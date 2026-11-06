// Build script: assemble the public publish folder (dist/) from source.
//
// Design goals (see docs/feature-plan.md):
// - Publish ONLY public assets: HTML, CSS, browser JS, images.
// - NEVER copy private/sensitive items into the publish output:
//   .git, .kiro, .env*, docs/, node_modules/, netlify/ (server functions),
//   scripts/, index-code.txt, and this build tooling.
// - Server functions live in netlify/functions and must not land in dist/.
//
// This keeps the existing root index.html (served by GitHub Pages) untouched
// while giving Netlify a clean, minimal publish directory.

import { cp, rm, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

// Files/folders at the repo root that are explicitly NOT public.
const DENY = new Set([
  ".git",
  ".github",
  ".gitignore",
  ".kiro",
  ".env",
  ".netlify",
  "node_modules",
  "netlify", // server functions – must never be copied into dist/
  "supabase", // db schema / server setup – not public
  "scripts", // build tooling
  "docs", // personal/project records
  "dist", // the output itself
  "package.json",
  "package-lock.json",
  "netlify.toml",
  "index-code.txt", // working copy of source, not for publishing
  "README.md",
]);

// Only these extensions are treated as publishable static assets.
const PUBLIC_EXT = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".json", // e.g. manifest/site config if added later
  ".txt", // e.g. robots.txt (index-code.txt is denied above)
  ".woff",
  ".woff2",
]);

async function copyPublic() {
  if (existsSync(DIST)) {
    await rm(DIST, { recursive: true, force: true });
  }
  await mkdir(DIST, { recursive: true });

  const entries = await readdir(ROOT, { withFileTypes: true });
  const copied = [];

  for (const entry of entries) {
    if (DENY.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue; // skip stray dotfiles

    const src = join(ROOT, entry.name);

    if (entry.isDirectory()) {
      // Copy a public asset folder (e.g. images/, assets/) recursively,
      // filtering to public extensions only.
      await copyDirFiltered(src, join(DIST, entry.name), copied);
    } else if (entry.isFile()) {
      if (PUBLIC_EXT.has(extname(entry.name).toLowerCase())) {
        await cp(src, join(DIST, entry.name));
        copied.push(entry.name);
      }
    }
  }

  return copied;
}

async function copyDirFiltered(srcDir, destDir, copied) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirFiltered(src, dest, copied);
    } else if (PUBLIC_EXT.has(extname(entry.name).toLowerCase())) {
      await mkdir(destDir, { recursive: true });
      await cp(src, dest);
      copied.push(src.replace(ROOT + "\\", "").replace(ROOT + "/", ""));
    }
  }
}

const copied = await copyPublic();
console.log("Built dist/ with public assets:");
for (const f of copied) console.log("  +", f);
if (!copied.includes("index.html")) {
  console.error("\nWARNING: index.html was not copied – check the source root.");
  process.exit(1);
}
console.log(`\nDone. ${copied.length} file(s) copied to dist/.`);
