"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

function dir() {
  return path.join(app.getPath("userData"), "conversations");
}

function fileFor(paperId) {
  const key = paperId || "_scratch";
  const hash = crypto.createHash("sha1").update(String(key)).digest("hex").slice(0, 24);
  return path.join(dir(), `${hash}.json`);
}

function load(paperId) {
  try {
    const file = fileFor(paperId);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data || !Array.isArray(data.messages)) return { messages: [], paperId };
    return {
      paperId,
      paperTitle: data.paperTitle || "",
      updatedAt: data.updatedAt || 0,
      messages: data.messages
        .filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
        .slice(-60),
    };
  } catch (error) {
    return { messages: [], paperId };
  }
}

function save(paperId, messages, paperTitle = "") {
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const trimmed = (messages || [])
      .filter((m) => m && ["user", "assistant"].includes(m.role))
      .slice(-60)
      .map((m) => ({
        role: m.role,
        content: String(m.content || ""),
        createdAt: m.createdAt || Date.now(),
        reasoning: m.reasoning ? String(m.reasoning).slice(0, 20000) : "",
        image: typeof m.image === "string" && m.image.startsWith("data:image/") ? m.image : "",
        imageMeta: m.imageMeta || null,
        meta: m.meta || null,
      }));
    fs.writeFileSync(
      fileFor(paperId),
      JSON.stringify(
        {
          paperId,
          paperTitle,
          updatedAt: Date.now(),
          messages: trimmed,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (error) {
    console.warn("[history] save failed:", error.message);
  }
}

function clear(paperId) {
  try {
    const file = fileFor(paperId);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (error) {}
}

module.exports = { load, save, clear, fileFor, dir };
