"use strict";

function authorNames(paper) {
  const creators = Array.isArray(paper?.creators) ? paper.creators : [];
  return creators
    .map((creator) => creator.name || [creator.first, creator.last].filter(Boolean).join(" "))
    .filter(Boolean);
}

function formatAuthors(paper) {
  const names = authorNames(paper);
  if (!names.length) return "Unknown";
  if (names.length <= 6) return names.join(", ");
  return `${names.slice(0, 6).join(", ")}, et al.`;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && ["user", "assistant"].includes(message.role))
    .filter((message) => !message.meta?.welcome && !message.local)
    .filter((message) => String(message.content || "").trim() || message.error)
    .map((message) => ({
      role: message.role,
      content: String(message.content || ""),
      createdAt: message.createdAt || null,
      image: Boolean(message.image),
      error: message.error ? String(message.error) : "",
      reasoning: message.reasoning ? String(message.reasoning) : "",
      meta: message.meta && typeof message.meta === "object" ? message.meta : null,
    }));
}

function turnsFromMessages(messages) {
  const turns = [];
  let current = null;
  for (const message of cleanMessages(messages)) {
    if (message.role === "user") {
      current = { question: message, answer: null };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { question: null, answer: null };
      turns.push(current);
    }
    if (!current.answer) current.answer = message;
  }
  return turns;
}

function yamlString(value) {
  return JSON.stringify(String(value == null ? "" : value));
}

function contextLine(meta) {
  if (!meta) return "";
  const parts = [];
  if (meta.hasImage) parts.push("screenshot");
  if (meta.selectionPage) parts.push(`p.${meta.selectionPage} selection`);
  if (meta.chunks) parts.push(`${meta.chunks} passages`);
  if (meta.contextMode === "full") parts.push("full text");
  if (meta.contextChars) parts.push(`${(meta.contextChars / 1000).toFixed(1)}k chars`);
  if (meta.model) parts.push(meta.model);
  return parts.length ? `Context: ${parts.join(" · ")}` : "";
}

function buildMarkdown({ paper, messages, exportedAt = new Date() } = {}) {
  const turns = turnsFromMessages(messages);
  const title = paper?.title || "Untitled paper";
  const authors = formatAuthors(paper);
  const iso = formatDate(exportedAt);
  const lines = [];

  lines.push("---");
  lines.push("app: \"PaperPet\"");
  lines.push(`paper_title: ${yamlString(title)}`);
  lines.push(`authors: ${yamlString(authors)}`);
  lines.push(`year: ${yamlString(paper?.year || "")}`);
  lines.push(`venue: ${yamlString(paper?.venue || "")}`);
  lines.push(`doi: ${yamlString(paper?.doi || "")}`);
  lines.push(`exported_at: ${yamlString(iso)}`);
  lines.push(`turns: ${turns.length}`);
  lines.push("---");
  lines.push("");
  lines.push("# PaperPet conversation export");
  lines.push("");
  lines.push(
    "> Questions and answers exported from PaperPet. Screenshot image data is not included; a turn is marked when it had an image.",
  );
  lines.push("");
  lines.push("## Paper");
  lines.push("");
  lines.push(`- **Title:** ${title}`);
  lines.push(`- **Authors:** ${authors}`);
  if (paper?.year) lines.push(`- **Year:** ${paper.year}`);
  if (paper?.venue) lines.push(`- **Venue:** ${paper.venue}`);
  if (paper?.doi) lines.push(`- **DOI:** ${paper.doi}`);
  lines.push("");

  if (!turns.length) {
    lines.push("_No conversation messages were available._");
    return `${lines.join("\n")}\n`;
  }

  turns.forEach((turn, index) => {
    lines.push(`## Turn ${index + 1}`);
    lines.push("");
    lines.push("### User");
    lines.push("");
    if (turn.question?.image) lines.push("> [Screenshot attached; image data not included.]");
    lines.push(turn.question?.content || "_No question text._");
    lines.push("");
    lines.push("### PaperPet");
    lines.push("");
    if (turn.answer) {
      if (turn.answer.error) {
        lines.push(`> Generation error: ${turn.answer.error}`);
        lines.push("");
      }
      lines.push(turn.answer.content || "_No answer text._");
      const context = contextLine(turn.answer.meta);
      if (context) {
        lines.push("");
        lines.push(`*${context}*`);
      }
    } else {
      lines.push("_No answer recorded._");
    }
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

function buildJson({ paper, messages, exportedAt = new Date() } = {}) {
  const clean = cleanMessages(messages).map((message) => ({
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    hasImage: message.image,
    error: message.error || undefined,
    reasoning: message.reasoning || undefined,
    meta: message.meta,
  }));
  return JSON.stringify(
    {
      schema: "paperpet.conversation/v1",
      app: {
        name: "PaperPet",
        description: "Zotero paper-reading desktop pet",
      },
      exportedAt: formatDate(exportedAt),
      paper: paper
        ? {
            title: paper.title || "",
            shortTitle: paper.shortTitle || "",
            authors: authorNames(paper),
            year: paper.year || "",
            venue: paper.venue || "",
            doi: paper.doi || "",
            url: paper.url || "",
            itemType: paper.itemType || "",
          }
        : null,
      messages: clean,
    },
    null,
    2,
  );
}

function safeFilename(value, extension = "md") {
  const ext = String(extension || "md").replace(/^\./, "").replace(/[^a-z0-9]/gi, "") || "md";
  let base = String(value || "PaperPet conversation")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!base) base = "PaperPet conversation";
  if (base.length > 90) base = base.slice(0, 90).trim();
  return `${base}.${ext}`;
}

module.exports = { buildMarkdown, buildJson, safeFilename, turnsFromMessages, cleanMessages };
