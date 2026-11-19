// SUNSET BOULEVARD — configuration, city layout and mission data.
// Top-down 2.5D open-world crime game. Afternoon / golden hour setting.
// All coordinates are world metres: x east, y south. The city is 640 x 640.

export const WORLD = {
  size: 640,
  block: 64, // city block size (m)
  road: 16, // normal road width (m)
  boulevard: 28, // Sunset Boulevard width (m)
  tilt: 0.62, // vertical squash of the tilted top-down camera
  zoom: 8, // screen px per world metre at default zoom
};

export const SUN = {
  // Low afternoon sun in the west: shadows fall to the east (+x).
  azimuth: 0.12, // radians, shadow direction offset from +x
  baseShadow: 1.35, // shadow length as a multiple of height at wanted 0
  heatShadow: 2.2, // shadow length at wanted 5 (Golden Hour Heat)
  skyTop: '#2a75d3',
  skyMid: '#ff9a5c',
  skyLow: '#ffa756',
};

export const PALETTE = {
  asphalt: '#33373d',
  asphaltLine: '#e8c93a',
  sidewalk: '#9a938a',
  sidewalkEdge: '#7d766e',
  grass: '#5f9e4d',
  grassDark: '#4c8340',
  sand: '#e8cf9a',
  water: '#2e7fa8',
  waterDeep: '#1f5f83',
  boardwalk: '#b98d5f',
  median: '#4c8340',
  roofDowntown: ['#7a8aa0', '#8a7a68', '#6b7f8f', '#9a8a7a'],
  roofHouse: ['#b8543e', '#c97b2e', '#7a6a9a', '#4a7a5c'],
  roofShop: ['#d8c9a8', '#b8a888', '#98a8b8'],
  wallDowntown: ['#5c6b7d', '#6b5f4f', '#4f6172', '#7d6b58'],
  wallHouse: ['#e8dcc8', '#d8c8b8', '#c8d8c8', '#e8c8b8'],
  wallShop: ['#e8d8b8', '#d8c8a8', '#c8d8e8'],
  heroCar: '#70e000', // acid lime — never pink/red
  policeWhite: '#f2f2f2',
  policeBlack: '#1c1e22',
  traffic: ['#d84a3a', '#3a7ad8', '#e8e8e8', '#f2b234', '#7a4ad8', '#2e8f6e', '#c8c8c8', '#8a5a2e'],
  pedShirts: ['#e84a4a', '#4a7ad8', '#f2b234', '#2e8f6e', '#8a4ad8', '#e87ab8', '#4ad8c8', '#d8d8d8'],
  skin: ['#e8b88a', '#c88a5a', '#8a5a34', '#f2c8a0'],
  tree: '#3e7a34',
  treeDark: '#2e5e28',
  palm: '#4a8a3e',
  awning: ['#d84a3a', '#3a7ad8', '#f2b234', '#2e8f6e'],
};

export const DISTRICTS = {
  // name, rect [x, y, w, h], kind
  downtown: { name: 'Downtown', rect: [192, 32, 256, 192], kind: 'downtown' },
  market: { name: 'Market Row', rect: [448, 224, 160, 160], kind: 'market' },
  residential: { name: 'Palm Court', rect: [32, 384, 224, 224], kind: 'residential' },
  park: { name: 'Sunset Park', rect: [288, 416, 128, 128], kind: 'park' },
  beach: { name: 'Boardwalk Beach', rect: [560, 32, 80, 576], kind: 'beach' },
  port: { name: 'Marina', rect: [448, 448, 112, 128], kind: 'marina' },
};

// Main roads (grid). Vertical roads at x, horizontal at y. The boulevard
// is the wide east-west artery through the middle of the city.
export const ROADS_V = [64, 128, 192, 256, 320, 384, 448, 512, 576];
export const ROADS_H = [64, 128, 192, 256, 320, 384, 448, 512, 576];
export const BOULEVARD_Y = 320; // Sunset Boulevard centreline

export const HERO = {
  name: 'Rico Vale',
  fixer: 'Mara Quinn',
  color: '#f2801a', // orange jacket
  pants: '#2b2d42',
  skin: '#e8b88a',
  hair: '#2a1c10',
};

export const ECONOMY = {
  startMoney: 0,
  startRep: 0,
  victoryMoney: 18000,
  victoryRep: 120,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  hitCar: 0.5,
  shotFired: 1,
  // Speeding near police adds heat at 0.25/s (was 0.5): at 0.5 the heat
  // gain during a chase outpaced the decay, so "lose the cops" could
  // never finish — the player was always adding heat faster than it
  // could fade, even while pulling away.
  speedNearPolice: 0.25,
  maxStars: 5,
  // Heat decays at 1.0/s once the player is unseen (was 0.7, 0.35, 0.2):
  // the lose step needs ~2-3 s of clean separation to clear, not 6 s.
  // At 0.7 the zigzag evade could not sustain separation long enough for
  // the heat to reach 0.05 inside the 30 s evade window.
  decayPerSec: 1.0,
  heatPerStar: 1,
};

export const WEAPONS = {
  fists: { name: 'FISTS', damage: 12, range: 2.2, rate: 0.45 },
  pistol: { name: 'PISTOL', damage: 34, range: 55, rate: 0.28, ammo: 24 },
};

// Six missions. Each has a title, a briefing line from Mara, and a list of
// objectives. An objective is { kind, x, y, r, label } or a scripted step.
export const MISSIONS = [
  {
    id: 1,
    title: 'FIRST LIGHT',
    brief: 'Mara Quinn: "Rico, welcome back. Meet me at Market Row — we have work."',
    steps: [
      { kind: 'goto', x: 520, y: 300, r: 12, label: 'Meet Mara at Market Row' },
      { kind: 'talk', label: 'Talk to Mara' },
    ],
  },
  {
    id: 2,
    title: 'THE PICKUP',
    brief: 'Mara: "The lime Sunset GT is parked at the downtown garage. Take it — quietly."',
    steps: [
      { kind: 'goto', x: 300, y: 150, r: 12, label: 'Reach the downtown garage' },
      { kind: 'steal', label: 'Steal the Sunset GT (walk up and press F)' },
    ],
  },
  {
    id: 3,
    title: 'BOULEVARD RUN',
    brief: 'Mara: "Drive the GT down Sunset Boulevard to the boardwalk. Show the city what it can do."',
    steps: [
      { kind: 'drive', x: 580, y: 320, r: 16, label: 'Drive to the boardwalk (east end)' },
    ],
  },
  {
    id: 4,
    title: 'LOSE THE HEAT',
    brief: 'Mara: "Cops are on you. Lose them in Palm Court — break line of sight and stay quiet."',
    steps: [
      { kind: 'lose', label: 'Lose the cops (wanted back to 0)' },
    ],
  },
  {
    id: 5,
    title: 'THE HEIST',
    brief: 'Mara: "The bank on the boulevard. Grab the cash case on foot, then get back to the car."',
    steps: [
      { kind: 'goto', x: 352, y: 296, r: 10, label: 'Reach the bank on foot' },
      { kind: 'grab', label: 'Grab the cash case (walk over it)' },
      { kind: 'drive', x: 160, y: 520, r: 16, label: 'Drive the case to Palm Court' },
    ],
  },
  {
    id: 6,
    title: 'GOLDEN GETAWAY',
    brief: 'Mara: "Last run, Rico. Get to the marina boat at golden hour — and lose the cops for good."',
    steps: [
      { kind: 'drive', x: 500, y: 500, r: 16, label: 'Reach the marina' },
      { kind: 'lose', label: 'Lose the cops one last time' },
      { kind: 'goto', x: 520, y: 545, r: 10, label: 'Board the boat' },
    ],
  },
];

export const SPAWN = { x: 512, y: 296 }; // Rico starts on foot at Market Row
export const HERO_CAR = { x: 300, y: 150 }; // Sunset GT parked at downtown garage
export const SAVE_KEY = 'sunset-boulevard-save-v1';
