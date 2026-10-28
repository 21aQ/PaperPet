import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "zotero-plugin");
const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, { recursive: true });

const files = ["manifest.json", "bootstrap.js", "icon.png"];
const zip = new JSZip();
for (const file of files) {
  const full = path.join(source, file);
  if (!fs.existsSync(full)) throw new Error(`Missing plugin file: ${full}`);
  zip.file(file, fs.readFileSync(full));
}

const buffer = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
const target = path.join(outDir, "paperpet-bridge.xpi");
fs.writeFileSync(target, buffer);
console.log(`built ${target} (${(buffer.length / 1024).toFixed(1)} KB)`);
