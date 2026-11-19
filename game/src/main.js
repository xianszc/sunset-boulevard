// SUNSET BOULEVARD — main game: loop, camera, wanted level, police, combat,
// HUD, save, and the screenshot presets. Canvas 2D, fixed-timestep loop.

import { WORLD, PALETTE, SPAWN, HERO_CAR, HERO, SAVE_KEY, ECONOMY, WANTED, WEAPONS } from './config.js';
import { buildCity, onRoad } from './world.js';
import { makePlayer, makeCar, makePed, makeHeli, updatePlayerOnFoot, updatePlayerCar, updateTrafficCar, updatePolice, updateHeli, updatePed, spawnTraffic, spawnPeds } from './entities.js';
import { MissionRunner } from './missions.js';
import { Renderer } from './render.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.city = buildCity();
    this.state = 'title'; // title | playing | paused | busted | wasted | victory
    this.time = 0;
    this.money = ECONOMY.startMoney;
    this.rep = ECONOMY.startRep;
    this.heat = 0;
    this.wanted = 0;
    this.shotsFired = 0;
    this.busted = false;
    this.camera = { x: SPAWN.x, y: SPAWN.y };
    this.zoom = WORLD.zoom;
    this.effects = []; // tracers, flashes, smoke
    this.bullets = [];
    this.player = makePlayer(SPAWN.x, SPAWN.y);
    this.mara = makePed(520, 300, { shirt: '#c94a7a' });
    this.mara.kind = 'mara';
    this.mara.skin = '#e8b88a';
    this.mara.hair = '#1a1a1a';
    this.heroCar = makeCar(HERO_CAR.x, HERO_CAR.y, 0, { hero: true, color: PALETTE.heroCar, parked: true });
    this.playerCar = null;
    this.traffic = spawnTraffic(14, this.city);
    this.peds = spawnPeds(26);
    this.police = [];
    this.heli = null;
    this.missions = new MissionRunner(this);
    this.objective = '';
    this.loadSave();
    this.bindUI();
    this.applyShotPreset();
    window.__sunset = this.debugAPI();
    this.last = performance.now();
    this._acc = 0; // fixed-timestep accumulator (see loop)
    requestAnimationFrame((t) => this.loop(t));
  }

  // --- debug / playtest API ---------------------------------------------------
  debugAPI() {
    const g = this;
    return {
      game: g,
      state: () => g.state,
      mission: () => g.missions.index + 1,
      step: () => g.missions.step + 1,
      wanted: () => g.wanted,
      money: () => g.money,
      rep: () => g.rep,
      player: () => ({ ...g.playerPos(), onFoot: g.player.onFoot, car: !!g.playerCar }),
      start: () => g.startGame(),
      teleport: (x, y, angle) => {
        g.player.x = x; g.player.y = y;
        if (angle !== undefined) g.player.angle = angle;
        if (g.playerCar) {
          g.playerCar.x = x; g.playerCar.y = y;
          if (angle !== undefined) g.playerCar.angle = angle;
        }
      },
      setWanted: (n) => { g.heat = n; g.wanted = Math.floor(n); },
      setMission: (i) => { g.missions.index = i - 1; g.missions.step = 0; g.missions.done = false; g.missions.victory = false; g.missions.start(); },
      giveCar: () => { g.enterCar(g.heroCar, true); },
      press: (k, down) => g.input.setKey(k, down),
      clickAt: (x, y) => { g.input.mouseX = x; g.input.mouseY = y; g.input.pressed.mouse = true; },
      save: () => g.save(),
    };
  }

  applyShotPreset() {
    const q = new URLSearchParams(location.search);
    const shot = q.get('shot');
    if (!shot) return;
    // Screenshot mode: skip the title screen, stage a fixed scene, and
    // freeze the wanted level so the staged scene stays stable for the shot.
    this.state = 'playing';
    this.shotMode = true;
    this.hideScreens();
    const P = this.player;
    if (shot === 'chase') {
      this.enterCar(this.heroCar, true);
      this.playerCar.x = 300; this.playerCar.y = 328; this.playerCar.angle = 0; this.playerCar.speed = 24;
      this.heat = 3; this.wanted = 3;
      this.spawnPolice(2, true);
      this.ensureHeli();
      this.missions.index = 2; this.missions.step = 0; this.missions.start();
    } else if (shot === 'boulevard') {
      this.enterCar(this.heroCar, true);
      this.playerCar.x = 180; this.playerCar.y = 328; this.playerCar.angle = 0; this.playerCar.speed = 20;
      this.heat = 1; this.wanted = 1;
      this.spawnPolice(1, true);
      this.missions.index = 2; this.missions.step = 0; this.missions.start();
    } else if (shot === 'onfoot') {
      P.x = 512; P.y = 296; P.onFoot = true;
      this.heat = 1; this.wanted = 1;
      this.spawnPolice(1, true);
      // A few pedestrians near Rico so the street reads as alive.
      for (let i = 0; i < 5; i++) {
        const ped = makePed(500 + i * 6, 288 + (i % 2) * 14);
        this.peds.push(ped);
      }
      this.missions.index = 0; this.missions.step = 0; this.missions.start();
    } else if (shot === 'heist') {
      P.x = 344; P.y = 306; P.onFoot = true;
      this.missions.index = 4; this.missions.step = 1; this.missions.grabbed = false;
      this.missions.start();
      this.heat = 3; this.wanted = 3;
      this.spawnPolice(2);
      this.ensureHeli();
    }
    this.camera.x = this.playerPos().x;
    this.camera.y = this.playerPos().y;
  }

  // --- UI -----------------------------------------------------------------------
  bindUI() {
    $('start-btn').addEventListener('click', () => { this.audio.ensure(); this.startGame(); });
    $('continue-btn').addEventListener('click', () => { this.audio.ensure(); this.startGame(); });
    $('retry-btn').addEventListener('click', () => this.retry());
    $('restart-btn').addEventListener('click', () => this.restartMission());
    $('victory-btn').addEventListener('click', () => this.freeRoam());
    $('resume-btn').addEventListener('click', () => this.resume());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      this.zoom = Math.max(4, Math.min(9, this.zoom - Math.sign(e.deltaY) * 0.5));
    }, { passive: true });
    const save = this.loadSaveData();
    if (save && save.mission > 0) $('continue-btn').style.display = '';
  }

  hideScreens() {
    for (const id of ['start-screen', 'end-screen', 'pause-screen']) {
      const el = $(id);
      if (el) el.style.display = 'none';
    }
  }

  showScreen(id) {
    this.hideScreens();
    const el = $(id);
    if (el) el.style.display = 'flex';
  }

  startGame() {
    this.audio.ensure();
    this.state = 'playing';
    this.hideScreens();
    this.missions.start();
    this.setObjective(this.missions.objectiveText());
  }

  retry() {
    // Busted: lose $500, wanted cleared, respawn at the market.
    this.money = Math.max(0, this.money - 500);
    this.heat = 0; this.wanted = 0;
    this.police = [];
    this.heli = null;
    this.player.busted = 0;
    this.player.health = 100;
    this.busted = false;
    this.exitCar(true);
    this.player.x = SPAWN.x; this.player.y = SPAWN.y;
    this.state = 'playing';
    this.hideScreens();
    this.missions.say('Busted — the SPD took $500. Mara got you out. Get back to work.', 5);
  }

  restartMission() {
    this.retry();
    this.missions.step = 0;
    this.missions.start();
  }

  freeRoam() {
    // Clear the victory flag: update() re-shows the victory screen every
    // frame while missions.victory is true and the state is 'playing', so
    // without this the player could never leave the victory screen — the
    // click would set state to 'playing' and the very next update would
    // set it straight back to 'victory'. That froze the game on the
    // victory screen and made BUSTED/retry/pistol unreachable after a win.
    this.missions.victory = false;
    this.state = 'playing';
    this.hideScreens();
    this.missions.say('Free roam — Sunset City is yours. Missions complete!', 5);
  }

  resume() {
    this.state = 'playing';
    this.hideScreens();
  }

  // --- save -----------------------------------------------------------------------
  loadSaveData() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  loadSave() {
    const s = this.loadSaveData();
    if (!s) return;
    this.money = s.money || 0;
    this.rep = s.rep || 0;
    this.missions.index = Math.min(5, s.mission || 0);
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ money: this.money, rep: this.rep, mission: this.missions.index, t: Date.now() }));
    } catch (e) { /* storage unavailable */ }
  }

  // --- wanted ----------------------------------------------------------------------
  addHeat(n) {
    this.heat = Math.min(WANTED.maxStars, this.heat + n);
    this.wanted = Math.floor(this.heat);
    this.lastHeatAdd = this.time;
  }

  playerPos() {
    if (this.playerCar) return { x: this.playerCar.x, y: this.playerCar.y };
    return { x: this.player.x, y: this.player.y };
  }

  spawnPolice(n, close = false) {
    const p = this.playerPos();
    while (this.police.length < n) {
      const a = Math.random() * Math.PI * 2;
      // Close enough to be seen (within 35 m) so the heat does not fade
      // before the chase even starts; far enough to drive in from off-screen.
      const d = close ? 26 + Math.random() * 14 : 35 + Math.random() * 15;
      const x = Math.max(16, Math.min(624, p.x + Math.cos(a) * d));
      const y = Math.max(16, Math.min(624, p.y + Math.sin(a) * d));
      const rp = { x, y };
      const onR = onRoad(rp.x, rp.y) ? rp : { x: 320, y: 320 };
      const car = makeCar(onR.x, onR.y, Math.atan2(p.y - onR.y, p.x - onR.x), { police: true });
      this.police.push(car);
    }
  }

  ensureHeli() {
    if (!this.heli && this.wanted >= 3) {
      const p = this.playerPos();
      this.heli = makeHeli(p.x + 30, p.y - 30);
    }
    if (this.heli && this.wanted < 3) this.heli = null;
  }

  // --- car enter / exit ---------------------------------------------------------------
  nearestCar(maxD = 4) {
    const p = this.player;
    let best = null, bd = maxD;
    const cars = [this.heroCar, ...this.traffic, ...this.police];
    for (const c of cars) {
      if (c.parked && c.traffic) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  enterCar(car, silent = false) {
    if (!car) return;
    const wasParked = car.parked;
    car.parked = false;
    car.traffic = false;
    this.playerCar = car;
    this.player.onFoot = false;
    this.player.x = car.x;
    this.player.y = car.y;
    if (!silent) {
      if (car.hero && wasParked) {
        this.addHeat(WANTED.stealCar);
        this.missions.onSteal();
        this.missions.say('You stole the Sunset GT! The SPD is coming — drive!', 4);
      } else if (!car.police) {
        this.addHeat(WANTED.stealCar * 0.5);
      }
      this.audio.blip(520, 0.1, 'square', 0.08);
    }
  }

  exitCar(silent = false) {
    if (!this.playerCar) return;
    const car = this.playerCar;
    this.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 3;
    this.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 3;
    this.player.angle = car.angle;
    this.playerCar = null;
    this.player.onFoot = true;
    if (!silent) this.audio.blip(420, 0.08, 'square', 0.06);
  }

  setObjective(text) {
    this.objective = text;
    const el = $('mission-objective');
    if (el) el.textContent = text;
  }

  // --- combat ---------------------------------------------------------------------------
  tryShoot() {
    const p = this.player;
    if (!p.onFoot || p.shootCd > 0) return;
    if (p.weapon === 'pistol' && p.ammo <= 0) {
      this.missions.say('Out of ammo — find the gun shop on Market Row to restock.', 3);
      return;
    }
    p.shootCd = WEAPONS.pistol.rate;
    p.ammo--;
    this.shotsFired++;
    this.addHeat(WANTED.shotFired);
    this.audio.shot();
    // Aim: from the player toward the mouse, in world space.
    const ps = this.renderer.project(p.x, p.y, 0, this.camera, this.zoom);
    const ang = Math.atan2(this.input.mouseY - ps.y, this.input.mouseX - ps.x);
    p.angle = ang;
    const range = WEAPONS.pistol.range;
    const ex = p.x + Math.cos(ang) * range;
    const ey = p.y + Math.sin(ang) * range;
    this.effects.push({ kind: 'tracer', x1: p.x, y1: p.y, x2: ex, y2: ey, t: 0.12 });
    this.effects.push({ kind: 'flash', x: p.x + Math.cos(ang) * 1.5, y: p.y + Math.sin(ang) * 1.5, t: 0.08 });
    // Hitscan: nearest ped or police car near the shot line.
    let best = null, bd = 3;
    const targets = [...this.peds.filter((q) => !q.down), ...this.police];
    for (const t of targets) {
      const dx = t.x - p.x, dy = t.y - p.y;
      const along = dx * Math.cos(ang) + dy * Math.sin(ang);
      if (along < 0 || along > range) continue;
      const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      if (perp < bd) { bd = perp; best = t; }
    }
    if (best) {
      if (best.kind === 'ped') {
        best.down = true;
        this.addHeat(WANTED.hitPed);
        this.effects.push({ kind: 'smoke', x: best.x, y: best.y, t: 0.8 });
      } else {
        best.hp -= WEAPONS.pistol.damage;
        this.effects.push({ kind: 'smoke', x: best.x, y: best.y, t: 0.8 });
        if (best.hp <= 0) { best.speed = 0; best.hp = 0; this.addHeat(1); }
      }
    }
  }

  tryPunch() {
    const p = this.player;
    if (!p.onFoot || p.fistsCd > 0) return;
    p.fistsCd = WEAPONS.fists.rate;
    p.angle = this.input.aimAngle(this.renderer.project(p.x, p.y, 0, this.camera, this.zoom));
    let best = null, bd = WEAPONS.fists.range;
    for (const t of this.peds) {
      if (t.down) continue;
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) {
      best.down = true;
      this.addHeat(0.5);
      this.effects.push({ kind: 'smoke', x: best.x, y: best.y, t: 0.6 });
    }
  }

  // --- main loop ---------------------------------------------------------------------------
  // Fixed-timestep accumulator. The first draft clamped dt to 0.05 s and ran
  // one update per frame, so on a slow renderer (SwiftShader, ~3 FPS) the
  // game clock ran at 0.15x real time: Rico walked at ~1 m/s, the car
  // barely moved in a 1.4 s throttle, and heat took a minute to fade — so
  // no mission trigger could ever fire inside the playtest's timeouts even
  // though the trigger logic itself was correct. Now the simulation advances
  // in 1/60 s steps, up to 20 per frame, so game-time tracks real time even
  // when rendering is slow.
  //
  // Edge-triggered keys (F, mouse, space, P) are consumed exactly once:
  // `pressed` is cleared after EVERY sub-step's update(), not just the
  // first and not at the end of the frame. The first draft cleared it only
  // after the first sub-step and again at the end of the frame, which had
  // two opposite bugs: a press arriving during the render phase was wiped
  // by the end-of-frame clear before the next frame could see it (lost
  // press — the playtest's F to exit the car was silently dropped), and a
  // press arriving mid-frame (after the first sub-step) stayed set for the
  // remaining sub-steps and fired once per sub-step (an F press could exit
  // AND re-enter the car in the same frame). Clearing after every update
  // makes each press fire exactly once, whenever it arrives.
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const frameDt = Math.min(0.5, (now - this.last) / 1000);
    this.last = now;
    this._acc += frameDt;
    const STEP = 1 / 60;
    let steps = 0;
    while (this._acc >= STEP && steps < 20) {
      if (this.state === 'playing') {
        this.time += STEP;
        this.update(STEP);
      }
      // Consume edge-triggered keys after every sub-step (see above).
      this.input.clearPressed();
      this._acc -= STEP;
      steps++;
    }
    if (steps >= 20) this._acc = 0; // drop the backlog after a long stall
    this.renderer.render(this, frameDt);
    this.drawEffects();
    this.updateHUD();
  }

  update(dt) {
    const inp = this.input;
    const p = this.player;

    // Pause / mute.
    if (inp.pressed.p || inp.pressed.escape) {
      this.state = 'paused';
      this.showScreen('pause-screen');
      return;
    }
    if (inp.pressed.m) {
      const muted = this.audio.toggleMute();
      this.missions.say(muted ? 'Sound muted.' : 'Sound on.', 2);
    }
    if (inp.pressed['1']) { p.weapon = 'fists'; }
    if (inp.pressed['2']) { p.weapon = 'pistol'; }

    // Enter / exit car.
    if (inp.pressed.f) {
      if (this.playerCar) this.exitCar();
      else {
        const car = this.nearestCar(4.5);
        if (car) this.enterCar(car);
      }
    }

    // Combat.
    if (inp.pressed.mouse || inp.mouseDown) this.tryShoot();
    if (inp.pressed[' ']) this.tryPunch();

    // Movement.
    if (this.playerCar) updatePlayerCar(this.playerCar, inp, dt, this.city, this);
    else updatePlayerOnFoot(p, inp, dt, this.city, this);

    // Traffic + pedestrians.
    for (const c of this.traffic) updateTrafficCar(c, dt, this.city, this);
    for (const ped of this.peds) updatePed(ped, dt, this.city, this);
    // Mara stands at the market (she only turns to face Rico).
    const dp = Math.hypot(p.x - this.mara.x, p.y - this.mara.y);
    if (dp < 12) this.mara.angle = Math.atan2(p.y - this.mara.y, p.x - this.mara.x);

    // Wanted: police pressure. In shot mode the staged wanted level is
    // frozen so the screenshot scene stays stable.
    const targetPolice = Math.min(this.wanted, 4);
    if (this.wanted > 0) this.spawnPolice(targetPolice);
    if (!this.shotMode) {
      // Heat decays when no police can see the player — but never in the
      // first 1.0 seconds after a crime, so the cops always get to arrive.
      // The sight radius is 30 m (was 35, 45) and the grace period is
      // 1.0 s (was 1.5, 3): the zigzag evade breaks 30 m sooner than 35 m,
      // and the shorter grace lets the decay start while the gap holds.
      // The decay gate is heat > 0, NOT wanted > 0: wanted is
      // floor(heat), so it hits 0 while heat is still ~0.99 — gating on
      // wanted stopped the decay there and the heat stuck just below 1
      // forever, so the lose step (heat <= 0.05) could never complete.
      const seen = this.police.some((c) => Math.hypot(c.x - this.playerPos().x, c.y - this.playerPos().y) < 30);
      if (this.heat > 0 && !seen && this.time - (this.lastHeatAdd || 0) > 1.0) {
        this.heat = Math.max(0, this.heat - WANTED.decayPerSec * dt);
      }
      this.wanted = Math.floor(this.heat);
      // Trim police when wanted falls.
      if (this.police.length > targetPolice && this.wanted === 0) {
        this.police.sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
        this.police.length = 0;
      }
    }
    for (const c of this.police) updatePolice(c, dt, this.city, this);
    this.ensureHeli();
    if (this.heli) updateHeli(this.heli, dt, this);

    // Car-vs-ped collisions (player's car): hitting a ped is a crime.
    if (this.playerCar && Math.abs(this.playerCar.speed) > 4) {
      for (const ped of this.peds) {
        if (ped.down) continue;
        if (Math.hypot(ped.x - this.playerCar.x, ped.y - this.playerCar.y) < 2.4) {
          ped.down = true;
          this.addHeat(WANTED.hitPed);
          this.effects.push({ kind: 'smoke', x: ped.x, y: ped.y, t: 0.8 });
        }
      }
    }

    // Missions.
    this.missions.update(dt);
    if (this.missions.victory && this.state === 'playing') {
      this.state = 'victory';
      $('victory-stats').textContent = `You took $${this.money.toLocaleString()} and ${this.rep} rep. Sunset City is yours, Rico.`;
      this.showScreen('end-screen');
      $('end-title').textContent = 'GOLDEN GETAWAY — YOU WIN';
      this.audio.jingle();
    }
    if (this.busted && this.state === 'playing') {
      this.state = 'busted';
      $('end-title').textContent = 'BUSTED';
      $('victory-stats').textContent = 'The SPD caught you. Mara paid your bail — $500 gone.';
      this.showScreen('end-screen');
    }
    if (p.health <= 0 && this.state === 'playing') {
      this.state = 'wasted';
      $('end-title').textContent = 'WASTED';
      $('victory-stats').textContent = 'Rico went down. The city keeps moving without you.';
      this.showScreen('end-screen');
    }

    // Camera follows the player, smoothed.
    const pp = this.playerPos();
    this.camera.x += (pp.x - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (pp.y - this.camera.y) * Math.min(1, dt * 5);

    // Audio.
    const spd01 = this.playerCar ? Math.abs(this.playerCar.speed) / 38 : 0;
    this.audio.setEngine(spd01);
    this.audio.setSiren(this.wanted > 0, dt);

    // Effects age out.
    this.effects = this.effects.filter((e) => (e.t -= dt) > 0);
  }

  drawEffects() {
    const ctx = this.renderer.ctx;
    const cam = this.camera, s = this.zoom;
    for (const e of this.effects) {
      if (e.kind === 'tracer') {
        const a = this.renderer.project(e.x1, e.y1, 0, cam, s);
        const b = this.renderer.project(e.x2, e.y2, 0, cam, s);
        ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      } else if (e.kind === 'flash') {
        const a = this.renderer.project(e.x, e.y, 0, cam, s);
        ctx.fillStyle = 'rgba(255, 220, 100, 0.9)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'smoke') {
        const a = this.renderer.project(e.x, e.y, 0, cam, s);
        ctx.fillStyle = 'rgba(120, 120, 120, 0.5)';
        ctx.beginPath();
        ctx.arc(a.x, a.y - 4, 7 * (1 - e.t), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- HUD ----------------------------------------------------------------------
  updateHUD() {
    const stars = '★'.repeat(this.wanted) + '☆'.repeat(5 - this.wanted);
    const starsEl = $('hud-stars');
    if (starsEl) {
      starsEl.textContent = stars;
      starsEl.style.color = this.wanted > 0 ? '#ff4a3a' : '#ffd23a';
    }
    const moneyEl = $('hud-money');
    if (moneyEl) moneyEl.textContent = `$${this.money.toLocaleString()} · REP ${this.rep}`;
    const objEl = $('mission-objective');
    if (objEl) objEl.textContent = this.missions.objectiveText();
    const titleEl = $('mission-title');
    if (titleEl) titleEl.textContent = this.missions.done ? 'ALL MISSIONS COMPLETE' : `${this.missions.index + 1}. ${this.missions.mission ? this.missions.mission.title : ''}`;
    const msgEl = $('hud-message');
    if (msgEl) {
      msgEl.textContent = this.missions.messageT > 0 ? this.missions.message : '';
      msgEl.style.opacity = this.missions.messageT > 0 ? '1' : '0';
    }
    const speedEl = $('hud-speed');
    if (speedEl) {
      const kmh = this.playerCar ? Math.round(Math.abs(this.playerCar.speed) * 3.6) : 0;
      speedEl.textContent = this.playerCar ? `${kmh} km/h` : 'ON FOOT';
    }
    const weaponEl = $('hud-weapon');
    if (weaponEl) {
      weaponEl.textContent = this.playerCar ? 'SUNSET GT' : `${this.player.weapon === 'pistol' ? 'PISTOL' : 'FISTS'} · ${this.player.weapon === 'pistol' ? this.player.ammo + ' ammo' : ''}`;
    }
    const healthEl = $('hud-health');
    if (healthEl) healthEl.style.width = `${Math.max(0, this.player.health)}%`;
    const bustedEl = $('hud-busted');
    const bustedWrap = $('hud-busted-wrap');
    if (bustedEl && bustedWrap) {
      const show = this.player.busted > 0.05;
      bustedWrap.style.display = show ? 'block' : 'none';
      bustedEl.style.display = show ? 'block' : 'none';
      bustedEl.style.width = `${Math.round(this.player.busted * 100)}%`;
    }
  }
}
