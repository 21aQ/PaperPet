const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMarkdown, buildJson, safeFilename } = require("../electron/exporter");

const paper = {
  title: "Variational Mode Decomposition",
  creators: [
    { first: "Konstantin", last: "Dragomiretskiy" },
    { first: "Dominique", last: "Zosso" },
  ],
  year: "2014",
  venue: "IEEE Transactions on Signal Processing",
  doi: "10.1109/TSP.2013.2288675",
};

const messages = [
  { role: "assistant", content: "welcome", meta: { welcome: true }, local: true },
  { role: "user", content: "为什么约束要求精确重构？", createdAt: 1700000000000, image: "data:image/png;base64,AAAA" },
  {
    role: "assistant",
    content: "**结论**：这是建模约束。\n\n$$\\sum_k u_k=f$$",
    createdAt: 1700000001000,
    meta: { selectionPage: "2", chunks: 5, contextChars: 15000, model: "deepseek-chat" },
  },
  { role: "user", content: "如果允许残差呢？", createdAt: 1700000002000 },
];

test("buildMarkdown exports Q/A turns and metadata without image data", () => {
  const markdown = buildMarkdown({ paper, messages, exportedAt: "2026-01-02T03:04:05.000Z" });
  assert.match(markdown, /^---/);
  assert.match(markdown, /paper_title: "Variational Mode Decomposition"/);
  assert.match(markdown, /## Turn 1/);
  assert.match(markdown, /### User/);
  assert.match(markdown, /为什么约束要求精确重构/);
  assert.match(markdown, /Screenshot attached/);
  assert.match(markdown, /Context: .*p\.2 selection/);
  assert.match(markdown, /\\sum_k u_k=f/);
  assert.doesNotMatch(markdown, /data:image/);
  assert.match(markdown, /## Turn 2/);
});

test("buildJson is valid and marks image turns without embedding data", () => {
  const json = JSON.parse(buildJson({ paper, messages, exportedAt: "2026-01-02T03:04:05.000Z" }));
  assert.equal(json.schema, "paperpet.conversation/v1");
  assert.equal(json.paper.title, "Variational Mode Decomposition");
  assert.equal(json.messages.length, 3);
  assert.equal(json.messages[0].hasImage, true);
  assert.equal(json.messages[0].image, undefined);
  assert.doesNotMatch(JSON.stringify(json), /data:image/);
  assert.equal(json.messages[1].meta.selectionPage, "2");
});

test("safeFilename strips invalid characters and extensions", () => {
  assert.equal(safeFilename("A/B: C?", "md"), "A B C.md");
  assert.equal(safeFilename("PaperPet-Conversation-2026-01-02", "json"), "PaperPet-Conversation-2026-01-02.json");
  assert.equal(safeFilename("", "md"), "PaperPet conversation.md");
});
