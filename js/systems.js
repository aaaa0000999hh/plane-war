// 系统：粒子 / 敌机生成 / 计分
"use strict";

// ---------- 粒子特效 ----------
class ParticleSystem {
  constructor() { this.list = []; this.max = 280; this.rings = []; }
  spawn(x, y, opts) {
    if (this.list.length >= this.max) return;
    this.list.push({
      x, y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life || 0.5, maxLife: opts.life || 0.5,
      color: opts.color || '#fff', size: opts.size || 2,
    });
  }
  explosion(x, y, color, count, scale) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), s = rand(40, 220) * (scale || 1);
      this.spawn(x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color, size: rand(1.5, 3.5) });
    }
  }
  // 冲击波光环
  spawnRing(x, y, color) {
    if (this.rings.length > 24) return;
    this.rings.push({ x, y, color, r: 8, life: 0.45, max: 0.45 });
  }
  // 道具拾取：粒子向目标汇聚
  converge(x, y, color, tx, ty, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), d = rand(26, 60);
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      this.spawn(sx, sy, { vx: (tx - sx) * 4, vy: (ty - sy) * 4, life: 0.32, color, size: rand(1.5, 2.5) });
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.98; p.vy = p.vy * 0.98 + 40 * dt;
      p.life -= dt;
      if (p.life <= 0) this.list.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += 340 * dt;
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
    }
    for (const r of this.rings) {
      const a = Math.max(0, r.life / r.max);
      ctx.globalAlpha = a;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1 + 3 * a;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

// ---------- 敌机波次生成 ----------
class EnemySpawner {
  constructor(game) {
    this.game = game; this.timer = 0.6;
  }
  update(dt) {
    if (this.game.state !== 'playing') return;
    if (this.game.bossActive()) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.spawnWave();
      const s = this.game.stage, tier = this.game.tier;
      this.timer = (rand(1500, 2600) / 1000) * (s ? s.spawnMul : 1) * (tier ? tier.spawn : 1);
    }
  }
  // 生成并按关卡倍率 × 难度等级倍率强化
  addEnemy(cls, x, y) {
    const s = this.game.stage, tier = this.game.tier;
    const e = new cls(x, y);
    const hpMul = (s ? s.hpMul : 1) * (tier ? tier.hp : 1);
    const speedMul = (s ? s.speedMul : 1) * (tier ? tier.speed : 1);
    e.hp = e.maxHp = Math.round(e.hp * hpMul);
    e.speed *= speedMul;
    this.game.enemies.push(e);
  }
  spawnWave() {
    const r = Math.random();
    if (r < 0.7) {
      this.addEnemy(EnemyNormal, rand(30, CONFIG.width - 30), -30);
    } else if (r < 0.9) {
      for (let i = 0; i < 2; i++)
        this.addEnemy(EnemyNormal, rand(30, CONFIG.width - 30), -30 - i * 52);
    } else {
      this.addEnemy(EnemyElite, rand(50, CONFIG.width - 50), -40);
    }
  }
}

// ---------- 计分 / 连击 / 金币 ----------
class ScoreSystem {
  constructor() {
    this.score = 0; this.combo = 0; this.comboTimer = 0; this.mult = 1;
    this.best = 0; this.coins = 0;
    try {
      this.best = parseInt(localStorage.getItem('plane_best') || '0', 10);
      this.coins = parseInt(localStorage.getItem('plane_coins') || '0', 10);
    } catch (e) {}
  }
  addKill(baseScore) {
    this.combo++;
    this.comboTimer = CONFIG.combo.window / 1000;
    this.mult = Math.min(CONFIG.combo.maxMult, 1 + Math.floor(this.combo / 3));
    const add = Math.round(baseScore * this.mult);
    this.score += add;
    return add;
  }
  update(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) { this.combo = 0; this.mult = 1; }
    }
  }
  end() {
    this.coins += Math.floor(this.score / 100);
    if (this.score > this.best) this.best = this.score;
    this.save();
    return Math.floor(this.score / 100);
  }
  save() {
    try {
      localStorage.setItem('plane_best', String(this.best));
      localStorage.setItem('plane_coins', String(this.coins));
    } catch (e) {}
  }
}

// ---------- 生涯统计与成就存档 ----------
class StatsSystem {
  constructor() {
    this.total = { kills: 0, bossKills: 0, maxCombo: 0, maxStage: 0, pkWins: 0, coopClears: 0, games: 0, surrenders: 0 };
    this.ach = {};  // id -> 解锁时间戳
    try {
      Object.assign(this.total, JSON.parse(localStorage.getItem('plane_stats') || '{}'));
      this.ach = JSON.parse(localStorage.getItem('plane_ach') || '{}');
    } catch (e) {}
  }
  save() {
    try {
      localStorage.setItem('plane_stats', JSON.stringify(this.total));
      localStorage.setItem('plane_ach', JSON.stringify(this.ach));
    } catch (e) {}
  }
}