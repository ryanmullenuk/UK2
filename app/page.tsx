import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UK_GRID_HEIGHT, UK_GRID_WIDTH, UK_MASK_PACKED } from "./generated-uk-mask";

type Pixel = { id: number; x: number; y: number; owner?: Owner };
type Owner = { name: string; colour: string; title: string; link: string; note: string };

const GRID_W = UK_GRID_WIDTH;
const GRID_H = UK_GRID_HEIGHT;
const TOTAL_PIXELS = 10_000;
const PRICE = 2;

const OWNERS: Owner[] = [
  { name: "North Star Studio", colour: "#ffcb3d", title: "Bright ideas, made in Britain", link: "https://example.com/north-star", note: "An independent creative studio claiming a little piece of the North." },
  { name: "Green Thread", colour: "#4fe3a4", title: "Better things, thoughtfully made", link: "https://example.com/green-thread", note: "British design with a lighter footprint." },
  { name: "The Red Lion", colour: "#ff6257", title: "A proper local, online", link: "https://example.com/red-lion", note: "Good food, local stories and a warm welcome." },
  { name: "Pixel & Co.", colour: "#9e7bff", title: "Tiny square. Big idea.", link: "https://example.com/pixel", note: "Early UK² supporter and digital mischief-maker." },
];

function buildPixels(): Pixel[] {
  return UK_MASK_PACKED.split(" ").map((cell, index) => {
    const [x, y] = cell.split(".").map((value) => Number.parseInt(value, 36));
    const mockOwner = index % 311 === 0 ? OWNERS[index % OWNERS.length] : index % 487 === 0 ? OWNERS[(index + 1) % OWNERS.length] : undefined;
    return { id: index + 1, x, y, owner: mockOwner };
  });
}

const PIXELS = buildPixels();
if (PIXELS.length !== TOTAL_PIXELS) throw new Error(`UK² map must contain exactly ${TOTAL_PIXELS} squares; generated ${PIXELS.length}.`);
const PIXEL_LOOKUP = new Map(PIXELS.map((p) => [`${p.x}:${p.y}`, p]));

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Pixel | null>(null);
  const [painting, setPainting] = useState(false);
  const lastPainted = useRef<number | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, rect.width);
    const height = Math.max(420, rect.height);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.min((width - 24) / GRID_W, (height - 18) / GRID_H);
    const ox = (width - GRID_W * cell) / 2;
    const oy = (height - GRID_H * cell) / 2;

    ctx.shadowColor = "rgba(4, 19, 42, .28)";
    ctx.shadowBlur = Math.max(5, cell * 2.5);
    for (const pixel of PIXELS) {
      ctx.fillStyle = pixel.owner?.colour || "#e8f2ef";
      ctx.fillRect(ox + pixel.x * cell, oy + pixel.y * cell, Math.max(1, cell - .18), Math.max(1, cell - .18));
    }
    ctx.shadowBlur = 0;
    for (const pixel of PIXELS) {
      if (!selected.has(pixel.id)) continue;
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
  }, [colour, hovered, selected]);

  useEffect(() => {
    render();
    const observer = new ResizeObserver(render);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [render]);

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
    const pixel = pointToPixel(event.clientX, event.clientY);
    setHovered(pixel);
    if (painting && pixel && pixel.id !== lastPainted.current && !pixel.owner) {
      lastPainted.current = pixel.id;
      onToggle(pixel, true);
    }
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="pixel-map"
        aria-label={`Interactive UK map containing exactly ${formatNumber(TOTAL_PIXELS)} selectable squares. Use a pointer to explore and select land squares.`}
        role="img"
        onPointerMove={handleMove}
        onPointerLeave={() => { setHovered(null); setPainting(false); }}
        onPointerDown={(event) => {
          const pixel = pointToPixel(event.clientX, event.clientY);
          if (!pixel) return;
          if (pixel.owner) onOpenOwner(pixel);
          else {
            onToggle(pixel);
            setPainting(true);
            lastPainted.current = pixel.id;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={() => setPainting(false)}
      />
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
  const colours = ["#ffcb3d", "#ff6257", "#4fe3a4", "#9e7bff", "#ff8ec7", "#22c8eb", "#f4f7f3", "#102d52"];

  const togglePixel = useCallback((pixel: Pixel, add = false) => {
    setSelected((current) => {
      const next = new Set(current);
      if (add) next.add(pixel.id);
      else if (next.has(pixel.id)) next.delete(pixel.id);
      else next.add(pixel.id);
      return next;
    });
  }, []);

  const ownedCount = useMemo(() => PIXELS.filter((pixel) => pixel.owner).length, []);

  return (
    <main>
      <div className="ocean" aria-hidden="true"><div /><div /><div /></div>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="UK squared home"><span>UK</span><sup>2</sup></a>
        <button className="menu-button" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen(!menuOpen)}>Menu</button>
        <nav id="site-nav" className={menuOpen ? "is-open" : ""} aria-label="Main navigation">
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="#why-buy" onClick={() => setMenuOpen(false)}>Why buy</a>
        </nav>
        <button className="header-cta" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Claim squares</button>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow"><span /> The digital land grab</p>
          <h1>Claim your place<br />on the <em>map.</em></h1>
          <p className="intro">10,000 squares. One iconic island. Own a permanent piece of the UK² map and make your mark.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Choose your squares <span>↗</span></button>
            <a href="#about">How it works <span>↓</span></a>
          </div>
          <div className="live-stats">
            <div><strong>{formatNumber(TOTAL_PIXELS - ownedCount)}</strong><span>Squares available</span></div>
            <div><strong>£{PRICE}</strong><span>Per square</span></div>
            <div><strong>Forever</strong><span>On the map</span></div>
          </div>
        </div>

        <div className="map-stage">
          <div className="map-status"><span className="pulse" /> LIVE MAP <b>{formatNumber(TOTAL_PIXELS)} squares</b></div>
          <PixelMap selected={selected} colour={colour} onToggle={togglePixel} onOpenOwner={setOwnerPixel} />
          <p className="map-instruction"><span>✦</span> Hover to explore · Click or drag to select</p>
        </div>
      </section>

      <section className="ticker" aria-label="How UK squared works">
        <div>CHOOSE YOUR SQUARES <span>✦</span> PICK YOUR COLOUR <span>✦</span> ADD YOUR LINK <span>✦</span> STAY ON THE MAP <span>✦</span> CHOOSE YOUR SQUARES <span>✦</span></div>
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
          <article><b>03</b><h3>Be discovered</h3><p>Every owned square is clickable, giving visitors a direct route to your story.</p></article>
        </div>
      </section>

      <section className="why-section" id="why-buy">
        <div className="why-card">
          <p className="eyebrow"><span /> Why buy?</p>
          <h2>Part advert.<br />Part artwork.<br /><em>Part of history.</em></h2>
          <p>Get in early, build something memorable and own a visible piece of a distinctly British internet landmark.</p>
          <button className="primary light" onClick={() => document.querySelector(".pixel-map")?.scrollIntoView({ behavior: "smooth", block: "center" })}>Find your spot <span>↗</span></button>
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
            {colours.map((item) => <button key={item} className={colour === item ? "active" : ""} style={{ background: item }} aria-label={`Choose ${item}`} onClick={() => setColour(item)} />)}
          </div>
          <div className="dock-total"><span>Total</span><strong>£{selected.size * PRICE}</strong></div>
          <button className="dock-clear" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="dock-buy" onClick={() => setPurchaseOpen(true)}>Continue <span>↗</span></button>
        </aside>
      )}

      {ownerPixel?.owner && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOwnerPixel(null); }}>
          <section className="modal owner-modal" role="dialog" aria-modal="true" aria-labelledby="owner-title">
            <button className="modal-close" onClick={() => setOwnerPixel(null)} aria-label="Close">×</button>
            <div className="owner-swatch" style={{ background: ownerPixel.owner.colour }}>#{ownerPixel.id}</div>
            <p className="eyebrow dark"><span /> Owned square</p>
            <h2 id="owner-title">{ownerPixel.owner.name}</h2>
            <h3>{ownerPixel.owner.title}</h3>
            <p>{ownerPixel.owner.note}</p>
            <a className="primary modal-link" href={ownerPixel.owner.link} target="_blank" rel="noreferrer">Visit their page <span>↗</span></a>
          </section>
        </div>
      )}

      {purchaseOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPurchaseOpen(false); }}>
          <section className="modal purchase-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
            <button className="modal-close" onClick={() => setPurchaseOpen(false)} aria-label="Close">×</button>
            <p className="eyebrow dark"><span /> Reserve your place</p>
            <h2 id="purchase-title">Your {selected.size === 1 ? "square" : `${selected.size} squares`}</h2>
            <p className="purchase-note">This is a working preview. Payments and permanent ownership will be connected before launch.</p>
            <label>Your name or brand<input type="text" placeholder="e.g. North Star Studio" /></label>
            <label>Headline<input type="text" placeholder="A short line visitors will see" /></label>
            <label>Destination link<input type="url" placeholder="https://" /></label>
            <div className="purchase-summary"><span>{selected.size} × £{PRICE}</span><strong>£{selected.size * PRICE}</strong></div>
            <button className="primary purchase-button" onClick={() => { setPurchaseOpen(false); setSelected(new Set()); alert("Thanks — your mock reservation has been recorded on this device."); }}>Mock checkout <span>↗</span></button>
          </section>
        </div>
      )}
    </main>
  );
}
