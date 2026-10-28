const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const answer = `**图中公式转写**

$$\\left\\|\\sum_k u_k-f\\right\\|_2^2\\le \\varepsilon$$

如果忽略范数符号，它就是在说：所有模态加起来与原始信号 $f$ 的差距不超过 $\\varepsilon$。

**生活化直觉**：想象你把一段混音拆成几条音轨。精确重构要求所有音轨重新叠起来必须和原曲一模一样；如果允许残差 $\\varepsilon$，就像允许混音里留一点听不见的底噪。

**如果允许残差会怎样**：可以把约束放松为不等式，或者在目标函数里加一个残差惩罚。这样模型会更像去噪问题，但最优解会依赖 $\\varepsilon$ 或惩罚系数。

*依据：p.2 §2、p.4 §4。*`;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.includes("/models")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "mock-paper-model" }, { id: "mock-vision-model" }] }));
    return;
  }
  if (req.method === "POST" && req.url.includes("/chat/completions")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const hasImage = JSON.stringify(parsed.messages || []).includes('"image_url"');
        const out = path.join(process.cwd(), "artifacts", hasImage ? "mock-vision-request.json" : "mock-request.json");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify({ model: parsed.model, hasImage, messages: parsed.messages }, null, 2));
      } catch (error) {}
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const chunks = answer.match(/[\s\S]{1,12}/g) || [answer];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= chunks.length) {
          clearInterval(timer);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1234, completion_tokens: 321, total_tokens: 1555 } })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i] } }] })}\n\n`,
        );
        i++;
      }, 22);
    });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(23333, "127.0.0.1", () => {
  console.log("mock server on http://127.0.0.1:23333/v1");
});
