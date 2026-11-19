// SUNSET BOULEVARD — input. Keyboard (WASD/arrows) plus mouse aim/shoot.
// Also exposes the pressed state the playtest driver uses.

export class Input {
  constructor(canvas) {
    this.up = false; this.down = false; this.left = false; this.right = false;
    this.run = false; // Shift
    this.mouseX = 0; this.mouseY = 0;
    this.mouseDown = false;
    this.pressed = {}; // edge-triggered keys, consumed by the game each frame
    this.canvas = canvas;
    this._onKeyDown = (e) => this.key(e, true);
    this._onKeyUp = (e) => this.key(e, false);
    this._onMouse = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    };
    this._onMouseDown = (e) => { this._onMouse(e); this.mouseDown = true; this.pressed.mouse = true; };
    this._onMouseUp = () => { this.mouseDown = false; };
    this._onBlur = () => { this.up = this.down = this.left = this.right = this.run = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('mousemove', this._onMouse);
    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
  }

  key(e, down) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (k === 'w' || k === 'arrowup') this.up = down;
    else if (k === 's' || k === 'arrowdown') this.down = down;
    else if (k === 'a' || k === 'arrowleft') this.left = down;
    else if (k === 'd' || k === 'arrowright') this.right = down;
    else if (k === 'shift') this.run = down;
    if (down) this.pressed[k] = true;
  }

  // Set a key state directly (used by the scripted playtest driver).
  setKey(k, down) {
    if (k === 'up') this.up = down;
    else if (k === 'down') this.down = down;
    else if (k === 'left') this.left = down;
    else if (k === 'right') this.right = down;
    else if (k === 'run') this.run = down;
    if (down) this.pressed[k] = true;
  }

  clearPressed() { this.pressed = {}; }

  // Mouse aim angle from the player to the cursor, in screen space.
  aimAngle(playerScreen) {
    return Math.atan2(this.mouseY - playerScreen.y, this.mouseX - playerScreen.x);
  }
}
