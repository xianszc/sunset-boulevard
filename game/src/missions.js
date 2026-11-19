// SUNSET BOULEVARD — missions and story.
// Six missions, one after another. Each step is checked every frame; when a
// step completes the game advances, shows a toast, and (for the heist) pays
// out. Victory after mission 6 pays $18,000 and 120 rep.

import { MISSIONS, ECONOMY, HERO_CAR } from './config.js';

export class MissionRunner {
  constructor(game) {
    this.game = game;
    this.index = 0; // 0-based mission index
    this.step = 0; // step inside the mission
    this.done = false;
    this.victory = false;
    this.message = '';
    this.messageT = 0;
    this.grabbed = false; // cash case picked up
    this.talkDone = false;
    this.stealDone = false;
    this.loseArmed = false; // mission 4/6: heat was raised on purpose
    this.casePos = { x: 352, y: 306 };
    this.maraPos = { x: 520, y: 300 };
  }

  get mission() { return MISSIONS[this.index]; }
  get stepDef() { return this.mission ? this.mission.steps[this.step] : null; }

  start() {
    this.say(this.mission.brief, 6);
    this.game.setObjective(this.stepDef ? this.stepDef.label : '');
  }

  say(text, seconds = 4) {
    this.message = text;
    this.messageT = seconds;
  }

  update(dt) {
    if (this.done || !this.mission) return;
    this.messageT = Math.max(0, this.messageT - dt);
    const s = this.stepDef;
    if (!s) return;
    const g = this.game;
    const p = g.playerPos();

    if (s.kind === 'goto') {
      if (Math.hypot(p.x - s.x, p.y - s.y) < s.r) this.advance();
    } else if (s.kind === 'talk') {
      if (Math.hypot(p.x - this.maraPos.x, p.y - this.maraPos.y) < 4) {
        this.talkDone = true;
        this.say('Mara: "Good. The GT is downtown — go get it. And Rico… don\'t get caught."', 5);
        this.advance();
      }
    } else if (s.kind === 'steal') {
      if (this.stealDone) this.advance();
    } else if (s.kind === 'drive') {
      if (Math.hypot(p.x - s.x, p.y - s.y) < s.r) this.advance();
    } else if (s.kind === 'lose') {
      // Arm the heat the first time this step is seen, then wait for 0.
      // The arming heat is 1 (was 2): the step already inherits the heat
      // from the steal (1) and any speeding, so 2 more made the total
      // ~4-5, which needed ~6 s of uninterrupted separation to clear —
      // more than the zigzag evade could sustain, so the step could not
      // finish inside the 30 s evade window.
      if (!this.loseArmed) {
        this.loseArmed = true;
        g.addHeat(1);
        this.say('Cops are on you! Break line of sight and stay quiet until the heat fades.', 5);
      }
      if (g.wanted <= 0 && g.heat <= 0.05) this.advance();
    } else if (s.kind === 'grab') {
      if (!this.grabbed && Math.hypot(p.x - this.casePos.x, p.y - this.casePos.y) < 3) {
        this.grabbed = true;
        g.money += 4000;
        g.addHeat(2);
        this.say('Cash case grabbed! +$4,000 — the cops heard that. Get back to the car!', 5);
        this.advance();
      }
    }
  }

  advance() {
    this.step++;
    this.loseArmed = false;
    const g = this.game;
    if (this.step >= this.mission.steps.length) {
      // Mission complete.
      g.money += 1500;
      g.rep += 15;
      this.say(`Mission complete: ${this.mission.title} — +$1,500, +15 rep`, 5);
      g.audio.jingle();
      this.index++;
      this.step = 0;
      if (this.index >= MISSIONS.length) {
        this.done = true;
        this.victory = true;
        g.money += ECONOMY.victoryMoney;
        g.rep += ECONOMY.victoryRep;
        g.save();
        return;
      }
      this.say(this.mission.brief, 6);
    }
    const s = this.stepDef;
    if (s) g.setObjective(s.label || '');
  }

  // Called by the game when the player steals a car.
  onSteal() {
    this.stealDone = true;
  }

  objectiveText() {
    if (this.done) return 'All missions complete — you won!';
    const s = this.stepDef;
    return s ? s.label : '';
  }

  // Where the current objective marker should point.
  objectivePos() {
    if (this.done) return null;
    const s = this.stepDef;
    if (!s) return null;
    if (s.kind === 'goto' || s.kind === 'drive') return { x: s.x, y: s.y };
    if (s.kind === 'talk') return this.maraPos;
    if (s.kind === 'grab') return this.casePos;
    if (s.kind === 'steal') return HERO_CAR;
    if (s.kind === 'lose') return null;
    return null;
  }
}
