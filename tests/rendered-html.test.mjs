import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds a public GitHub Pages entry point", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");

  assert.match(html, /<title>pixelUK — Claim your place on the map<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/i);
  assert.match(html, /\/assets\/[^"']+\.js/i);
  assert.match(html, /https:\/\/pixeluk\.co\.uk\/og\.png/i);
  assert.match(html, /\/apple-touch-icon\.png/i);
  assert.match(html, /\/site\.webmanifest/i);
  assert.doesNotMatch(html, /chatgpt|sign[ -]?in|auth/i);
  assert.equal((await readFile(new URL("../dist/CNAME", import.meta.url), "utf8")).trim(), "pixeluk.co.uk");
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
  assert.match(page, /const \[availablePixels, setAvailablePixels\] = useState\(TOTAL_PIXELS\)/);
  assert.match(page, /\/map-data/);
  assert.match(page, /\/create-checkout/);
  assert.match(page, /Stripe is currently in test mode/);
  assert.doesNotMatch(page, /mockOwner|const OWNERS/);
  assert.doesNotMatch(page, /[↗↓✦]/);
  assert.match(page, /className="zoom-controls"/);
  assert.match(page, /Math\.min\(5/);
  assert.match(page, /const animateCamera/);
  assert.match(page, /duration = reset \? 520 : 320/);
  assert.match(page, /const getMapCache/);
  assert.match(page, /ctx\.drawImage\(getMapCache\(\)/);
  assert.match(page, /pointerMoveFrameRef/);
  assert.match(page, /className=\{`map-selection-total/);
  assert.match(page, /£\{selected\.size \* PRICE\}/);
  assert.match(page, /create a permanent place to remember someone/);
  assert.match(page, /RIPPLE_CELLS/);
  assert.match(page, /type="color"/);
  assert.match(page, /\["Royal blue", "#3256d8"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.pixel-ripples/);
  assert.match(css, /\.primary \{[^}]*background: transparent[^}]*box-shadow: none/s);
  assert.match(css, /\.benefit-grid article:hover/);
  assert.match(css, /\.purchase-modal \{ border: 0; box-shadow: none; \}/);
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare|drizzle|next/i);
  assert.match(workflow, /path: dist\s*$/m);
});

test("keeps checkout secrets server-side and ownership transactional", async () => {
  const [page, migration, checkout, webhook, mapData] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260816000000_pixel_ownership.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/create-checkout/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/stripe-webhook/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/map-data/index.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /sk_(?:test|live)_|whsec_/);
  assert.match(migration, /generate_series\(1, 10000\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /status = 'owned'/);
  assert.match(migration, /enable row level security/);
  assert.match(checkout, /stripe\.checkout\.sessions\.create/);
  assert.match(checkout, /unit_amount: 200/);
  assert.match(webhook, /constructEventAsync/);
  assert.match(webhook, /complete_pixel_order/);
  assert.match(mapData, /\.eq\("status", "available"\)/);
});
