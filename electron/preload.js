"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("paperpet", {
  getState: () => ipcRenderer.invoke("app:get-state"),
  readClipboardImage: () => ipcRenderer.invoke("clipboard:read-image"),
  refreshBridge: () => ipcRenderer.invoke("bridge:refresh"),
  send: (payload) => ipcRenderer.invoke("chat:send", payload),
  abort: (requestId) => ipcRenderer.invoke("chat:abort", requestId),
  loadHistory: (paperId) => ipcRenderer.invoke("chat:history", paperId),
  clearHistory: (paperId) => ipcRenderer.invoke("chat:clear", paperId),
  saveConfig: (patch) => ipcRenderer.invoke("config:save", patch),
  testConnection: (payload) => ipcRenderer.invoke("config:test", payload),
  listModels: (payload) => ipcRenderer.invoke("config:models", payload),
  setMode: (collapsed) => ipcRenderer.invoke("window:set-mode", collapsed),
  getWindowBounds: () => ipcRenderer.invoke("window:get-bounds"),
  beginResize: (edge) => ipcRenderer.invoke("window:begin-resize", edge),
  endResize: () => ipcRenderer.invoke("window:end-resize"),
  setWindowBounds: (bounds) => ipcRenderer.invoke("window:set-bounds", bounds),
  endWindowResize: () => ipcRenderer.invoke("window:resize-end"),
  hide: () => ipcRenderer.invoke("window:hide"),
  pin: (value) => ipcRenderer.invoke("window:pin", value),
  quit: () => ipcRenderer.invoke("window:quit"),
  openExternal: (url) => ipcRenderer.invoke("app:open-external", url),
  openPath: (target) => ipcRenderer.invoke("app:open-path", target),
  revealPlugin: () => ipcRenderer.invoke("plugin:reveal"),
  copyPluginPath: () => ipcRenderer.invoke("plugin:copy-path"),
  installPlugin: () => ipcRenderer.invoke("plugin:install"),
  onBridgeState: (callback) => subscribe("bridge:state", callback),
  onPaperChanged: (callback) => subscribe("paper:changed", callback),
  onChatStart: (callback) => subscribe("chat:start", callback),
  onChatDelta: (callback) => subscribe("chat:delta", callback),
  onChatReasoning: (callback) => subscribe("chat:reasoning", callback),
  onChatDone: (callback) => subscribe("chat:done", callback),
  onChatError: (callback) => subscribe("chat:error", callback),
  onMode: (callback) => subscribe("window:mode", callback),
  onOpenSettings: (callback) => subscribe("app:open-settings", callback),
  platform: process.platform,
});
