import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds a public GitHub Pages entry point", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>UK² — Claim your place on the map<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /\/UK2\/assets\/[^"']+\.js/i);
  assert.match(html, /https:\/\/ryanmullenuk\.github\.io\/UK2\/og\.png/i);
  assert.doesNotMatch(html, /chatgpt|sign[ -]?in|auth/i);
});

test("keeps the exact-count and accessibility safeguards", async () => {
  const [page, css, mask, packageJson, workflow] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/generated-uk-mask.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const TOTAL_PIXELS = 10_000/);
  assert.match(page, /PIXELS\.length !== TOTAL_PIXELS/);
  assert.match(page, /UK_MASK_PACKED/);
  const packedMask = mask.match(/UK_MASK_PACKED = ("[^"]+")/)?.[1];
  assert.ok(packedMask);
  assert.equal(JSON.parse(packedMask).split(" ").length, 10_000);
  assert.match(page, /aria-label=\{`Interactive UK map containing exactly/);
  assert.match(page, /Proceed to secure payment/);
  assert.match(page, /const AVAILABLE_PIXELS = PIXELS\.filter\(\(pixel\) => !pixel\.owner\)\.length/);
  assert.doesNotMatch(page, /mockOwner|const OWNERS/);
  assert.doesNotMatch(page, /[↗↓✦]/);
  assert.match(page, /className="zoom-controls"/);
  assert.match(page, /Math\.min\(5/);
  assert.match(page, /RIPPLE_CELLS/);
  assert.match(page, /type="color"/);
  assert.match(page, /\["Royal blue", "#3256d8"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.pixel-ripples/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|drizzle|next/i);
  assert.match(workflow, /path: dist\s*$/m);
});
