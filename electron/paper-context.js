"use strict";

/**
 * Paper context assembly for statistics / mathematics papers.
 * Kept dependency-free so it can be unit-tested with plain node:test.
 */

const LIGATURES = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "st",
  "\uFB06": "st",
};

const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves`
    .split(/\s+/)
    .filter(Boolean),
);

const QUERY_EXPANSIONS = {
  约束: "constraint constrained",
  重构: "reconstruction reconstruct",
  残差: "residual",
  推导: "derivation derive",
  假设: "assumption assume",
  定理: "theorem",
  引理: "lemma",
  证明: "proof prove",
  收敛: "convergence converge",
  噪声: "noise",
  方差: "variance",
  偏差: "bias",
  估计: "estimation estimator",
  算法: "algorithm",
  实验: "experiment",
  结果: "result",
  定义: "definition define",
  频带: "band bandwidth",
  带宽: "bandwidth",
  模态: "mode",
  分解: "decomposition decompose",
  符号: "notation symbol",
  记号: "notation symbol",
  中心频率: "center frequency",
  优化: "optimization optimize",
  拉格朗日: "Lagrangian",
  维纳: "Wiener",
  傅里叶: "Fourier",
  希尔伯特: "Hilbert",
  采样: "sampling",
  边界: "boundary",
};

function expandQuery(text) {
  const value = String(text || "");
  const extra = [];
  for (const [zh, en] of Object.entries(QUERY_EXPANSIONS)) {
    if (value.includes(zh)) extra.push(en);
  }
  return `${value} ${extra.join(" ")}`.trim();
}

function repairLegacyMojibake(text) {
  let value = String(text || "");
  const replacements = [
    [/鈥擜/g, "—A"],
    [/鈥擡/g, "—E"],
    [/鈥攎/g, "—m"],
    [/鈥攖/g, "—t"],
    [/鈥揨/g, "–Z"],
    [/鈥揫/g, "–["],
    [/鈥揳/g, "–a"],
    [/鈥檚/g, "’s"],
    [/鈥檛/g, "’t"],
    [/鈥渕/g, "“m"],
    [/鈥渟/g, "“s"],
    [/鈥渢/g, "“t"],
    [/鈥\?/g, "” "],
    [/铿乴/g, "fil"],
    [/铿乧/g, "fic"],
    [/鍜孼/g, "和Z"],
  ];
  for (const [pattern, replacement] of replacements) value = value.replace(pattern, replacement);
  return value;
}

function cleanPageText(text) {
  let value = repairLegacyMojibake(String(text || ""));
  value = value.replace(/\u0000/g, " ");
  value = value.replace(/[\uFB00-\uFB06]/g, (ch) => LIGATURES[ch] || ch);
  value = value.replace(/\u00AD/g, "");
  value = value.replace(/\r\n?/g, "\n");
  value = value.replace(/([A-Za-z])-\n\s*([a-z])/g, "$1$2");
  value = value.replace(/[ \t\f\v]+/g, " ");
  value = value.replace(/\n+/g, " ");
  return value.replace(/\s+/g, " ").trim();
}

function splitPages(rawText, pageCountHint = 0) {
  const raw = String(rawText || "").replace(/\u0000/g, "");
  let rawPages = raw.split("\f");
  if (rawPages.length === 1 && pageCountHint > 1) {
    // Some extractors use a run of blank lines instead of form feeds.
    const byBlank = raw.split(/\n{4,}/);
    if (byBlank.length > 1) rawPages = byBlank;
  }
  const pages = rawPages
    .map((text, index) => ({
      page: index + 1,
      raw: text,
      text: cleanPageText(text),
    }))
    .filter((item) => item.text.length > 0 || item.raw.trim().length > 0);
  return pages;
}

function detectHeadings(pages) {
  const headings = [];
  const seen = new Set();
  const sectionRe = /^(?:\d+(?:\.\d+){0,3}\.?\s+)?(Abstract|Introduction|Related Work|Background|Preliminaries|Problem Setup|Problem Formulation|Method(?:ology)?|Theory|Main Results?|Experiments?|Empirical (?:Results?|Evaluation)|Results?|Discussion|Conclusions?|Appendix|References|Proofs?)\b[.:]?$/i;
  const numberedRe = /^(\d+(?:\.\d+){0,3})\.?\s+([A-Z][A-Za-z0-9,:\-–—()'&?! ]{2,72})$/;
  const romanRe = /^([IVXLC]+)\.\s+([A-Z][A-Za-z0-9,:\-–—()'&?! ]{2,72})$/;
  const letterRe = /^([A-Z])\.\s+([A-Z][A-Za-z0-9,:\-–—()'&?! ]{2,72})$/;
  const theoremRe = /^(Theorem|Lemma|Proposition|Corollary|Definition|Assumption|Remark|Example)\s+\d+(?:\.\d+)*[.:]?/i;

  for (const page of pages) {
    const lines = String(page.raw || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (line.length > 140) continue;
      const words = line.split(/\s+/).length;
      if (words > 16) continue;
      let label = "";
      let level = 1;
      let m = line.match(numberedRe);
      if (m) {
        label = line.replace(/\s+/g, " ");
        level = m[1].split(".").length;
      } else if ((m = line.match(sectionRe))) {
        label = line.replace(/\s+/g, " ");
        level = 1;
      } else if ((m = line.match(romanRe))) {
        const heading = m[2];
        if (m[1].length > 1 || heading === heading.toUpperCase()) {
          label = line.replace(/\s+/g, " ");
          level = 1;
        }
      }
      if (!label && (m = line.match(letterRe))) {
        label = line.replace(/\s+/g, " ");
        level = 2;
      }
      if (!label && (m = line.match(theoremRe))) {
        label = line.replace(/\s+/g, " ");
        level = 2;
      }
      if (!label) continue;
      if (/^(references|appendix)$/i.test(label) && headings.length > 3) {
        // Keep them; they help the model know what is *not* paper body.
      }
      const key = `${page.page}:${label.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      headings.push({ label, page: page.page, level });
      if (headings.length >= 120) return headings;
    }
  }
  return headings;
}

function splitSentences(text) {
  const value = String(text || "");
  const parts = value
    .split(/(?<=[.!?])\s+(?=[A-Z(\\[“"'])/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [value];
}

function chunkPages(pages, target = 1800, overlap = 180) {
  const chunks = [];
  for (const page of pages) {
    const sentences = splitSentences(page.text);
    let buffer = [];
    let length = 0;
    const flush = () => {
      if (!buffer.length) return;
      const text = buffer.join(" ").trim();
      if (text.length >= 40) {
        chunks.push({
          id: `p${page.page}-c${chunks.length}`,
          page: page.page,
          text,
        });
      }
      if (overlap > 0) {
        const tail = [];
        let tailLen = 0;
        for (let i = buffer.length - 1; i >= 0; i--) {
          tail.unshift(buffer[i]);
          tailLen += buffer[i].length + 1;
          if (tailLen >= overlap) break;
        }
        buffer = tail;
        length = buffer.join(" ").length;
      } else {
        buffer = [];
        length = 0;
      }
    };

    for (const sentence of sentences) {
      if (sentence.length > target * 2) {
        flush();
        const words = sentence.split(/\s+/);
        let piece = [];
        let pieceLen = 0;
        for (const word of words) {
          piece.push(word);
          pieceLen += word.length + 1;
          if (pieceLen >= target) {
            chunks.push({
              id: `p${page.page}-c${chunks.length}`,
              page: page.page,
              text: piece.join(" "),
            });
            piece = [];
            pieceLen = 0;
          }
        }
        if (piece.length) {
          buffer = [piece.join(" ")];
          length = buffer[0].length;
        }
        continue;
      }
      if (length + sentence.length + 1 > target && buffer.length) flush();
      buffer.push(sentence);
      length += sentence.length + 1;
    }
    flush();
  }
  return chunks;
}

function tokenize(text) {
  const value = String(text || "").toLowerCase();
  const matches =
    value.match(/[a-z][a-z0-9'’\-]{1,}|[\u0370-\u03ff]{1,}|[\u4e00-\u9fff]{2,}/g) || [];
  const tokens = [];
  for (let token of matches) {
    token = token.replace(/[’']s$/, "").replace(/^-+|-+$/g, "");
    if (!token || STOPWORDS.has(token)) continue;
    if (token.length === 1 && !/[\u0370-\u03ff]/.test(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

class BM25Index {
  constructor(chunks, options = {}) {
    this.chunks = chunks || [];
    this.k1 = options.k1 || 1.5;
    this.b = options.b || 0.75;
    this.docs = this.chunks.map((chunk) => {
      const tokens = tokenize(chunk.text);
      const tf = new Map();
      for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
      return { chunk, tokens, tf, length: tokens.length };
    });
    this.avgLength = Math.max(
      1,
      this.docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, this.docs.length),
    );
    this.df = new Map();
    for (const doc of this.docs) {
      for (const token of new Set(doc.tokens)) {
        this.df.set(token, (this.df.get(token) || 0) + 1);
      }
    }
  }

  idf(token) {
    const n = this.docs.length;
    const df = this.df.get(token) || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query, topK = 6) {
    const queryTokens = [...new Set(tokenize(query))];
    if (!queryTokens.length || !this.docs.length) return [];
    const queryLower = String(query || "").toLowerCase();
    const results = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const token of queryTokens) {
        const tf = doc.tf.get(token) || 0;
        if (!tf) continue;
        const denom = tf + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLength);
        score += this.idf(token) * ((tf * (this.k1 + 1)) / denom);
      }
      if (score <= 0) continue;
      if (queryLower.length > 12 && doc.chunk.text.toLowerCase().includes(queryLower.slice(0, 80))) {
        score += 2.5;
      }
      results.push({ ...doc.chunk, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

function findSelectionContext(pages, selection, radius = 2500) {
  if (!selection || !selection.text) return null;
  const needle = cleanPageText(selection.text);
  if (!needle) return null;
  const short = needle.slice(0, Math.min(90, needle.length)).toLowerCase();
  let page = null;
  let index = -1;
  for (const item of pages) {
    const hay = item.text.toLowerCase();
    index = hay.indexOf(needle.toLowerCase());
    if (index === -1) index = hay.indexOf(short);
    if (index !== -1) {
      page = item;
      break;
    }
  }
  if (!page) {
    const pageLabel = Number(selection.pageLabel);
    if (Number.isFinite(pageLabel) && pages[pageLabel - 1]) {
      page = pages[pageLabel - 1];
      index = 0;
    }
  }
  if (!page) {
    return {
      page: Number(selection.pageLabel) || null,
      text: needle,
      exact: false,
    };
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(page.text.length, index + needle.length + radius);
  const before = start > 0 ? "…" : "";
  const after = end < page.text.length ? "…" : "";
  return {
    page: page.page,
    pageLabel: selection.pageLabel || String(page.page),
    text: `${before}${page.text.slice(start, end)}${after}`,
    exact: true,
  };
}

function pageContext(pages, pageNumber, radius = 1, maxChars = 7000) {
  if (!pageNumber) return null;
  const start = Math.max(1, pageNumber - radius);
  const end = Math.min(pages.length, pageNumber + radius);
  const selected = pages.filter((p) => p.page >= start && p.page <= end);
  if (!selected.length) return null;
  let text = "";
  for (const page of selected) {
    const part = `[p.${page.page}] ${page.text}`;
    if (text.length + part.length > maxChars) {
      text += part.slice(0, Math.max(0, maxChars - text.length));
      break;
    }
    text += (text ? "\n\n" : "") + part;
  }
  return { start, end, text };
}

function formatAuthors(paper) {
  const creators = Array.isArray(paper?.creators) ? paper.creators : [];
  const names = creators
    .map((c) => c.name || [c.first, c.last].filter(Boolean).join(" "))
    .filter(Boolean);
  if (!names.length) return "Unknown";
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")}, et al.`;
}

function looksCorrupted(text) {
  const value = String(text || "");
  if (!value) return false;
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length;
  return cjk > 3 || /[\uFFFD]{1,}/.test(value) || /铿|鈥|鍜|锛|鐨/.test(value);
}

function extractAbstractFromPages(pages) {
  if (!Array.isArray(pages) || !pages.length) return "";
  const joined = pages
    .slice(0, 2)
    .map((page) => page.text)
    .join(" ");
  const match = joined.match(
    /\babstract\b[\s:—–-]*(.{60,3200}?)(?:\bindex terms\b|\bkeywords?\b|\bI\.\s*introduction\b|\b1\.\s*introduction\b|\bintroduction\b)/i,
  );
  if (!match) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

function cleanAbstract(paper, pages) {
  const raw = paper?.abstract || "";
  const repaired = repairLegacyMojibake(raw);
  if (looksCorrupted(raw)) {
    const extracted = extractAbstractFromPages(pages);
    if (extracted) return extracted;
  }
  return repaired;
}

function formatAnnotations(annotations, limit = 14) {
  if (!Array.isArray(annotations) || !annotations.length) return "";
  return annotations
    .slice(-limit)
    .map((a) => {
      const page = a.pageLabel ? `p.${a.pageLabel}` : "p.?";
      const text = String(a.text || "").replace(/\s+/g, " ").slice(0, 450);
      const comment = a.comment ? ` — 我的批注: ${String(a.comment).slice(0, 220)}` : "";
      return `- [${page}] ${text}${comment}`;
    })
    .join("\n");
}

function buildDossier({ paper, pages, headings, fullText, mode, maxChars = 60000 }) {
  if (!paper) {
    return "（当前没有从 Zotero 同步到论文。如果用户问“这篇论文”，提醒他先在 Zotero 中打开 PDF。）";
  }
  const lines = [];
  lines.push("===== PAPER DOSSIER（同篇论文内保持稳定）=====");
  lines.push(`TITLE: ${paper.title || "(untitled)"}`);
  if (paper.shortTitle && paper.shortTitle !== paper.title) lines.push(`SHORT TITLE: ${paper.shortTitle}`);
  lines.push(`AUTHORS: ${formatAuthors(paper)}`);
  lines.push(`YEAR: ${paper.year || "?"}`);
  if (paper.venue) lines.push(`VENUE: ${paper.venue}`);
  if (paper.volume || paper.issue || paper.pages) {
    lines.push(
      `BIBLIO: ${[paper.volume && `vol. ${paper.volume}`, paper.issue && `no. ${paper.issue}`, paper.pages && `pp. ${paper.pages}`]
        .filter(Boolean)
        .join(", ")}`,
    );
  }
  if (paper.doi) lines.push(`DOI: ${paper.doi}`);
  if (paper.url) lines.push(`URL: ${paper.url}`);
  if (paper.tags && paper.tags.length) lines.push(`TAGS: ${paper.tags.join(", ")}`);
  lines.push(`PAGES: ${pages.length || "?"}`);
  lines.push("");
  lines.push("ABSTRACT:");
  const abstract = cleanAbstract(paper, pages);
  lines.push(abstract ? String(abstract).trim() : "(no abstract in Zotero)");

  if (headings && headings.length) {
    lines.push("");
    lines.push("SECTION MAP（行号是 PDF 页码）:");
    for (const h of headings.slice(0, 80)) {
      lines.push(`- p.${h.page}  ${"  ".repeat(Math.max(0, h.level - 1))}${h.label}`);
    }
  }

  if (mode === "full" && fullText) {
    lines.push("");
    lines.push("FULL TEXT（[p.N] 为 PDF 页码；公式可能因 PDF 抽取而失真，遇到可疑处要说明）:");
    let used = 0;
    for (const page of pages) {
      const part = `\n[p.${page.page}] ${page.text}`;
      if (used + part.length > maxChars) {
        lines.push(`\n[... 全文超出本次上下文预算，剩余 ${pages.length - page.page + 1} 页未包含 ...]`);
        break;
      }
      lines.push(part);
      used += part.length;
    }
  }

  if (paper.notes && paper.notes.length) {
    lines.push("");
    lines.push("MY ZOTERO NOTES:");
    for (const note of paper.notes.slice(0, 3)) {
      lines.push(`- ${String(note).slice(0, 900)}`);
    }
  }

  return lines.join("\n");
}

const MODE_INSTRUCTIONS = {
  explain:
    "回答模式：直读。先用一句话说结论，再逐句拆开这段在说什么；标出它依赖的定义/假设。若这是复杂公式，先用一个生活化类比或低维特例建立直觉，再展开公式。",
  derive:
    "回答模式：推导。先用一个低维/数值小例子说明这一步在做什么，再把推导拆成编号步骤；每一步后用括号注明依据（定义/定理编号/假设/代数变形）。如果原文省略了步骤，明确说“这里省略了…”。",
  symbol:
    "回答模式：符号。说明这个记号在文中哪里定义、含义、取值范围/维数、与哪些公式相关；如果文中没有定义，明确说没有。如果能用一句话类比，先给类比。",
  intuition:
    "回答模式：直觉。给一个低维特例、数值小例子或几何图像；最后回到原式说明哪一项对应直觉的哪一部分。",
  quiz:
    "回答模式：自测。出 3 个由浅入深的问题，先只给问题；然后在“参考答案”下给出简短答案与依据页码。不要一上来就给答案。",
  summary:
    "回答模式：本节总结。用 4–6 条说明这一节的目标、关键假设、主要结果、证明路线、与后文关系；每条标页码/章节。",
  structure:
    "回答模式：论证结构。按“主张 → 证据 → 使用的定理/假设 → 还缺什么”四栏分析；指出论证的 gap 或隐含条件。",
  check:
    "回答模式：校验。先复述用户的理解，再判断对/错/部分对；指出错在哪一步，并给出正确版本与依据。",
  general:
    "回答模式：自由问答。仍然优先依据论文上下文；论文没写到的内容要明确区分“论文说的”和“通用数学背景”。遇到复杂公式主动先给生活化例子或低维特例。",
};

function modeInstruction(mode) {
  return MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.general;
}

function buildUserContent({
  paper,
  pages,
  headings,
  annotations,
  selection,
  page,
  question,
  mode,
  contextMode,
  maxChars = 60000,
}) {
  const sections = [];
  if (!pages.length) {
    sections.push(
      "<note>Zotero 里这篇文献还没有可用的 PDF 全文索引。你只能依据标题、摘要和批注回答；需要看正文时请明确告诉读者。</note>",
    );
  }
  const selectionContext = findSelectionContext(pages, selection);
  const pageCtx = pageContext(pages, page, 1, 6500);
  const chunks = [];
  let retrievalText = "";

  if (contextMode === "smart" && pages.length) {
    const index = new BM25Index(chunkPages(pages, 1700, 160));
    const query = expandQuery(
      [question, selection?.text, paper?.title, paper?.abstract].filter(Boolean).join(" "),
    );
    const results = index.search(query, contextMode === "selection" ? 3 : 6);
    const chosen = [];
    const usedPages = new Set();
    if (headings.length && contextMode !== "selection") {
      const headingIndex = new BM25Index(
        headings.map((heading) => ({
          page: heading.page,
          text: `${heading.label} ${paper?.title || ""}`,
        })),
      );
      for (const hit of headingIndex.search(expandQuery(question), 3)) {
        const chunk = index.chunks.find((item) => item.page === hit.page);
        if (!chunk) continue;
        if (chosen.some((item) => item.text === chunk.text)) continue;
        chosen.push({ ...chunk, score: hit.score });
        usedPages.add(chunk.page);
      }
    }
    for (const result of results) {
      if (chosen.some((item) => item.text === result.text)) continue;
      if (selectionContext && result.page === selectionContext.page) {
        const overlap = result.text.slice(0, 80);
        if (selectionContext.text.includes(overlap)) continue;
      }
      if (usedPages.has(result.page) && chosen.length >= 3) continue;
      chosen.push(result);
      usedPages.add(result.page);
      if (chosen.length >= (contextMode === "selection" ? 2 : 5)) break;
    }
    if (chosen.length) {
      retrievalText = chosen
        .map((c) => `[p.${c.page}] ${c.text}`)
        .join("\n\n");
      chunks.push(...chosen);
    }
  }

  if (selectionContext) {
    sections.push(
      `<selected_text page="${selectionContext.pageLabel || selectionContext.page || "?"}">\n${selectionContext.text}\n</selected_text>`,
    );
  }
  if (pageCtx) {
    sections.push(
      `<current_page range="p.${pageCtx.start}-p.${pageCtx.end}">\n${pageCtx.text}\n</current_page>`,
    );
  }
  if (retrievalText) {
    sections.push(`<retrieved_passages>\n${retrievalText}\n</retrieved_passages>`);
  }
  const annotationText = formatAnnotations(annotations, 14);
  if (annotationText) {
    sections.push(`<reader_annotations>\n${annotationText}\n</reader_annotations>`);
  }
  sections.push(`<question>\n${String(question || "").trim() || "请解释当前选段。"}\n</question>`);
  sections.push(modeInstruction(mode));

  let context = sections.join("\n\n");
  if (context.length > maxChars) {
    context = context.slice(0, maxChars) + "\n\n[上下文已按预算截断]";
  }
  return {
    content: context,
    meta: {
      selectionPage: selectionContext?.page || null,
      selectionIncluded: Boolean(selectionContext),
      currentPage: page || null,
      chunks: chunks.length,
      pages: chunks.map((c) => c.page),
      contextChars: context.length,
      mode: contextMode,
    },
  };
}

function buildMessages({
  paper,
  pages = [],
  headings = [],
  annotations = [],
  selection = null,
  page = 0,
  question = "",
  history = [],
  contextMode = "smart",
  maxChars = 60000,
  systemPrompt,
  mode = "general",
}) {
  const dossier = buildDossier({
    paper,
    pages,
    headings,
    fullText: contextMode === "full",
    mode: contextMode,
    maxChars: Math.round(maxChars * 0.75),
  });
  const system = `${systemPrompt}\n\n${dossier}`;
  const user = buildUserContent({
    paper,
    pages,
    headings,
    annotations,
    selection,
    page,
    question,
    mode,
    contextMode,
    maxChars: Math.round(maxChars * 0.35),
  });
  const safeHistory = [];
  for (const msg of history || []) {
    if (!msg || !["user", "assistant"].includes(msg.role)) continue;
    if (!msg.content) continue;
    safeHistory.push({ role: msg.role, content: String(msg.content).slice(0, 12000) });
  }
  while (safeHistory.length > 10) safeHistory.shift();
  const messages = [
    { role: "system", content: system },
    ...safeHistory,
    { role: "user", content: user.content },
  ];
  return {
    messages,
    meta: {
      ...user.meta,
      dossierChars: dossier.length,
      historyMessages: safeHistory.length,
    },
  };
}

const SYSTEM_PROMPT = `你是「纸读 PaperPet」，一位专注统计学、概率论、机器学习理论与应用数学英文论文的精读助教。你正陪着一位研究生读者读一篇论文。
目标：让读者真正读懂，而不是给泛泛摘要或百科式介绍。

硬性规则：
1. 只依据提供的论文上下文与通用数学事实。论文没写的内容必须明确说“论文的上下文里没有写/我没有看到”，不要编造。
2. 引用原文、公式或结论时标注位置（如 p.7、§3.2、Theorem 3.1、eq. (2.4)）。不要编造定理编号、公式编号或页码。
3. 推导要逐步展开；每一步后用括号注明依据（定义、假设 A2、Theorem 3.1、代数变形、交换期望与求和、Jensen 不等式等）。
4. 严格区分 definition / assumption / theorem / lemma / proposition / corollary，不要混用。指出结论依赖哪条假设；假设不满足时说明会怎样。
5. 注意论文自造的记号：首次用到时写“记号：…”。若记号有歧义，给出它在文中的定义位置。矩阵/向量转置、维数、取值范围要写清楚。
6. 公式用 LaTeX：行内 $...$，独立公式 $$...$$。不要把公式放进代码块。矩阵、期望、范数、上下标要写对。
7. 中文回答，保留英文术语原词（如 sub-Gaussian, Stein's method, reproducing kernel Hilbert space）。
8. 先给结论（1–2 句），再展开。默认控制在 400 字左右；用户明确要“详细/完整推导”时再展开。
9. 不确定就直说“我不确定/上下文不足”，并指出需要查看的章节或公式。绝不为了显得完整而补造内容。
10. 如果用户给的文本像是 PDF 公式抽取乱码，先复述你推断的 LaTeX 并请用户确认，再解释。
11. 如果上下文中没有正在阅读的论文，而用户问“这篇论文”，提醒他在 Zotero 中打开 PDF，并让 PaperPet 桥接插件同步。
12. 不要输出“作为 AI 模型”之类的免责声明；直接像一个坐在旁边的师兄/助教那样说话。
13. 当用户附上截图时，第一步必须逐字转写图中的内容；公式用 LaTeX，标出看不清的符号，然后再解释。不要跳过转写直接给结论。
14. 当问题涉及复杂公式（多重求和/积分、期望、范数、约束优化、矩阵分解、变分）时，先用 2–4 句给一个生活化类比或低维数值特例，再进入公式推导。不要等用户要求“给个例子”。简单记号或单步代数不必强行举例，例子不能替代严格定义。`;

module.exports = {
  cleanPageText,
  repairLegacyMojibake,
  looksCorrupted,
  cleanAbstract,
  splitPages,
  detectHeadings,
  splitSentences,
  chunkPages,
  tokenize,
  BM25Index,
  findSelectionContext,
  pageContext,
  buildDossier,
  buildUserContent,
  buildMessages,
  SYSTEM_PROMPT,
  MODE_INSTRUCTIONS,
  modeInstruction,
};
