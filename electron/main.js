"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell,
  clipboard,
  globalShortcut,
  nativeTheme,
} = require("electron");

const configStore = require("./config");
const { ZoteroBridge } = require("./zotero-bridge");
const history = require("./history");
const {
  splitPages,
  detectHeadings,
  buildMessages,
  SYSTEM_PROMPT,
} = require("./paper-context");
const { streamChat, testConnection, listModels, LlmError } = require("./llm");

const APP_NAME = "纸读 PaperPet";
const EXPANDED = { width: 410, height: 650 };
const COLLAPSED = { width: 198, height: 258 };
const MIN_EXPANDED = { width: 360, height: 520 };
const MAX_EXPANDED = { width: 760, height: 1000 };
const DEMO_PAPER_ID = "demo:vmd";

app.setName("PaperPet");
try {
  const override = process.env.PAPERPET_USER_DATA;
  app.setPath(
    "userData",
    override
      ? path.resolve(override)
      : path.join(app.getPath("appData"), "PaperPet", "desktop"),
  );
} catch (error) {}
// Chromium's GPU process sandbox is unavailable in some Windows Server /
// remote sessions and aborts before the first window. Renderer isolation is
// still enforced by contextIsolation + no nodeIntegration.
if (process.platform === "win32") app.commandLine.appendSwitch("no-sandbox");

const argv = process.argv.slice(1);
const isDemo = argv.includes("--demo");
const screenshotArg = argv.find((arg) => arg === "--screenshot" || arg.startsWith("--screenshot="));
const isScreenshot = Boolean(screenshotArg);

let mainWindow = null;
let tray = null;
let bridge = null;
let isQuitting = false;
let isCollapsed = false;
let lastPaperIdSent = null;
let currentConfig = null;
let savePositionTimer = null;
let resizeSession = null;
let lastAppliedZoom = 0;
const activeRequests = new Map();

if (process.platform === "win32") app.setAppUserModelId("com.paperpet.desktop");

const gotLock = isScreenshot ? true : app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
}

const DEMO_PAPER = {
  itemID: 101,
  key: "VMD2014X",
  libraryID: 1,
  itemType: "journalArticle",
  title: "Variational Mode Decomposition",
  shortTitle: "VMD",
  creators: [
    { first: "Konstantin", last: "Dragomiretskiy", name: "", type: "author" },
    { first: "Dominique", last: "Zosso", name: "", type: "author" },
  ],
  year: "2014",
  date: "2014",
  venue: "IEEE Transactions on Signal Processing",
  volume: "62",
  issue: "3",
  pages: "531-544",
  doi: "10.1109/TSP.2013.2288675",
  url: "",
  abstract:
    "This paper introduces variational mode decomposition (VMD), a fully intrinsic and adaptive decomposition method. The decomposition is formulated as a constrained variational problem and solved with the alternate direction method of multipliers. Each mode is a narrow-band signal around a center frequency, and the method is shown to be robust to noise and sampling.",
  language: "en",
  extra: "",
  tags: ["variational mode decomposition", "signal processing", "ADMM"],
  collections: ["Reading queue"],
  notes: [],
};

const DEMO_TEXT = [
  `1 Introduction
Signal decomposition is a fundamental tool for analysing non-stationary data. Empirical mode decomposition (EMD) extracts modes recursively, but it is sensitive to noise and lacks a variational formulation. The goal of this paper is to define a decomposition that is fully intrinsic, adaptive, and mathematically well posed.
The key object is an amplitude-modulated / frequency-modulated (AM-FM) mode
u_k(t) = A_k(t) cos(phi_k(t)),
where A_k(t) is a slowly varying envelope and phi_k(t) is the instantaneous phase. The instantaneous frequency is omega_k(t) = phi_k'(t) and is assumed to be non-negative and slowly varying.
2 Variational Formulation
For each mode we compute the analytic signal by means of the Hilbert transform, shift its spectrum to baseband, and minimize the squared bandwidth. This gives the constrained problem
min over {u_k}, {omega_k} of sum_k || d_t [ ( delta(t) + j/(pi t) ) * u_k(t) ] exp(-j omega_k t) ||_2^2
subject to sum_k u_k = f.
The constraint says that the modes must reconstruct the observed signal exactly. The penalty parameter alpha controls the trade-off between bandwidth and reconstruction. A quadratic penalty and a Lagrange multiplier turn the constrained problem into an unconstrained saddle-point problem.
3 Solution by ADMM
The alternate direction method of multipliers updates each mode in the Fourier domain,
u_k^{n+1}(omega) = ( f(omega) - sum_{i != k} u_i(omega) + lambda(omega)/2 ) / ( 1 + 2 alpha (omega - omega_k)^2 ),
and then updates the center frequency by a weighted average of the power spectrum. The multiplier is updated by dual ascent. The algorithm is initialized with zero modes and zero center frequencies; it stops when the relative change of the modes is below a tolerance.
4 Relation to Wiener Filtering
Each mode update is a Wiener filter with a prior centred at omega_k. This explains why VMD is robust to noise: the update shrinks frequencies far from the mode centre. In contrast, EMD uses a recursive sifting procedure and has no explicit noise model.
5 Experiments
The method is tested on synthetic multi-component signals and on real data. In the presence of additive Gaussian noise, VMD recovers the center frequencies more accurately than EMD. The paper also studies the effect of alpha and the number of modes K.
Assumption A1. The modes are narrow-band around their center frequencies.
Assumption A2. The observed signal is square integrable and the modes are mutually orthogonal in the reconstruction sense.
6 Discussion
The variational formulation gives a clear objective and a convergent ADMM scheme. However, the number of modes K must be chosen by the user, and the bandwidth parameter alpha strongly affects the result. The method assumes slowly varying envelopes; for signals with abrupt changes the narrow-band approximation may fail.
References
Dragomiretskiy, K., and Zosso, D. Variational mode decomposition. IEEE TSP, 2014.`,
  `Appendix A. Derivation of the mode update
We derive the update by minimizing the augmented Lagrangian with respect to one mode while holding the others fixed. In the Fourier domain the bandwidth term becomes a multiplication by (1 + 2 alpha (omega - omega_k)^2). Completing the square gives the closed-form update used in Algorithm 1.
The center-frequency update follows from setting the derivative with respect to omega_k to zero. The resulting expression is a power-weighted mean of the frequencies, which is why omega_k can be interpreted as the center of mass of the mode's spectrum.
Appendix B. Convergence
The ADMM scheme is guaranteed to converge for convex objectives with linear constraints. The bandwidth functional is quadratic in the modes, and the constraint is linear, so the standard ADMM convergence result applies. The center-frequency update is a coordinate descent step; in practice it converges quickly, although a global convergence proof for the joint update is not given.`,
];

const DEMO_ANNOTATIONS = [
  {
    text: "The constraint says that the modes must reconstruct the observed signal exactly.",
    comment: "为什么一定要精确重构？允许残差不是更合理吗？",
    pageLabel: "2",
    color: "#ffd400",
  },
  {
    text: "Each mode update is a Wiener filter with a prior centred at omega_k.",
    comment: "这里和 Wiener filter 的联系很关键。",
    pageLabel: "4",
    color: "#5fb236",
  },
];

const DEMO_SELECTION = {
  text: "The constraint says that the modes must reconstruct the observed signal exactly.",
  pageLabel: "2",
  color: "#ffd400",
  source: "selection",
  capturedAt: Date.now(),
  attachmentItemID: 102,
};

const DEMO_STATE = {
  installed: true,
  connected: true,
  stale: false,
  ageMs: 800,
  bridgePath: path.join(process.env.APPDATA || "", "PaperPet", "bridge"),
  data: {
    version: 1,
    plugin: { id: "paperpet@local", version: "1.0.0" },
    status: "reading",
    updatedAt: Date.now(),
    zotero: { version: "10.0.6" },
    paper: DEMO_PAPER,
    attachment: {
      itemID: 102,
      key: "VMD2014A",
      filename: "Dragomiretskiy_Zosso_2014.pdf",
      contentType: "application/pdf",
      pageCount: 14,
      fullTextChars: 48210,
    },
    reader: {
      tabID: "reader-1",
      page: 2,
      pageLabel: "2",
      selection: DEMO_SELECTION,
    },
    selection: DEMO_SELECTION,
    annotations: DEMO_ANNOTATIONS,
  },
};

const DEMO_MESSAGES = [
  {
    role: "assistant",
    content:
      "我在。你已经打开《Variational Mode Decomposition》，我把 PDF 全文和 2 条高亮都接上了。\n\n选中正文或公式后直接问我，或者从下面挑一个：",
    createdAt: Date.now() - 60000,
    meta: { welcome: true },
  },
  {
    role: "user",
    content: "为什么 VMD 要把信号写成一组模态之和？这个约束是怎么来的？",
    createdAt: Date.now() - 42000,
  },
  {
    role: "assistant",
    content:
      "**一句话结论**：VMD 把“分解”写成一个**带精确重构约束的变分问题**，这样每个模态的带宽都有明确目标，而不是像 EMD 那样靠递归筛分。\n\n**约束的来源**：论文要求\n\n$$\\sum_k u_k(t)=f(t)$$\n\n也就是所有模态加起来必须还原观测信号 $f$。它是**建模假设**，不是推导出来的：作者希望分解不丢失信息，所以把残差设为零；噪声和拟合误差留给带宽项 $\\alpha$ 去权衡。\n\n**为什么这样写有好处**：\n1. 目标函数 $\\sum_k \\left\\|\\partial_t\\left[\\left(\\delta+\\frac{j}{\\pi t}\\right)*u_k\\right]e^{-j\\omega_k t}\\right\\|_2^2$ 直接度量每个模态的带宽；\n2. 约束保证 $\\sum_k u_k=f$，于是问题是一个标准的约束优化问题；\n3. 用增广拉格朗日 + ADMM 后，每个 $u_k$ 的更新变成频域里的 Wiener 滤波（p.4）。\n\n**容易误读**：精确重构约束并不意味着 VMD 不能去噪。噪声主要被**带宽先验**抑制，而不是靠留下残差。若你希望允许残差，可以把约束放松为 $\\|\\sum_k u_k-f\\|^2\\le \\epsilon$，但那就不是原文的 formulation 了。\n\n*依据：p.2 §2、p.4 §4。*",
    createdAt: Date.now() - 40000,
    meta: { context: "选段 p.2 · 5 段相关原文", model: "deepseek-chat", durationMs: 4200 },
  },
];

function pluginXpiPath() {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "zotero-plugin", "paperpet-bridge.xpi"),
      path.join(process.resourcesPath, "paperpet-bridge.xpi"),
      path.join(process.resourcesPath, "app.asar.unpacked", "dist", "paperpet-bridge.xpi"),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  }
  const candidates = [
    path.join(__dirname, "..", "dist", "paperpet-bridge.xpi"),
    path.join(__dirname, "..", "zotero-plugin", "dist", "paperpet-bridge.xpi"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function sanitizeBridgeState(state) {
  if (!state) return null;
  const data = state.data
    ? {
        ...state.data,
        attachment: state.data.attachment
          ? { ...state.data.attachment, fullTextFile: undefined }
          : null,
      }
    : null;
  return {
    installed: Boolean(state.installed),
    connected: Boolean(state.connected),
    stale: Boolean(state.stale),
    ageMs: state.ageMs,
    bridgePath: state.bridgePath,
    data,
  };
}

function getPaperId() {
  if (isDemo) return DEMO_PAPER_ID;
  return bridge ? bridge.getPaperId() : null;
}

function getBridgeState() {
  if (isDemo) return DEMO_STATE;
  return bridge ? bridge.getState() : null;
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getDisplayBounds(bounds) {
  try {
    return screen.getDisplayMatching(bounds).workArea;
  } catch (error) {
    return screen.getPrimaryDisplay().workArea;
  }
}

function clampBounds(bounds) {
  const area = getDisplayBounds(bounds);
  const margin = 10;
  const width = Math.min(bounds.width, area.width - margin * 2);
  const height = Math.min(bounds.height, area.height - margin * 2);
  return {
    x: Math.round(Math.min(Math.max(bounds.x, area.x + margin), area.x + area.width - width - margin)),
    y: Math.round(Math.min(Math.max(bounds.y, area.y + margin), area.y + area.height - height - margin)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function defaultBounds(collapsed) {
  const area = screen.getPrimaryDisplay().workArea;
  const size = collapsed ? COLLAPSED : EXPANDED;
  return clampBounds({
    x: area.x + area.width - size.width - 22,
    y: area.y + area.height - size.height - 22,
    ...size,
  });
}

function zoomForSize(width, height) {
  if (isCollapsed) return 1;
  const ratio = (width / EXPANDED.width + height / EXPANDED.height) / 2;
  return Math.min(1.35, Math.max(0.9, Math.round(ratio * 100) / 100));
}

function applyZoomForSize(width, height) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const zoom = zoomForSize(width, height);
  if (Math.abs(zoom - lastAppliedZoom) < 0.005) return;
  lastAppliedZoom = zoom;
  try {
    mainWindow.webContents.setZoomFactor(zoom);
  } catch (error) {
    console.warn("[main] zoom:", error.message);
  }
  send("window:zoom", { zoom });
}

function loadBounds() {
  const config = configStore.load();
  if (Number.isFinite(config.window.x) && Number.isFinite(config.window.y)) {
    const bounds = clampBounds({
      x: config.window.x,
      y: config.window.y,
      width: config.window.collapsed
        ? COLLAPSED.width
        : Math.min(MAX_EXPANDED.width, Math.max(MIN_EXPANDED.width, config.window.width)),
      height: config.window.collapsed
        ? COLLAPSED.height
        : Math.min(MAX_EXPANDED.height, Math.max(MIN_EXPANDED.height, config.window.height)),
    });
    return bounds;
  }
  return defaultBounds(config.window.collapsed);
}

function createWindow() {
  const config = configStore.load();
  currentConfig = config;
  isCollapsed = config.window.collapsed === true;
  const bounds = isScreenshot ? defaultBounds(false) : loadBounds();
  isCollapsed = isScreenshot ? false : bounds.width <= COLLAPSED.width + 10;

  mainWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: !isScreenshot,
    backgroundColor: isScreenshot ? "#e9e3d6" : "#00000000",
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    roundedCorners: false,
    alwaysOnTop: config.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      devTools: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  if (config.alwaysOnTop) mainWindow.setAlwaysOnTop(true, "floating");
  try {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (error) {}

  const query = new URLSearchParams();
  if (isDemo) query.set("demo", "1");
  if (isScreenshot) query.set("screenshot", "1");
  const file = path.join(__dirname, "..", "src", "index.html");
  mainWindow.loadFile(file, { search: query.toString() ? `?${query.toString()}` : "" });

  mainWindow.once("ready-to-show", () => {
    mainWindow.showInactive();
    mainWindow.focus();
    const bounds = mainWindow.getBounds();
    applyZoomForSize(bounds.width, bounds.height);
    if (isScreenshot) {
      setTimeout(() => captureScreenshots(), 1600);
    } else if (argv.includes("--autotest-image")) {
      setTimeout(() => runAutoImageTest(), 1200);
    } else if (argv.includes("--autotest")) {
      setTimeout(() => runAutoTest(), 1200);
    }
  });

  mainWindow.on("move", () => {
    if (!mainWindow || mainWindow.isDestroyed() || isCollapsed) return;
    if (savePositionTimer) clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const [x, y] = mainWindow.getPosition();
      configStore.updateWindowPosition(x, y);
    }, 350);
  });

  mainWindow.on("close", (event) => {
    if (isQuitting || isScreenshot) return;
    event.preventDefault();
    mainWindow.hide();
    if (tray) tray.setToolTip(`${APP_NAME} · 已隐藏，点击托盘图标唤回`);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("blur", () => {
    if (resizeSession) stopResizeSession(true);
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "..", "assets", "tray.png");
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip(`${APP_NAME} · Zotero 论文陪读`);
  const rebuild = () => {
    if (!tray) return;
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: mainWindow && mainWindow.isVisible() ? "隐藏桌宠" : "显示桌宠",
          click: () => (mainWindow && mainWindow.isVisible() ? mainWindow.hide() : showWindow()),
        },
        {
          label: isCollapsed ? "展开研读面板" : "收起成桌宠",
          click: () => setMode(!isCollapsed),
        },
        { type: "separator" },
        {
          label: "设置",
          click: () => {
            showWindow();
            send("app:open-settings");
          },
        },
        {
          label: "打开桥接数据文件夹",
          click: () => {
            const dir = path.join(app.getPath("appData"), "PaperPet", "bridge");
            fs.mkdirSync(dir, { recursive: true });
            shell.openPath(dir);
          },
        },
        { type: "separator" },
        { label: "退出纸读", click: () => quitApp() },
      ]),
    );
  };
  tray.on("click", () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
  tray.on("double-click", () => showWindow());
  rebuild();
  tray._paperPetRebuild = rebuild;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (isCollapsed) setMode(false);
  mainWindow.show();
  mainWindow.focus();
}

function stopResizeSession(save = true) {
  if (!resizeSession) return;
  clearInterval(resizeSession.timer);
  clearTimeout(resizeSession.timeout);
  resizeSession = null;
  if (save && mainWindow && !mainWindow.isDestroyed() && !isCollapsed) {
    const bounds = mainWindow.getBounds();
    configStore.updateWindowSize(bounds.width, bounds.height);
    configStore.updateWindowPosition(bounds.x, bounds.y);
  }
}

function startResizeSession(edge) {
  if (!mainWindow || mainWindow.isDestroyed() || isCollapsed) return null;
  stopResizeSession(false);
  const allowed = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);
  if (!allowed.has(edge)) return null;
  const startCursor = screen.getCursorScreenPoint();
  const startBounds = mainWindow.getBounds();
  resizeSession = {
    edge,
    startCursor,
    startBounds,
    timer: null,
    timeout: null,
  };
  resizeSession.timer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !resizeSession) return;
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - resizeSession.startCursor.x;
    const dy = cursor.y - resizeSession.startCursor.y;
    const start = resizeSession.startBounds;
    let x = start.x;
    let y = start.y;
    let width = start.width;
    let height = start.height;
    if (edge.includes("e")) width = start.width + dx;
    if (edge.includes("w")) {
      width = start.width - dx;
      x = start.x + dx;
    }
    if (edge.includes("s")) height = start.height + dy;
    if (edge.includes("n")) {
      height = start.height - dy;
      y = start.y + dy;
    }
    width = Math.max(MIN_EXPANDED.width, width);
    height = Math.max(MIN_EXPANDED.height, height);
    if (edge.includes("w")) x = start.x + start.width - width;
    if (edge.includes("n")) y = start.y + start.height - height;
    const next = clampBounds({
      x,
      y,
      width: Math.min(MAX_EXPANDED.width, width),
      height: Math.min(MAX_EXPANDED.height, height),
    });
    const current = mainWindow.getBounds();
    if (
      current.x !== next.x ||
      current.y !== next.y ||
      current.width !== next.width ||
      current.height !== next.height
    ) {
      mainWindow.setBounds(next);
      applyZoomForSize(next.width, next.height);
    }
  }, 16);
  resizeSession.timeout = setTimeout(() => stopResizeSession(true), 30000);
  return { edge, bounds: startBounds };
}

function setMode(collapsed) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopResizeSession(false);
  const next = Boolean(collapsed);
  if (next === isCollapsed) {
    send("window:mode", { collapsed: next });
    return;
  }
  const old = mainWindow.getBounds();
  const config = configStore.load();
  if (!isCollapsed) {
    configStore.updateWindowSize(old.width, old.height);
  }
  const size = next
    ? COLLAPSED
    : {
        width: Math.min(MAX_EXPANDED.width, Math.max(MIN_EXPANDED.width, config.window.width)),
        height: Math.min(MAX_EXPANDED.height, Math.max(MIN_EXPANDED.height, config.window.height)),
      };
  const bounds = clampBounds({
    x: old.x + old.width - size.width,
    y: old.y + old.height - size.height,
    ...size,
  });
  isCollapsed = next;
  mainWindow.setBounds(bounds);
  configStore.updateWindowMode(next);
  configStore.updateWindowPosition(bounds.x, bounds.y);
  applyZoomForSize(bounds.width, bounds.height);
  send("window:mode", { collapsed: next });
  if (tray && tray._paperPetRebuild) tray._paperPetRebuild();
}

function quitApp() {
  isQuitting = true;
  stopResizeSession(true);
  if (bridge) bridge.stop();
  for (const controller of activeRequests.values()) {
    try {
      controller.abort();
    } catch (error) {}
  }
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

function applyConfigSideEffects(previous = {}) {
  const config = configStore.load();
  nativeTheme.themeSource = config.theme || "system";
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(config.alwaysOnTop, config.alwaysOnTop ? "floating" : "normal");
  }
  if (app.isPackaged) {
    try {
      app.setLoginItemSettings({
        openAtLogin: config.autoLaunch,
        path: process.execPath,
        args: [],
      });
    } catch (error) {
      console.warn("[main] auto-launch:", error.message);
    }
  }
  if (previous.globalShortcut !== config.globalShortcut || !globalShortcut.isRegistered(config.globalShortcut)) {
    if (previous.globalShortcut) {
      try {
        globalShortcut.unregister(previous.globalShortcut);
      } catch (error) {}
    }
    try {
      globalShortcut.register(config.globalShortcut, () => {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) mainWindow.hide();
        else showWindow();
      });
    } catch (error) {
      console.warn("[main] global shortcut:", error.message);
    }
  }
}

function wireBridge() {
  bridge = new ZoteroBridge({ appData: app.getPath("appData") });
  bridge.on("state", (state) => {
    const sanitized = sanitizeBridgeState(state);
    const paperId = state.data?.paper ? `${state.data.paper.libraryID}:${state.data.paper.key}` : null;
    if (paperId && paperId !== lastPaperIdSent) {
      lastPaperIdSent = paperId;
      send("paper:changed", {
        paperId,
        paper: state.data.paper,
        history: history.load(paperId),
      });
    }
    send("bridge:state", sanitized);
  });
  bridge.start(1000);
}

function buildConversationContext({ question, mode, includeSelection, config }) {
  const state = getBridgeState();
  const data = state?.data;
  const paper = data?.paper || null;
  const fullText = isDemo ? DEMO_TEXT.join("\f") : bridge.readFullText();
  const pageCount = data?.attachment?.pageCount || 0;
  const pages = splitPages(fullText, pageCount);
  const headings = detectHeadings(pages);
  const selection = includeSelection === false ? null : data?.selection || null;
  const page = Number(data?.reader?.page) || 0;
  const paperId = isDemo ? DEMO_PAPER_ID : getPaperId();
  const saved = isDemo
    ? { messages: DEMO_MESSAGES.slice(0, -1).map(({ role, content }) => ({ role, content })) }
    : history.load(paperId);
  const built = buildMessages({
    paper,
    pages,
    headings,
    annotations: data?.annotations || [],
    selection,
    page,
    question,
    history: saved.messages,
    contextMode: config.contextMode,
    maxChars: config.contextChars,
    systemPrompt: SYSTEM_PROMPT,
    mode,
  });
  return {
    ...built,
    paper,
    paperId,
    pages: pages.length,
    fullTextChars: fullText.length,
    savedMessages: saved.messages,
    selection,
  };
}

async function runDemoStream({ requestId, question, mode, controller }) {
  const answer =
    mode === "quiz"
      ? "**自测：VMD 的变分形式**\n\n1. 约束 $\\sum_k u_k=f$ 在建模上起什么作用？如果放松成不等式，目标函数需要怎样改？\n2. 为什么每个模态的更新可以解释成以 $\\omega_k$ 为中心的 Wiener 滤波？\n3. 若信号含 abrupt change，Assumption A1 的窄带近似会怎样失效？\n\n**参考答案**\n\n1. 它保证分解不丢信息；放松后应加一个残差惩罚 $\\lambda\\|\\sum_k u_k-f\\|_2^2$，否则问题会退化为把每个模态压到零。\n2. 频域分母 $1+2\\alpha(\\omega-\\omega_k)^2$ 是先验方差，分子是观测减去其他模态，正是 Wiener 解的形式（p.4）。\n3. 包络不再慢变，瞬时频率不再良定义，窄带假设失效，中心频率更新会变得不稳定。"
      : "**一句话结论**：VMD 的出发点是给“模态分解”一个明确的目标函数，而不是依赖递归筛分。\n\n约束 $\\sum_k u_k=f$ 是**精确重构假设**：作者希望分解不丢失观测信息；噪声由每个模态的带宽惩罚 $\\alpha$ 控制。更新式\n\n$$u_k^{n+1}(\\omega)=\\frac{f(\\omega)-\\sum_{i\\neq k}u_i(\\omega)+\\lambda(\\omega)/2}{1+2\\alpha(\\omega-\\omega_k)^2}$$\n\n在频域里就是一个以 $\\omega_k$ 为中心的 Wiener 滤波。\n\n**容易误读**：精确重构不等于不能去噪；去噪来自窄带先验，而不是残差项。\n\n*依据：p.2 §2、p.4 §4。*";
  const chunks = answer.match(/[\s\S]{1,14}/g) || [answer];
  let text = "";
  for (const chunk of chunks) {
    if (controller.signal.aborted) break;
    text += chunk;
    send("chat:delta", { requestId, delta: chunk });
    await new Promise((resolve) => setTimeout(resolve, 38));
  }
  return { text, reasoning: "", usage: null };
}

function registerIpc() {
  ipcMain.handle("app:get-state", () => {
    const config = configStore.publicConfig();
    const state = sanitizeBridgeState(getBridgeState());
    const paperId = getPaperId();
    return {
      demo: isDemo,
      version: app.getVersion(),
      mode: { collapsed: isCollapsed },
      config,
      bridge: state,
      history: isDemo
        ? { paperId: DEMO_PAPER_ID, paperTitle: DEMO_PAPER.title, messages: DEMO_MESSAGES }
        : history.load(paperId),
      paths: {
        bridge: state?.bridgePath || path.join(app.getPath("appData"), "PaperPet", "bridge"),
        plugin: pluginXpiPath(),
        userData: app.getPath("userData"),
      },
    };
  });

  ipcMain.handle("clipboard:read-image", () => readClipboardImage());

  ipcMain.handle("app:open-external", (event, url) => {
    if (/^https?:\/\//i.test(String(url || ""))) return shell.openExternal(String(url));
    return false;
  });

  ipcMain.handle("app:open-path", (event, target) => {
    const allowed = ["bridge", "userData", "plugin"].includes(String(target));
    if (!allowed) return false;
    let targetPath = "";
    if (target === "bridge") targetPath = path.join(app.getPath("appData"), "PaperPet", "bridge");
    if (target === "userData") targetPath = app.getPath("userData");
    if (target === "plugin") targetPath = path.dirname(pluginXpiPath());
    fs.mkdirSync(targetPath, { recursive: true });
    shell.openPath(targetPath);
    return true;
  });

  ipcMain.handle("plugin:reveal", () => {
    const file = pluginXpiPath();
    if (fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(path.dirname(file));
    return file;
  });

  ipcMain.handle("plugin:copy-path", () => {
    const file = pluginXpiPath();
    clipboard.writeText(file);
    return file;
  });

  ipcMain.handle("plugin:install", () => installPlugin());

  ipcMain.handle("window:set-mode", (event, collapsed) => {
    setMode(Boolean(collapsed));
    return { collapsed: isCollapsed };
  });

  ipcMain.handle("window:get-bounds", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    return mainWindow.getBounds();
  });

  ipcMain.handle("window:begin-resize", (event, edge) => startResizeSession(String(edge || "")));

  ipcMain.handle("window:end-resize", () => {
    stopResizeSession(true);
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  });

  ipcMain.handle("window:set-bounds", (event, bounds = {}) => {
    if (!mainWindow || mainWindow.isDestroyed() || isCollapsed) return null;
    const area = getDisplayBounds({
      x: Number(bounds.x) || 0,
      y: Number(bounds.y) || 0,
      width: Number(bounds.width) || EXPANDED.width,
      height: Number(bounds.height) || EXPANDED.height,
    });
    const width = Math.round(
      Math.min(area.width, Math.max(MIN_EXPANDED.width, Number(bounds.width) || EXPANDED.width)),
    );
    const height = Math.round(
      Math.min(area.height, Math.max(MIN_EXPANDED.height, Number(bounds.height) || EXPANDED.height)),
    );
    const next = clampBounds({
      x: Math.round(Number(bounds.x) || 0),
      y: Math.round(Number(bounds.y) || 0),
      width,
      height,
    });
    mainWindow.setBounds(next);
    applyZoomForSize(next.width, next.height);
    if (savePositionTimer) clearTimeout(savePositionTimer);
    savePositionTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const current = mainWindow.getBounds();
      configStore.updateWindowSize(current.width, current.height);
      configStore.updateWindowPosition(current.x, current.y);
    }, 320);
    return next;
  });

  ipcMain.handle("window:resize-end", () => {
    if (!mainWindow || mainWindow.isDestroyed() || isCollapsed) return null;
    const bounds = mainWindow.getBounds();
    configStore.updateWindowSize(bounds.width, bounds.height);
    configStore.updateWindowPosition(bounds.x, bounds.y);
    applyZoomForSize(bounds.width, bounds.height);
    return bounds;
  });

  ipcMain.handle("window:hide", () => {
    mainWindow?.hide();
    return true;
  });

  ipcMain.handle("window:pin", (event, value) => {
    const on = Boolean(value);
    configStore.save({ alwaysOnTop: on });
    if (mainWindow) mainWindow.setAlwaysOnTop(on, on ? "floating" : "normal");
    return on;
  });

  ipcMain.handle("window:quit", () => {
    quitApp();
    return true;
  });

  ipcMain.handle("bridge:refresh", () => {
    if (!bridge) return null;
    const state = bridge.refresh(true);
    return sanitizeBridgeState(state);
  });

  ipcMain.handle("chat:history", (event, paperId) => {
    const current = getPaperId();
    if (paperId && paperId !== current) return { messages: [] };
    return history.load(current);
  });

  ipcMain.handle("chat:clear", (event, paperId) => {
    history.clear(paperId || getPaperId());
    return true;
  });

  ipcMain.handle("chat:send", async (event, payload = {}) => {
    const config = configStore.load();
    const apiKey = configStore.getApiKey();
    const question = String(payload.question || "").trim();
    const mode = String(payload.mode || "general");
    if (!question) throw new Error("问题不能为空");

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    activeRequests.set(requestId, controller);

    if (!isDemo && !apiKey) {
      activeRequests.delete(requestId);
      throw new Error("还没有配置 API Key。点右上角设置，填入 DeepSeek（或任意 OpenAI 兼容接口）的 Key。");
    }

    const built = buildConversationContext({
      question,
      mode,
      includeSelection: payload.includeSelection,
      config,
    });
    let image = null;
    if (payload.image) {
      image = prepareImage(payload.image, payload.imagePreview || "");
    }
    const visionModel = config.visionModel || config.model;
    if (image) {
      const last = built.messages[built.messages.length - 1];
      const instruction =
        "\n\n<user_screenshot>\n用户随问题附上了一张 PDF 截图，可能是公式、定理或推导片段。请先逐字转写图中内容；公式用 LaTeX，并标注看不清的地方，然后再解释。\n</user_screenshot>";
      last.content = [
        { type: "text", text: String(last.content) + instruction },
        { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } },
      ];
    }
    const meta = {
      ...built.meta,
      paperTitle: built.paper?.title || "",
      mode,
      pages: built.pages,
      fullTextChars: built.fullTextChars,
      selectionIncluded: Boolean(built.selection),
      selectionPage: built.selection?.pageLabel || built.meta.selectionPage || null,
      contextMode: config.contextMode,
      model: image ? visionModel : config.model,
      hasImage: Boolean(image),
      imageWidth: image?.width || 0,
      imageHeight: image?.height || 0,
    };
    send("chat:start", { requestId, meta, image: image?.preview || "" });
    const started = Date.now();
    let streamedText = "";
    let streamedReasoning = "";

    try {
      const result = isDemo
        ? await runDemoStream({ requestId, question, mode, controller })
        : await streamChat({
            config: { ...config, apiKey, model: image ? visionModel : config.model },
            messages: built.messages,
            signal: controller.signal,
            onDelta: (delta) => {
              streamedText += delta;
              send("chat:delta", { requestId, delta });
            },
            onReasoning: (delta) => {
              streamedReasoning += delta;
              send("chat:reasoning", { requestId, delta });
            },
          });

      const durationMs = Date.now() - started;
      meta.durationMs = durationMs;
      if (!isDemo) {
        const saved = history.load(built.paperId);
        saved.messages.push(
          {
            role: "user",
            content: question,
            createdAt: started,
            image: image?.preview || "",
            imageMeta: image ? { width: image.width, height: image.height } : null,
          },
          {
            role: "assistant",
            content: result.text,
            reasoning: result.reasoning,
            createdAt: Date.now(),
            meta,
          },
        );
        history.save(built.paperId, saved.messages, built.paper?.title || "");
      }
      send("chat:done", {
        requestId,
        meta,
        usage: result.usage,
        durationMs,
        aborted: controller.signal.aborted,
      });
      return { requestId };
    } catch (error) {
      const code = error instanceof LlmError ? error.code : "unknown";
      if (code === "aborted" || controller.signal.aborted) {
        const durationMs = Date.now() - started;
        meta.durationMs = durationMs;
        meta.aborted = true;
        if (!isDemo) {
          const saved = history.load(built.paperId);
          saved.messages.push(
            {
              role: "user",
              content: question,
              createdAt: started,
              image: image?.preview || "",
              imageMeta: image ? { width: image.width, height: image.height } : null,
            },
            {
              role: "assistant",
              content: streamedText || "（已停止）",
              reasoning: streamedReasoning,
              createdAt: Date.now(),
              meta,
            },
          );
          history.save(built.paperId, saved.messages, built.paper?.title || "");
        }
        send("chat:done", {
          requestId,
          meta,
          usage: null,
          durationMs,
          aborted: true,
        });
        return { requestId, aborted: true };
      }
      const message =
        error instanceof LlmError ? error.message : String(error.message || error);
      const finalMessage =
        image && /400|415|422/.test(String(error.status || ""))
          ? `${message}（当前模型可能不支持图片输入，请在设置里填写“截图 / 图片理解模型”。）`
          : message;
      send("chat:error", { requestId, message: finalMessage, code, meta });
      return { requestId, error: finalMessage };
    } finally {
      activeRequests.delete(requestId);
    }
  });

  ipcMain.handle("chat:abort", (event, requestId) => {
    const controller = activeRequests.get(requestId);
    if (controller) controller.abort();
    return Boolean(controller);
  });

  ipcMain.handle("config:save", (event, patch = {}) => {
    const previous = configStore.load();
    const allowed = [
      "baseUrl",
      "model",
      "visionModel",
      "temperature",
      "maxTokens",
      "contextMode",
      "contextChars",
      "showReasoning",
      "alwaysOnTop",
      "autoLaunch",
      "theme",
      "globalShortcut",
      "onboardingDone",
    ];
    const clean = {};
    for (const key of allowed) {
      if (patch[key] !== undefined) clean[key] = patch[key];
    }
    if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
      configStore.setApiKey(patch.apiKey);
    }
    if (patch.clearKey === true) configStore.setApiKey("");
    const saved = configStore.save(clean);
    currentConfig = saved;
    applyConfigSideEffects(previous);
    return configStore.publicConfig();
  });

  ipcMain.handle("config:test", async (event, payload = {}) => {
    const saved = configStore.load();
    const apiKey = String(payload.apiKey || "").trim() || configStore.getApiKey();
    if (!apiKey) return { ok: false, error: "请先填写 API Key" };
    return testConnection({
      config: {
        baseUrl: payload.baseUrl || saved.baseUrl,
        model: payload.model || saved.model,
        apiKey,
      },
    });
  });

  ipcMain.handle("config:models", async (event, payload = {}) => {
    const saved = configStore.load();
    const apiKey = String(payload.apiKey || "").trim() || configStore.getApiKey();
    if (!apiKey) return { ok: false, error: "请先填写 API Key" };
    try {
      const models = await listModels({
        config: {
          baseUrl: payload.baseUrl || saved.baseUrl,
          model: payload.model || saved.model,
          apiKey,
        },
      });
      return { ok: true, models };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });
}

function zoteroIsRunning() {
  if (process.platform !== "win32") return false;
  try {
    const output = execFileSync(
      "tasklist",
      ["/FI", "IMAGENAME eq zotero.exe", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    return /zotero\.exe/i.test(output);
  } catch (error) {
    return false;
  }
}

function findZoteroProfile() {
  const profilesIni = path.join(app.getPath("appData"), "Zotero", "Zotero", "profiles.ini");
  try {
    const ini = fs.readFileSync(profilesIni, "utf8");
    const blocks = ini.split(/\[/).map((block) => block.trim());
    let fallback = null;
    for (const block of blocks) {
      const isDefault = /Default=1/i.test(block);
      const match = block.match(/Path=(.+)/);
      if (!match) continue;
      const dir = path.isAbsolute(match[1])
        ? match[1]
        : path.join(path.dirname(profilesIni), match[1]);
      if (isDefault) return dir;
      if (!fallback) fallback = dir;
    }
    return fallback;
  } catch (error) {
    return null;
  }
}

function extensionEntry(profileDir, xpi) {
  const fileUri = "file:///" + xpi.replace(/\\/g, "/");
  return {
    id: "paperpet@local",
    syncGUID: `{${crypto.randomUUID()}}`,
    version: "1.0.0",
    type: "extension",
    loader: null,
    updateURL: null,
    installOrigins: null,
    manifestVersion: 2,
    optionsURL: null,
    optionsType: null,
    optionsBrowserStyle: true,
    aboutURL: null,
    defaultLocale: {
      name: "PaperPet Bridge",
      description: "Tells PaperPet which paper you are reading in Zotero.",
      creator: "PaperPet",
      homepageURL: null,
    },
    visible: true,
    active: true,
    userDisabled: false,
    appDisabled: false,
    embedderDisabled: false,
    installDate: Date.now(),
    updateDate: Date.now(),
    applyBackgroundUpdates: 1,
    path: xpi,
    skinnable: false,
    sourceURI: fileUri,
    releaseNotesURI: null,
    softDisabled: false,
    foreignInstall: true,
    strictCompatibility: true,
    locales: [],
    targetApplications: [
      { id: "zotero@zotero.org", minVersion: "7.0", maxVersion: "10.0.*" },
    ],
    targetPlatforms: [],
    signedState: 0,
    signedTypes: [],
    signedDate: null,
    seen: true,
    dependencies: [],
    incognito: "spanning",
    userPermissions: { permissions: [], origins: [], data_collection: [] },
    optionalPermissions: { permissions: [], origins: [], data_collection: [] },
    requestedPermissions: { permissions: [], origins: [], data_collection: [] },
    icons: { 48: "icon.png", 96: "icon.png" },
    iconURL: null,
    blocklistAttentionDismissed: false,
    blocklistState: 0,
    blocklistURL: null,
    startupData: null,
    hidden: false,
    installTelemetryInfo: { source: "about:addons", method: "install-from-file" },
    recommendationState: null,
    rootURI: `jar:${fileUri}!/`,
    location: "app-profile",
  };
}

function prepareImage(dataUrl, fallbackPreview = "") {
  const value = String(dataUrl || "");
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(value)) {
    throw new Error("图片格式不支持，请重新截图。");
  }
  let image = nativeImage.createFromDataURL(value);
  if (image.isEmpty()) throw new Error("无法读取这张图片，请重新截图。");
  const original = image.getSize();
  const maxSide = 1800;
  if (Math.max(original.width, original.height) > maxSide) {
    const scale = maxSide / Math.max(original.width, original.height);
    image = image.resize({
      width: Math.round(original.width * scale),
      height: Math.round(original.height * scale),
      quality: "good",
    });
  }
  const png = image.toPNG();
  if (!png || png.length > 12 * 1024 * 1024) {
    throw new Error("图片太大，请截取公式附近的一小块。");
  }
  const size = image.getSize();
  const previewWidth = Math.min(360, size.width);
  const previewImage =
    size.width > previewWidth ? image.resize({ width: previewWidth, quality: "good" }) : image;
  return {
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    preview:
      fallbackPreview && fallbackPreview.startsWith("data:image/")
        ? fallbackPreview
        : `data:image/jpeg;base64,${previewImage.toJPEG(72).toString("base64")}`,
    width: size.width,
    height: size.height,
  };
}

function readClipboardImage() {
  let image = clipboard.readImage();
  if (image.isEmpty()) {
    return { ok: false, error: "剪贴板里没有图片。先按 Win+Shift+S 截图，再点这里。" };
  }
  const original = image.getSize();
  const maxSide = 1800;
  if (Math.max(original.width, original.height) > maxSide) {
    const scale = maxSide / Math.max(original.width, original.height);
    image = image.resize({
      width: Math.round(original.width * scale),
      height: Math.round(original.height * scale),
      quality: "good",
    });
  }
  const png = image.toPNG();
  if (!png || png.length > 12 * 1024 * 1024) {
    return { ok: false, error: "图片太大了，请截取公式附近的一小块。" };
  }
  const fullSize = image.getSize();
  let previewWidth = Math.min(360, fullSize.width);
  const previewImage =
    fullSize.width > previewWidth
      ? image.resize({ width: previewWidth, quality: "good" })
      : image;
  const preview = previewImage.toJPEG(72);
  return {
    ok: true,
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    preview: `data:image/jpeg;base64,${preview.toString("base64")}`,
    width: fullSize.width,
    height: fullSize.height,
  };
}

function installPlugin() {
  const xpi = pluginXpiPath();
  if (!fs.existsSync(xpi)) {
    return { ok: false, error: "找不到桥接插件文件，请先运行 pnpm build:plugin。" };
  }
  if (zoteroIsRunning()) {
    return {
      ok: false,
      needsZoteroClosed: true,
      error: "请先完全退出 Zotero（托盘里也要退出），再点安装。装好后重新打开 Zotero 即可。",
    };
  }
  const profileDir = findZoteroProfile();
  if (!profileDir || !fs.existsSync(profileDir)) {
    return {
      ok: false,
      error: "没有找到 Zotero 配置目录。请按 README 在 Zotero 的插件管理器里手动安装。",
    };
  }
  try {
    const extDir = path.join(profileDir, "extensions");
    fs.mkdirSync(extDir, { recursive: true });
    const target = path.join(extDir, "paperpet@local.xpi");
    fs.copyFileSync(xpi, target);

    const registry = path.join(profileDir, "extensions.json");
    let data = { schemaVersion: 37, addons: [] };
    if (fs.existsSync(registry)) {
      try {
        data = JSON.parse(fs.readFileSync(registry, "utf8"));
      } catch (error) {
        return { ok: false, error: "Zotero 的插件索引无法解析，请手动安装。" };
      }
      fs.copyFileSync(registry, registry + ".paperpet.bak");
    }
    data.addons = (Array.isArray(data.addons) ? data.addons : []).filter(
      (addon) => addon && addon.id !== "paperpet@local",
    );
    data.addons.push(extensionEntry(profileDir, target));
    fs.writeFileSync(registry, JSON.stringify(data, null, 0), "utf8");
    return {
      ok: true,
      target,
      profileDir,
      message: "已安装 PaperPet Bridge。重新打开 Zotero 即可生效。",
    };
  } catch (error) {
    return { ok: false, error: `安装失败：${error.message}` };
  }
}

async function captureScreenshots() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const outArg = screenshotArg.includes("=") ? screenshotArg.split("=")[1] : "";
  const out = path.resolve(outArg || path.join(process.cwd(), "artifacts", "ui.png"));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    await mainWindow.webContents.executeJavaScript("document.fonts.ready");
    await mainWindow.webContents.executeJavaScript(
      "document.getElementById('chatScroll').scrollTop = 0; document.body.classList.add('screenshot');",
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());
    console.log("[screenshot] wrote", out);

    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const bubbles = [...document.querySelectorAll('.msg.assistant .bubble')];
        bubbles[bubbles.length - 1]?.scrollIntoView({ block: 'start' });
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const formulaImage = await mainWindow.webContents.capturePage();
    const formulaPath = out.replace(/\.png$/i, "-formula.png");
    fs.writeFileSync(formulaPath, formulaImage.toPNG());
    console.log("[screenshot] wrote", formulaPath);

    await mainWindow.webContents.executeJavaScript("document.getElementById('btnSettings').click()");
    await new Promise((resolve) => setTimeout(resolve, 450));
    const settingsImage = await mainWindow.webContents.capturePage();
    const settingsPath = out.replace(/\.png$/i, "-settings.png");
    fs.writeFileSync(settingsPath, settingsImage.toPNG());
    console.log("[screenshot] wrote", settingsPath);
    await mainWindow.webContents.executeJavaScript(
      "document.getElementById('btnCloseSettings').click()",
    );
    await new Promise((resolve) => setTimeout(resolve, 250));

    const oldBounds = mainWindow.getBounds();
    const resized = clampBounds({
      x: oldBounds.x - 75,
      y: oldBounds.y - 55,
      width: 560,
      height: 760,
    });
    mainWindow.setBounds(resized);
    applyZoomForSize(resized.width, resized.height);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const resizedImage = await mainWindow.webContents.capturePage();
    const resizedPath = out.replace(/\.png$/i, "-resized.png");
    fs.writeFileSync(resizedPath, resizedImage.toPNG());
    console.log("[screenshot] wrote", resizedPath);

    setMode(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const collapsed = await mainWindow.webContents.capturePage();
    const collapsedPath = out.replace(/\.png$/i, "-collapsed.png");
    fs.writeFileSync(collapsedPath, collapsed.toPNG());
    console.log("[screenshot] wrote", collapsedPath);
  } catch (error) {
    console.error("[screenshot] failed:", error);
  } finally {
    isQuitting = true;
    app.quit();
  }
}

async function runAutoImageTest() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.webContents.executeJavaScript(
      "document.getElementById('btnImage').click()",
    );
    await new Promise((resolve) => setTimeout(resolve, 700));
    const previewState = await mainWindow.webContents.executeJavaScript(`
      (() => ({
        imageBarHidden: document.getElementById('imageBar').hidden,
        thumb: document.getElementById('imageThumb').getAttribute('src')?.slice(0, 30) || '',
      }))()
    `);
    console.log("[auto-image] preview", JSON.stringify(previewState));
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('input');
        input.value = '这张截图里的公式怎么理解？';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('btnSend').click();
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const out = path.resolve(path.join(process.cwd(), "artifacts", "autotest-image.png"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());
    const result = await mainWindow.webContents.executeJavaScript(`
      (() => ({
        images: document.querySelectorAll('.msg-image:not([hidden])').length,
        context: document.querySelector('.msg-context')?.innerText || '',
      }))()
    `);
    console.log("[auto-image]", JSON.stringify(result), "wrote", out);
  } catch (error) {
    console.error("[auto-image] failed:", error);
  } finally {
    isQuitting = true;
    app.quit();
  }
}

async function runAutoTest() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('input');
        input.value = '为什么约束要求精确重构？如果允许残差会怎样？';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('btnSend').click();
        return true;
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const bubbles = [...document.querySelectorAll('.msg .bubble')];
        return {
          count: bubbles.length,
          last: bubbles[bubbles.length - 1]?.innerText?.slice(0, 500) || '',
          math: document.querySelectorAll('.katex').length,
          connection: document.getElementById('connection').innerText,
        };
      })()
    `);
    console.log("[autotest]", JSON.stringify(result));
    const out = path.resolve(path.join(process.cwd(), "artifacts", "autotest.png"));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const image = await mainWindow.webContents.capturePage();
    fs.writeFileSync(out, image.toPNG());
    console.log("[autotest] wrote", out);
  } catch (error) {
    console.error("[autotest] failed:", error);
  } finally {
    isQuitting = true;
    app.quit();
  }
}

async function init() {
  configStore.load();
  registerIpc();
  if (!isDemo) wireBridge();
  createWindow();
  createTray();
  applyConfigSideEffects({});
}

if (argv.includes("--install-bridge")) {
  app.whenReady().then(() => {
    const result = installPlugin();
    console.log("[install-bridge]", JSON.stringify(result));
    app.exit(result.ok ? 0 : 1);
  });
} else if (argv.includes("--selftest")) {
  app.whenReady().then(() => {
    configStore.setApiKey("sk-local-test-1234");
    const pub = configStore.publicConfig();
    const check = {
      hasApiKey: pub.hasApiKey,
      masked: pub.maskedKey,
      keySource: pub.keySource,
      roundtrip: configStore.getApiKey() === "sk-local-test-1234",
      configPath: configStore.configPath(),
    };
    configStore.setApiKey("");
    console.log("[selftest]", JSON.stringify(check));
    app.exit(check.hasApiKey && check.roundtrip ? 0 : 1);
  });
} else {
  app.whenReady().then(init).catch((error) => {
    console.error("[main] init failed:", error);
    app.quit();
  });
}

app.on("activate", () => showWindow());
app.on("window-all-closed", () => {
  if (isQuitting || isScreenshot) app.quit();
});
app.on("before-quit", () => {
  isQuitting = true;
  if (bridge) bridge.stop();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
