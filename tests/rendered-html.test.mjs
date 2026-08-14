import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the finished UK squared experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>UK² — Claim your place on the map<\/title>/i);
  assert.match(html, /Interactive UK map containing exactly 10,000 selectable squares/);
  assert.match(html, /Choose your squares/);
  assert.match(html, /Why buy/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps the exact-count and accessibility safeguards in source", async () => {
  const [page, layout, css, mask, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/generated-uk-mask.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const TOTAL_PIXELS = 10_000/);
  assert.match(page, /PIXELS\.length !== TOTAL_PIXELS/);
  assert.match(page, /UK_MASK_PACKED/);
  const packedMask = mask.match(/UK_MASK_PACKED = ("[^"]+")/)?.[1];
  assert.ok(packedMask);
  assert.equal(JSON.parse(packedMask).split(" ").length, 10_000);
  assert.match(page, /aria-label=\{`Interactive UK map containing exactly/);
  assert.match(page, /Mock checkout/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
