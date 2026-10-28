/* PaperPet Bridge — Zotero 7/8/10 bootstrap plugin
 * Writes the currently-read paper, PDF text cache, annotations and current
 * selection to %APPDATA%\PaperPet\bridge\context.json for the desktop pet.
 */

var PaperPetBridge = {
  id: "paperpet@local",
  version: "1.0.0",
  started: false,
  timer: null,
  writeTimer: null,
  logTimer: null,
  busy: false,
  lastHash: "",
  lastWriteAt: 0,
  lastReader: null,
  lastSelection: null,
  lastSelectionKey: "",
  cachedText: new Map(),
  logs: [],
  paths: null,

  async start() {
    if (this.started) return;
    this.started = true;

    let appData = Services.dirsvc.get("AppData", Components.interfaces.nsIFile).path;
    let root = PathUtils.join(appData, "PaperPet");
    let bridge = PathUtils.join(root, "bridge");
    let papers = PathUtils.join(bridge, "papers");
    await Zotero.File.createDirectoryIfMissingAsync(bridge);
    await Zotero.File.createDirectoryIfMissingAsync(papers);
    this.paths = {
      root,
      bridge,
      papers,
      context: PathUtils.join(bridge, "context.json"),
      log: PathUtils.join(bridge, "plugin.log"),
    };

    this.log(`started on Zotero ${Zotero.version}; bridge=${bridge}`);
    Zotero.debug(`[PaperPet] bridge started at ${bridge}`);

    try {
      Zotero.Reader.registerEventListener(
        "renderTextSelectionPopup",
        (event) => this.onSelectionPopup(event),
        this.id,
      );
    } catch (e) {
      this.log("reader event registration failed: " + this.err(e));
    }

    this.timer = setInterval(() => this.tick(), 1500);
    this.tick();
  },

  shutdown() {
    if (!this.started) return;
    this.started = false;
    if (this.timer) clearInterval(this.timer);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    if (this.logTimer) clearTimeout(this.logTimer);
    this.timer = null;
    try {
      Zotero.Reader.unregisterEventListener(
        "renderTextSelectionPopup",
        this.onSelectionPopup,
      );
    } catch (e) {}
    this.log("shutdown");
    this.flushLog();
    Zotero.debug("[PaperPet] bridge stopped");
  },

  err(e) {
    return e && (e.stack || e.message) ? (e.stack || e.message) : String(e);
  },

  log(message) {
    let line = `${new Date().toISOString()} ${message}`;
    this.logs.push(line);
    if (this.logs.length > 120) this.logs.splice(0, this.logs.length - 120);
    if (this.logTimer) return;
    this.logTimer = setTimeout(() => {
      this.logTimer = null;
      this.flushLog();
    }, 500);
  },

  async flushLog() {
    if (!this.paths) return;
    try {
      await Zotero.File.putContentsAsync(
        this.paths.log,
        this.logs.join("\n") + "\n",
        "UTF-8",
      );
    } catch (e) {
      Zotero.debug("[PaperPet] failed to write log: " + this.err(e));
    }
  },

  scheduleWrite() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.tick(true);
    }, 120);
  },

  onSelectionPopup(event) {
    try {
      let { reader, params } = event || {};
      let annotation = params && params.annotation;
      if (!reader || !annotation || !annotation.text) return;
      let text = String(annotation.text).trim();
      if (!text) return;
      this.lastSelection = {
        text: text.slice(0, 6000),
        pageLabel: annotation.pageLabel || "",
        color: annotation.color || "",
        source: "popup",
        capturedAt: Date.now(),
        attachmentItemID: reader.itemID,
      };
      this.lastSelectionKey = `popup:${reader.itemID}:${text.slice(0, 60)}`;
      this.log(`selection popup: ${text.length} chars, p.${annotation.pageLabel || "?"}`);
      this.scheduleWrite();
    } catch (e) {
      this.log("onSelectionPopup error: " + this.err(e));
    }
  },

  findActiveReader() {
    let readers = (Zotero.Reader && Zotero.Reader._readers) || [];
    let open = readers.filter((r) => r && r.itemID && !r._isTabClosed);
    for (let reader of open) {
      try {
        let win = reader._window || Zotero.getMainWindow();
        if (win && win.Zotero_Tabs && win.Zotero_Tabs.selectedID === reader.tabID) {
          return reader;
        }
      } catch (e) {}
    }
    return null;
  },

  findOpenReaderForLastPaper() {
    let readers = (Zotero.Reader && Zotero.Reader._readers) || [];
    let open = readers.filter((r) => r && r.itemID && !r._isTabClosed);
    if (this.lastReader) {
      let same = open.find((r) => r.itemID === this.lastReader.itemID);
      if (same) return same;
    }
    return null;
  },

  getSelectedLibraryItem() {
    try {
      let pane = Zotero.getActiveZoteroPane();
      if (!pane) return null;
      let items = pane.getSelectedItems();
      if (!items || !items.length) return null;
      return items[0];
    } catch (e) {
      return null;
    }
  },

  readerSelection(reader) {
    if (!reader || !reader.itemID) return null;
    let wins = [];
    try {
      if (reader._internalReader && reader._internalReader._primaryView) {
        wins.push(reader._internalReader._primaryView._iframeWindow);
      }
    } catch (e) {}
    try {
      wins.push(reader._iframeWindow);
    } catch (e) {}

    for (let win of wins) {
      if (!win) continue;
      try {
        let text = String(win.getSelection ? win.getSelection().toString() : "").trim();
        if (!text || text.length < 2) continue;
        let page = "";
        try {
          page =
            win.PDFViewerApplication &&
            win.PDFViewerApplication.pdfViewer &&
            win.PDFViewerApplication.pdfViewer.currentPageNumber;
        } catch (e) {}
        let pageLabel = page ? String(page) : "";
        if (
          this.lastSelection &&
          this.lastSelection.attachmentItemID === reader.itemID &&
          this.lastSelection.text === text &&
          this.lastSelection.pageLabel
        ) {
          pageLabel = this.lastSelection.pageLabel;
        }
        let key = `live:${reader.itemID}:${pageLabel}:${text.slice(0, 60)}`;
        if (key === this.lastSelectionKey) return this.lastSelection;
        this.lastSelection = {
          text: text.slice(0, 6000),
          pageLabel,
          color: "",
          source: "selection",
          capturedAt: Date.now(),
          attachmentItemID: reader.itemID,
        };
        this.lastSelectionKey = key;
        this.log(`live selection: ${text.length} chars, p.${pageLabel || "?"}`);
        return this.lastSelection;
      } catch (e) {}
    }
    return null;
  },

  readerPage(reader, attachment) {
    let page = 0;
    try {
      let win =
        reader._internalReader &&
        reader._internalReader._primaryView &&
        reader._internalReader._primaryView._iframeWindow;
      page =
        win &&
        win.PDFViewerApplication &&
        win.PDFViewerApplication.pdfViewer &&
        win.PDFViewerApplication.pdfViewer.currentPageNumber;
    } catch (e) {}
    if (!page) {
      try {
        page = attachment.getAttachmentLastPageIndex() + 1;
      } catch (e) {}
    }
    return Number.isInteger(page) && page > 0 ? page : 0;
  },

  async paperFromItem(item) {
    if (!item) return null;
    let attachment = null;
    let paper = null;

    if (item.isAttachment && item.isAttachment()) {
      attachment = item;
      paper = item.parentItemID ? Zotero.Items.get(item.parentItemID) : item;
    } else {
      paper = item;
      try {
        let best = item.getBestAttachment && item.getBestAttachment();
        if (best && best.isPDFAttachment && best.isPDFAttachment()) {
          attachment = best;
        }
      } catch (e) {}
      if (!attachment) {
        try {
          let ids = (item.getAttachments && item.getAttachments()) || [];
          for (let id of ids) {
            let candidate = Zotero.Items.get(id);
            if (candidate && candidate.isPDFAttachment && candidate.isPDFAttachment()) {
              attachment = candidate;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!paper) return null;

    let creators = [];
    try {
      creators = paper.getCreators().map((c) => ({
        first: c.firstName || "",
        last: c.lastName || "",
        name: c.name || "",
        type: c.creatorType || "",
      }));
    } catch (e) {}

    let date = "";
    let title = "";
    let abstract = "";
    let doi = "";
    let url = "";
    let language = "";
    let extra = "";
    let venue = "";
    let shortTitle = "";
    let volume = "";
    let issue = "";
    let pages = "";
    try {
      date = paper.getField("date") || "";
      title = paper.getField("title") || "";
      shortTitle = paper.getField("shortTitle") || "";
      abstract = paper.getField("abstractNote") || "";
      doi = paper.getField("DOI") || "";
      url = paper.getField("url") || "";
      language = paper.getField("language") || "";
      extra = paper.getField("extra") || "";
      venue =
        paper.getField("publicationTitle") ||
        paper.getField("proceedingsTitle") ||
        paper.getField("bookTitle") ||
        paper.getField("university") ||
        paper.getField("publisher") ||
        "";
      volume = paper.getField("volume") || "";
      issue = paper.getField("issue") || "";
      pages = paper.getField("pages") || "";
    } catch (e) {}

    let year = "";
    let m = String(date).match(/(18|19|20)\d{2}/);
    if (m) year = m[0];

    let itemType = "";
    try {
      itemType = Zotero.ItemTypes.getName(paper.itemTypeID) || "";
    } catch (e) {}

    let tags = [];
    try {
      tags = (paper.getTags() || []).map((t) => t.tag);
    } catch (e) {}

    let collections = [];
    try {
      collections = (paper.getCollections() || [])
        .map((id) => {
          let c = Zotero.Collections.get(id);
          return c ? c.name : "";
        })
        .filter(Boolean);
    } catch (e) {}

    let notes = [];
    try {
      let noteIDs = paper.getNotes() || [];
      for (let id of noteIDs.slice(0, 4)) {
        let note = Zotero.Items.get(id);
        if (!note) continue;
        let html = note.getNote() || "";
        let text = html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/[ \t]+/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        if (text) notes.push(text.slice(0, 1200));
      }
    } catch (e) {}

    let annotations = [];
    if (attachment) {
      try {
        let anns = attachment.getAnnotations() || [];
        annotations = anns.slice(-80).map((a) => ({
          id: a.id,
          type: a.annotationType || "",
          text: a.annotationText || "",
          comment: a.annotationComment || "",
          pageLabel: a.annotationPageLabel || "",
          color: a.annotationColor || "",
        }));
      } catch (e) {}
    }

    let attachmentInfo = null;
    let fullText = null;
    if (attachment) {
      try {
        attachmentInfo = {
          itemID: attachment.id,
          key: attachment.key,
          filename: attachment.attachmentFilename || "",
          contentType: attachment.attachmentContentType || "",
          pageCount: 0,
          fullTextChars: 0,
          fullTextFile: "",
        };
        fullText = await this.getFullText(attachment, attachmentInfo);
        attachmentInfo.pageCount =
          (fullText && fullText.pageCount) ||
          (fullText && fullText.text ? fullText.text.split("\f").length : 0);
        attachmentInfo.fullTextChars =
          (fullText && fullText.text && fullText.text.length) || 0;
        attachmentInfo.fullTextFile = fullText && fullText.file ? fullText.file : "";
      } catch (e) {
        this.log("attachment text failed: " + this.err(e));
      }
    }

    return {
      paper: {
        itemID: paper.id,
        key: paper.key,
        libraryID: paper.libraryID,
        itemType,
        title,
        shortTitle,
        creators,
        year,
        date,
        venue,
        volume,
        issue,
        pages,
        doi,
        url,
        abstract,
        language,
        extra,
        tags,
        collections,
        notes,
      },
      attachment: attachmentInfo,
      annotations,
    };
  },

  async getFullText(attachment, attachmentInfo) {
    let key = attachment.key;
    let filePath = "";
    let stat = null;
    try {
      filePath = (await attachment.getFilePathAsync()) || "";
      if (filePath) stat = await IOUtils.stat(filePath);
    } catch (e) {}

    let textFile = PathUtils.join(this.paths.papers, `${key}.txt`);
    let metaFile = PathUtils.join(this.paths.papers, `${key}.json`);
    let meta = null;
    try {
      if (await IOUtils.exists(metaFile)) {
        meta = JSON.parse(await Zotero.File.getContentsAsync(metaFile, "UTF-8"));
      }
    } catch (e) {}

    if (
      meta &&
      meta.textFile === textFile &&
      (await IOUtils.exists(textFile)) &&
      (!stat || (meta.mtime === stat.lastModified && meta.size === stat.size))
    ) {
      let text = await Zotero.File.getContentsAsync(textFile, "UTF-8");
      return { text, pageCount: meta.pageCount || 0, file: textFile };
    }

    let text = "";
    try {
      if (attachment.isPDFAttachment && attachment.isPDFAttachment()) {
        let cacheFile = "";
        try {
          cacheFile = Zotero.Fulltext.getItemCacheFile(attachment).path;
        } catch (e) {}
        if (cacheFile && (await IOUtils.exists(cacheFile))) {
          text = await Zotero.File.getContentsAsync(cacheFile, "UTF-8");
        }
        if (!text || !text.trim()) {
          let result = await Zotero.PDFWorker.getFullText(attachment.id);
          text = (result && (result.text || result.content)) || "";
          if (result && result.pageCount) attachmentInfo.pageCount = result.pageCount;
        }
      }
    } catch (e) {
      this.log("PDF text extraction failed: " + this.err(e));
    }

    if (!text) text = "";
    let pageCount = attachmentInfo.pageCount || text.split("\f").length;
    try {
      await Zotero.File.putContentsAsync(textFile, text, "UTF-8");
      await Zotero.File.putContentsAsync(
        metaFile,
        JSON.stringify({
          textFile,
          mtime: stat ? stat.lastModified : 0,
          size: stat ? stat.size : 0,
          pageCount,
          chars: text.length,
          savedAt: Date.now(),
        }),
        "UTF-8",
      );
    } catch (e) {
      this.log("fulltext cache write failed: " + this.err(e));
    }

    return { text, pageCount, file: textFile };
  },

  async tick(force) {
    if (!this.started || this.busy) return;
    this.busy = true;
    try {
      let active = this.findActiveReader();
      let reader = active || this.findOpenReaderForLastPaper();
      let selected = this.getSelectedLibraryItem();
      let status = "idle";
      let item = null;

      if (active) {
        status = "reading";
        item = Zotero.Items.get(active.itemID);
        this.lastReader = active;
      } else if (selected) {
        status = "selected";
        item = selected;
      } else if (reader) {
        status = "reader-open";
        item = Zotero.Items.get(reader.itemID);
      }

      if (!item) {
        let payload = {
          version: 1,
          plugin: { id: this.id, version: this.version },
          status: "idle",
          updatedAt: Date.now(),
          zotero: { version: Zotero.version },
          paper: null,
          attachment: null,
          reader: null,
          annotations: [],
        };
        await this.write(payload, force);
        return;
      }

      if (reader && (!active || reader.itemID === active.itemID)) {
        this.readerSelection(reader);
      } else if (active) {
        this.readerSelection(active);
      }

      let info = await this.paperFromItem(item);
      if (!info) return;

      let currentReader = active || (reader && reader.itemID === item.id ? reader : null);
      let page = currentReader ? this.readerPage(currentReader, item) : 0;
      let selection = null;
      if (
        this.lastSelection &&
        (!this.lastSelection.attachmentItemID ||
          this.lastSelection.attachmentItemID === item.id)
      ) {
        selection = { ...this.lastSelection };
      }

      let payload = {
        version: 1,
        plugin: { id: this.id, version: this.version },
        status,
        updatedAt: Date.now(),
        zotero: { version: Zotero.version },
        paper: info.paper,
        attachment: info.attachment,
        annotations: info.annotations,
        reader: currentReader
          ? {
              tabID: currentReader.tabID || "",
              page,
              pageLabel: selection && selection.pageLabel
                ? selection.pageLabel
                : page
                  ? String(page)
                  : "",
              selection,
            }
          : null,
        selection,
      };

      await this.write(payload, force);
    } catch (e) {
      this.log("tick error: " + this.err(e));
    } finally {
      this.busy = false;
    }
  },

  async write(payload, force) {
    if (!this.paths) return;
    let comparable = JSON.stringify({
      ...payload,
      updatedAt: 0,
    });
    let now = Date.now();
    if (!force && comparable === this.lastHash && now - this.lastWriteAt < 5000) {
      return;
    }
    this.lastHash = comparable;
    this.lastWriteAt = now;
    let tmp = this.paths.context + ".tmp";
    let json = JSON.stringify(payload);
    try {
      await Zotero.File.putContentsAsync(tmp, json, "UTF-8");
      await IOUtils.move(tmp, this.paths.context);
    } catch (e) {
      try {
        await Zotero.File.putContentsAsync(this.paths.context, json, "UTF-8");
      } catch (e2) {
        this.log("context write failed: " + this.err(e2));
      }
    }
  },
};

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
  await Zotero.initializationPromise;
  try {
    await PaperPetBridge.start();
    Zotero.PaperPet = PaperPetBridge;
  } catch (e) {
    Zotero.debug("[PaperPet] startup failed: " + (e.stack || e.message));
  }
}

async function onMainWindowLoad({ window }, reason) {
  if (Zotero.PaperPet) Zotero.PaperPet.scheduleWrite();
}

async function onMainWindowUnload({ window }, reason) {}

function shutdown({ id, version, resourceURI, rootURI }, reason) {
  if (reason === APP_SHUTDOWN) return;
  try {
    PaperPetBridge.shutdown();
  } catch (e) {}
  if (Zotero.PaperPet === PaperPetBridge) Zotero.PaperPet = null;
}

function uninstall(data, reason) {}
