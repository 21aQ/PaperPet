"use strict";

(() => {
  const api = window.paperpet;
  const $ = (id) => document.getElementById(id);

  const els = {
    app: $("app"),
    paperCard: $("paperCard"),
    paperStatus: $("paperStatus"),
    paperPages: $("paperPages"),
    paperTitle: $("paperTitle"),
    paperMeta: $("paperMeta"),
    paperChips: $("paperChips"),
    paperEmpty: $("paperEmpty"),
    btnRefreshPaper: $("btnRefreshPaper"),
    btnInstallBridge: $("btnInstallBridge"),
    btnBridgeHelp: $("btnBridgeHelp"),
    chatScroll: $("chatScroll"),
    chatList: $("chatList"),
    thinkingBar: $("thinkingBar"),
    thinkingText: $("thinkingText"),
    selectionBar: $("selectionBar"),
    selectionToggle: $("selectionToggle"),
    selectionPage: $("selectionPage"),
    selectionPreview: $("selectionPreview"),
    selectionRemove: $("selectionRemove"),
    imageBar: $("imageBar"),
    imageThumb: $("imageThumb"),
    imageSize: $("imageSize"),
    imageRemove: $("imageRemove"),
    btnImage: $("btnImage"),
    quickScreenshot: $("quickScreenshot"),
    input: $("input"),
    btnSend: $("btnSend"),
    connection: $("connection"),
    settings: $("settings"),
    toast: $("toast"),
    petLine: $("petLine"),
    petStatusText: $("petStatusText"),
    petBubble: $("petBubble"),
    btnPin: $("btnPin"),
    btnCollapse: $("btnCollapse"),
    btnSettings: $("btnSettings"),
    btnHide: $("btnHide"),
    cfgBaseUrl: $("cfgBaseUrl"),
    cfgApiKey: $("cfgApiKey"),
    cfgModel: $("cfgModel"),
    cfgVisionModel: $("cfgVisionModel"),
    cfgContextChars: $("cfgContextChars"),
    cfgShowReasoning: $("cfgShowReasoning"),
    cfgAlwaysOnTop: $("cfgAlwaysOnTop"),
    cfgAutoLaunch: $("cfgAutoLaunch"),
    cfgTheme: $("cfgTheme"),
    cfgShortcut: $("cfgShortcut"),
    keyState: $("keyState"),
    keyHint: $("keyHint"),
    modelList: $("modelList"),
    testResult: $("testResult"),
    bridgeBadge: $("bridgeBadge"),
    pluginPath: $("pluginPath"),
    btnTest: $("btnTest"),
    btnModels: $("btnModels"),
    btnRevealKey: $("btnRevealKey"),
    btnGetKey: $("btnGetKey"),
    btnInstallPlugin: $("btnInstallPlugin"),
    btnRevealPlugin: $("btnRevealPlugin"),
    btnOpenBridge: $("btnOpenBridge"),
    btnOpenData: $("btnOpenData"),
    btnClearHistory: $("btnClearHistory"),
    btnQuit: $("btnQuit"),
    btnSaveSettings: $("btnSaveSettings"),
    btnCloseSettings: $("btnCloseSettings"),
  };

  const state = {
    demo: false,
    config: null,
    bridge: null,
    paths: {},
    paper: null,
    paperId: null,
    messages: [],
    stream: null,
    streamTimer: null,
    includeSelection: true,
    selectionKey: "",
    selectionDismissedKey: "",
    toastTimer: null,
    petTimer: null,
    petHappyTimer: null,
    onboardingKey: "",
    settingsOpen: false,
    testRunning: false,
    lastPage: 0,
    resizeEdge: "",
    pendingImage: null,
  };

  const PET_LINES = [
    "读到哪了？",
    "选中一段，我来拆解。",
    "这一步用了什么假设？",
    "公式乱码也可以发我。",
    "要不要我考考你？",
    "不懂的记号，指给我看。",
  ];

  const QUICK = {
    explain: {
      question: "请解释当前这一页的核心内容，并指出它在全文论证中的位置。",
      empty: "请解释我选中的这段内容。",
    },
    derive: {
      question: "请把当前这一页里最关键的一步推导展开，逐步标注每一步的依据。",
      empty: "请把这段里的推导展开，逐步标注依据。",
    },
    symbol: {
      question: "请解释这一页里出现的记号：它们在哪里定义、取值范围/维数是什么、和哪些式子相关。",
      empty: "请解释这段里出现的记号：定义、取值范围、相关公式。",
    },
    intuition: {
      question: "请用直觉或一个低维小例子解释这一页的核心思想。",
      empty: "请用直觉或一个小例子解释这段。",
    },
    quiz: {
      question: "请就当前这一节出 3 个由浅入深的问题，先只给问题，不要给答案。",
      empty: "请就这段内容出 3 个自测问题，先只给问题。",
    },
    summary: {
      question: "请总结这一节：目标、关键假设、主要结果、证明路线，以及它和前后文的关系。",
      empty: "请总结这段内容在整节里的作用。",
    },
    structure: {
      question: "请分析当前选段的论证结构：主张、证据、依赖的定理/假设、可能的 gap。",
      empty: "请分析这段的论证结构。",
    },
  };

  function escapeHTML(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeMessage(message, index = 0) {
    return {
      id: message.id || `m-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      role: message.role === "user" ? "user" : "assistant",
      content: String(message.content || ""),
      reasoning: String(message.reasoning || ""),
      createdAt: message.createdAt || Date.now(),
      meta: message.meta || null,
      image: typeof message.image === "string" ? message.image : "",
      imageMeta: message.imageMeta || null,
      error: message.error || "",
      streaming: Boolean(message.streaming),
      local: Boolean(message.local),
    };
  }

  function paperKey(bridge = state.bridge) {
    const paper = bridge?.data?.paper;
    if (!paper) return null;
    return `${paper.libraryID || 0}:${paper.key || paper.itemID}`;
  }

  function currentPaper() {
    return state.bridge?.data?.paper || null;
  }

  function currentData() {
    return state.bridge?.data || null;
  }

  function currentPage() {
    return Number(state.bridge?.data?.reader?.page) || 0;
  }

  function currentSelection() {
    return state.bridge?.data?.selection || null;
  }

  function authorLine(paper) {
    if (!paper) return "";
    const creators = Array.isArray(paper.creators) ? paper.creators : [];
    const names = creators
      .map((c) => c.name || [c.first, c.last].filter(Boolean).join(" "))
      .filter(Boolean);
    if (!names.length) return paper.year || "";
    const authorText =
      names.length > 3 ? `${names.slice(0, 3).join(", ")} et al.` : names.join(", ");
    return [authorText, paper.year, paper.venue].filter(Boolean).join(" · ");
  }

  function formatTime(timestamp) {
    try {
      return new Date(timestamp).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "";
    }
  }

  function formatBytes(count) {
    const n = Number(count) || 0;
    if (n > 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n > 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  }

  function toast(message, duration = 2400) {
    if (!message) return;
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), duration);
  }

  /* ---------------- markdown + math ---------------- */

  function protectMath(text) {
    const store = [];
    let out = String(text || "");
    const add = (tex, display) => {
      const index = store.length;
      store.push({ tex: tex.trim(), display });
      return `@@PP_MATH_${index}@@`;
    };
    out = out.replace(/\$\$([\s\S]+?)\$\$/g, (match, tex) => add(tex, true));
    out = out.replace(/\\\[([\s\S]+?)\\\]/g, (match, tex) => add(tex, true));
    out = out.replace(/\\\(([\s\S]+?)\\\)/g, (match, tex) => add(tex, false));
    out = out.replace(/(^|[^\\$])\$(?!\$)([^\n$]+?)\$(?!\$)/g, (match, prefix, tex) => {
      return `${prefix}${add(tex, false)}`;
    });
    return { text: out, store };
  }

  function restoreMath(html, store) {
    const template = document.createElement("div");
    template.innerHTML = html;
    template.querySelectorAll(".pp-math").forEach((node) => {
      const item = store[Number(node.dataset.id)];
      if (!item) return;
      if (item.display) node.classList.add("pp-display");
      try {
        katex.render(item.tex, node, {
          displayMode: item.display,
          throwOnError: false,
          strict: false,
          trust: false,
        });
      } catch (error) {
        node.textContent = item.tex;
      }
    });
    return template.innerHTML;
  }

  function renderMarkdown(text) {
    const source = String(text || "");
    if (!source) return "";
    const protectedMath = protectMath(source);
    let html;
    try {
      html = marked.parse(protectedMath.text, {
        gfm: true,
        breaks: true,
        headerIds: false,
        mangle: false,
      });
    } catch (error) {
      html = escapeHTML(protectedMath.text).replace(/\n/g, "<br>");
    }
    html = html.replace(/@@PP_MATH_(\d+)@@/g, '<span class="pp-math" data-id="$1"></span>');
    if (window.DOMPurify) {
      html = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target", "rel"],
      });
    }
    html = restoreMath(html, protectedMath.store);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    wrapper.querySelectorAll("a").forEach((a) => {
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      a.addEventListener("click", (event) => {
        event.preventDefault();
        api.openExternal(a.href);
      });
    });
    return wrapper.innerHTML;
  }

  /* ---------------- messages ---------------- */

  function messageMetaText(msg) {
    const meta = msg.meta || {};
    const parts = [];
    if (meta.selectionPage) parts.push(`p.${meta.selectionPage} 选段`);
    if (meta.chunks) parts.push(`${meta.chunks} 段原文`);
    if (meta.contextMode === "full") parts.push("全文");
    if (meta.model) parts.push(meta.model);
    if (meta.durationMs) parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
    return parts.join(" · ");
  }

  function createMessageEl(msg) {
    const el = document.createElement("div");
    el.className = `msg ${msg.role}${msg.streaming ? " is-streaming" : ""}${msg.error ? " is-error" : ""}`;
    el.dataset.id = msg.id;

    if (msg.role === "assistant") {
      el.innerHTML = `
        <div class="msg-head">
          <span class="msg-avatar" aria-hidden="true"><svg viewBox="0 0 120 120"><use href="#pet-full"></use></svg></span>
          <span class="msg-who">小纸</span>
          <span class="msg-time">${formatTime(msg.createdAt)}</span>
        </div>
        <details class="reasoning" hidden>
          <summary><span class="reasoning-label">思考过程</span><span class="reasoning-chevron">⌄</span></summary>
          <div class="reasoning-body"></div>
        </details>
        <div class="bubble"></div>
        <div class="msg-context"></div>
        <div class="msg-actions">
          <span class="msg-meta"></span>
          <button class="copy-btn" type="button" title="复制回答">
            <svg viewBox="0 0 24 24"><use href="#i-copy"></use></svg><span>复制</span>
          </button>
        </div>`;
    } else {
      el.innerHTML = `
        <img class="msg-image" alt="截图" hidden />
        <div class="bubble"></div>
        <div class="msg-actions">
          <span class="msg-meta">${formatTime(msg.createdAt)}</span>
        </div>`;
    }

    const copyBtn = el.querySelector(".copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyText(el._message?.content || msg.content);
        toast("已复制这段回答");
      });
    }
    el._message = msg;
    updateMessageEl(el, msg);
    return el;
  }

  function updateMessageEl(el, msg) {
    const bubble = el.querySelector(".bubble");
    if (!bubble) return;
    const imageEl = el.querySelector(".msg-image");
    if (imageEl) {
      if (msg.image) {
        imageEl.src = msg.image;
        imageEl.hidden = false;
      } else {
        imageEl.hidden = true;
        imageEl.removeAttribute("src");
      }
    }
    if (msg.error) {
      bubble.innerHTML = `<strong>连接没有成功</strong><br>${escapeHTML(msg.error)}`;
    } else {
      bubble.innerHTML = renderMarkdown(msg.content);
      if (!msg.content && msg.streaming) {
        bubble.innerHTML = '<span class="stream-caret"></span>';
      }
    }

    const reasoning = el.querySelector(".reasoning");
    if (reasoning) {
      if (msg.reasoning) {
        reasoning.hidden = false;
        reasoning.querySelector(".reasoning-body").textContent = msg.reasoning;
        reasoning.querySelector(".reasoning-label").textContent = `思考过程 · ${msg.reasoning.length} 字`;
        if (state.config?.showReasoning || msg.streaming) reasoning.open = true;
      } else {
        reasoning.hidden = true;
      }
    }

    const metaEl = el.querySelector(".msg-meta");
    if (metaEl) {
      metaEl.textContent = msg.role === "assistant" ? messageMetaText(msg) : formatTime(msg.createdAt);
    }
    const contextEl = el.querySelector(".msg-context");
    if (contextEl) {
      const meta = msg.meta || {};
      if (msg.role === "assistant" && (meta.chunks || meta.hasImage)) {
        const parts = [];
        if (meta.hasImage) {
          parts.push(
            `截图${meta.imageWidth ? ` ${meta.imageWidth}×${meta.imageHeight}` : ""}`,
          );
        }
        if (meta.selectionPage) parts.push(`p.${meta.selectionPage} 选段`);
        if (meta.chunks) parts.push(`${meta.chunks} 段相关原文`);
        if (meta.contextMode === "full") parts.push("全文");
        if (meta.contextChars) parts.push(`${(meta.contextChars / 1000).toFixed(1)}k 字符`);
        contextEl.textContent = `依据：${parts.join(" · ")}`;
        contextEl.hidden = false;
      } else {
        contextEl.hidden = true;
      }
    }
    el.classList.toggle("is-streaming", Boolean(msg.streaming));
    el.classList.toggle("is-error", Boolean(msg.error));
  }

  function appendMessage(msg) {
    const el = createMessageEl(msg);
    els.chatList.appendChild(el);
    return el;
  }

  function renderAllMessages() {
    els.chatList.innerHTML = "";
    state.onboardingKey = "";
    if (!state.messages.length) {
      state.messages.push(normalizeMessage(makeWelcomeMessage(), 0));
    }
    const fragment = document.createDocumentFragment();
    for (const msg of state.messages) {
      fragment.appendChild(createMessageEl(msg));
    }
    els.chatList.appendChild(fragment);
    renderOnboarding();
    if (state.messages.length <= 1 && currentPaper()) renderStarters();
    requestAnimationFrame(() => scrollToBottom(false));
  }

  function renderStarters() {
    if (els.chatList.querySelector(".starter-grid")) return;
    const starters = [
      ["这篇论文要解决什么问题？", "summary"],
      ["核心假设和适用边界是什么？", "structure"],
      ["把最关键的一步推导展开", "derive"],
      ["给我一个直觉小例子", "intuition"],
    ];
    const grid = document.createElement("div");
    grid.className = "starter-grid";
    const head = document.createElement("div");
    head.className = "starter-head";
    head.textContent = "可以这样开始";
    grid.appendChild(head);
    for (const [question, mode] of starters) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "starter-card";
      button.innerHTML = `<span>${escapeHTML(question)}</span><svg viewBox="0 0 24 24"><use href="#i-arrow"></use></svg>`;
      button.addEventListener("click", () => sendMessage(question, mode));
      grid.appendChild(button);
    }
    els.chatList.appendChild(grid);
  }

  function makeWelcomeMessage() {
    const paper = currentPaper();
    const config = state.config || {};
    let content;
    if (state.demo) {
      content =
        "这里是**演示模式**：我已经接上了《Variational Mode Decomposition》的全文、页码和高亮。\n\n选中正文或公式后直接问我，也可以点下面的快捷按钮。";
    } else if (paper) {
      content = `我在。你正在读《${paper.title || "这篇论文"}》，PDF 全文和页码都已经接上了。\n\n选中正文或公式后直接问我，或者从下面挑一个开始。\n\n如果公式被抽丢了，按 **Win+Shift+S** 截图，回到这里按 **Ctrl+V**。`;
      if (!config.hasApiKey) {
        content += "\n\n还差一步：点右上角设置，填入 API Key，我们就能开始。";
      }
    } else if (state.bridge?.installed && state.bridge?.connected) {
      content =
        "Zotero 已连接，但我还没看到正在阅读的 PDF。\n\n在 Zotero 里双击打开一篇论文，我会自动把标题、全文和你的高亮接过来。";
    } else if (state.bridge?.installed) {
      content =
        "我在等 Zotero。\n\n打开 Zotero 和一篇 PDF，我会自动跟过来；如果一直没反应，点下面的“重新检测”。";
    } else {
      content =
        "你好，我是**小纸**，你的论文桌宠。\n\n我通过一个轻量 Zotero 插件知道你正在读哪篇论文，然后陪你拆公式、补推导、查记号。先安装桥接插件，再填一个模型 API Key 就可以开始。";
    }
    return {
      role: "assistant",
      content,
      createdAt: Date.now() - 1000,
      meta: { welcome: true },
      local: true,
    };
  }

  function renderOnboarding() {
    const old = els.chatList.querySelector(".onboarding-card");
    if (old) old.remove();
    if (state.demo) return;
    const config = state.config || {};
    const bridge = state.bridge;
    let key = "";
    let title = "";
    let text = "";
    let action = "";
    let actionLabel = "";
    if (!config.hasApiKey) {
      key = "no-key";
      title = "还差一个 API Key";
      text = "支持 DeepSeek 或任意 OpenAI 兼容接口。Key 只加密保存在本机。";
      action = "settings";
      actionLabel = "去配置";
    } else if (bridge && !bridge.installed) {
      key = "no-bridge";
      title = "把 Zotero 接上";
      text = "安装 PaperPet Bridge（一个只读本地文件的轻量插件），我才能知道你在读哪篇。";
      action = "install";
      actionLabel = "一键安装";
    } else if (bridge && bridge.installed && !bridge.connected) {
      key = "stale-bridge";
      title = "Zotero 还没响应";
      text = "打开 Zotero 后等两秒；如果仍无反应，重新检测或重启 Zotero。";
      action = "refresh";
      actionLabel = "重新检测";
    }
    if (!key) {
      state.onboardingKey = "";
      return;
    }
    if (state.onboardingKey === key) return;
    state.onboardingKey = key;

    const card = document.createElement("div");
    card.className = "onboarding-card";
    card.innerHTML = `
      <div class="onboarding-icon"><svg viewBox="0 0 24 24"><use href="#i-spark"></use></svg></div>
      <div class="onboarding-copy">
        <b>${escapeHTML(title)}</b>
        <p>${escapeHTML(text)}</p>
      </div>
      <button class="onboarding-btn" type="button">${escapeHTML(actionLabel)}</button>`;
    card.querySelector("button").addEventListener("click", () => {
      if (action === "settings") openSettings("key");
      if (action === "install") installBridge();
      if (action === "refresh") refreshBridge();
    });
    els.chatList.appendChild(card);
    requestAnimationFrame(() => scrollToBottom(false));
  }

  function scrollToBottom(smooth = false) {
    els.chatScroll.scrollTo({
      top: els.chatScroll.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = String(text || "");
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch (e) {}
      area.remove();
    }
  }

  /* ---------------- paper / bridge rendering ---------------- */

  function setChip(text, kind = "") {
    const span = document.createElement("span");
    span.className = `chip ${kind}`.trim();
    span.textContent = text;
    return span;
  }

  function renderPaper() {
    const paper = currentPaper();
    const data = currentData();
    const bridge = state.bridge;
    const connected = Boolean(bridge?.connected);
    const installed = Boolean(bridge?.installed);
    els.paperCard.classList.toggle("empty", !paper);
    els.paperEmpty.hidden = Boolean(paper);
    els.paperPages.textContent = "";

    if (!paper) {
      if (!installed) {
        els.paperStatus.textContent = "未连接 · ZOTERO";
        els.paperEmpty.querySelector(".paper-empty-title").textContent = "还没连上 Zotero";
        els.paperEmpty.querySelector(".paper-empty-sub").textContent =
          "安装 PaperPet Bridge，只需一次。之后打开 PDF，我就知道你在读哪篇。";
        els.btnInstallBridge.textContent = "安装桥接";
        els.btnBridgeHelp.textContent = "怎么装？";
      } else if (!connected) {
        els.paperStatus.textContent = "等待 ZOTERO";
        els.paperEmpty.querySelector(".paper-empty-title").textContent = "Zotero 好像没在运行";
        els.paperEmpty.querySelector(".paper-empty-sub").textContent =
          "打开 Zotero 和一篇 PDF，我会自动接上；也可以点重新检测。";
        els.btnInstallBridge.textContent = "重新检测";
        els.btnBridgeHelp.textContent = "查看设置";
      } else {
        els.paperStatus.textContent = "ZOTERO 已连接";
        els.paperEmpty.querySelector(".paper-empty-title").textContent = "还没打开论文";
        els.paperEmpty.querySelector(".paper-empty-sub").textContent =
          "在 Zotero 里双击一篇 PDF，标题、全文、页码和你的高亮会自动出现在这里。";
        els.btnInstallBridge.textContent = "重新检测";
        els.btnBridgeHelp.textContent = "查看设置";
      }
      els.paperTitle.textContent = "还没找到正在读的论文";
      els.paperMeta.textContent = "打开 Zotero 里的 PDF，我会自动跟过来";
      els.paperChips.innerHTML = "";
      return;
    }

    const page = Number(data?.reader?.page) || 0;
    const status = data?.status;
    els.paperStatus.textContent =
      status === "reading"
        ? "正在读 · ZOTERO"
        : status === "selected"
          ? "已选中 · ZOTERO"
          : "上次打开 · ZOTERO";
    els.paperTitle.textContent = paper.title || "(untitled)";
    els.paperTitle.title = paper.title || "";
    els.paperMeta.textContent = authorLine(paper);
    els.paperPages.textContent = data?.attachment?.pageCount
      ? `PDF ${data.attachment.pageCount} 页`
      : "";

    els.paperChips.innerHTML = "";
    if (page) els.paperChips.appendChild(setChip(`p.${page}`, "page"));
    const annotationCount = Array.isArray(data?.annotations) ? data.annotations.length : 0;
    if (annotationCount) {
      els.paperChips.appendChild(setChip(`${annotationCount} 条高亮`));
    }
    if (data?.attachment?.fullTextChars > 0) {
      els.paperChips.appendChild(setChip(`全文 ${formatBytes(data.attachment.fullTextChars)} 字`, "sync"));
    } else {
      els.paperChips.appendChild(setChip("仅元数据", "warn"));
    }
    if (!connected) {
      els.paperChips.appendChild(setChip("等待 Zotero", "warn"));
    }
  }

  function renderSelection() {
    const selection = currentSelection();
    if (!selection || !selection.text) {
      els.selectionBar.hidden = true;
      state.selectionKey = "";
      state.selectionDismissedKey = "";
      state.includeSelection = true;
      return;
    }
    const key = `${selection.text.slice(0, 90)}|${selection.pageLabel || ""}`;
    if (key !== state.selectionKey) {
      state.selectionKey = key;
      state.includeSelection = true;
      els.selectionBar.classList.remove("open");
    }
    if (state.selectionDismissedKey === key || !state.includeSelection) {
      els.selectionBar.hidden = true;
      return;
    }
    els.selectionBar.hidden = false;
    els.selectionPage.textContent = `p.${selection.pageLabel || "?"} 选段`;
    const preview = String(selection.text).replace(/\s+/g, " ").trim();
    els.selectionPreview.textContent = preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
  }

  function renderImageBar() {
    const image = state.pendingImage;
    if (!image) {
      els.imageBar.hidden = true;
      els.btnImage.classList.remove("has-image");
      return;
    }
    els.imageBar.hidden = false;
    els.imageThumb.src = image.preview;
    els.imageSize.textContent = `${image.width}×${image.height}`;
    els.btnImage.classList.add("has-image");
    if (!els.input.value.trim()) {
      els.input.placeholder = "问这张截图… 例如：这个公式怎么推？";
    }
  }

  async function grabClipboardImage(showEmptyMessage = true) {
    try {
      els.btnImage.disabled = true;
      const image = await api.readClipboardImage();
      if (!image?.ok) {
        if (showEmptyMessage) toast(image?.error || "剪贴板里没有图片", 3800);
        return;
      }
      state.pendingImage = image;
      renderImageBar();
      toast(`已读取截图 ${image.width}×${image.height}，可以提问了`, 2400);
      els.input.focus();
    } catch (error) {
      if (showEmptyMessage) toast(`读取截图失败：${error.message || error}`, 3600);
    } finally {
      els.btnImage.disabled = false;
    }
  }

  function clearPendingImage() {
    state.pendingImage = null;
    renderImageBar();
    if (!currentSelection()) els.input.placeholder = "问这篇论文… 例如：这一步为什么成立？";
  }

  function updateConnection() {
    const bridge = state.bridge;
    const paper = currentPaper();
    const page = currentPage();
    const dot = els.connection.querySelector(".status-dot");
    dot.className = "status-dot";
    let text = "";
    let petText = "";
    if (!bridge) {
      text = "正在连接 Zotero…";
      petText = "正在找 Zotero";
      dot.classList.add("warn");
    } else if (!bridge.installed) {
      text = "未安装 Zotero 桥接";
      petText = "还没接上 Zotero";
      dot.classList.add("bad");
    } else if (!bridge.connected) {
      text = "等待 Zotero…";
      petText = "在等 Zotero";
      dot.classList.add("warn");
    } else if (!paper) {
      text = `Zotero 已连接${bridge.data?.zotero?.version ? ` · ${bridge.data.zotero.version}` : ""}`;
      petText = "Zotero 已连接";
      dot.classList.add("ok");
    } else {
      text = `Zotero 已连接${page ? ` · p.${page}` : ""}`;
      petText = page ? `Zotero · p.${page}` : "Zotero · 已连接";
      dot.classList.add("ok");
    }
    const span = els.connection.querySelector("span");
    if (span) span.textContent = text;
    els.petStatusText.textContent = petText;

    if (state.pendingImage) {
      els.input.placeholder = "问这张截图… 例如：这个公式怎么推？";
    } else if (paper) {
      els.input.placeholder = currentSelection()
        ? "就这段提问… 例如：为什么这一步成立？"
        : "问这篇论文… 例如：这个记号是什么意思？";
    } else {
      els.input.placeholder = "先在 Zotero 打开一篇 PDF，或者问我一般性的数学问题…";
    }
  }

  function updatePetMood(mood) {
    els.app.classList.toggle("is-thinking", mood === "thinking");
    els.app.classList.toggle("is-listening", mood === "listening");
    if (mood === "thinking") {
      els.petLine.textContent = "正在翻论文…";
      return;
    }
    if (mood === "happy") {
      els.petLine.textContent = "懂了就记下来。";
      return;
    }
    const paper = currentPaper();
    if (!paper) {
      els.petLine.textContent = state.bridge?.connected ? "打开一篇 PDF 吧。" : "在等 Zotero…";
      return;
    }
    els.petLine.textContent = PET_LINES[Math.floor(Math.random() * PET_LINES.length)];
  }

  function startPetRotation() {
    clearInterval(state.petTimer);
    state.petTimer = setInterval(() => {
      if (state.settingsOpen || state.stream) return;
      if (els.app.classList.contains("is-collapsed")) {
        const paper = currentPaper();
        els.petLine.textContent = paper
          ? PET_LINES[Math.floor(Math.random() * PET_LINES.length)]
          : state.bridge?.connected
            ? "打开一篇 PDF 吧。"
            : "在等 Zotero…";
      }
    }, 9000);
  }

  function applyBridgeState(bridge, options = {}) {
    if (!bridge) return;
    const wasPaperKey = paperKey(state.bridge);
    state.bridge = bridge;
    const nextKey = paperKey(bridge);
    if (!options.initial && wasPaperKey && nextKey && wasPaperKey !== nextKey) {
      // paper:changed will load the conversation; keep the UI responsive here.
    }
    state.paper = currentPaper();
    if (!nextKey && options.initial) {
      state.paperId = null;
    }
    renderPaper();
    renderSelection();
    updateConnection();
    renderOnboarding();
    if (options.initial && !state.messages.length) {
      renderAllMessages();
    }
  }

  function setConversation(messages) {
    if (state.stream) abortStream(true);
    state.stream = null;
    els.thinkingBar.hidden = true;
    els.app.classList.remove("is-thinking");
    state.messages = (messages || []).map((m, index) => normalizeMessage(m, index));
    renderAllMessages();
    updateConnection();
    updatePetMood("idle");
  }

  async function refreshBridge() {
    try {
      const bridge = await api.refreshBridge();
      if (bridge) applyBridgeState(bridge, { initial: false });
      toast(bridge?.connected ? "已重新连接 Zotero" : "还没有检测到 Zotero 桥接");
    } catch (error) {
      toast(`检测失败：${error.message || error}`);
    }
  }

  async function installBridge() {
    try {
      const result = await api.installPlugin();
      if (result?.ok) {
        toast("桥接插件已装好，请重新打开 Zotero", 4200);
        els.pluginPath.textContent = `${result.target}\n重新打开 Zotero 后生效。`;
        state.onboardingKey = "";
        renderOnboarding();
      } else if (result?.needsZoteroClosed) {
        await api.revealPlugin();
        toast("Zotero 正在运行。已打开插件文件，请在 Zotero 的“工具 → 插件”里从文件安装。", 6500);
        openSettings("bridge");
      } else {
        toast(result?.error || "安装失败，请查看设置里的手动安装说明", 4500);
        openSettings("bridge");
      }
    } catch (error) {
      toast(`安装失败：${error.message || error}`, 4500);
      openSettings("bridge");
    }
  }

  /* ---------------- chat streaming ---------------- */

  function setThinking(on, text) {
    els.thinkingBar.hidden = !on;
    if (text) els.thinkingText.textContent = text;
    els.btnSend.classList.toggle("is-stop", on);
    const use = els.btnSend.querySelector("use");
    if (use) use.setAttribute("href", on ? "#i-stop" : "#i-send");
    els.btnSend.title = on ? "停止生成" : "发送";
    els.btnSend.setAttribute("aria-label", on ? "停止生成" : "发送");
    if (!on) updateSendDisabled();
  }

  function createStreamMessage() {
    const msg = normalizeMessage(
      {
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        streaming: true,
        meta: null,
      },
      state.messages.length,
    );
    state.messages.push(msg);
    appendMessage(msg);
    return msg;
  }

  function findStreamEl(msg) {
    return els.chatList.querySelector(`.msg[data-id="${msg.id}"]`);
  }

  function scheduleStreamUpdate() {
    if (!state.stream || state.streamTimer) return;
    state.streamTimer = setTimeout(() => {
      state.streamTimer = null;
      if (!state.stream) return;
      const msg = state.stream.msg;
      const el = findStreamEl(msg);
      if (!el) return;
      try {
        updateMessageEl(el, msg);
      } catch (error) {
        console.warn("[render] streaming update failed", error);
      }
      scrollToBottom(false);
    }, 75);
  }

  async function sendMessage(question, mode = "general") {
    if (state.stream) {
      await abortStream();
      return;
    }
    const image = state.pendingImage;
    let text = String(question || "").trim();
    if (!text && image) text = "请先转写这张截图里的公式，再解释它在论文里的作用。";
    if (!text) return;
    if (!state.demo && !state.config?.hasApiKey) {
      openSettings("key");
      toast("先填一个 API Key，我们才能开始", 3000);
      return;
    }
    if (
      !image &&
      !currentPaper() &&
      ["explain", "derive", "symbol", "summary", "structure"].includes(mode)
    ) {
      toast("先在 Zotero 打开一篇 PDF，我才能带着上下文回答", 3200);
      return;
    }

    const userMsg = normalizeMessage({
      role: "user",
      content: text,
      createdAt: Date.now(),
      image: image?.preview || "",
      imageMeta: image ? { width: image.width, height: image.height } : null,
    });
    state.messages.push(userMsg);
    els.chatList.querySelector(".starter-grid")?.remove();
    appendMessage(userMsg);
    const streamMsg = createStreamMessage();
    state.stream = {
      msg: streamMsg,
      requestId: null,
      startedAt: Date.now(),
      mode,
    };
    setThinking(true, image ? "正在看图里的公式…" : "正在翻论文…");
    updatePetMood("thinking");
    scrollToBottom(false);

    els.input.value = "";
    autoGrow();
    clearPendingImage();
    updateSendDisabled();

    try {
      const result = await api.send({
        question: text,
        mode,
        includeSelection: state.includeSelection,
        image: image?.dataUrl || "",
        imagePreview: image?.preview || "",
      });
      if (result?.error) {
        finishStreamError(result.error, "unknown");
      }
    } catch (error) {
      finishStreamError(error.message || String(error), "invoke");
      if (/API Key/i.test(String(error.message || error))) openSettings("key");
    }
  }

  function finishStreamError(message, code) {
    if (!state.stream) return;
    const msg = state.stream.msg;
    msg.streaming = false;
    if (code === "aborted" || /已停止/.test(message)) {
      msg.meta = { ...(msg.meta || {}), aborted: true };
      if (!msg.content) msg.content = "（已停止）";
      msg.error = "";
      toast("已停止生成");
    } else {
      msg.error = message;
    }
    const el = findStreamEl(msg);
    if (el) updateMessageEl(el, msg);
    state.stream = null;
    setThinking(false);
    updatePetMood("idle");
    scrollToBottom(false);
  }

  function finishStreamDone(payload) {
    if (!state.stream) return;
    const msg = state.stream.msg;
    msg.streaming = false;
    msg.meta = payload.meta || msg.meta;
    if (payload.usage) {
      msg.meta = { ...(msg.meta || {}), usage: payload.usage };
    }
    if (payload.aborted) {
      if (!msg.content) msg.content = "（已停止）";
      msg.meta = { ...(msg.meta || {}), aborted: true };
    }
    const el = findStreamEl(msg);
    if (el) updateMessageEl(el, msg);
    state.stream = null;
    setThinking(false);
    updatePetMood(payload.aborted ? "idle" : "happy");
    scrollToBottom(false);
  }

  async function abortStream(silent = false) {
    const stream = state.stream;
    if (!stream) return;
    if (stream.requestId) {
      try {
        await api.abort(stream.requestId);
      } catch (error) {}
    }
    if (!silent) toast("正在停止…", 1200);
  }

  function autoGrow() {
    els.input.style.height = "auto";
    const height = Math.min(96, Math.max(24, els.input.scrollHeight));
    els.input.style.height = `${height}px`;
  }

  function updateSendDisabled() {
    if (state.stream) {
      els.btnSend.disabled = false;
      return;
    }
    els.btnSend.disabled = !els.input.value.trim() && !state.pendingImage;
  }

  /* ---------------- settings ---------------- */

  function setTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
  }

  function fillSettings() {
    const config = state.config || {};
    els.cfgBaseUrl.value = config.baseUrl || "https://api.deepseek.com";
    els.cfgModel.value = config.model || "deepseek-chat";
    els.cfgVisionModel.value = config.visionModel || "";
    els.cfgApiKey.value = "";
    els.cfgApiKey.type = "password";
    els.btnRevealKey.textContent = "显示";
    els.cfgApiKey.placeholder = config.hasApiKey
      ? `已保存 ${config.maskedKey || "••••••"}`
      : "sk-…（只保存在本机）";
    els.cfgContextChars.value = String(config.contextChars || 60000);
    els.cfgShowReasoning.checked = Boolean(config.showReasoning);
    els.cfgAlwaysOnTop.checked = Boolean(config.alwaysOnTop);
    els.cfgAutoLaunch.checked = Boolean(config.autoLaunch);
    els.cfgTheme.value = config.theme || "system";
    els.cfgShortcut.textContent = prettifyShortcut(config.globalShortcut || "CommandOrControl+Alt+P");
    els.keyState.textContent = config.hasApiKey
      ? config.keySource === "env"
        ? "环境变量"
        : "已配置"
      : "未配置";
    els.keyState.className = `setting-badge ${config.hasApiKey ? "ok" : ""}`.trim();
    els.testResult.textContent = config.hasApiKey ? "已保存 Key，可重新测试" : "填好 Key 后测一下";
    els.testResult.className = "test-result";
    els.keyHint.textContent =
      config.keySource === "env"
        ? "正在使用环境变量 DEEPSEEK_API_KEY。也可以在这里覆盖保存。"
        : "使用系统级加密保存（Windows DPAPI）。也可设置环境变量 DEEPSEEK_API_KEY。";
    setSegmented(config.contextMode || "smart");
    const bridge = state.bridge;
    els.bridgeBadge.textContent = !bridge?.installed
      ? "未安装"
      : bridge.connected
        ? "已连接"
        : "未运行";
    els.bridgeBadge.className = `setting-badge ${bridge?.connected ? "ok" : bridge?.installed ? "bad" : ""}`.trim();
    els.pluginPath.textContent = state.paths?.plugin || "未找到 paperpet-bridge.xpi";
  }

  function prettifyShortcut(shortcut) {
    return shortcut
      .replace(/CommandOrControl/i, "Ctrl")
      .replace(/Control/i, "Ctrl")
      .replace(/\+/g, "+");
  }

  function setSegmented(value) {
    document.querySelectorAll("#contextMode .seg-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.value === value);
    });
  }

  function openSettings(focus) {
    state.settingsOpen = true;
    els.settings.hidden = false;
    fillSettings();
    els.settings.querySelector(".settings-scroll").scrollTop = 0;
    if (focus === "key") {
      setTimeout(() => els.cfgApiKey.focus(), 120);
    } else if (focus === "bridge") {
      setTimeout(() => {
        const groups = els.settings.querySelectorAll(".setting-group");
        groups[3]?.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 120);
    }
  }

  function closeSettings() {
    state.settingsOpen = false;
    els.settings.hidden = true;
  }

  async function saveSettings() {
    const apiKey = els.cfgApiKey.value.trim();
    const patch = {
      baseUrl: els.cfgBaseUrl.value.trim(),
      model: els.cfgModel.value.trim(),
      visionModel: els.cfgVisionModel.value.trim(),
      contextChars: Number(els.cfgContextChars.value),
      showReasoning: els.cfgShowReasoning.checked,
      alwaysOnTop: els.cfgAlwaysOnTop.checked,
      autoLaunch: els.cfgAutoLaunch.checked,
      theme: els.cfgTheme.value,
      contextMode:
        document.querySelector("#contextMode .seg-btn.active")?.dataset.value || "smart",
      onboardingDone: true,
    };
    if (apiKey) patch.apiKey = apiKey;
    if (!patch.baseUrl) patch.baseUrl = "https://api.deepseek.com";
    if (!patch.model) patch.model = "deepseek-chat";
    try {
      els.btnSaveSettings.disabled = true;
      const config = await api.saveConfig(patch);
      state.config = config;
      setTheme(config.theme);
      updatePinState();
      fillSettings();
      renderOnboarding();
      toast("设置已保存");
      setTimeout(() => closeSettings(), 260);
    } catch (error) {
      toast(`保存失败：${error.message || error}`, 3600);
    } finally {
      els.btnSaveSettings.disabled = false;
    }
  }

  async function testConnection() {
    if (state.testRunning) return;
    state.testRunning = true;
    els.btnTest.disabled = true;
    els.testResult.textContent = "正在连接…";
    els.testResult.className = "test-result";
    try {
      const result = await api.testConnection({
        baseUrl: els.cfgBaseUrl.value.trim(),
        model: els.cfgModel.value.trim(),
        apiKey: els.cfgApiKey.value.trim(),
      });
      if (result.ok) {
        els.testResult.textContent = `连接正常 · ${result.latencyMs} ms${result.model ? ` · ${result.model}` : ""}`;
        els.testResult.className = "test-result ok";
        if (result.models?.length) fillModelList(result.models);
      } else {
        els.testResult.textContent = result.error || "连接失败";
        els.testResult.className = "test-result bad";
      }
    } catch (error) {
      els.testResult.textContent = error.message || String(error);
      els.testResult.className = "test-result bad";
    } finally {
      state.testRunning = false;
      els.btnTest.disabled = false;
    }
  }

  async function loadModels() {
    els.btnModels.disabled = true;
    try {
      const result = await api.listModels({
        baseUrl: els.cfgBaseUrl.value.trim(),
        model: els.cfgModel.value.trim(),
        apiKey: els.cfgApiKey.value.trim(),
      });
      if (result.ok) {
        fillModelList(result.models || []);
        toast(result.models?.length ? `拉到 ${result.models.length} 个模型` : "接口没有返回模型列表");
      } else {
        toast(result.error || "拉取失败", 3200);
      }
    } catch (error) {
      toast(`拉取失败：${error.message || error}`, 3200);
    } finally {
      els.btnModels.disabled = false;
    }
  }

  function fillModelList(models) {
    els.modelList.innerHTML = "";
    for (const model of [...new Set(models)].slice(0, 80)) {
      const option = document.createElement("option");
      option.value = model;
      els.modelList.appendChild(option);
    }
  }

  function updatePinState() {
    const on = Boolean(state.config?.alwaysOnTop);
    els.btnPin.classList.toggle("is-on", on);
    els.btnPin.title = on ? "取消置顶" : "置顶";
  }

  /* ---------------- event wiring ---------------- */

  function bindUi() {
    els.btnPin.addEventListener("click", async () => {
      const next = !state.config.alwaysOnTop;
      state.config.alwaysOnTop = await api.pin(next);
      updatePinState();
      toast(next ? "已置顶" : "已取消置顶");
    });
    els.btnCollapse.addEventListener("click", () => api.setMode(true));
    els.btnHide.addEventListener("click", () => api.hide());
    els.btnSettings.addEventListener("click", () => openSettings());
    els.btnCloseSettings.addEventListener("click", closeSettings);
    els.settings.querySelector(".settings-backdrop").addEventListener("click", closeSettings);
    els.btnSaveSettings.addEventListener("click", saveSettings);
    els.btnTest.addEventListener("click", testConnection);
    els.btnModels.addEventListener("click", loadModels);
    els.btnRevealKey.addEventListener("click", () => {
      const isPassword = els.cfgApiKey.type === "password";
      els.cfgApiKey.type = isPassword ? "text" : "password";
      els.btnRevealKey.textContent = isPassword ? "隐藏" : "显示";
    });
    els.btnGetKey.addEventListener("click", () => {
      api.openExternal("https://platform.deepseek.com/api_keys");
    });
    document.querySelectorAll("#contextMode .seg-btn").forEach((button) => {
      button.addEventListener("click", () => setSegmented(button.dataset.value));
    });
    els.btnInstallPlugin.addEventListener("click", installBridge);
    els.btnRevealPlugin.addEventListener("click", async () => {
      const file = await api.revealPlugin();
      toast(`已打开插件文件：${file}`, 4200);
    });
    els.btnOpenBridge.addEventListener("click", () => api.openPath("bridge"));
    els.btnOpenData.addEventListener("click", () => api.openPath("userData"));
    els.btnClearHistory.addEventListener("click", async () => {
      if (!window.confirm("清空当前论文的对话记录？此操作不能撤销。")) return;
      await api.clearHistory(state.paperId);
      state.messages = [];
      renderAllMessages();
      toast("已清空本篇对话");
    });
    els.btnQuit.addEventListener("click", () => api.quit());
    els.btnRefreshPaper.addEventListener("click", refreshBridge);
    els.btnInstallBridge.addEventListener("click", () => {
      if (state.bridge?.installed) refreshBridge();
      else installBridge();
    });
    els.btnBridgeHelp.addEventListener("click", () => openSettings("bridge"));
    els.btnImage.addEventListener("click", () => grabClipboardImage());
    els.quickScreenshot.addEventListener("click", () => grabClipboardImage());
    els.imageRemove.addEventListener("click", () => {
      clearPendingImage();
      updateSendDisabled();
    });
    document.addEventListener("paste", (event) => {
      const items = [...(event.clipboardData?.items || [])];
      const hasImage = items.some(
        (item) => item.kind === "file" && String(item.type || "").startsWith("image/"),
      );
      if (!hasImage) return;
      event.preventDefault();
      grabClipboardImage();
    });
    els.petBubble.addEventListener("click", () => api.setMode(false));
    els.selectionToggle.addEventListener("click", () => {
      els.selectionBar.classList.toggle("open");
    });
    els.selectionRemove.addEventListener("click", () => {
      state.includeSelection = false;
      state.selectionDismissedKey = state.selectionKey;
      els.selectionBar.hidden = true;
      toast("这段先不带上");
    });

    els.input.addEventListener("input", () => {
      autoGrow();
      updateSendDisabled();
    });
    els.input.addEventListener("focus", () => {
      if (!state.stream) updatePetMood("listening");
    });
    els.input.addEventListener("blur", () => {
      if (!state.stream) updatePetMood("idle");
    });
    els.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (state.stream) abortStream();
        else sendMessage(els.input.value, "general");
      }
    });
    els.btnSend.addEventListener("click", () => {
      if (state.stream) abortStream();
      else sendMessage(els.input.value, "general");
    });

    document.querySelectorAll(".quick-chip").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.mode;
        const config = QUICK[mode];
        if (!config) return;
        if (!currentPaper()) {
          toast("先在 Zotero 打开一篇 PDF，我才能读上下文", 3000);
          return;
        }
        const question = currentSelection() ? config.empty : config.question;
        sendMessage(question, mode);
      });
    });

    document.querySelectorAll(".resize-handle").forEach((handle) => {
      handle.addEventListener("pointerdown", async (event) => {
        if (event.button !== 0 || els.app.classList.contains("is-collapsed")) return;
        event.preventDefault();
        event.stopPropagation();
        try {
          handle.setPointerCapture(event.pointerId);
        } catch (error) {}
        state.resizeEdge = handle.dataset.edge;
        document.body.classList.add("is-resizing");
        document.body.style.cursor = getComputedStyle(handle).cursor;
        await api.beginResize(handle.dataset.edge);
      });
      const endResize = async (event) => {
        if (!state.resizeEdge) return;
        state.resizeEdge = "";
        document.body.classList.remove("is-resizing");
        document.body.style.cursor = "";
        try {
          handle.releasePointerCapture(event.pointerId);
        } catch (error) {}
        await api.endResize();
      };
      handle.addEventListener("pointerup", endResize);
      handle.addEventListener("pointercancel", endResize);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (state.settingsOpen) closeSettings();
        else if (state.stream) abortStream();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        openSettings();
      }
    });

    api.onBridgeState((bridge) => applyBridgeState(bridge, { initial: false }));
    api.onPaperChanged((payload) => {
      state.paperId = payload.paperId;
      state.paper = payload.paper;
      setConversation(payload.history?.messages || []);
      if (payload.paper?.title) toast(`已切换到《${payload.paper.title.slice(0, 38)}》`, 2800);
      updateConnection();
      updatePetMood("idle");
    });
    api.onChatStart((payload) => {
      if (!state.stream) return;
      state.stream.requestId = payload.requestId;
      state.stream.msg.meta = payload.meta || null;
      const meta = payload.meta || {};
      const page = meta.selectionPage || currentPage();
      setThinking(
        true,
        page
          ? `正在读 p.${page}${meta.chunks ? ` · ${meta.chunks} 段原文` : ""}…`
          : "正在翻论文…",
      );
      updatePetMood("thinking");
    });
    api.onChatDelta((payload) => {
      if (!state.stream) return;
      if (state.stream.requestId && payload.requestId !== state.stream.requestId) return;
      state.stream.msg.content += payload.delta || "";
      scheduleStreamUpdate();
    });
    api.onChatReasoning((payload) => {
      if (!state.stream) return;
      if (state.stream.requestId && payload.requestId !== state.stream.requestId) return;
      state.stream.msg.reasoning += payload.delta || "";
      scheduleStreamUpdate();
    });
    api.onChatDone((payload) => {
      if (!state.stream) return;
      if (state.stream.requestId && payload.requestId !== state.stream.requestId) return;
      finishStreamDone(payload);
    });
    api.onChatError((payload) => {
      if (!state.stream) return;
      if (state.stream.requestId && payload.requestId !== state.stream.requestId) return;
      finishStreamError(payload.message || "生成失败", payload.code || "unknown");
    });
    api.onMode(({ collapsed }) => {
      els.app.classList.toggle("is-collapsed", Boolean(collapsed));
      if (!collapsed) setTimeout(() => els.input.focus(), 280);
      updatePetMood("idle");
    });
    api.onOpenSettings(() => openSettings());
  }

  /* ---------------- boot ---------------- */

  async function init() {
    const initial = await api.getState();
    state.demo = Boolean(initial.demo);
    state.config = initial.config;
    state.bridge = initial.bridge;
    state.paths = initial.paths || {};
    state.paper = currentPaper();
    state.paperId = state.demo ? "demo:vmd" : paperKey(initial.bridge);
    setTheme(state.config.theme);
    els.app.classList.toggle("is-collapsed", Boolean(initial.mode?.collapsed));
    updatePinState();
    bindUi();
    applyBridgeState(initial.bridge, { initial: true });
    const messages = initial.history?.messages || [];
    state.messages = messages.map((m, index) => normalizeMessage(m, index));
    renderAllMessages();
    updateConnection();
    updatePetMood("idle");
    startPetRotation();
    autoGrow();
    updateSendDisabled();
    if (!state.demo && !state.config.hasApiKey) {
      // Don't force the settings panel; the welcome card explains what to do.
    }
    if (!initial.mode?.collapsed) {
      setTimeout(() => els.input.focus(), 320);
    }
  }

  init().catch((error) => {
    console.error("[paperpet] init failed", error);
    els.chatList.innerHTML = `<div class="msg assistant is-error"><div class="bubble"><strong>纸读没能启动</strong><br>${escapeHTML(error.message || String(error))}</div></div>`;
  });
})();
