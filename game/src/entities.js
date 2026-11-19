// SUNSET BOULEVARD — entities: the player, cars, pedestrians, police, heli.
// All movement is in world metres and seconds. Cars use a simple arcade
// bicycle model; people walk with a two-leg cycle. No physics library.

import { PALETTE, WANTED, WEAPONS, HERO } from './config.js';
import { onRoad, onSidewalk, inWater, resolveCollision, nearestRoadPoint, districtAt } from './world.js';

let nextId = 1;

export function makePlayer(x, y) {
  return {
    id: nextId++, kind: 'player', x, y, angle: 0, speed: 0,
    walkPhase: 0, moving: false, onFoot: true, car: null,
    health: 100, weapon: 'pistol', ammo: WEAPONS.pistol.ammo,
    fistsCd: 0, shootCd: 0, busted: 0, dead: false,
  };
}

export function makeCar(x, y, angle, opts = {}) {
  return {
    id: nextId++, kind: opts.police ? 'police' : 'car',
    x, y, angle, speed: 0,
    color: opts.color || '#d8d8d8',
    police: !!opts.police, hero: !!opts.hero, parked: !!opts.parked,
    traffic: !!opts.traffic, driver: opts.traffic ? 'traffic' : null,
    route: null, routeIdx: 0, waitT: 0,
    hp: 100, sirenPhase: Math.random() * 6,
    length: 4.4, width: 1.9,
    ramCd: 0, // seconds until this police car may ram the player again
  };
}

export function makePed(x, y, opts = {}) {
  return {
    id: nextId++, kind: 'ped',
    x, y, angle: Math.random() * Math.PI * 2, speed: 0,
    shirt: opts.shirt || PALETTE.pedShirts[Math.floor(Math.random() * PALETTE.pedShirts.length)],
    skin: PALETTE.skin[Math.floor(Math.random() * PALETTE.skin.length)],
    hair: ['#2a1c10', '#6a4a2a', '#c8c8c8', '#1a1a1a'][Math.floor(Math.random() * 4)],
    walkPhase: Math.random() * 6, target: null, waitT: Math.random() * 2,
    fleeing: false, down: false, police: !!opts.police,
  };
}

export function makeHeli(x, y) {
  return { id: nextId++, kind: 'heli', x, y, angle: 0, orbit: 0, h: 55 };
}

// --- player on foot -------------------------------------------------------
export function updatePlayerOnFoot(p, input, dt, city, game) {
  const accel = 26;
  const maxSpeed = input.run ? 7.2 : 4.4;
  let mx = 0, my = 0;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    p.speed = Math.min(p.speed + accel * dt, maxSpeed);
    p.walkPhase += dt * (input.run ? 13 : 9);
  } else {
    p.speed = Math.max(0, p.speed - 30 * dt);
  }
  p.x += Math.cos(p.angle) * p.speed * dt * (len > 0 ? 1 : 0);
  p.y += Math.sin(p.angle) * p.speed * dt * (len > 0 ? 1 : 0);
  // Keep inside the city and out of the water and buildings.
  p.x = Math.max(8, Math.min(592, p.x));
  p.y = Math.max(8, Math.min(632, p.y));
  resolveCollision(city.buildings, p, 0.7);
  if (inWater(p.x, p.y)) { p.x = 592; }
  p.fistsCd = Math.max(0, p.fistsCd - dt);
  p.shootCd = Math.max(0, p.shootCd - dt);
  // Busted progress decays when no police car is close. It only rises
  // while the player is (nearly) stationary: a player sprinting away
  // cannot be busted, or the M5 walk back to the car after grabbing the
  // case would get them busted mid-walk. The BUSTED test parks the player
  // still next to a stopped police car, so it still triggers there.
  const near = game.police.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 6 && Math.abs(c.speed) < 3);
  if (near && p.onFoot && p.speed < 2) p.busted = Math.min(1, p.busted + dt * 0.35);
  else p.busted = Math.max(0, p.busted - dt * 0.5);
  if (p.busted >= 1) game.busted = true;
}

// --- cars -----------------------------------------------------------------
const CAR_ACCEL = 16;
const CAR_BRAKE = 30;
const CAR_MAX = 38; // ~137 km/h
const CAR_MAX_REVERSE = 10;

export function updatePlayerCar(car, input, dt, city, game) {
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const maxSpd = CAR_MAX;
  if (throttle > 0) car.speed = Math.min(car.speed + CAR_ACCEL * dt, maxSpd);
  else if (throttle < 0) {
    if (car.speed > 0.5) car.speed = Math.max(0, car.speed - CAR_BRAKE * dt);
    else car.speed = Math.max(-CAR_MAX_REVERSE, car.speed - CAR_ACCEL * 0.6 * dt);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  // Steering: a real car barely turns at a standstill, but a zero turn rate
  // at low speed soft-locks the player against a building — the car is
  // pressed into the wall, speed ~0, so it can never turn away. Keep a
  // small minimum turn rate (arcade concession) so the player can always
  // manoeuvre out of a stuck position.
  const turnAuthority = Math.max(0.35, Math.min(1, Math.abs(car.speed) / 8));
  const turn = steer * 1.9 * dt * turnAuthority * Math.sign(car.speed || 1);
  car.angle += turn;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = Math.max(6, Math.min(594, car.x));
  car.y = Math.max(6, Math.min(634, car.y));
  // Hitting a building slows the car. This must be a per-second rate, not a
  // per-frame multiplier: the old code did speed *= 0.4 on every frame (and
  // every sub-step after the fixed-timestep fix), which pinned the car at
  // ~0.2 m/s the instant it touched a building, so the player could never
  // pull away or turn off the wall. Now it loses half its speed per second
  // of contact — a hard hit, but recoverable.
  if (resolveCollision(city.buildings, car, 1.4)) car.speed *= Math.pow(0.5, dt);
  // Off-road slows the car.
  if (!onRoad(car.x, car.y) && !onSidewalk(car.x, car.y)) car.speed *= Math.max(0, 1 - 0.8 * dt);
  if (inWater(car.x, car.y)) { car.x = 590; car.speed *= 0.3; }
  // Speeding near police raises heat.
  if (Math.abs(car.speed) > 22) {
    const near = game.police.some((c) => Math.hypot(c.x - car.x, c.y - car.y) < 30);
    if (near) game.addHeat(WANTED.speedNearPolice * dt);
  }
  car.sirenPhase += dt * 6;
}

export function updateTrafficCar(car, dt, city, game) {
  // Follow a waypoint route along roads; pause at intersections sometimes.
  if (car.waitT > 0) { car.waitT -= dt; car.speed = 0; return; }
  if (!car.route || car.routeIdx >= car.route.length) {
    car.route = makeRoute(car.x, car.y);
    car.routeIdx = 0;
    if (Math.random() < 0.25) car.waitT = 1 + Math.random() * 2;
  }
  const t = car.route[car.routeIdx];
  const dx = t.x - car.x, dy = t.y - car.y;
  const d = Math.hypot(dx, dy);
  if (d < 3) { car.routeIdx++; return; }
  const want = Math.atan2(dy, dx);
  let da = want - car.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  car.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, da));
  const target = 9 + Math.random() * 0.4;
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 10 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (resolveCollision(city.buildings, car, 1.4)) { car.route = null; car.speed = 0; }
  // Gentle separation from the player's car.
  const pc = game.playerCar;
  if (pc && pc !== car) {
    const dd = Math.hypot(pc.x - car.x, pc.y - car.y);
    if (dd < 5) { car.speed = Math.max(0, car.speed - 20 * dt); }
  }
}

function makeRoute(x, y) {
  // Random walk along the road grid: 4-7 legs.
  const pts = [];
  let cx = x, cy = y;
  for (let i = 0; i < 5 + Math.floor(Math.random() * 3); i++) {
    const horizontal = Math.random() < 0.5;
    const p = nearestRoadPoint(cx, cy);
    cx = p.x; cy = p.y;
    if (horizontal) cx = 48 + Math.random() * 544;
    else cy = 48 + Math.random() * 544;
    pts.push({ x: cx, y: cy });
  }
  return pts;
}

// --- police ---------------------------------------------------------------
export function updatePolice(car, dt, city, game) {
  const p = game.playerPos();
  const dx = p.x - car.x, dy = p.y - car.y;
  const d = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let da = want - car.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, da));
  // Police top speed stays below the hero car's (38) so a flat-out escape
  // can pull away: at 30 the GT only gained 4 m/s and a weaving escape
  // never broke the sight radius. At 24 the GT pulls away even while
  // weaving, so "lose the cops" can actually finish.
  // On foot and very close, the police STOPS to make the arrest instead
  // of driving through the player: the busted meter only rises while the
  // police car is slow (< 3 m/s in updatePlayerOnFoot, < 6 m/s here), and
  // a chasing car never slows below 10 m/s, so it could never stay slow
  // long enough to bust the player — the BUSTED state was unreachable.
  const target = (game.player.onFoot && d < 5) ? 0 : (d > 60 ? 24 : d > 18 ? 18 : 10);
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), 18 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  if (resolveCollision(city.buildings, car, 1.4)) { car.speed *= 0.5; car.angle += 0.6; }
  car.sirenPhase += dt * 8;
  car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
  // Ram the player: a hard hit slows the player's car and adds heat.
  // Rate-limited to one hit per second per police car, and the hit is a
  // single impulse (not a per-frame drain). The old code multiplied the
  // player's speed by 0.92 on EVERY frame a police car touched them, which
  // pinned the player at ~1 m/s with 2-4 police cars on top of them — the
  // player could never accelerate away, heat maxed out at 5, and "lose the
  // cops" could never complete. It was also frame-rate dependent, so the
  // fixed-timestep fix made it far worse (60 hits/s instead of 3/s).
  const pc = game.playerCar;
  if (pc && d < 4.5) {
    if (car.ramCd <= 0) {
      pc.speed *= 0.85;
      game.addHeat(0.15);
      car.ramCd = 1.0;
    }
    // Keep a visible gap after the hit so the police car does not sit
    // inside the ram radius and re-hit the instant the cooldown ends.
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / d;
      car.x -= dx * push * 0.5;
      car.y -= dy * push * 0.5;
    }
  }
  // On foot, a police car touching the player starts the bust — but only
  // while the player is (nearly) stationary (see updatePlayerOnFoot).
  if (game.player.onFoot && d < 3.2 && Math.abs(car.speed) < 6 && game.player.speed < 2) {
    game.player.busted = Math.min(1, game.player.busted + dt * 0.5);
  }
}

export function updateHeli(h, dt, game) {
  const p = game.playerPos();
  h.orbit += dt * 0.55;
  const r = 26;
  h.x = p.x + Math.cos(h.orbit) * r;
  h.y = p.y + Math.sin(h.orbit) * r * 0.8;
  h.angle = h.orbit + Math.PI / 2;
}

// --- pedestrians ----------------------------------------------------------
export function updatePed(ped, dt, city, game) {
  if (ped.down) return;
  const player = game.playerPos();
  const dp = Math.hypot(player.x - ped.x, player.y - ped.y);
  // Flee gunfire and nearby police chases.
  if (game.shotsFired > 0 || (game.wanted >= 2 && dp < 25)) ped.fleeing = true;
  if (ped.fleeing && dp > 45) ped.fleeing = false;
  if (ped.waitT > 0) { ped.waitT -= dt; ped.speed = 0; return; }
  if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 2) {
    if (Math.random() < 0.3) { ped.waitT = 1 + Math.random() * 3; return; }
    ped.target = randomSidewalkPoint(ped.x, ped.y);
  }
  const dx = ped.target.x - ped.x, dy = ped.target.y - ped.y;
  const want = Math.atan2(dy, dx);
  ped.angle = want;
  const spd = ped.fleeing ? 5.2 : 1.6 + Math.random() * 0.4;
  ped.speed = spd;
  ped.x += Math.cos(want) * spd * dt;
  ped.y += Math.sin(want) * spd * dt;
  ped.walkPhase += dt * (ped.fleeing ? 12 : 6);
  ped.x = Math.max(8, Math.min(592, ped.x));
  ped.y = Math.max(8, Math.min(632, ped.y));
  resolveCollision(city.buildings, ped, 0.6);
}

function randomSidewalkPoint(x, y) {
  for (let i = 0; i < 12; i++) {
    const nx = Math.max(12, Math.min(588, x + (Math.random() - 0.5) * 90));
    const ny = Math.max(12, Math.min(628, y + (Math.random() - 0.5) * 90));
    if (onSidewalk(nx, ny) || onRoad(nx, ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

// Spawn helpers ------------------------------------------------------------
export function spawnTraffic(count, city) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const x = 48 + Math.random() * 520;
    const y = 48 + Math.random() * 520;
    const p = nearestRoadPoint(x, y);
    const angle = Math.random() < 0.5 ? 0 : Math.PI / 2;
    const car = makeCar(p.x, p.y, angle, { traffic: true, color: PALETTE.traffic[i % PALETTE.traffic.length] });
    car.route = makeRoute(p.x, p.y);
    cars.push(car);
  }
  return cars;
}

export function spawnPeds(count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const x = 40 + Math.random() * 540;
    const y = 40 + Math.random() * 560;
    if (onRoad(x, y) || inWater(x, y)) continue;
    peds.push(makePed(x, y));
  }
  return peds;
}

export function districtName(x, y) {
  return districtAt(x, y);
}
