// SUNSET BOULEVARD — city generation: roads, districts, buildings, props.
// The city is a clear grid: a wide boulevard east-west, avenues north-south,
// and five readable districts. Buildings are axis-aligned boxes with a
// footprint, a height and a district kind; the renderer extrudes them.

import { WORLD, DISTRICTS, ROADS_V, ROADS_H, BOULEVARD_Y, PALETTE } from './config.js';

// Deterministic PRNG so the city is identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// A building: { x, y, w, d, h, kind, roof, wall, rot } — x/y is the
// north-west corner on the ground, w east, d south, h height in metres.
export function buildCity() {
  const rng = mulberry32(20261119);
  const buildings = [];
  const trees = [];
  const lamps = [];
  const props = []; // { x, y, kind } — benches, hydrants, stalls, containers
  const parking = []; // parked cars { x, y, angle, color }

  const roadW = WORLD.road;
  const half = roadW / 2;

  // Walk the block grid. A block is the square between four roads.
  for (let bi = 0; bi < 8; bi++) {
    for (let bj = 0; bj < 8; bj++) {
      const bx = 64 + bi * 64 + half; // block west edge
      const by = 64 + bj * 64 + half; // block north edge
      const bw = 64 - roadW; // 48 m of buildable width
      const bd = 64 - roadW;
      const cx = bx + bw / 2;
      const cy = by + bd / 2;

      // Which district owns this block's centre?
      const district = districtAt(cx, cy);
      if (district === 'beach') {
        // Sand + a few beach umbrellas + lifeguard tower, no buildings.
        if (rng() < 0.8) props.push({ x: cx - 12, y: cy, kind: 'umbrella' });
        if (rng() < 0.6) props.push({ x: cx + 14, y: cy - 8, kind: 'umbrella' });
        if (rng() < 0.4) props.push({ x: cx, y: cy + 14, kind: 'tower' });
        continue;
      }
      if (district === 'park') {
        // Trees, a pond and paths.
        const n = 5 + Math.floor(rng() * 4);
        for (let i = 0; i < n; i++) {
          trees.push({ x: bx + 6 + rng() * (bw - 12), y: by + 6 + rng() * (bd - 12), r: 2.2 + rng() * 1.4, kind: 'oak' });
        }
        props.push({ x: cx, y: cy, kind: 'pond' });
        continue;
      }
      if (district === 'marina') {
        // Boats in the water strip + containers on the quay.
        if (bj >= 6) {
          props.push({ x: cx - 10, y: cy, kind: 'boat' });
          props.push({ x: cx + 12, y: cy + 6, kind: 'boat' });
        } else {
          for (let i = 0; i < 2; i++) {
            props.push({ x: bx + 8 + i * 20, y: by + 10, kind: 'container', color: pick(rng, ['#d84a3a', '#3a7ad8', '#f2b234', '#2e8f6e']) });
          }
        }
        continue;
      }
      if (district === 'downtown') {
        // 1–2 tall towers per block, with a plaza gap.
        const n = rng() < 0.55 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const w = 20 + rng() * 12;
          const d = 20 + rng() * 12;
          const x = bx + 4 + (i * (bw - w - 8)) + rng() * 4;
          const y = by + 4 + rng() * 4;
          const h = 28 + rng() * 34;
          buildings.push({ x, y, w, d, h, kind: 'downtown', roof: pick(rng, PALETTE.roofDowntown), wall: pick(rng, PALETTE.wallDowntown) });
        }
        // Plaza trees
        trees.push({ x: bx + 6, y: by + bd - 6, r: 2.4, kind: 'palm' });
        trees.push({ x: bx + bw - 6, y: by + 6, r: 2.4, kind: 'palm' });
        continue;
      }
      if (district === 'market') {
        // A row of shops with awnings facing the street.
        const n = 3;
        for (let i = 0; i < n; i++) {
          const w = 12 + rng() * 4;
          const d = 10 + rng() * 3;
          const x = bx + 3 + i * ((bw - 6) / n);
          const y = by + 6;
          buildings.push({ x, y, w, d, h: 7 + rng() * 3, kind: 'shop', roof: pick(rng, PALETTE.roofShop), wall: pick(rng, PALETTE.wallShop), awning: pick(rng, PALETTE.awning) });
        }
        props.push({ x: cx, y: by + bd - 8, kind: 'stall', color: pick(rng, PALETTE.awning) });
        props.push({ x: cx - 14, y: by + bd - 8, kind: 'stall', color: pick(rng, PALETTE.awning) });
        continue;
      }
      // Residential: 2–4 houses with yards and trees.
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = 10 + rng() * 4;
        const d = 9 + rng() * 3;
        const x = bx + 4 + (i % 2) * (bw / 2);
        const y = by + 4 + Math.floor(i / 2) * (bd / 2);
        buildings.push({ x, y, w, d, h: 6 + rng() * 3, kind: 'house', roof: pick(rng, PALETTE.roofHouse), wall: pick(rng, PALETTE.wallHouse) });
        trees.push({ x: x + w + 4, y: y + 3, r: 1.8 + rng(), kind: 'oak' });
      }
    }
  }

  // Palm trees along the boulevard median (never in the driving lanes).
  for (let x = 80; x < 560; x += 32) {
    trees.push({ x, y: BOULEVARD_Y - 3, r: 2.0, kind: 'palm' });
    trees.push({ x: x + 16, y: BOULEVARD_Y + 3, r: 2.0, kind: 'palm' });
  }
  // Street lamps on the boulevard corners.
  for (const x of ROADS_V) {
    lamps.push({ x: x - 9, y: BOULEVARD_Y - 15 });
    lamps.push({ x: x + 9, y: BOULEVARD_Y + 15 });
  }
  // Parked cars along side streets (never on the boulevard centre).
  for (let i = 0; i < 22; i++) {
    const vertical = rng() < 0.5;
    const road = pick(rng, vertical ? ROADS_V : ROADS_H);
    const along = 80 + rng() * 480;
    const side = rng() < 0.5 ? -1 : 1;
    parking.push({
      x: vertical ? road + side * 6 : along,
      y: vertical ? along : road + side * 6,
      angle: vertical ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      color: pick(rng, PALETTE.traffic),
    });
  }

  return { buildings, trees, lamps, props, parking };
}

export function districtAt(x, y) {
  for (const key of Object.keys(DISTRICTS)) {
    const r = DISTRICTS[key].rect;
    if (x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]) return key;
  }
  return 'residential';
}

// Road test: is (x, y) on a road (drivable)? Roads are the grid strips plus
// the boulevard. Sidewalks are a 3 m band around each road.
export function onRoad(x, y) {
  const half = WORLD.road / 2;
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= half) return true;
  if (Math.abs(y - BOULEVARD_Y) <= WORLD.boulevard / 2) return true;
  return false;
}

export function onSidewalk(x, y) {
  if (onRoad(x, y)) return false;
  const half = WORLD.road / 2 + 3;
  for (const rx of ROADS_V) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROADS_H) if (Math.abs(y - ry) <= half) return true;
  if (Math.abs(y - BOULEVARD_Y) <= WORLD.boulevard / 2 + 3) return true;
  return false;
}

export function inWater(x, y) {
  return x > 592; // sea east of the beach
}

// Circle-vs-building collision. Returns the building hit, or null.
export function collideBuildings(buildings, x, y, r) {
  for (const b of buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.d) return b;
  }
  return null;
}

// Push a circle out of a building AABB (axis-separated, for walking/driving).
export function resolveCollision(buildings, p, r) {
  const b = collideBuildings(buildings, p.x, p.y, r);
  if (!b) return false;
  const dxl = p.x + r - b.x;
  const dxr = b.x + b.w - (p.x - r);
  const dyt = p.y + r - b.y;
  const dyb = b.y + b.d - (p.y - r);
  const m = Math.min(dxl, dxr, dyt, dyb);
  if (m === dxl) p.x = b.x - r;
  else if (m === dxr) p.x = b.x + b.w + r;
  else if (m === dyt) p.y = b.y - r;
  else p.y = b.y + b.d + r;
  return true;
}

// Nearest road point (for spawning traffic / police).
export function nearestRoadPoint(x, y) {
  let best = null;
  let bd = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = { x: rx, y }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = { x, y: ry }; }
  }
  if (Math.abs(y - BOULEVARD_Y) < bd) best = { x, y: BOULEVARD_Y };
  return best;
}
