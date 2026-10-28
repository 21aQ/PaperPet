"use strict";

const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const DEFAULTS = {
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-chat",
  visionModel: "",
  apiKeyEnc: "",
  temperature: 0.3,
  maxTokens: 3000,
  contextMode: "smart",
  contextChars: 60000,
  showReasoning: false,
  alwaysOnTop: true,
  autoLaunch: false,
  theme: "system",
  globalShortcut: "CommandOrControl+Alt+P",
  window: {
    x: null,
    y: null,
    width: 410,
    height: 650,
    collapsed: false,
  },
  onboardingDone: false,
};

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeBaseUrl(value) {
  let url = String(value || "").trim();
  if (!url) url = DEFAULTS.baseUrl;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url.replace(/\/+$/, "");
}

function encryptKey(key) {
  const value = String(key || "").trim();
  if (!value) return "";
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return "enc:" + safeStorage.encryptString(value).toString("base64");
    }
  } catch (error) {
    console.warn("[config] safeStorage unavailable:", error.message);
  }
  return "b64:" + Buffer.from(value, "utf8").toString("base64");
}

function decryptKey(enc) {
  if (!enc) return "";
  try {
    if (enc.startsWith("enc:")) {
      return safeStorage.decryptString(Buffer.from(enc.slice(4), "base64"));
    }
    if (enc.startsWith("b64:")) {
      return Buffer.from(enc.slice(4), "base64").toString("utf8");
    }
  } catch (error) {
    console.warn("[config] cannot decrypt API key:", error.message);
  }
  return "";
}

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn("[config] read failed:", error.message);
    return {};
  }
}

let cache = null;

function normalize(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const windowRaw = source.window && typeof source.window === "object" ? source.window : {};
  const config = {
    ...DEFAULTS,
    ...source,
    baseUrl: normalizeBaseUrl(source.baseUrl),
    model: String(source.model || DEFAULTS.model).trim() || DEFAULTS.model,
    visionModel: String(source.visionModel || "").trim(),
    temperature: clampNumber(source.temperature, 0, 1.5, DEFAULTS.temperature),
    maxTokens: Math.round(clampNumber(source.maxTokens, 256, 16384, DEFAULTS.maxTokens)),
    contextChars: Math.round(clampNumber(source.contextChars, 12000, 240000, DEFAULTS.contextChars)),
    contextMode: ["smart", "full", "selection"].includes(source.contextMode)
      ? source.contextMode
      : DEFAULTS.contextMode,
    alwaysOnTop: source.alwaysOnTop !== false,
    autoLaunch: source.autoLaunch === true,
    showReasoning: source.showReasoning === true,
    theme: ["system", "light", "dark"].includes(source.theme) ? source.theme : "system",
    globalShortcut:
      typeof source.globalShortcut === "string" && source.globalShortcut.trim()
        ? source.globalShortcut.trim()
        : DEFAULTS.globalShortcut,
    window: {
      x: Number.isFinite(Number(windowRaw.x)) ? Number(windowRaw.x) : null,
      y: Number.isFinite(Number(windowRaw.y)) ? Number(windowRaw.y) : null,
      width: Math.round(clampNumber(windowRaw.width, 360, 760, DEFAULTS.window.width)),
      height: Math.round(clampNumber(windowRaw.height, 520, 1000, DEFAULTS.window.height)),
      collapsed: windowRaw.collapsed === true,
    },
    onboardingDone: source.onboardingDone === true,
  };
  return config;
}

function load() {
  if (cache) return cache;
  const raw = readRaw();
  cache = normalize(raw);
  cache._envKey = String(process.env.DEEPSEEK_API_KEY || process.env.PAPERPET_API_KEY || "").trim();
  return cache;
}

function save(patch) {
  const current = load();
  const nextRaw = { ...current, ...(patch || {}) };
  delete nextRaw._envKey;
  const next = normalize(nextRaw);
  cache = { ...next, _envKey: current._envKey };
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), "utf8");
  } catch (error) {
    console.error("[config] write failed:", error.message);
  }
  return cache;
}

function getApiKey() {
  const config = load();
  return decryptKey(config.apiKeyEnc) || config._envKey || "";
}

function setApiKey(key) {
  const config = load();
  const value = String(key || "").trim();
  config.apiKeyEnc = encryptKey(value);
  save({ apiKeyEnc: config.apiKeyEnc });
}

function publicConfig() {
  const config = load();
  const key = getApiKey();
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    visionModel: config.visionModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    contextMode: config.contextMode,
    contextChars: config.contextChars,
    showReasoning: config.showReasoning,
    alwaysOnTop: config.alwaysOnTop,
    autoLaunch: config.autoLaunch,
    theme: config.theme,
    globalShortcut: config.globalShortcut,
    window: { ...config.window },
    onboardingDone: config.onboardingDone,
    hasApiKey: Boolean(key),
    maskedKey: key
      ? key.length > 10
        ? `${key.slice(0, 4)}••••••${key.slice(-4)}`
        : "••••••"
      : "",
    keySource: config._envKey && !decryptKey(config.apiKeyEnc) ? "env" : config.apiKeyEnc ? "saved" : "none",
  };
}

function updateWindowPosition(x, y) {
  const config = load();
  config.window.x = Number.isFinite(Number(x)) ? Number(x) : null;
  config.window.y = Number.isFinite(Number(y)) ? Number(y) : null;
  save({ window: config.window });
}

function updateWindowMode(collapsed) {
  const config = load();
  config.window.collapsed = Boolean(collapsed);
  save({ window: config.window });
}

function updateWindowSize(width, height) {
  const config = load();
  config.window.width = Math.round(clampNumber(width, 360, 760, DEFAULTS.window.width));
  config.window.height = Math.round(clampNumber(height, 520, 1000, DEFAULTS.window.height));
  save({ window: config.window });
}

module.exports = {
  DEFAULTS,
  load,
  save,
  getApiKey,
  setApiKey,
  publicConfig,
  updateWindowPosition,
  updateWindowMode,
  updateWindowSize,
  normalizeBaseUrl,
  configPath,
  encryptKey,
  decryptKey,
};
