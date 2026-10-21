// Builds every target into dist/:
//   dist/mfga.user.js          Tampermonkey / Violentmonkey userscript
//   dist/chrome/, dist/mfga-chrome.zip     Chrome / Edge MV3 extension
//   dist/firefox/, dist/mfga-firefox.zip   Firefox MV3 extension
// Usage: node scripts/build.mjs [--watch]
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, watch as watchDir, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipDirectory } from "./zip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const VERSION = pkg.version;
const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  format: "iife",
  target: ["chrome111", "firefox128"],
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning",
  define: { __MFGA_VERSION__: JSON.stringify(VERSION) },
};

function manifestFor(browser) {
  const m = JSON.parse(readFileSync(path.join(ROOT, "platform/extension/manifest.base.json"), "utf8"));
  m.version = VERSION;
  if (browser === "chrome") {
    m.background = { service_worker: "background.js" };
    m.minimum_chrome_version = "111";
  } else {
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = {
      gecko: {
        id: "mfga@pawel-mazurkiewicz.github.io",
        strict_min_version: "128.0",
        // Required for new AMO submissions since 2025-11-03; MFGA collects nothing.
        data_collection_permissions: { required: ["none"] },
      },
    };
  }
  return m;
}

async function buildExtension(browser) {
  const out = path.join(DIST, browser);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const entries = {
    "content.js": "platform/extension/content.js",
    "main-world.js": "src/page/main-world.js",
    "background.js": "src/background/background.js",
  };
  for (const [file, entry] of Object.entries(entries)) {
    await build({ ...common, entryPoints: [path.join(ROOT, entry)], outfile: path.join(out, file) });
  }
  cpSync(path.join(ROOT, "assets/icons"), path.join(out, "icons"), { recursive: true });
  writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifestFor(browser), null, 2)}\n`);
  zipDirectory(out, path.join(DIST, `mfga-${browser}.zip`));
}

async function buildUserscript() {
  const icon = `data:image/png;base64,${readFileSync(path.join(ROOT, "assets/icons/icon-32.png")).toString("base64")}`;
  const meta = readFileSync(path.join(ROOT, "platform/userscript/meta.txt"), "utf8")
    .replace(/__VERSION__/g, VERSION)
    .replace(/__ICON__/g, icon);
  // The page-world helper is bundled separately and embedded as a string; the userscript injects it.
  const mainWorld = await build({
    ...common,
    entryPoints: [path.join(ROOT, "src/page/main-world.js")],
    write: false,
    minify: true,
  });
  const r = await build({
    ...common,
    entryPoints: [path.join(ROOT, "platform/userscript/entry.js")],
    write: false,
    define: { ...common.define, __MFGA_MAIN_WORLD__: JSON.stringify(mainWorld.outputFiles[0].text) },
  });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(path.join(DIST, "mfga.user.js"), `${meta.trim()}\n\n${r.outputFiles[0].text}`);
}

async function main() {
  mkdirSync(DIST, { recursive: true });
  await Promise.all([buildExtension("chrome"), buildExtension("firefox"), buildUserscript()]);
  console.log(`MFGA ${VERSION} built into ${path.relative(process.cwd(), DIST) || "dist"}/`);
}

await main();
if (watch) {
  console.log("watching src/ and platform/ …");
  let t = 0;
  const rebuild = () => {
    clearTimeout(t);
    t = setTimeout(() => main().catch((e) => console.error(e)), 150);
  };
  for (const dir of ["src", "platform"]) watchDir(path.join(ROOT, dir), { recursive: true }, rebuild);
}
