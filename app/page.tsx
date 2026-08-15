import { useCallback, useEffect, useRef, useState } from "react";
import { UK_GRID_HEIGHT, UK_GRID_WIDTH, UK_MASK_PACKED } from "./generated-uk-mask";

type Pixel = { id: number; x: number; y: number; owner?: Owner };
type Owner = { name: string; colour: string; title: string; link: string; note: string };

const GRID_W = UK_GRID_WIDTH;
const GRID_H = UK_GRID_HEIGHT;
const TOTAL_PIXELS = 10_000;
const PRICE = 2;

function buildPixels(): Pixel[] {
  return UK_MASK_PACKED.split(" ").map((cell, index) => {
    const [x, y] = cell.split(".").map((value) => Number.parseInt(value, 36));
    return { id: index + 1, x, y };
  });
}

const PIXELS = buildPixels();
if (PIXELS.length !== TOTAL_PIXELS) throw new Error(`UK² map must contain exactly ${TOTAL_PIXELS} squares; generated ${PIXELS.length}.`);
const AVAILABLE_PIXELS = PIXELS.filter((pixel) => !pixel.owner).length;
const PIXEL_LOOKUP = new Map(PIXELS.map((p) => [`${p.x}:${p.y}`, p]));
const RIPPLE_CELLS = (() => {
  const land = new Set(PIXELS.map((pixel) => `${pixel.x}:${pixel.y}`));
  const visited = new Set(land);
  let frontier = PIXELS.map(({ x, y }) => ({ x, y }));
  const ripples: Array<{ x: number; y: number; band: number }> = [];

  for (let band = 1; band <= 5; band += 1) {
    const next: Array<{ x: number; y: number }> = [];
    for (const cell of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = `${x}:${y}`;
        if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H || visited.has(key)) continue;
        visited.add(key);
        next.push({ x, y });
        if ((x + y + band) % 2 === 0) ripples.push({ x, y, band });
      }
    }
    frontier = next;
  }

  return ripples;
})();

const COLOURS = [
  ["Sunshine", "#ffcb3d"], ["Coral", "#ff6257"], ["Mint", "#4fe3a4"], ["Violet", "#9e7bff"],
  ["Pink", "#ff8ec7"], ["Cyan", "#22c8eb"], ["White", "#f4f7f3"], ["Navy", "#102d52"],
  ["Orange", "#ff8a34"], ["Lime", "#b8ec45"], ["Sky", "#72b8ff"], ["Lavender", "#c9a7ff"],
  ["Crimson", "#c9364f"], ["Teal", "#159c9a"], ["Royal blue", "#3256d8"], ["Black", "#07111f"],
] as const;

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function PixelMap({ selected, colour, onToggle, onOpenOwner }: {
  selected: Set<number>;
  colour: string;
  onToggle: (pixel: Pixel, add?: boolean) => void;
  onOpenOwner: (pixel: Pixel) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rippleCanvasRef = useRef<HTMLCanvasElement>(null);
  const mapCacheRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Pixel | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPainted = useRef<number | null>(null);
  const paintingRef = useRef(false);
  const pointerMoveFrameRef = useRef(0);
  const pendingPointerRef = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const panDrag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const metricsRef = useRef({ baseCell: 1, width: 1, height: 1 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const cameraAnimationRef = useRef(0);

  const getMapCache = useCallback(() => {
    if (mapCacheRef.current) return mapCacheRef.current;
    const scale = 4;
    const cache = document.createElement("canvas");
    cache.width = GRID_W * scale;
    cache.height = GRID_H * scale;
    const context = cache.getContext("2d");
    if (!context) return cache;
    context.imageSmoothingEnabled = false;
    for (const pixel of PIXELS) {
      context.fillStyle = pixel.owner?.colour || "#e8f2ef";
      context.fillRect(pixel.x * scale, pixel.y * scale, scale - .65, scale - .65);
    }
    mapCacheRef.current = cache;
    return cache;
  }, []);

  const clampPan = useCallback((next: { x: number; y: number }, level = zoom) => {
    const { baseCell, width, height } = metricsRef.current;
    const maxX = Math.max(0, (GRID_W * baseCell * level - width) / 2) + 28;
    const maxY = Math.max(0, (GRID_H * baseCell * level - height) / 2) + 28;
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, [zoom]);

  const setCamera = useCallback((level: number, position: { x: number; y: number }) => {
    zoomRef.current = level;
    panRef.current = position;
    setZoom(level);
    setPan(position);
  }, []);

  const animateCamera = useCallback((next: number, reset = false) => {
    cancelAnimationFrame(cameraAnimationRef.current);
    const targetZoom = Math.max(1, Math.min(5, Math.round(next * 4) / 4));
    const startZoom = zoomRef.current;
    const startPan = panRef.current;
    const targetPan = reset || targetZoom === 1 ? { x: 0, y: 0 } : clampPan(startPan, targetZoom);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setCamera(targetZoom, targetPan);
      return;
    }

    const started = performance.now();
    const duration = reset ? 520 : 320;
    const step = (time: number) => {
      const progress = Math.min(1, (time - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCamera(
        startZoom + (targetZoom - startZoom) * eased,
        {
          x: startPan.x + (targetPan.x - startPan.x) * eased,
          y: startPan.y + (targetPan.y - startPan.y) * eased,
        },
      );
      if (progress < 1) cameraAnimationRef.current = requestAnimationFrame(step);
      else cameraAnimationRef.current = 0;
    };
    cameraAnimationRef.current = requestAnimationFrame(step);
  }, [clampPan, setCamera]);

  useEffect(() => () => {
    cancelAnimationFrame(cameraAnimationRef.current);
    cancelAnimationFrame(pointerMoveFrameRef.current);
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const rippleCanvas = rippleCanvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !rippleCanvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, rect.width);
    const height = Math.max(420, rect.height);
    const renderWidth = Math.round(width * ratio);
    const renderHeight = Math.round(height * ratio);
    if (canvas.width !== renderWidth) canvas.width = renderWidth;
    if (canvas.height !== renderHeight) canvas.height = renderHeight;
    if (rippleCanvas.width !== renderWidth) rippleCanvas.width = renderWidth;
    if (rippleCanvas.height !== renderHeight) rippleCanvas.height = renderHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    rippleCanvas.style.width = `${width}px`;
    rippleCanvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const baseCell = Math.min((width - 24) / GRID_W, (height - 18) / GRID_H);
    metricsRef.current = { baseCell, width, height };
    const cell = baseCell * zoom;
    const ox = (width - GRID_W * cell) / 2 + pan.x;
    const oy = (height - GRID_H * cell) / 2 + pan.y;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getMapCache(), ox, oy, GRID_W * cell, GRID_H * cell);
    for (const id of selected) {
      const pixel = PIXELS[id - 1];
      if (!pixel) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(ox + pixel.x * cell, oy + pixel.y * cell, Math.max(1.2, cell - .08), Math.max(1.2, cell - .08));
    }
    if (hovered) {
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(255,255,255,.95)";
      ctx.shadowBlur = 9;
      ctx.fillRect(ox + hovered.x * cell - .7, oy + hovered.y * cell - .7, cell + 1.2, cell + 1.2);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#08294e";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + hovered.x * cell - .7, oy + hovered.y * cell - .7, cell + 1.2, cell + 1.2);
    }
    canvas.dataset.cell = String(cell);
    canvas.dataset.ox = String(ox);
    canvas.dataset.oy = String(oy);
    rippleCanvas.dataset.cell = String(cell);
    rippleCanvas.dataset.ox = String(ox);
    rippleCanvas.dataset.oy = String(oy);
    rippleCanvas.dataset.ratio = String(ratio);
    rippleCanvas.dataset.width = String(width);
    rippleCanvas.dataset.height = String(height);
  }, [colour, getMapCache, hovered, pan, selected, zoom]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [render]);

  useEffect(() => {
    let frame = 0;
    let previous = Number.NEGATIVE_INFINITY;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const drawRipples = (time: number) => {
      if (!reducedMotion) frame = requestAnimationFrame(drawRipples);
      if (time - previous < 55) return;
      previous = time;
      if (cameraAnimationRef.current || panDrag.current || paintingRef.current) return;
      const canvas = rippleCanvasRef.current;
      if (!canvas) return;
      const width = Number(canvas.dataset.width);
      const height = Number(canvas.dataset.height);
      const ratio = Number(canvas.dataset.ratio);
      const cell = Number(canvas.dataset.cell);
      const ox = Number(canvas.dataset.ox);
      const oy = Number(canvas.dataset.oy);
      if (!width || !height || !cell) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#bcecff";
      for (const ripple of RIPPLE_CELLS) {
        const wave = (Math.sin(time / 520 - ripple.band * .92) + 1) / 2;
        ctx.globalAlpha = .035 + wave * .2 * (1 - ripple.band / 7);
        const size = Math.max(1, cell * (.34 + wave * .3));
        ctx.fillRect(
          ox + (ripple.x + .5) * cell - size / 2,
          oy + (ripple.y + .5) * cell - size / 2,
          size,
          size,
        );
      }
      ctx.globalAlpha = 1;
    };
    if (reducedMotion) drawRipples(0);
    else frame = requestAnimationFrame(drawRipples);
    return () => cancelAnimationFrame(frame);
  }, []);

  const pointToPixel = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cell = Number(canvas.dataset.cell);
    const x = Math.floor((clientX - rect.left - Number(canvas.dataset.ox)) / cell);
    const y = Math.floor((clientY - rect.top - Number(canvas.dataset.oy)) / cell);
    return PIXEL_LOOKUP.get(`${x}:${y}`) || null;
  };

  const handleMove = (event: React.PointerEvent) => {
    pendingPointerRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    if (pointerMoveFrameRef.current) return;
    pointerMoveFrameRef.current = requestAnimationFrame(() => {
      pointerMoveFrameRef.current = 0;
      const pointer = pendingPointerRef.current;
      if (!pointer) return;
      if (panDrag.current?.pointerId === pointer.pointerId) {
        const drag = panDrag.current;
        const nextPan = clampPan({ x: drag.originX + pointer.clientX - drag.x, y: drag.originY + pointer.clientY - drag.y });
        panRef.current = nextPan;
        setPan(nextPan);
        return;
      }
      const pixel = pointToPixel(pointer.clientX, pointer.clientY);
      setHovered((current) => current?.id === pixel?.id ? current : pixel);
      if (paintingRef.current && pixel && pixel.id !== lastPainted.current && !pixel.owner) {
        lastPainted.current = pixel.id;
        onToggle(pixel, true);
      }
    });
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas ref={rippleCanvasRef} className="pixel-ripples" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        className={`pixel-map ${isPanning ? "is-panning" : ""}`}
        aria-label={`Interactive UK map containing exactly ${formatNumber(TOTAL_PIXELS)} selectable squares. Use a pointer to explore and select land squares.`}
        role="img"
        onPointerMove={handleMove}
        onPointerLeave={() => { setHovered(null); paintingRef.current = false; pendingPointerRef.current = null; }}
        onPointerDown={(event) => {
          const pixel = pointToPixel(event.clientX, event.clientY);
          if (!pixel) {
            if (zoom > 1) {
              cancelAnimationFrame(cameraAnimationRef.current);
              cameraAnimationRef.current = 0;
              panDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: panRef.current.x, originY: panRef.current.y };
              setIsPanning(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            return;
          }
          if (pixel.owner) onOpenOwner(pixel);
          else {
            onToggle(pixel);
            paintingRef.current = true;
            lastPainted.current = pixel.id;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={(event) => {
          paintingRef.current = false;
          if (panDrag.current?.pointerId === event.pointerId) panDrag.current = null;
          setIsPanning(false);
        }}
        onPointerCancel={() => { paintingRef.current = false; panDrag.current = null; setIsPanning(false); }}
        onWheel={(event) => { event.preventDefault(); animateCamera(zoomRef.current + (event.deltaY < 0 ? .25 : -.25)); }}
      />
      <div className="zoom-controls" aria-label="Map zoom controls">
        <button type="button" onClick={() => animateCamera(zoomRef.current + .25)} disabled={zoom >= 5} aria-label="Zoom in">+</button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" onClick={() => animateCamera(zoomRef.current - .25)} disabled={zoom <= 1} aria-label="Zoom out">-</button>
        <button type="button" className="zoom-reset" onClick={() => animateCamera(1, true)} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>Reset</button>
      </div>
      <div className={`pixel-tooltip ${hovered ? "is-visible" : ""}`} aria-hidden="true">
        {hovered?.owner ? <><strong>{hovered.owner.name}</strong><span>Square #{hovered.id} · View profile</span></> : hovered ? <><strong>Square #{hovered.id}</strong><span>Available · £{PRICE}</span></> : null}
      </div>
      <div className="map-key" aria-label="Map key">
        <span><i className="key-dot available" /> Available</span>
        <span><i className="key-dot owned" /> Owned</span>
        <span><i className="key-dot chosen" /> Your selection</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [colour, setColour] = useState("#ffcb3d");
  const [ownerPixel, setOwnerPixel] = useState<Pixel | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const togglePixel = useCallback((pixel: Pixel, add = false) => {
    setSelected((current) => {
      const next = new Set(current);
      if (add) next.add(pixel.id);
      else if (next.has(pixel.id)) next.delete(pixel.id);
      else next.add(pixel.id);
      return next;
    });
  }, []);

  return (
    <main>
      <div className="ocean" aria-hidden="true"><div /><div /><div /></div>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="UK squared home"><span>UK</span><sup>2</sup></a>
        <button className="menu-button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen(!menuOpen)}>MENU</button>
        <nav id="site-nav" className={menuOpen ? "is-open" : ""} aria-label="Main navigation">
          <a href="#home" onClick={() => setMenuOpen(false)}>HOME</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>ABOUT</a>
          <a href="#why-buy" onClick={() => setMenuOpen(false)}>WHY BUY</a>
        </nav>
        <button className="header-cta" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Claim squares</button>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span /> The digital land grab</p>
          <h1>CLAIM YOUR PLACE<br />ON THE <em>MAP.</em></h1>
          <p className="intro">10,000 squares. One iconic island. Own a permanent piece of the UK² map and make your mark.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Choose your squares</button>
            <a href="#about">How it works</a>
          </div>
          <div className="live-stats">
            <div><strong>{formatNumber(AVAILABLE_PIXELS)}</strong><span>Squares available</span></div>
            <div><strong>£{PRICE}</strong><span>Per square</span></div>
            <div><strong>Forever</strong><span>On the map</span></div>
          </div>
        </div>

        <div className="map-stage">
          <div className="map-status"><span className="pulse" /> LIVE MAP <b>{formatNumber(TOTAL_PIXELS)} squares</b></div>
          <div className={`map-selection-total ${selected.size ? "is-visible" : ""}`} aria-live="polite">
            <span>{selected.size} selected</span><strong>£{selected.size * PRICE}</strong>
          </div>
          <PixelMap selected={selected} colour={colour} onToggle={togglePixel} onOpenOwner={setOwnerPixel} />
          <p className="map-instruction">Hover to explore · Scroll or use controls to zoom · Drag the ocean to move</p>
        </div>
      </section>

      <section className="ticker" aria-label="How UK squared works">
        <div>CHOOSE YOUR SQUARES <span>|</span> PICK YOUR COLOUR <span>|</span> ADD YOUR LINK <span>|</span> STAY ON THE MAP <span>|</span> CHOOSE YOUR SQUARES <span>|</span></div>
      </section>

      <section className="content-section about-section" id="about">
        <div className="section-number">01 / ABOUT</div>
        <div className="section-copy">
          <p className="eyebrow dark"><span /> One map. 10,000 stories.</p>
          <h2>A small square<br />with <em>big potential.</em></h2>
          <p>UK² is a living, clickable portrait of Britain, owned one square at a time by the people, brands and ideas shaping it.</p>
        </div>
        <div className="steps">
          <article><b>01</b><h3>Choose</h3><p>Pick one square, a cluster, or plot out a pattern anywhere that is still available.</p></article>
          <article><b>02</b><h3>Make it yours</h3><p>Choose your colour and add a name, message, advert or link to your corner of the map.</p></article>
          <article><b>03</b><h3>Be discovered</h3><p>Every owned square is clickable, giving visitors a direct route to your advert or story. Promote something, buy a square for someone, or create a permanent place to remember someone.</p></article>
        </div>
      </section>

      <section className="why-section" id="why-buy">
        <div className="why-card">
          <p className="eyebrow"><span /> Why buy?</p>
          <h2>Part advert.<br />Part artwork.<br /><em>Part of history.</em></h2>
          <p>Get in early, build something memorable and own a visible piece of a distinctly British internet landmark.</p>
          <button className="primary light" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Find your spot</button>
        </div>
        <div className="benefit-grid">
          <article><span>01</span><h3>Be seen</h3><p>A permanent visual presence that invites curiosity and clicks.</p></article>
          <article><span>02</span><h3>Be creative</h3><p>Join squares to create initials, patterns, icons or pixel art.</p></article>
          <article><span>03</span><h3>Be early</h3><p>Prime positions are limited. Once a square is owned, it is off the market.</p></article>
          <article><span>04</span><h3>Be part of it</h3><p>Your mark becomes part of the finished collective artwork.</p></article>
        </div>
      </section>

      <footer>
        <div className="brand footer-brand"><span>UK</span><sup>2</sup></div>
        <p>Claim your place on the map.</p>
        <div><a href="#about">About</a><a href="#why-buy">Why buy</a><a href="mailto:hello@uk2.example">Contact</a></div>
        <small>© 2026 UK² · Prototype purchase experience</small>
      </footer>

      {selected.size > 0 && (
        <aside className="selection-dock" aria-live="polite">
          <div><span>{selected.size}</span><p><strong>{selected.size === 1 ? "square" : "squares"} selected</strong><small>Click or drag to add more</small></p></div>
          <div className="palette" aria-label="Choose square colour">
            {COLOURS.map(([name, value]) => <button key={value} className={colour === value ? "active" : ""} style={{ background: value }} aria-label={`Choose ${name}`} title={name} onClick={() => setColour(value)} />)}
            <label className="custom-colour" title="Choose a custom colour">
              <span>Custom colour</span>
              <input type="color" value={colour} onChange={(event) => setColour(event.target.value)} aria-label="Choose a custom colour" />
            </label>
          </div>
          <div className="dock-total"><span>Total</span><strong>£{selected.size * PRICE}</strong></div>
          <button className="dock-clear" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="dock-buy" onClick={() => setPurchaseOpen(true)}>Checkout</button>
        </aside>
      )}

      {ownerPixel?.owner && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOwnerPixel(null); }}>
          <section className="modal owner-modal" role="dialog" aria-modal="true" aria-labelledby="owner-title">
            <button className="modal-close" onClick={() => setOwnerPixel(null)}>Close</button>
            <div className="owner-swatch" style={{ background: ownerPixel.owner.colour }}>#{ownerPixel.id}</div>
            <p className="eyebrow dark"><span /> Owned square</p>
            <h2 id="owner-title">{ownerPixel.owner.name}</h2>
            <h3>{ownerPixel.owner.title}</h3>
            <p>{ownerPixel.owner.note}</p>
            <a className="primary modal-link" href={ownerPixel.owner.link} target="_blank" rel="noreferrer">Visit their page</a>
          </section>
        </div>
      )}

      {purchaseOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPurchaseOpen(false); }}>
          <section className="modal purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
            <button className="modal-close" onClick={() => setPurchaseOpen(false)}>Close</button>
            <p className="eyebrow dark"><span /> Secure checkout</p>
            <h2 id="purchase-title">Your {selected.size === 1 ? "square" : `${selected.size} squares`}</h2>
            <p className="purchase-note">Review your selection and advert details. The final button will connect to Stripe Checkout when the secure ownership service is enabled.</p>
            <div className="purchase-selection">
              <span className="purchase-colour" style={{ background: colour }} />
              <p><strong>Selected squares</strong><small>{Array.from(selected).slice(0, 8).map((id) => `#${id}`).join(", ")}{selected.size > 8 ? ` and ${selected.size - 8} more` : ""}</small></p>
            </div>
            <label>Your name or brand<input type="text" placeholder="e.g. North Star Studio" /></label>
            <label>Email address<input type="email" placeholder="you@example.com" /></label>
            <label>Headline<input type="text" placeholder="A short line visitors will see" /></label>
            <label>Destination link<input type="url" placeholder="https://" /></label>
            <div className="purchase-summary"><span>{selected.size} × £{PRICE}</span><strong>£{selected.size * PRICE}</strong></div>
            <button className="primary purchase-button" onClick={() => alert("Secure payment will be enabled when Stripe and the permanent ownership database are connected.")}>Proceed to secure payment</button>
          </section>
        </div>
      )}
    </main>
  );
}
