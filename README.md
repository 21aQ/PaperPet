# 纸读 PaperPet

**English** | [简体中文](README.zh-CN.md)

> A desktop pet that reads papers with you. It knows which PDF you have open in Zotero, and answers questions about the text, formulas, assumptions, and derivations.

![Platform](https://img.shields.io/badge/platform-Windows-2f5f8a)
![Zotero](https://img.shields.io/badge/Zotero-7%20%7C%208%20%7C%2010-6f9d8b)
![Electron](https://img.shields.io/badge/Electron-37-22303a)
![License](https://img.shields.io/badge/license-MIT-c59b4a)

PaperPet is a **floating Windows desktop companion** for reading English research papers in statistics, probability, machine learning theory, and applied mathematics. It sits in the corner of your screen as a small paper spirit. Click it to open a study panel.

A lightweight Zotero plugin tells PaperPet:

- which paper you are reading,
- the current page and text selection,
- your highlights and annotations,
- the extracted full text.

PaperPet turns that into a compact context window and sends it to DeepSeek or any OpenAI-compatible API. Answers cite pages/sections, separate **definition / assumption / theorem / lemma**, derive steps with justifications, and render math with KaTeX.

![PaperPet panel](docs/screenshot.png)

![Formula explanation](docs/screenshot-formula.png)

## Features

- **Knows your current paper.** Switch PDFs in Zotero and the pet follows. Title, authors, year, venue, page count, and highlights are shown on the paper card.
- **Selection-aware questions.** Double-click or drag-select text in the PDF; a `p.X selection` chip appears. The selection, current page, and nearby passages are automatically attached.
- **Retrieval over the whole paper.** The extracted text is split by page, section headings are detected (Roman/numbered/lettered), and a BM25 index finds the most relevant passages. Chinese questions are expanded with English terminology (e.g. 约束 → constraint, 残差 → residual).
- **Screenshot OCR for formulas.** Press `Win+Shift+S`, then `Ctrl+V` in PaperPet (or click the image button / **Explain screenshot** chip). The image is previewed and sent to a vision model, which first transcribes the formula to LaTeX and then explains it. This is the fallback for PDFs whose math glyphs have no usable Unicode mapping.
- **Intuition first for complex math.** For multi-sum/integral/expectation/norm/constrained-optimization formulas, the assistant starts with a short everyday analogy or low-dimensional example before the formal derivation. You do not have to ask "give me an example" every time.
- **Resizable panel with proportional type.** Drag any edge or corner (360×520 to 760×1000). Font size scales with the window from about 0.9× to 1.35×, and the size is remembered.
- **Streaming LaTeX answers.** Markdown + KaTeX render while the answer streams. Reasoning tokens can be shown in a collapsible block.
- **Per-paper history.** Conversations are stored by paper and restored when you switch back.
- **Desktop-pet behavior.** Transparent, frameless, always-on-top, draggable, tray icon, global `Ctrl+Alt+P` show/hide, collapse into a small pet.
- **Privacy controls.** The API key is encrypted with Windows DPAPI; the Zotero plugin only writes local JSON and never makes network requests. Choose **Smart / Full text / Selection only** context modes.

![Screenshot explanation](docs/screenshot-image.png)

## Quick start

### Option A — use a portable build

A portable Windows build can be produced locally (the Electron runtime is large and is not committed to this repository):

```bash
pnpm install
node node_modules/electron/install.js   # if pnpm skipped Electron's postinstall
node scripts/sync-vendor.mjs
node scripts/build-plugin.mjs
node scripts/package.mjs
```

The app is generated in `dist/release/PaperPet-win32-x64/`.

1. Double-click **`启动纸读.vbs`** — not `PaperPet.exe` directly on Windows Server/remote sessions. The VBS launcher starts the app with `--no-sandbox`, which is required when Chromium's GPU sandbox is unavailable. Renderer isolation is still enforced (`contextIsolation: true`, `nodeIntegration: false`).
2. Open **Settings → Model connection**:
   - Base URL: `https://api.deepseek.com` by default; any OpenAI-compatible endpoint works.
   - API key: stored locally with Windows DPAPI.
   - Model: `deepseek-chat` by default.
   - **Screenshot / vision model**: required for screenshot OCR if your main model does not accept images (e.g. `deepseek-flash`, `gpt-4o`, or a vision model on your gateway).
   - Click **Test connection**.
3. Install the Zotero bridge:
   - With Zotero running: **Settings → Zotero bridge → Open plugin file**, then in Zotero choose **Tools → Plugins → gear → Install Plugin From File…** and select `paperpet-bridge.xpi`.
   - With Zotero fully closed: click **Install / update** in PaperPet, then reopen Zotero.
   - The prebuilt plugin is also available at [`prebuilt/paperpet-bridge.xpi`](prebuilt/paperpet-bridge.xpi).
4. Open a PDF in Zotero, select a sentence or double-click a word, and ask.

### Option B — run from source

```bash
pnpm install
node node_modules/electron/install.js
pnpm start          # includes --no-sandbox
pnpm demo           # demo data, no API key or Zotero needed
```

## Usage

| I want to… | Do this |
|---|---|
| Understand a sentence | Select it, click **Explain selection** |
| See why a step holds | Select the step, click **Unfold derivation** |
| Look up a symbol | Select the formula/paragraph, click **Explain notation**, or ask “what is λ?” |
| Understand a lost formula | `Win+Shift+S` around the formula → `Ctrl+V` in PaperPet → send |
| Get intuition | Click **Intuition**, or just ask; complex formulas get an example proactively |
| Test myself | Click **Quiz me**; questions come first, answers below |
| Read a different paper | Open another PDF in Zotero; the conversation switches automatically |
| Make the text larger | Drag any window edge/corner; type scales with the window |
| Hide the pet | Click `×`, use the tray icon, or press `Ctrl+Alt+P` |

## Configuration

| Setting | Meaning |
|---|---|
| Context mode | **Smart** (metadata + abstract + section map + current page + selection + BM25 passages), **Full text**, or **Selection only** |
| Context budget | 24k / 60k / 120k / 240k characters |
| Show reasoning | Expand `reasoning_content` from reasoning models |
| Vision model | Separate model for screenshots; blank = use the main model |
| Always on top | Keep the pet above Zotero/PDF |
| Start at login | Only effective in a packaged build |
| Theme | System / light paper / dark reading |

## Privacy

- The Zotero plugin writes only to `%APPDATA%\PaperPet\bridge\` and makes no network requests.
- Paper content and screenshots are sent only when **you press Send**.
- API keys are encrypted with Electron `safeStorage` (Windows DPAPI), or read from `DEEPSEEK_API_KEY`.
- Conversations are stored locally under `%APPDATA%\PaperPet\desktop\conversations\`.
- **Selection only** mode sends the selected text and current page, not the whole paper.
- Screenshots are sent to your configured vision model; only a small preview is stored in local conversation history.

## How it works

```text
Zotero 10 + PaperPet Bridge (bootstrap plugin)
        │  context.json + papers/<key>.txt (local files)
        ▼
Electron main process
  ├─ ZoteroBridge: watches current paper / page / selection
  ├─ paper-context: page split, headings, BM25, prompt assembly
  ├─ llm: OpenAI-compatible SSE streaming (+ image_url messages)
  └─ history: one JSON conversation per paper
        │
        ▼
Transparent always-on-top BrowserWindow
  └─ HTML/CSS/JS pet UI + marked + DOMPurify + KaTeX
```

Key design choices:

- **No vector database.** A single paper is 5–50k words; BM25 plus section headings is enough and has zero extra dependencies.
- **Stable system prefix.** The paper dossier (title/abstract/section map/full text) stays in the system prompt; question-specific selections and retrieval go in the user message, which improves API prefix-cache hits.
- **File bridge instead of an HTTP server.** No port conflicts, no CORS, no dependency on Zotero's local API switch.
- **Custom resize handles** instead of native transparent-window resizing, with browser zoom for proportional type.

## Project layout

```text
paperpet/
├─ electron/
│  ├─ main.js              # window, tray, IPC, screenshots, plugin install
│  ├─ preload.js           # safe IPC bridge
│  ├─ config.js            # config + DPAPI key storage
│  ├─ zotero-bridge.js     # reads context.json, follows paper switches
│  ├─ paper-context.js     # cleaning, headings, BM25, prompt assembly
│  ├─ llm.js               # OpenAI-compatible SSE streaming
│  └─ history.js           # per-paper conversation store
├─ src/                    # pet UI (HTML/CSS/JS + KaTeX)
├─ zotero-plugin/          # manifest.json + bootstrap.js
├─ scripts/                # build, icons, package, mock LLM
├─ test/                   # node:test unit tests
└─ docs/                   # screenshots
```

## Development

```bash
node scripts/sync-vendor.mjs   # marked / DOMPurify / KaTeX
pnpm test:context              # 8 unit tests
pnpm build:plugin              # dist/paperpet-bridge.xpi
node scripts/package.mjs       # Windows portable build
```

The mock server used for end-to-end tests:

```bash
node scripts/mock-llm.js       # http://127.0.0.1:23333/v1
```

## Limitations

1. **PDF math glyphs can be missing.** Many math PDFs use Type3 fonts or fonts without a ToUnicode map, so Zotero's text layer drops `ω_k`, subscripts, etc. Use screenshot OCR (requires a vision model) as the fallback.
2. **One-click bridge install requires Zotero to be closed.** When Zotero is running, use **Open plugin file** and the official plugin manager.
3. **No automatic writing to Zotero notes yet.** Answers can be copied with one click.
4. **Packaged/tested on Windows only.** The core is cross-platform; tray, login item, and installer scripts target Windows.
5. **Model quality sets the ceiling.** Use a stronger model for hard derivations, and a vision-capable model for screenshots. Long context costs more.

## Troubleshooting

| Symptom | Check |
|---|---|
| “Waiting for Zotero…” | Is Zotero running? Is PaperPet Bridge enabled? Check `%APPDATA%\PaperPet\bridge\plugin.log` for `started` |
| Empty paper card | Open the PDF and make its reader tab active; wait 2 seconds |
| No selection chip | Select text in the PDF text layer; scanned PDFs without OCR have no selectable text |
| Plugin not loading | Fully quit and reopen Zotero; confirm PaperPet Bridge is enabled under Tools → Plugins |
| 401 / 402 | Invalid key or insufficient balance; use **Test connection** |
| 404 / model not found | Check `/v1` in the Base URL; use **Fetch models** |
| Image request fails | Set a vision-capable **Screenshot / vision model** |
| `PaperPet.exe` crashes on launch | Use `启动纸读.vbs` or the desktop shortcut, which include `--no-sandbox` |

## License

MIT. For personal study and research only; follow the copyright and terms of the papers and model services you use.

---

Made by [21aQ](https://github.com/21aQ) · Repository: [github.com/21aQ/PaperPet](https://github.com/21aQ/PaperPet)
