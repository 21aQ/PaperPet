import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import packager from "@electron/packager";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const xpi = path.join(root, "dist", "paperpet-bridge.xpi");
if (!fs.existsSync(xpi)) {
  throw new Error("Missing dist/paperpet-bridge.xpi. Run pnpm build:plugin first.");
}

const stage = path.join(root, "dist", ".stage");
const out = path.join(root, "dist", "release");
fs.rmSync(stage, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const dir of ["electron", "src", "assets"]) {
  fs.cpSync(path.join(root, dir), path.join(stage, dir), { recursive: true });
}
for (const file of ["package.json", "README.md", "README.zh-CN.md", "LICENSE"]) {
  if (fs.existsSync(path.join(root, file))) {
    fs.copyFileSync(path.join(root, file), path.join(stage, file));
  }
}

const paths = await packager({
  dir: stage,
  out,
  overwrite: true,
  platform: "win32",
  arch: "x64",
  name: "PaperPet",
  executableName: "PaperPet",
  appVersion: "1.0.0",
  buildVersion: "1.0.0",
  icon: path.join(root, "assets", "icon.ico"),
  asar: true,
  prune: false,
  quiet: true,
  extraResource: [xpi],
  win32metadata: {
    CompanyName: "PaperPet",
    FileDescription: "纸读 PaperPet · Zotero 论文陪读桌宠",
    ProductName: "纸读 PaperPet",
    InternalName: "PaperPet",
    OriginalFilename: "PaperPet.exe",
    LegalCopyright: "PaperPet",
  },
});

const appDir = paths[0];
console.log("packaged", appDir);

const vbs = `Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
base = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run """" & base & "\\PaperPet.exe"" --no-sandbox", 0, False
`;
fs.writeFileSync(path.join(appDir, "启动纸读.vbs"), vbs, "utf8");

const cmd = `@echo off\r\nstart "" "%~dp0PaperPet.exe" --no-sandbox\r\n`;
fs.writeFileSync(path.join(appDir, "启动纸读.cmd"), cmd, "utf8");

const shortcut = `$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop "纸读 PaperPet.lnk"))
$link.TargetPath = (Join-Path $base "PaperPet.exe")
$link.Arguments = "--no-sandbox"
$link.WorkingDirectory = $base
$link.IconLocation = (Join-Path $base "PaperPet.exe") + ",0"
$link.Description = "纸读 PaperPet · Zotero 论文陪读桌宠"
$link.Save()
Write-Host "桌面快捷方式已创建：$desktop\\纸读 PaperPet.lnk"
`;
fs.writeFileSync(path.join(appDir, "创建桌面快捷方式.ps1"), "\uFEFF" + shortcut, "utf8");

for (const file of ["README.md", "README.zh-CN.md", "LICENSE"]) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(appDir, file));
}
const docs = path.join(root, "docs");
if (fs.existsSync(docs)) fs.cpSync(docs, path.join(appDir, "docs"), { recursive: true });

console.log("launcher + shortcut script written");
console.log(path.join(appDir, "PaperPet.exe"));
