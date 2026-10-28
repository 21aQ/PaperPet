import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "src", "vendor");
fs.mkdirSync(path.join(out, "katex", "fonts"), { recursive: true });

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

copy(path.join(root, "node_modules", "marked", "lib", "marked.umd.js"), path.join(out, "marked.umd.js"));
copy(path.join(root, "node_modules", "dompurify", "dist", "purify.min.js"), path.join(out, "purify.min.js"));
copy(path.join(root, "node_modules", "katex", "dist", "katex.min.js"), path.join(out, "katex", "katex.min.js"));
copy(path.join(root, "node_modules", "katex", "dist", "katex.min.css"), path.join(out, "katex", "katex.min.css"));
copy(
  path.join(root, "node_modules", "katex", "dist", "contrib", "auto-render.min.js"),
  path.join(out, "katex", "auto-render.min.js"),
);

const fontsDir = path.join(root, "node_modules", "katex", "dist", "fonts");
for (const file of fs.readdirSync(fontsDir)) {
  if (/\.(woff2?|ttf)$/i.test(file)) {
    copy(path.join(fontsDir, file), path.join(out, "katex", "fonts", file));
  }
}

console.log("vendor assets synced to", out);
