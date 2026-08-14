import { writeFile } from "node:fs/promises";

const SOURCE = "https://raw.githubusercontent.com/ONSvisual/uk-topojson/master/output/topo.json";
const TARGET = 10_000;
const GRID_W = 196;

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Unable to download ONS UK boundary data (${response.status}).`);
const topology = await response.json();
const geometry = topology.objects.uk.geometries[0];

function decodeArc(arcIndex) {
  const reverse = arcIndex < 0;
  const arc = topology.arcs[reverse ? ~arcIndex : arcIndex];
  let x = 0;
  let y = 0;
  const points = arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [
      x * topology.transform.scale[0] + topology.transform.translate[0],
      y * topology.transform.scale[1] + topology.transform.translate[1],
    ];
  });
  return reverse ? points.reverse() : points;
}

function decodeRing(arcIndexes) {
  const ring = [];
  for (const arcIndex of arcIndexes) {
    const arc = decodeArc(arcIndex);
    ring.push(...(ring.length ? arc.slice(1) : arc));
  }
  return ring;
}

const polygons = geometry.arcs.map((polygon) => polygon.map(decodeRing));
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const project = ([lon, lat]) => [lon * Math.PI / 180, -mercatorY(lat)];
function simplifyRing(ring, tolerance = .00045) {
  if (ring.length < 6) return ring;
  const simplified = [ring[0]];
  let [lastX, lastY] = ring[0];
  for (let index = 1; index < ring.length - 1; index++) {
    const [x, y] = ring[index];
    if ((x - lastX) ** 2 + (y - lastY) ** 2 >= tolerance ** 2) {
      simplified.push(ring[index]);
      lastX = x;
      lastY = y;
    }
  }
  simplified.push(ring.at(-1));
  return simplified;
}
const projected = polygons.map((polygon) => polygon.map((ring) => simplifyRing(ring.map(project))));
const allPoints = projected.flat(2);
const minX = Math.min(...allPoints.map(([x]) => x));
const maxX = Math.max(...allPoints.map(([x]) => x));
const minY = Math.min(...allPoints.map(([, y]) => y));
const maxY = Math.max(...allPoints.map(([, y]) => y));
const aspect = (maxY - minY) / (maxX - minX);
const GRID_H = Math.round(GRID_W * aspect);
console.log({ GRID_W, GRID_H, aspect, polygons: polygons.length, bounds: [minX, minY, maxX, maxY] });

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi) inside = !inside;
  }
  return inside;
}

function rasterise(scale) {
  const cells = new Set();
  for (const polygon of projected) {
    const points = polygon.flat();
    const polygonMinX = Math.min(...points.map(([x]) => x));
    const polygonMaxX = Math.max(...points.map(([x]) => x));
    const polygonMinY = Math.min(...points.map(([, y]) => y));
    const polygonMaxY = Math.max(...points.map(([, y]) => y));
    const screenX = (value) => (((value - minX) / (maxX - minX) - .5) * scale + .5) * GRID_W;
    const screenY = (value) => (((value - minY) / (maxY - minY) - .5) * scale + .5) * GRID_H;
    const startX = Math.max(0, Math.floor(screenX(polygonMinX)) - 1);
    const endX = Math.min(GRID_W - 1, Math.ceil(screenX(polygonMaxX)) + 1);
    const startY = Math.max(0, Math.floor(screenY(polygonMinY)) - 1);
    const endY = Math.min(GRID_H - 1, Math.ceil(screenY(polygonMaxY)) + 1);
    for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
      const nx = ((x + .5) / GRID_W - .5) / scale + .5;
      const ny = ((y + .5) / GRID_H - .5) / scale + .5;
      const px = minX + nx * (maxX - minX);
      const py = minY + ny * (maxY - minY);
      if (pointInRing(px, py, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(px, py, hole))) cells.add(`${x}:${y}`);
    }
  }
  return [...cells].map((cell) => {
    const [x, y] = cell.split(":").map(Number);
    return { x, y };
  });
}

let best = { cells: [], delta: Infinity, scale: 1 };
let low = .60;
let high = .90;
for (let step = 0; step < 11; step++) {
  const scale = (low + high) / 2;
  const cells = rasterise(scale);
  const delta = Math.abs(cells.length - TARGET);
  if (delta < best.delta) best = { cells, delta, scale };
  if (!delta) break;
  if (cells.length < TARGET) low = scale;
  else high = scale;
}

const occupied = new Set(best.cells.map(({ x, y }) => `${x}:${y}`));
const neighbourCount = (x, y) => {
  let count = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && occupied.has(`${x + ox}:${y + oy}`)) count++;
  return count;
};

if (best.cells.length > TARGET) {
  best.cells.sort((a, b) => neighbourCount(b.x, b.y) - neighbourCount(a.x, a.y) || a.y - b.y || a.x - b.x);
  best.cells = best.cells.slice(0, TARGET);
} else if (best.cells.length < TARGET) {
  const fringe = [];
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    if (!occupied.has(`${x}:${y}`) && neighbourCount(x, y)) fringe.push({ x, y });
  }
  fringe.sort((a, b) => neighbourCount(b.x, b.y) - neighbourCount(a.x, a.y) || a.y - b.y || a.x - b.x);
  best.cells.push(...fringe.slice(0, TARGET - best.cells.length));
}

best.cells.sort((a, b) => a.y - b.y || a.x - b.x);
console.log({ closestRasterCount: occupied.size, adjustedCount: best.cells.length, scale: best.scale });
if (best.cells.length !== TARGET) throw new Error(`Expected ${TARGET} cells, generated ${best.cells.length}.`);
const packed = best.cells.map(({ x, y }) => `${x.toString(36)}.${y.toString(36)}`).join(" ");
const output = `// Generated from ONS UK TopoJSON. Do not edit by hand.\n// Source: ${SOURCE}\nexport const UK_GRID_WIDTH = ${GRID_W};\nexport const UK_GRID_HEIGHT = ${GRID_H};\nexport const UK_MASK_PACKED = ${JSON.stringify(packed)};\n`;
await writeFile(new URL("../app/generated-uk-mask.ts", import.meta.url), output);
console.log(`Generated ${TARGET} cells on ${GRID_W} × ${GRID_H} grid at scale ${best.scale.toFixed(4)}.`);
