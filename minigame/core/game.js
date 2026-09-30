'use strict';

const RULES = Object.freeze({
  lives: 3,
  successScore: 25,
  perfectBonus: 25,
  perfectTolerance: 0.1,
  swingSpeedScale: 0.75,
  fixedStep: 1 / 120,
  maxFrameDelta: 0.1,
});

/**
 * 无平台依赖的游戏逻辑。世界坐标 Y 向下，screenY = y + cameraY。
 * x/y 是楼块左上角；swing 状态的 angle 为绳子角度，其他状态为楼块角度。
 */
class TowerGame {
  constructor({ width = 375, height = 667, random = Math.random } = {}) {
    if (!(width > 0) || !(height > 0) || !Number.isFinite(width + height)) {
      throw new RangeError('游戏画布尺寸必须是有限正数');
    }
    this.width = width;
    this.height = height;
    this.random = random;
    this.floorWidth = width * 0.25;
    this.floorHeight = this.floorWidth * 0.71;
    this.baseY = height * 0.82;
    this.reset();
  }

  reset() {
    this.state = 'playing';
    this.score = 0;
    this.floors = 0;
    this.lives = RULES.lives;
    this.combo = 0;
    this.blocks = [];
    this.active = null;
    this.cameraY = 0;
    this.time = 0;
    this.topX = (this.width - this.floorWidth) / 2;
    this.topY = this.baseY;
    this._accumulator = 0;
    this._swayOffset = 0;
    this._spawnDelay = 0;
    this._events = [];
    this._spawn();
  }

  pause() {
    if (this.state === 'playing') this.state = 'paused';
  }

  resume() {
    if (this.state === 'paused') this.state = 'playing';
  }

  drop() {
    if (this.state !== 'playing' || !this.active || this.active.status !== 'swing') {
      return false;
    }
    this.active.status = 'falling';
    this.active.angle = 0;
    this.active.vy = 0;
    return true;
  }

  drainEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }

  update(deltaSeconds) {
    if (this.state !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    // 切回前台或低帧率时不补算整段时间，避免瞬间掉楼和穿透。
    this._accumulator += Math.min(deltaSeconds, RULES.maxFrameDelta);
    while (this._accumulator + 1e-10 >= RULES.fixedStep && this.state === 'playing') {
      this._accumulator -= RULES.fixedStep;
      this._step(RULES.fixedStep);
    }
  }

  _spawn() {
    const degrees = this.floors < 10 ? 30 : this.floors < 20 ? 60 : 80;
    this._swingAmplitude = (degrees + this.random() * 5) * Math.PI / 180;
    this._swingSign = this.random() < 0.5 ? -1 : 1;
    this.active = {
      x: 0, y: 0,
      width: this.floorWidth, height: this.floorHeight,
      angle: 0, status: 'swing',
      anchorX: this.width / 2, anchorY: 0,
      ropeX: 0, ropeY: 0,
      vy: 0, collisionChecked: false,
    };
    this._positionSwing();
  }

  _positionSwing() {
    const block = this.active;
    const speed = this.floors < 10 ? 1 : this.floors < 20 ? 0.8 : this.floors < 30 ? 0.7 : 0.74;
    const targetAngle = this.floors === 0 ? 0 :
      this._swingAmplitude * this._swingSign * Math.sin(this.time * 5 * speed * RULES.swingSpeedScale);
    const ropeLength = this.height * 0.39;
    // 难度仍改变目标摆角；横向范围由画布宽度决定，长屏不会将吊块甩出视口。
    const horizontalRange = Math.min(Math.max(0, (this.width - block.width) / 2 - 8), ropeLength * 0.95);
    const displacement = Math.sin(targetAngle) * horizontalRange;
    block.angle = Math.asin(displacement / ropeLength);
    block.anchorY = -this.height * 0.13 - this.cameraY;
    block.ropeX = block.anchorX + displacement;
    block.ropeY = block.anchorY + Math.cos(block.angle) * ropeLength;
    block.x = block.ropeX - block.width / 2;
    block.y = block.ropeY + block.height * 0.3;
  }

  _step(dt) {
    this.time += dt;
    this._moveTower();
    const cameraTarget = Math.max(0, this.height * 0.66 - this.topY);
    this.cameraY += (cameraTarget - this.cameraY) * (1 - Math.exp(-8 * dt));
    this.blocks = this.blocks.filter(block => block.y + this.cameraY <= this.height + this.floorHeight * 2);

    if (!this.active) {
      this._spawnDelay -= dt;
      if (this._spawnDelay <= 0) this._spawn();
      return;
    }
    const block = this.active;
    if (block.status === 'swing') {
      this._positionSwing();
      return;
    }
    if (block.status === 'tipping') {
      this._tip(block, dt);
    } else {
      const previousBottom = block.y + block.height;
      const gravity = this.height * 2.2;
      block.y += block.vy * dt + 0.5 * gravity * dt * dt;
      block.vy += gravity * dt;
      if (!block.collisionChecked && previousBottom <= this.topY && block.y + block.height >= this.topY) {
        block.collisionChecked = true;
        this._collide(block);
      }
    }
    if (this.active && block.y + this.cameraY > this.height + block.height * 2) {
      this._miss();
    }
  }

  _moveTower() {
    const amplitude = this.floors < 5 ? 0 : this.floors < 13 ? 0.012 : this.floors < 23 ? 0.024 : 0.036;
    const nextOffset = Math.sin(this.time * 5) * amplitude * this.width;
    const shift = nextOffset - this._swayOffset;
    this._swayOffset = nextOffset;
    this.topX += shift;
    for (const block of this.blocks) block.x += shift;
  }

  _collide(block) {
    const left = this.floors === 0 ? 0 : this.topX;
    const right = this.floors === 0 ? this.width : this.topX + this.floorWidth;
    const center = block.x + block.width / 2;
    if (block.x + block.width <= left || block.x >= right) return;

    if (center < left || center > right) {
      block.status = 'tipping';
      block.direction = center < left ? -1 : 1;
      block.pivotX = center < left ? left : right;
      block.pivotY = this.topY;
      block.offsetX = block.x - block.pivotX;
      block.offsetY = -block.height;
      block.y = this.topY - block.height;
      block.vy = 0;
      return;
    }

    const offset = Math.abs(block.x - this.topX);
    const perfect = this.floors > 0 && offset <= this.floorWidth * RULES.perfectTolerance + 1e-8;
    this.combo = perfect ? this.combo + 1 : 0;
    const points = RULES.successScore + RULES.perfectBonus * this.combo;
    this.score += points;
    this.floors += 1;
    block.y = this.topY - block.height;
    this.blocks.push({
      x: block.x, y: block.y,
      width: block.width, height: block.height, perfect,
    });
    this.topX = block.x;
    this.topY = block.y;
    this.active = null;
    this._spawnDelay = 0.4;
    this._emit('land', { perfect, points });
  }

  _tip(block, dt) {
    block.angle += block.direction * 3.6 * dt;
    if (Math.abs(block.angle) < 1.3) {
      const cosine = Math.cos(block.angle);
      const sine = Math.sin(block.angle);
      block.x = block.pivotX + block.offsetX * cosine - block.offsetY * sine;
      block.y = block.pivotY + block.offsetX * sine + block.offsetY * cosine;
    } else {
      block.vy += this.height * 1.7 * dt;
      block.x += block.direction * this.width * 0.3 * dt;
      block.y += (this.height * 0.3 + block.vy) * dt;
    }
  }

  _miss() {
    this.lives -= 1;
    this.combo = 0;
    this.active = null;
    this._spawnDelay = 0.25;
    this._emit('miss');
    if (this.lives === 0) {
      this.state = 'gameover';
      this._emit('gameover');
    }
  }

  _emit(type, details = {}) {
    this._events.push({
      type,
      perfect: false,
      points: 0,
      combo: this.combo,
      score: this.score,
      floors: this.floors,
      lives: this.lives,
      ...details,
    });
  }
}

module.exports = { TowerGame, RULES };
