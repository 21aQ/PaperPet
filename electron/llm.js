"use strict";

class LlmError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "LlmError";
    this.status = options.status || 0;
    this.code = options.code || "";
    this.detail = options.detail || "";
  }
}

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function endpoints(baseUrl) {
  let base = stripTrailingSlash(baseUrl || "https://api.deepseek.com");
  let chat = base;
  if (/\/chat\/completions$/i.test(chat)) {
    // already complete
  } else if (/\/v1$/i.test(chat)) {
    chat = chat + "/chat/completions";
  } else {
    chat = chat + "/chat/completions";
  }
  let models = base.replace(/\/chat\/completions$/i, "");
  if (!/\/v1$/i.test(models) && /openai\.com|localhost|127\.0\.0\.1/i.test(models)) {
    // Most OpenAI-compatible local servers expose /v1; do not force it for
    // DeepSeek, whose base URL works without /v1.
  }
  models = models + "/models";
  return { chat, models };
}

function errorMessage(status, detail) {
  let parsed = "";
  try {
    const json = JSON.parse(detail);
    parsed = json.error?.message || json.message || json.detail || "";
  } catch (error) {
    parsed = String(detail || "").slice(0, 400);
  }
  const map = {
    400: "请求格式有误，可能是模型名或参数不被支持",
    401: "API Key 无效或已过期",
    402: "账户余额不足",
    403: "没有权限访问该模型",
    404: "接口地址或模型名不存在",
    413: "上下文太长，超出了模型的输入限制",
    422: "参数校验失败",
    429: "请求过于频繁，或已达到配额限制",
    500: "模型服务内部错误",
    502: "模型网关错误",
    503: "模型服务暂时不可用",
  };
  const base = map[status] || `模型接口返回 ${status}`;
  return parsed ? `${base}：${parsed}` : base;
}

async function readError(res) {
  let detail = "";
  try {
    detail = await res.text();
  } catch (error) {}
  return new LlmError(errorMessage(res.status, detail), {
    status: res.status,
    detail: String(detail || "").slice(0, 1200),
  });
}

async function streamChat({ config, messages, signal, onDelta, onReasoning, onUsage }) {
  const { chat } = endpoints(config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("请求超时")), 240000);
  const onAbort = () => controller.abort(signal.reason || new Error("已停止"));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const body = {
    model: config.model,
    messages,
    stream: true,
    max_tokens: Number(config.maxTokens) || 3000,
  };
  if (!/reasoner|thinking|o1|o3/i.test(String(config.model || ""))) {
    body.temperature = Number(config.temperature);
  }

  try {
    const res = await fetch(chat, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw await readError(res);
    if (!res.body) throw new LlmError("模型接口没有返回流式内容", { status: 0 });

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let text = "";
    let reasoning = "";
    let usage = null;

    const handleEvent = (rawEvent) => {
      const lines = rawEvent.split(/\r?\n/);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch (error) {
          continue;
        }
        if (json.usage) usage = json.usage;
        const choice = json.choices && json.choices[0];
        if (!choice) continue;
        const delta = choice.delta || choice.message || {};
        const content = delta.content;
        if (typeof content === "string" && content) {
          text += content;
          onDelta?.(content);
        }
        const think = delta.reasoning_content ?? delta.reasoning;
        if (typeof think === "string" && think) {
          reasoning += think;
          onReasoning?.(think);
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const event = buffer.slice(0, idx);
        const match = buffer.slice(idx).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(idx + (match ? match[0].length : 2));
        handleEvent(event);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleEvent(buffer);
    onUsage?.(usage);
    return { text, reasoning, usage };
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason && reason.message === "请求超时") {
        throw new LlmError("模型响应超时（4 分钟）。可以稍后重试，或换一个更快的模型。", {
          code: "timeout",
        });
      }
      throw new LlmError("已停止生成", { code: "aborted" });
    }
    if (error instanceof LlmError) throw error;
    if (error.name === "AbortError") throw new LlmError("已停止生成", { code: "aborted" });
    const message = String(error.message || error);
    if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network/i.test(message)) {
      throw new LlmError(`无法连接模型接口：${message}。请检查 Base URL 和网络。`, {
        code: "network",
      });
    }
    throw new LlmError(`模型请求失败：${message}`, { code: "unknown" });
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function listModels({ config, signal }) {
  const { models } = endpoints(config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(models, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) throw await readError(res);
    const json = await res.json();
    const list = Array.isArray(json.data)
      ? json.data.map((item) => item.id).filter(Boolean)
      : Array.isArray(json.models)
        ? json.models.map((item) => item.id || item.name).filter(Boolean)
        : [];
    return [...new Set(list)].sort();
  } finally {
    clearTimeout(timeout);
  }
}

async function testConnection({ config, signal }) {
  const started = Date.now();
  const { chat } = endpoints(config.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(chat, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "Reply with the single word: OK" }],
        stream: false,
        max_tokens: 4,
        ...(/reasoner|thinking|o1|o3/i.test(String(config.model || "")) ? {} : { temperature: 0 }),
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw await readError(res);
    const json = await res.json().catch(() => ({}));
    let models = [];
    try {
      models = await listModels({ config, signal });
    } catch (error) {}
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: json.model || config.model,
      models,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: "连接超时（25 秒）", latencyMs: Date.now() - started };
    }
    return {
      ok: false,
      error: error instanceof LlmError ? error.message : String(error.message || error),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { LlmError, endpoints, streamChat, listModels, testConnection };
