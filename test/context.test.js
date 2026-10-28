const test = require("node:test");
const assert = require("node:assert/strict");
const {
  cleanPageText,
  repairLegacyMojibake,
  splitPages,
  detectHeadings,
  chunkPages,
  BM25Index,
  findSelectionContext,
  buildMessages,
  cleanAbstract,
  SYSTEM_PROMPT,
} = require("../electron/paper-context");

test("cleanPageText removes PDF hyphenation and ligatures", () => {
  const cleaned = cleanPageText("The ef\ufb01cient estima-\ntor is consistent.\n\nNext paragraph.");
  assert.match(cleaned, /efficient estimator is consistent/);
  assert.match(cleaned, /Next paragraph/);
});

test("repairLegacyMojibake fixes common Zotero metadata corruption", () => {
  const result = repairLegacyMojibake("Wiener 铿乴ter and ef铿乧iently, Index Terms鈥擜M-FM");
  assert.match(result, /Wiener filter/);
  assert.match(result, /efficiently/);
  assert.match(result, /—AM-FM/);
});

test("splitPages uses form feeds and preserves page numbers", () => {
  const pages = splitPages("one\ftwo\fthree");
  assert.equal(pages.length, 3);
  assert.equal(pages[1].page, 2);
  assert.equal(pages[1].text, "two");
});

test("detectHeadings handles Roman, lettered and numbered sections", () => {
  const pages = [
    {
      page: 1,
      raw: "I. INTRODUCTION\nSome text\nA. What is a Mode?\nMore text\n2.1 Problem Setup",
      text: "",
    },
    {
      page: 2,
      raw: "III. VARIATIONAL MODE DECOMPOSITION\nB. Exact Reconstruction Versus Denoising",
      text: "",
    },
  ];
  const headings = detectHeadings(pages);
  assert.ok(headings.some((h) => h.label === "I. INTRODUCTION" && h.level === 1));
  assert.ok(headings.some((h) => h.label === "A. What is a Mode?" && h.level === 2));
  assert.ok(headings.some((h) => h.label === "2.1 Problem Setup" && h.level === 2));
  assert.ok(headings.some((h) => h.label === "III. VARIATIONAL MODE DECOMPOSITION" && h.level === 1));
});

test("BM25 finds the passage containing the queried concept", () => {
  const pages = [
    {
      page: 1,
      raw: "",
      text: "The variational model uses a quadratic penalty and a Lagrange multiplier.",
    },
    {
      page: 2,
      raw: "",
      text: "The center frequency update is a power-weighted mean of the spectrum.",
    },
    {
      page: 3,
      raw: "",
      text: "Experiments compare the method with empirical mode decomposition.",
    },
  ];
  const index = new BM25Index(chunkPages(pages, 400, 40));
  const hits = index.search("Lagrange multiplier penalty", 1);
  assert.ok(hits.length >= 1);
  assert.match(hits[0].text, /Lagrange multiplier/);
});

test("findSelectionContext locates a selected sentence and adds a window", () => {
  const pages = splitPages(
    "A short introduction to the problem. The selected sentence is here. More discussion follows.",
  );
  const result = findSelectionContext(pages, { text: "The selected sentence is here.", pageLabel: "1" });
  assert.equal(result.page, 1);
  assert.match(result.text, /selected sentence/);
  assert.match(result.text, /short introduction/);
});

test("buildMessages puts stable dossier in system and selection in user message", () => {
  const paper = {
    title: "A Test Paper",
    creators: [{ first: "Ada", last: "Lovelace" }],
    year: "2024",
    abstract: "We study a statistical estimator.",
    venue: "Journal of Tests",
  };
  const pages = splitPages(
    "1 Introduction\nWe study a statistical estimator under sub-Gaussian noise.\f2 Method\nThe estimator minimizes a penalized risk.",
  );
  const headings = detectHeadings(pages);
  const built = buildMessages({
    paper,
    pages,
    headings,
    annotations: [{ text: "Key assumption", pageLabel: "2" }],
    selection: { text: "minimizes a penalized risk", pageLabel: "2" },
    page: 2,
    question: "为什么这一步成立？",
    history: [{ role: "user", content: "上一问" }, { role: "assistant", content: "上一答" }],
    contextMode: "smart",
    maxChars: 30000,
    systemPrompt: SYSTEM_PROMPT,
    mode: "derive",
  });
  assert.equal(built.messages[0].role, "system");
  assert.match(built.messages[0].content, /A Test Paper/);
  assert.match(built.messages[0].content, /SECTION MAP/);
  assert.equal(built.messages.at(-1).role, "user");
  assert.match(built.messages.at(-1).content, /<selected_text/);
  assert.match(built.messages.at(-1).content, /minimizes a penalized risk/);
  assert.match(built.messages.at(-1).content, /推导/);
  assert.equal(built.meta.selectionIncluded, true);
});

test("cleanAbstract falls back to page text when metadata is corrupt", () => {
  const paper = { abstract: "Wiener 铿乴ter 鈥擜M-FM 铿乧ient" };
  const pages = splitPages(
    "Abstract—This paper studies a variational model with a narrow-band prior. Index Terms—mode decomposition, filter.",
  );
  const abstract = cleanAbstract(paper, pages);
  assert.match(abstract, /variational model/);
  assert.doesNotMatch(abstract, /铿/);
});
