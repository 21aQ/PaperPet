"use strict";

const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const STALE_MS = 25000;

class ZoteroBridge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.appData = options.appData || process.env.APPDATA || "";
    this.root = path.join(this.appData, "PaperPet");
    this.bridgePath = path.join(this.root, "bridge");
    this.contextPath = path.join(this.bridgePath, "context.json");
    this.papersPath = path.join(this.bridgePath, "papers");
    this.timer = null;
    this.lastSignature = "";
    this.lastEmit = 0;
    this.lastState = null;
    this.textCache = new Map();
  }

  start(intervalMs = 1000) {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  readPayload() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.contextPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.lastError = error.message;
      }
      return null;
    }
    if (!raw || raw.version !== 1) return null;
    return raw;
  }

  normalize(payload) {
    if (!payload) return null;
    const paper = payload.paper && typeof payload.paper === "object" ? payload.paper : null;
    const attachment =
      payload.attachment && typeof payload.attachment === "object" ? payload.attachment : null;
    const selection =
      payload.selection && typeof payload.selection === "object" && payload.selection.text
        ? payload.selection
        : payload.reader && payload.reader.selection && payload.reader.selection.text
          ? payload.reader.selection
          : null;
    return {
      ...payload,
      paper,
      attachment,
      selection,
      annotations: Array.isArray(payload.annotations) ? payload.annotations : [],
      reader: payload.reader && typeof payload.reader === "object" ? payload.reader : null,
    };
  }

  getState(force = false) {
    const now = Date.now();
    const exists = fs.existsSync(this.contextPath);
    let payload = this.readPayload();
    if (!payload && this.lastState && !force) {
      // Keep the last known paper during a transient half-written update.
      payload = this.lastState.data;
    }
    const data = this.normalize(payload);
    const ageMs = data && data.updatedAt ? Math.max(0, now - Number(data.updatedAt)) : null;
    const stale = !data || ageMs === null || ageMs > STALE_MS;
    const connected = Boolean(data) && !stale;
    const state = {
      installed: exists || fs.existsSync(this.bridgePath),
      connected,
      stale,
      ageMs,
      data,
      bridgePath: this.bridgePath,
      contextPath: this.contextPath,
      papersPath: this.papersPath,
      error: this.lastError || null,
    };
    this.lastState = state;
    return state;
  }

  signature(state) {
    const d = state.data;
    if (!d) return `none:${state.installed}:${state.connected}`;
    const paper = d.paper || {};
    const selection = d.selection || {};
    const reader = d.reader || {};
    const attachment = d.attachment || {};
    return JSON.stringify([
      state.connected,
      paper.libraryID,
      paper.key,
      paper.itemID,
      reader.page,
      selection.text ? selection.text.slice(0, 120) : "",
      selection.capturedAt || 0,
      attachment.fullTextChars || 0,
      d.annotations.length,
      d.status,
    ]);
  }

  refresh(force = false) {
    const state = this.getState(force);
    const signature = this.signature(state);
    const now = Date.now();
    if (force || signature !== this.lastSignature || now - this.lastEmit > 5000) {
      this.lastSignature = signature;
      this.lastEmit = now;
      this.emit("state", state);
    }
    return state;
  }

  readFullText() {
    const state = this.getState();
    const data = state.data;
    if (!data || !data.attachment || !data.attachment.fullTextFile) return "";
    const file = path.resolve(String(data.attachment.fullTextFile));
    const root = path.resolve(this.papersPath) + path.sep;
    if (!file.startsWith(root)) {
      console.warn("[bridge] refusing to read outside papers directory:", file);
      return "";
    }
    try {
      const stat = fs.statSync(file);
      const cached = this.textCache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.text;
      }
      const text = fs.readFileSync(file, "utf8");
      this.textCache.clear();
      this.textCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text });
      return text;
    } catch (error) {
      console.warn("[bridge] cannot read full text:", error.message);
      return "";
    }
  }

  getPaperId() {
    const data = this.getState().data;
    if (!data || !data.paper) return null;
    return `${data.paper.libraryID || 0}:${data.paper.key || data.paper.itemID}`;
  }
}

module.exports = { ZoteroBridge, STALE_MS };
