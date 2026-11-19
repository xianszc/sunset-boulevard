// SUNSET BOULEVARD — renderer. Canvas 2D, oblique top-down 2.5D.
// Projection: screen x follows world x, screen y is squashed by the tilt,
// and height extrudes up-and-east (oblique), so roofs, south faces and east
// faces are all visible. Afternoon sun in the west throws long shadows east;
// the shadow length grows with the wanted level (Golden Hour Heat).

import { WORLD, SUN, PALETTE, DISTRICTS, ROADS_V, ROADS_H, BOULEVARD_Y } from './config.js';

const TILT = WORLD.tilt;
const OBLIQUE = 0.35; // eastward shift per unit of height

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.bgCanvas = null; // pre-rendered sky gradient (see resize)
    this.fgCanvas = null; // pre-rendered vignette + sun glow (see resize)
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = w;
    this.H = h;
    this.buildBackdrop(w, h);
  }

  // The sky gradient, the vignette and the sun glow are static full-screen
  // gradient fills. In software rendering (SwiftShader) a gradient fill
  // over the whole frame is one of the most expensive things a frame does,
  // and this game did three of them per frame. Pre-render them once per
  // resize into offscreen canvases; each frame then just blits them.
  buildBackdrop(w, h) {
    const bg = document.createElement('canvas');
    bg.width = Math.max(2, Math.round(w));
    bg.height = Math.max(2, Math.round(h));
    const b = bg.getContext('2d');
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, SUN.skyTop);
    g.addColorStop(0.55, SUN.skyMid);
    g.addColorStop(1, SUN.skyLow);
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    this.bgCanvas = bg;

    const fg = document.createElement('canvas');
    fg.width = Math.max(2, Math.round(w));
    fg.height = Math.max(2, Math.round(h));
    const f = fg.getContext('2d');
    const v = f.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(255,180,90,0)');
    v.addColorStop(1, 'rgba(255,140,40,0.22)');
    f.fillStyle = v;
    f.fillRect(0, 0, w, h);
    const sg = f.createRadialGradient(w * 0.10, h * 0.10, 4, w * 0.10, h * 0.10, 190);
    sg.addColorStop(0, 'rgba(255, 236, 180, 0.95)');
    sg.addColorStop(0.18, 'rgba(255, 200, 110, 0.55)');
    sg.addColorStop(0.5, 'rgba(255, 160, 70, 0.16)');
    sg.addColorStop(1, 'rgba(255, 160, 70, 0)');
    f.fillStyle = sg;
    f.fillRect(0, 0, w * 0.45, h * 0.55);
    this.fgCanvas = fg;
  }

  // World -> screen. cam is { x, y }, s is px per metre.
  project(wx, wy, wz, cam, s) {
    return {
      x: (wx - cam.x) * s + this.W / 2 + wz * s * OBLIQUE,
      y: (wy - cam.y) * s * TILT + this.H / 2 - wz * s,
    };
  }

  shadowLen(wanted) {
    const t = wanted / 5;
    return SUN.baseShadow + (SUN.heatShadow - SUN.baseShadow) * t;
  }

  render(game, dt) {
    const ctx = this.ctx;
    const { W, H } = this;
    const cam = game.camera;
    const s = game.zoom;
    const wanted = game.wanted;
    const shLen = this.shadowLen(wanted);

    // --- sky / background: warm afternoon gradient (visible at the edges) --
    // Pre-rendered blit (see buildBackdrop) instead of a gradient fill.
    if (this.bgCanvas) ctx.drawImage(this.bgCanvas, 0, 0, W, H);
    // Heat tint: the higher the wanted level, the warmer the frame.
    const warm = Math.min(1, 0.25 + wanted * 0.12);
    if (warm > 0.3) {
      ctx.fillStyle = `rgba(255, 90, 20, ${(warm - 0.3) * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }

    const view = this.viewBounds(cam, s);
    const city = game.city;

    // --- ground: grass base -------------------------------------------------
    ctx.fillStyle = PALETTE.grass;
    this.fillWorldRect(ctx, 0, 0, WORLD.size, WORLD.size, cam, s);
    // Beach sand (east strip) and sea.
    ctx.fillStyle = PALETTE.sand;
    this.fillWorldRect(ctx, 560, 0, 32, WORLD.size, cam, s);
    ctx.fillStyle = PALETTE.water;
    this.fillWorldRect(ctx, 592, 0, 48, WORLD.size, cam, s);
    // Water shimmer lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let y = 20; y < WORLD.size; y += 46) {
      const a = this.project(596, y, 0, cam, s);
      const b = this.project(638, y + 8, 0, cam, s);
      if (this.onScreen(a, b)) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    // Park grass (darker) and marina quay.
    ctx.fillStyle = PALETTE.grassDark;
    this.fillWorldRect(ctx, DISTRICTS.park.rect[0], DISTRICTS.park.rect[1], DISTRICTS.park.rect[2], DISTRICTS.park.rect[3], cam, s);

    // --- roads ---------------------------------------------------------------
    ctx.fillStyle = PALETTE.asphalt;
    for (const rx of ROADS_V) this.fillWorldRect(ctx, rx - WORLD.road / 2, 0, WORLD.road, WORLD.size, cam, s);
    for (const ry of ROADS_H) this.fillWorldRect(ctx, 0, ry - WORLD.road / 2, WORLD.size, WORLD.road, cam, s);
    this.fillWorldRect(ctx, 0, BOULEVARD_Y - WORLD.boulevard / 2, WORLD.size, WORLD.boulevard, cam, s);
    // Boulevard median (grass + palms are drawn as props).
    ctx.fillStyle = PALETTE.median;
    this.fillWorldRect(ctx, 0, BOULEVARD_Y - 2, WORLD.size, 4, cam, s);
    // Centre dashes.
    ctx.strokeStyle = PALETTE.asphaltLine;
    ctx.lineWidth = Math.max(1, 0.35 * s);
    ctx.setLineDash([3 * s * 0.28, 3 * s * 0.28]);
    for (const rx of ROADS_V) {
      const a = this.project(rx, 0, 0, cam, s);
      const b = this.project(rx, WORLD.size, 0, cam, s);
      if (this.onScreen(a, b)) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    for (const ry of ROADS_H) {
      const a = this.project(0, ry, 0, cam, s);
      const b = this.project(WORLD.size, ry, 0, cam, s);
      if (this.onScreen(a, b)) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    }
    ctx.setLineDash([]);
    // Sidewalks: light bands along every road.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_V) {
      this.fillWorldRect(ctx, rx - WORLD.road / 2 - 3, 0, 3, WORLD.size, cam, s);
      this.fillWorldRect(ctx, rx + WORLD.road / 2, 0, 3, WORLD.size, cam, s);
    }
    for (const ry of ROADS_H) {
      this.fillWorldRect(ctx, 0, ry - WORLD.road / 2 - 3, WORLD.size, 3, cam, s);
      this.fillWorldRect(ctx, 0, ry + WORLD.road / 2, WORLD.size, 3, cam, s);
    }

    // --- ground props: pond, stalls, containers, boats, umbrellas -----------
    for (const p of city.props) this.drawProp(ctx, p, cam, s, shLen);

    // --- buildings (north to south so near ones overlap far ones) -----------
    const blds = city.buildings.filter((b) => this.inView(b.x, b.y, b.w, b.d, view)).sort((a, b) => a.y - b.y);
    for (const b of blds) this.drawBuilding(ctx, b, cam, s, shLen);

    // --- trees and lamps ------------------------------------------------------
    const trees = city.trees.filter((t) => this.inView(t.x, t.y, 4, 4, view)).sort((a, b) => a.y - b.y);
    for (const t of trees) this.drawTree(ctx, t, cam, s, shLen);
    for (const l of city.lamps) this.drawLamp(ctx, l, cam, s);

    // --- cars ------------------------------------------------------------------
    const cars = [...game.traffic, ...game.police, game.heroCar, ...(game.playerCar ? [game.playerCar] : [])]
      .filter((c) => c && this.inView(c.x, c.y, 6, 6, view))
      .sort((a, b) => a.y - b.y);
    const seenCars = new Set();
    for (const c of cars) {
      if (seenCars.has(c.id)) continue;
      seenCars.add(c.id);
      this.drawCar(ctx, c, cam, s, shLen, game.time);
    }
    // Parked cars.
    for (const p of city.parking) {
      if (!this.inView(p.x, p.y, 6, 6, view)) continue;
      this.drawCar(ctx, { x: p.x, y: p.y, angle: p.angle, color: p.color, parked: true, id: -1 }, cam, s, shLen, game.time);
    }

    // --- people ------------------------------------------------------------------
    const peds = [...game.peds, game.player, game.mara].filter((p) => p && !p.down && this.inView(p.x, p.y, 3, 3, view)).sort((a, b) => a.y - b.y);
    for (const p of peds) this.drawPerson(ctx, p, cam, s, shLen, game);

    // --- helicopter ----------------------------------------------------------------
    if (game.heli) this.drawHeli(ctx, game.heli, cam, s, game.time);

    // --- objective marker -----------------------------------------------------------
    this.drawObjective(ctx, game, cam, s);

    // --- minimap ----------------------------------------------------------------------
    this.drawMinimap(ctx, game);

    // --- vignette + sun glow (pre-rendered blit, see buildBackdrop) --------------
    if (this.fgCanvas) ctx.drawImage(this.fgCanvas, 0, 0, W, H);
  }

  viewBounds(cam, s) {
    const hw = (this.W / 2 / s) + 30;
    const hh = (this.H / 2 / (s * TILT)) + 30;
    return { x0: cam.x - hw, x1: cam.x + hw, y0: cam.y - hh, y1: cam.y + hh };
  }

  inView(x, y, w, d, view) {
    return x + w > view.x0 && x < view.x1 && y + d > view.y0 && y < view.y1;
  }

  onScreen(a, b) {
    const { W, H } = this;
    return (a.x > -50 && a.x < W + 50 && a.y > -50 && a.y < H + 50) || (b.x > -50 && b.x < W + 50 && b.y > -50 && b.y < H + 50);
  }

  fillWorldRect(ctx, x, y, w, d, cam, s) {
    const a = this.project(x, y, 0, cam, s);
    const b = this.project(x + w, y + d, 0, cam, s);
    ctx.fillRect(a.x, a.y, (b.x - a.x), (b.y - a.y) / 1); // note: y already squashed by projection
  }

  // --- buildings ----------------------------------------------------------------
  drawBuilding(ctx, b, cam, s, shLen) {
    const p00 = this.project(b.x, b.y, 0, cam, s);
    const p10 = this.project(b.x + b.w, b.y, 0, cam, s);
    const p11 = this.project(b.x + b.w, b.y + b.d, 0, cam, s);
    const p01 = this.project(b.x, b.y + b.d, 0, cam, s);
    const h = b.h * s;
    const shx = b.h * shLen * s;
    const shy = b.h * shLen * s * 0.22;
    // Long afternoon shadow to the east.
    ctx.fillStyle = 'rgba(20, 16, 10, 0.30)';
    ctx.beginPath();
    ctx.moveTo(p01.x, p01.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p11.x + shx, p11.y + shy);
    ctx.lineTo(p01.x + shx, p01.y + shy);
    ctx.closePath();
    ctx.fill();
    // South face (warm, sunlit).
    ctx.fillStyle = this.shade(b.wall, 1.12);
    ctx.beginPath();
    ctx.moveTo(p01.x, p01.y);
    ctx.lineTo(p11.x, p11.y);
    ctx.lineTo(p11.x + h * OBLIQUE, p11.y - h);
    ctx.lineTo(p01.x + h * OBLIQUE, p01.y - h);
    ctx.closePath();
    ctx.fill();
    // East face (shaded).
    ctx.fillStyle = this.shade(b.wall, 0.72);
    ctx.beginPath();
    ctx.moveTo(p11.x, p11.y);
    ctx.lineTo(p10.x, p10.y);
    ctx.lineTo(p10.x + h * OBLIQUE, p10.y - h);
    ctx.lineTo(p11.x + h * OBLIQUE, p11.y - h);
    ctx.closePath();
    ctx.fill();
    // Roof.
    ctx.fillStyle = b.roof;
    ctx.beginPath();
    ctx.moveTo(p00.x + h * OBLIQUE, p00.y - h);
    ctx.lineTo(p10.x + h * OBLIQUE, p10.y - h);
    ctx.lineTo(p11.x + h * OBLIQUE, p11.y - h);
    ctx.lineTo(p01.x + h * OBLIQUE, p01.y - h);
    ctx.closePath();
    ctx.fill();
    // Roof parapet + a rooftop box for tall towers.
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (b.h > 24) {
      const rx = p00.x + h * OBLIQUE + (p10.x - p00.x) * 0.3;
      const ry = p00.y - h + (p11.y - p00.y) * 0.25;
      ctx.fillStyle = this.shade(b.roof, 0.8);
      ctx.fillRect(rx, ry - 6, (p10.x - p00.x) * 0.28, 6);
    }
    // Windows on the south face (warm lit glass in the afternoon).
    const cols = Math.max(2, Math.floor(b.w / 5));
    const rows = Math.max(1, Math.floor(b.h / 7));
    ctx.fillStyle = 'rgba(255, 214, 130, 0.9)';
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const fx = p01.x + ((i + 0.5) / cols) * (p11.x - p01.x) + h * OBLIQUE * ((j + 0.5) / rows);
        const fy = p01.y - ((j + 0.5) / rows) * h;
        ctx.fillRect(fx - 2, fy - 2.5, 4, 5);
      }
    }
    // Shop awning.
    if (b.awning) {
      ctx.fillStyle = b.awning;
      const ax = p01.x, ay = p01.y;
      ctx.fillRect(ax, ay - 3, p11.x - p01.x, 5);
    }
  }

  shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
    const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
    const b = Math.min(255, Math.round((n & 255) * f));
    return `rgb(${r},${g},${b})`;
  }

  // --- trees, lamps, props ------------------------------------------------------
  drawTree(ctx, t, cam, s, shLen) {
    const p = this.project(t.x, t.y, 0, cam, s);
    const r = t.r * s;
    const shx = r * 0.9 * shLen;
    ctx.fillStyle = 'rgba(20, 16, 10, 0.28)';
    ctx.beginPath();
    ctx.ellipse(p.x + shx * 0.5, p.y + 1, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    if (t.kind === 'palm') {
      // Trunk + a radial frond crown: reads as a palm from above.
      ctx.strokeStyle = '#7a5a34';
      ctx.lineWidth = Math.max(1.5, 0.35 * s);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + r * 0.25, p.y - r * 1.1);
      ctx.stroke();
      ctx.fillStyle = PALETTE.palm;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.ellipse(p.x + r * 0.25 + Math.cos(a) * r * 0.75, p.y - r * 1.1 + Math.sin(a) * r * 0.5, r * 0.85, r * 0.3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a6a2a';
      ctx.beginPath();
      ctx.arc(p.x + r * 0.25, p.y - r * 1.1, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 0.4, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(p.x - r * 0.3, p.y - r * 0.2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawLamp(ctx, l, cam, s) {
    const p = this.project(l.x, l.y, 0, cam, s);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(p.x - 1, p.y - 5, 2, 5);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 6, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawProp(ctx, p, cam, s, shLen) {
    const pt = this.project(p.x, p.y, 0, cam, s);
    if (p.kind === 'pond') {
      ctx.fillStyle = '#3a8ab8';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, 16 * s * 0.4, 10 * s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7ac8e8';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (p.kind === 'stall') {
      ctx.fillStyle = p.color || '#d84a3a';
      ctx.fillRect(pt.x - 6, pt.y - 8, 12, 8);
      ctx.fillStyle = '#f2e8d8';
      ctx.fillRect(pt.x - 6, pt.y - 2, 12, 2);
    } else if (p.kind === 'container') {
      ctx.fillStyle = p.color || '#d84a3a';
      ctx.fillRect(pt.x - 8, pt.y - 5, 16, 10);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.strokeRect(pt.x - 8, pt.y - 5, 16, 10);
    } else if (p.kind === 'boat') {
      ctx.fillStyle = '#f2f2f2';
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, 12, 5, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a7ad8';
      ctx.fillRect(pt.x - 2, pt.y - 10, 4, 8);
    } else if (p.kind === 'umbrella') {
      ctx.fillStyle = '#e84a4a';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y - 2, 6, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f2e8d8';
      ctx.fillRect(pt.x - 1, pt.y - 2, 2, 6);
    } else if (p.kind === 'tower') {
      ctx.fillStyle = '#d8c8a8';
      ctx.fillRect(pt.x - 4, pt.y - 12, 8, 12);
      ctx.fillStyle = '#d84a3a';
      ctx.fillRect(pt.x - 5, pt.y - 16, 10, 4);
    }
  }

  // --- cars -------------------------------------------------------------------
  drawCar(ctx, car, cam, s, shLen, time) {
    const p = this.project(car.x, car.y, 0, cam, s);
    const L = 4.4 * s, Wd = 1.9 * s;
    // Shadow (long, east).
    ctx.fillStyle = 'rgba(20, 16, 10, 0.32)';
    ctx.save();
    ctx.translate(p.x + L * 0.14 * shLen, p.y + 1);
    ctx.rotate(car.angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.55, Wd * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(car.angle);
    // Body.
    ctx.fillStyle = car.police ? PALETTE.policeWhite : car.color;
    this.roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 4);
    ctx.fill();
    // Police: black hood + trunk.
    if (car.police) {
      ctx.fillStyle = PALETTE.policeBlack;
      ctx.fillRect(-L / 2, -Wd / 2, L * 0.22, Wd);
      ctx.fillRect(L * 0.28, -Wd / 2, L * 0.22, Wd);
      ctx.fillStyle = '#1c4ad8';
      ctx.font = `bold ${Math.max(6, Wd * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SPD', 0, 0);
    }
    // Windshield + roof.
    ctx.fillStyle = 'rgba(20, 30, 44, 0.85)';
    ctx.fillRect(-L * 0.08, -Wd * 0.42, L * 0.16, Wd * 0.84);
    ctx.fillStyle = car.police ? '#d8dce2' : this.shade(car.color, 0.82);
    this.roundRect(ctx, -L * 0.28, -Wd * 0.38, L * 0.34, Wd * 0.76, 3);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#14161a';
    const wy = Wd / 2 - 1;
    ctx.fillRect(-L * 0.32, -wy - 2, L * 0.12, 3);
    ctx.fillRect(L * 0.20, -wy - 2, L * 0.12, 3);
    ctx.fillRect(-L * 0.32, wy - 1, L * 0.12, 3);
    ctx.fillRect(L * 0.20, wy - 1, L * 0.12, 3);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(L / 2 - 1, -Wd / 2 + 2, 1.5, 2);
    ctx.fillRect(L / 2 - 1, Wd / 2 - 4, 1.5, 2);
    // Police light bar, flashing red/blue.
    if (car.police) {
      const on = Math.floor(time * 6 + (car.sirenPhase || 0)) % 2 === 0;
      ctx.fillStyle = on ? '#ff2a2a' : '#2a5aff';
      ctx.fillRect(-L * 0.05, -Wd / 2 - 2, L * 0.1, 3);
      // Light glow on the ground.
      ctx.fillStyle = on ? 'rgba(255,42,42,0.25)' : 'rgba(42,90,255,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, Wd * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hero car: lime + a gold stripe so it reads as the player's car.
    if (car.hero) {
      ctx.fillStyle = '#ffd23a';
      ctx.fillRect(-L / 2 + 2, -1, L - 4, 2);
    }
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // --- people -----------------------------------------------------------------
  drawPerson(ctx, p, cam, s, shLen, game) {
    const pt = this.project(p.x, p.y, 0, cam, s);
    const isPlayer = p.kind === 'player';
    const isMara = p.kind === 'mara';
    const sc = isPlayer || isMara ? 1.6 : 1.05; // hero figures read bigger
    const legSwing = Math.sin(p.walkPhase || 0) * (p.moving || p.speed > 0.5 ? 2.2 : 0);
    // Shadow.
    ctx.fillStyle = 'rgba(20, 16, 10, 0.30)';
    ctx.beginPath();
    ctx.ellipse(pt.x + 3 * shLen, pt.y + 1, 4.5 * sc, 2.2 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
    // A lime ring under Rico so the player is findable at a glance.
    if (isPlayer) {
      ctx.strokeStyle = 'rgba(112, 224, 0, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y + 1, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(p.angle || 0);
    // Legs (two small rects, swinging when walking).
    ctx.fillStyle = isPlayer ? '#2b2d42' : '#3a3a44';
    ctx.fillRect(-3 * sc, -2.4 * sc + legSwing * 0.4, 2.4 * sc, 4.5 * sc);
    ctx.fillRect(0.6 * sc, -2.4 * sc - legSwing * 0.4, 2.4 * sc, 4.5 * sc);
    // Torso (shoulders read from above).
    ctx.fillStyle = isPlayer ? '#f2801a' : isMara ? '#c94a7a' : p.shirt || '#888888';
    this.roundRect(ctx, -4 * sc, -5 * sc, 8 * sc, 7 * sc, 2.5 * sc);
    ctx.fill();
    // Head.
    ctx.fillStyle = p.skin || '#e8b88a';
    ctx.beginPath();
    ctx.arc(0, -6.5 * sc, 3.4 * sc, 0, Math.PI * 2);
    ctx.fill();
    // Hair / hat.
    ctx.fillStyle = isPlayer ? '#2a1c10' : (p.hair || '#2a1c10');
    ctx.beginPath();
    ctx.arc(0, -7.4 * sc, 3.2 * sc, Math.PI, 0);
    ctx.fill();
    if (isPlayer) {
      // Orange cap brim.
      ctx.fillStyle = '#f2801a';
      ctx.fillRect(-3.4 * sc, -8.6 * sc, 6.8 * sc, 1.6 * sc);
    }
    // Pistol in hand when armed.
    if (isPlayer && game && game.player && game.player.weapon === 'pistol') {
      ctx.fillStyle = '#222';
      ctx.fillRect(3.5 * sc, -4 * sc, 4 * sc, 1.6 * sc);
    }
    // Busted ring when police are closing in.
    if (isPlayer && p.busted > 0.05) {
      ctx.strokeStyle = `rgba(255, 42, 42, ${0.4 + p.busted * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 12 + p.busted * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Mara gets a name tag.
    if (isMara) {
      ctx.fillStyle = 'rgba(10,10,14,0.75)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      const w = ctx.measureText('MARA').width + 8;
      ctx.fillRect(pt.x - w / 2, pt.y - 26, w, 13);
      ctx.fillStyle = '#ffd23a';
      ctx.fillText('MARA', pt.x, pt.y - 16);
    }
  }

  // --- helicopter ---------------------------------------------------------------
  drawHeli(ctx, h, cam, s, time) {
    const HS = 1.6; // heli reads bigger so it is unmistakable
    // Ground shadow first.
    const g = this.project(h.x, h.y, 0, cam, s);
    ctx.fillStyle = 'rgba(20, 16, 10, 0.25)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 14 * HS, 7 * HS, 0, 0, Math.PI * 2);
    ctx.fill();
    // Small, subtle spotlight pool on the ground (not a giant cone).
    // Rendered at a third of its true height so the heli stays on screen.
    const p = this.project(h.x, h.y, h.h * 0.35, cam, s);
    ctx.fillStyle = 'rgba(255, 244, 180, 0.10)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, 20, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(h.angle);
    ctx.fillStyle = '#e8e8e8';
    this.roundRect(ctx, -12 * HS, -5 * HS, 24 * HS, 10 * HS, 4);
    ctx.fill();
    ctx.fillStyle = '#2a4a6a';
    ctx.fillRect(4 * HS, -3.5 * HS, 6 * HS, 7 * HS);
    // Rotor (blurred disc).
    ctx.strokeStyle = 'rgba(30,30,34,0.5)';
    ctx.lineWidth = 2;
    const ra = time * 22;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ra) * 18 * HS, Math.sin(ra) * 18 * HS);
    ctx.lineTo(-Math.cos(ra) * 18 * HS, -Math.sin(ra) * 18 * HS);
    ctx.moveTo(Math.cos(ra + 1.57) * 18 * HS, Math.sin(ra + 1.57) * 18 * HS);
    ctx.lineTo(-Math.cos(ra + 1.57) * 18 * HS, -Math.sin(ra + 1.57) * 18 * HS);
    ctx.stroke();
    ctx.restore();
  }

  // --- objective marker ------------------------------------------------------------
  drawObjective(ctx, game, cam, s) {
    const pos = game.missions.objectivePos();
    if (!pos) return;
    const p = this.project(pos.x, pos.y, 0, cam, s);
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    // Diamond marker + a vertical beam so it reads from the tilted view.
    ctx.fillStyle = 'rgba(255, 210, 58, 0.25)';
    ctx.fillRect(p.x - 2, p.y - 90 * pulse, 4, 90 * pulse);
    ctx.save();
    ctx.translate(p.x, p.y - 26 * pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd23a';
    ctx.strokeStyle = '#7a5a00';
    ctx.lineWidth = 1.5;
    const r = 9 * pulse;
    ctx.fillRect(-r / 2, -r / 2, r, r);
    ctx.strokeRect(-r / 2, -r / 2, r, r);
    ctx.restore();
    // Off-screen arrow at the screen edge.
    if (p.x < 20 || p.x > this.W - 20 || p.y < 20 || p.y > this.H - 20) {
      const cx = Math.max(30, Math.min(this.W - 30, p.x));
      const cy = Math.max(30, Math.min(this.H - 30, p.y));
      const a = Math.atan2(p.y - this.H / 2, p.x - this.W / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // --- minimap ------------------------------------------------------------------------
  drawMinimap(ctx, game) {
    const size = 150;
    const x0 = 14, y0 = this.H - size - 14;
    const k = size / WORLD.size;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    this.roundRect(ctx, x0 - 5, y0 - 5, size + 10, size + 10, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x0, y0, size, size);
    ctx.clip();
    // Water + sand + grass.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, size, size);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0 + 560 * k, y0, 32 * k, size);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0 + 592 * k, y0, 48 * k, size);
    // Roads.
    ctx.fillStyle = '#3a3f45';
    for (const rx of ROADS_V) ctx.fillRect(x0 + (rx - 8) * k, y0, 16 * k, size);
    for (const ry of ROADS_H) ctx.fillRect(x0, y0 + (ry - 8) * k, size, 16 * k);
    ctx.fillRect(x0, y0 + (BOULEVARD_Y - 14) * k, size, 28 * k);
    // Buildings.
    ctx.fillStyle = '#8a94a4';
    for (const b of game.city.buildings) {
      ctx.fillRect(x0 + b.x * k, y0 + b.y * k, Math.max(1, b.w * k), Math.max(1, b.d * k));
    }
    // Objective.
    const op = game.missions.objectivePos();
    if (op) {
      ctx.fillStyle = '#ffd23a';
      ctx.beginPath();
      ctx.arc(x0 + op.x * k, y0 + op.y * k, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police (red dots) and player (lime arrow).
    ctx.fillStyle = '#ff3a3a';
    for (const c of game.police) {
      ctx.beginPath();
      ctx.arc(x0 + c.x * k, y0 + c.y * k, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = game.playerPos();
    ctx.save();
    ctx.translate(x0 + p.x * k, y0 + p.y * k);
    ctx.rotate(game.playerCar ? game.playerCar.angle : game.player.angle);
    ctx.fillStyle = '#70e000';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Label.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SUNSET CITY', x0, y0 - 8);
  }
}
