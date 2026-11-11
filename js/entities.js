// 实体：子弹 / 敌弹 / 导弹 / 敌机 / Boss / 道具
"use strict";

// ---------- 玩家子弹 ----------
class Bullet {
  constructor(x, y, vx, vy, damage, color, owner) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.damage = damage; this.color = color || CONFIG.colors.cyan;
    this.owner = owner === undefined ? -1 : owner;   // PK 模式：0/1 表示归属玩家
    this.radius = 4; this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.x < -30 || this.x > CONFIG.width + 30) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(LaserSprites.get(this.color), -7, -18, 14, 36);
    ctx.restore();
  }
}

// ---------- 敌方子弹 ----------
class EnemyBullet {
  constructor(x, y, vx, vy, color) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = 5; this.dead = false;
    this.color = color || CONFIG.colors.red;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > CONFIG.height + 30 || this.y < -30 || this.x < -30 || this.x > CONFIG.width + 30) this.dead = true;
  }
  draw(ctx) {
    const s = 21;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.85;
    ctx.drawImage(GlowSprites.get(this.color), this.x - s / 2, this.y - s / 2, s, s);
    ctx.restore();
  }
}

// ---------- 追踪导弹 ----------
class Missile {
  constructor(x, y, owner) {
    this.x = x; this.y = y; this.vx = 0; this.vy = -200;
    this.owner = owner === undefined ? -1 : owner;
    this.radius = 5; this.damage = 30; this.dead = false; this.t = 0;
  }
  update(dt, game) {
    this.t += dt;
    let target = null, best = Infinity;
    for (const e of game.enemies) {
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < best) { best = d; target = e; }
    }
    let ax = 0, ay = -CONFIG.missileSpeed;
    if (target) {
      const ang = angleTo(this.x, this.y, target.x, target.y);
      ax = Math.cos(ang) * CONFIG.missileSpeed;
      ay = Math.sin(ang) * CONFIG.missileSpeed;
    }
    this.vx += (ax - this.vx) * Math.min(1, dt * 5);
    this.vy += (ay - this.vy) * Math.min(1, dt * 5);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -40 || this.x < -40 || this.x > CONFIG.width + 40) this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = CONFIG.colors.purple; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(this.x - this.vx * 0.03, this.y - this.vy * 0.03);
    ctx.lineTo(this.x, this.y); ctx.stroke();
    ctx.fillStyle = '#d9bcff';
    ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ---------- 敌机基类 ----------
class Enemy {
  constructor(x, y, opts) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.t = 0;
    this.hp = opts.hp; this.maxHp = opts.hp;
    this.radius = opts.radius; this.speed = opts.speed;
    this.score = opts.score; this.color = opts.color;
    this.dead = false; this.fireTimer = rand(500, 1500);
    this.flash = 0;   // 受击闪白计时
    // 嘲讽气泡
    this.taunt = null; this.tauntTime = 0; this.tauntTimer = rand(2, 6);
  }
  say(text) {
    this.taunt = text;
    this.tauntTime = 2.4;
  }
  takeDamage(d) {
    this.hp -= d;
    this.flash = 0.1;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
  }
  update(dt, game) {
    this.t += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.tauntTime > 0) {
      this.tauntTime -= dt;
      if (this.tauntTime <= 0) this.taunt = null;
    }
    this.tauntTimer -= dt;
    if (this.tauntTimer <= 0) {
      this.tauntTimer = rand(5, 10);
      if (Math.random() < 0.55 && CONFIG.taunts.length)
        this.say(CONFIG.taunts[randInt(0, CONFIG.taunts.length - 1)]);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  // 嘲讽气泡：拟人化吐槽，敌人随便嘴贱
  drawTaunt(ctx) {
    if (!this.taunt || this.tauntTime <= 0) return;
    const life = 2.4;
    const age = life - this.tauntTime;
    const alpha = Math.min(1, age * 6, this.tauntTime * 3);
    const bob = Math.sin(this.t * 3) * 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 11px "Microsoft YaHei", monospace';
    const tw = ctx.measureText(this.taunt).width;
    const bw = tw + 18, bh = 20;
    let bx = clamp(this.x - bw / 2, 4, CONFIG.width - bw - 4);
    const above = this.y - this.radius - bh - 14 + bob;
    const isAbove = above > 46;
    const by = isAbove ? above : this.y + this.radius + 12 + bob;
    // 气泡主体
    ctx.fillStyle = 'rgba(4,10,20,0.92)';
    ctx.strokeStyle = 'rgba(255,200,80,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill(); ctx.stroke();
    // 气泡尾巴
    const tx = clamp(this.x, bx + 10, bx + bw - 10);
    ctx.beginPath();
    if (isAbove) { ctx.moveTo(tx - 4, by + bh); ctx.lineTo(tx + 4, by + bh); ctx.lineTo(tx, by + bh + 7); }
    else { ctx.moveTo(tx - 4, by); ctx.lineTo(tx + 4, by); ctx.lineTo(tx, by - 7); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(4,10,20,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,80,0.9)';
    ctx.stroke();
    // 文字
    ctx.fillStyle = '#ffe9b0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.taunt, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.restore();
  }
}

// ---------- 普通敌机 ----------
class EnemyNormal extends Enemy {
  constructor(x, y) {
    const c = CONFIG.enemies.normal;
    super(x, y, { hp: c.hp, radius: c.radius, speed: c.speed, score: c.score, color: c.color });
    this.baseX = x;
  }
  update(dt, game) {
    super.update(dt, game);
    this.y += this.speed * dt;
    this.x = this.baseX + Math.sin(this.t * 2.2) * 14;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.y > 0 && this.y < CONFIG.height * 0.7) {
      game.addEnemyBullet(this.x, this.y + this.radius, 0, 170, CONFIG.colors.red);
      this.fireTimer = CONFIG.enemies.normal.fireInterval;
    }
    if (this.y > CONFIG.height + 50) this.y = CONFIG.height + 100; // 离屏由主循环清理
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.sin(this.t * 1.6) * 0.12);
    ctx.shadowBlur = 14; ctx.shadowColor = this.color;
    // 六边形无人机
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = Math.cos(a) * this.radius, py = Math.sin(a) * this.radius;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#141026';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.color; ctx.lineWidth = 1.5; ctx.stroke();
    // 核心
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color; ctx.fill();
    ctx.restore();
  }
}

// ---------- 精英敌机 ----------
class EnemyElite extends Enemy {
  constructor(x, y) {
    const c = CONFIG.enemies.elite;
    super(x, y, { hp: c.hp, radius: c.radius, speed: c.speed, score: c.score, color: c.color });
  }
  update(dt, game) {
    super.update(dt, game);
    this.y += this.speed * dt;
    this.x += Math.sin(this.t * 3) * 70 * dt;
    this.x = clamp(this.x, this.radius, CONFIG.width - this.radius);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.y > 0 && this.y < CONFIG.height * 0.75) {
      const base = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const a = base - 0.35 + 0.35 * i;
        game.addEnemyBullet(this.x, this.y + this.radius, Math.cos(a) * 180, Math.sin(a) * 180, this.color);
      }
      this.fireTimer = CONFIG.enemies.elite.fireInterval;
    }
    if (this.y > CONFIG.height + 50) this.y = CONFIG.height + 100;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    // 外层旋转刃环
    ctx.save();
    ctx.rotate(this.t * 1.4);
    ctx.shadowBlur = 16; ctx.shadowColor = this.color;
    ctx.strokeStyle = this.color; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(this.radius * 0.7, 0); ctx.lineTo(this.radius + 8, 0); ctx.stroke();
    }
    ctx.restore();
    // 八边形主体
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const rr = this.radius * (i % 2 === 0 ? 1 : 0.78);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#2a0f14';
    ctx.shadowBlur = 12; ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.stroke();
    // 核心
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd0d0'; ctx.shadowBlur = 12; ctx.shadowColor = this.color; ctx.fill();
    ctx.restore();
  }
}

// ---------- Boss（多阶段弹幕） ----------
class Boss extends Enemy {
  constructor(x, y) {
    const b = CONFIG.boss;
    super(x, y, { hp: b.hp, radius: b.radius, speed: b.speed, score: b.score, color: CONFIG.colors.magenta });
    this.entered = false; this.phase = 0;
    this.phases = [
      { hpRatio: 1.0, pattern: 'spiral' },
      { hpRatio: 0.6, pattern: 'fan' },
      { hpRatio: 0.3, pattern: 'radial' },
    ];
  }
  update(dt, game) {
    super.update(dt, game);
    if (!this.entered) {
      this.y += 90 * dt;
      if (this.y >= CONFIG.boss.enterY) { this.entered = true; this.y = CONFIG.boss.enterY; }
      return;
    }
    this.x += Math.sin(this.t * 0.8) * this.speed * dt;
    this.x = clamp(this.x, this.radius + 10, CONFIG.width - this.radius - 10);

    const ratio = this.hp / this.maxHp;
    let p = ratio <= 0.3 ? 2 : ratio <= 0.6 ? 1 : 0;
    if (p !== this.phase) { this.phase = p; game.onBossPhaseChange(); }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.shoot(game);
      this.fireTimer = [1000, 850, 650][this.phase];
    }
  }
  shoot(game) {
    const bs = CONFIG.boss.bulletSpeed;
    const x = this.x, y = this.y + this.radius * 0.6;
    const pat = this.phases[this.phase].pattern;
    if (pat === 'spiral') {
      const arms = 2, cnt = 6;
      for (let a = 0; a < arms; a++) {
        const base = this.t * 1.8 + a * Math.PI;
        for (let i = 0; i < cnt; i++) {
          const ang = base + i * (Math.PI * 2 / cnt);
          game.addEnemyBullet(x, y, Math.cos(ang) * bs, Math.sin(ang) * bs, CONFIG.colors.magenta);
        }
      }
    } else if (pat === 'fan') {
      const tgt = (game.nearestPlayer && game.nearestPlayer(x, y)) || game.player;
      const base = angleTo(x, y, tgt.x, tgt.y);
      const cnt = 7, spread = 1.0;
      for (let i = 0; i < cnt; i++) {
        const ang = base - spread / 2 + spread * i / (cnt - 1);
        game.addEnemyBullet(x, y, Math.cos(ang) * bs * 1.2, Math.sin(ang) * bs * 1.2, CONFIG.colors.red);
      }
    } else if (pat === 'radial') {
      const cnt = 16;
      for (let i = 0; i < cnt; i++) {
        const ang = i * (Math.PI * 2 / cnt) + this.t * 0.5;
        game.addEnemyBullet(x, y, Math.cos(ang) * bs * 0.9, Math.sin(ang) * bs * 0.9, CONFIG.colors.orange);
      }
      const tgt = (game.nearestPlayer && game.nearestPlayer(x, y)) || game.player;
      const base = angleTo(x, y, tgt.x, tgt.y);
      for (let i = -2; i <= 2; i++) {
        const ang = base + i * 0.2;
        game.addEnemyBullet(x, y, Math.cos(ang) * bs * 1.4, Math.sin(ang) * bs * 1.4, CONFIG.colors.red);
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2);
    // 外环旋转护盾
    ctx.save();
    ctx.rotate(this.t * 0.6);
    ctx.strokeStyle = 'rgba(255,45,149,0.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, i * Math.PI / 3 + 0.1, i * Math.PI / 3 + 0.9);
      ctx.stroke();
    }
    ctx.restore();
    // 六边形装甲主体
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const px = Math.cos(a) * this.radius, py = Math.sin(a) * this.radius;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -this.radius, 0, this.radius);
    g.addColorStop(0, '#3a0d24');
    g.addColorStop(0.5, '#22061a');
    g.addColorStop(1, '#0d0210');
    ctx.fillStyle = g;
    ctx.shadowBlur = 26; ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.color; ctx.lineWidth = 2.5; ctx.stroke();
    // 内层能量环
    ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,120,200,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    // 脉冲核心
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.4, '#ff8ad0');
    cg.addColorStop(1, 'rgba(255,45,149,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(0, 0, 18 + pulse * 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ---------- 道具 ----------
const PROP_INFO = {
  P: { color: CONFIG.colors.red, letter: 'P' },
  W: { color: CONFIG.colors.cyan, letter: 'W' },
  S: { color: CONFIG.colors.green, letter: 'S' },
  B: { color: CONFIG.colors.orange, letter: 'B' },
  H: { color: CONFIG.colors.green, letter: '+' },
  M: { color: CONFIG.colors.purple, letter: 'M' },
};
const PROP_TYPES = ['P', 'W', 'S', 'B', 'H', 'M'];

class Prop {
  constructor(x, y) {
    this.x = x; this.y = y; this.vy = 80; this.radius = 13;
    this.type = PROP_TYPES[randInt(0, PROP_TYPES.length - 1)];
    this.dead = false; this.t = rand(0, 6);
  }
  update(dt) {
    this.y += this.vy * dt;
    if (this.y > CONFIG.height + 20) this.dead = true;
  }
  draw(ctx) {
    const info = PROP_INFO[this.type];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.t);
    ctx.shadowBlur = 12; ctx.shadowColor = info.color;
    ctx.strokeStyle = info.color; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 2 * i / 6;
      const px = Math.cos(a) * this.radius, py = Math.sin(a) * this.radius;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = info.color; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(info.letter, 0, 0);
    ctx.restore();
  }
}

// ---------- 玩家战机 ----------
class Player {
  constructor(fighterIndex) {
    const f = CONFIG.fighters[fighterIndex];
    this.fighter = f;
    this.x = CONFIG.width / 2;
    this.y = CONFIG.height - 90;
    this.radius = 12;
    this.hp = f.hp; this.maxHp = f.hp;
    this.speed = f.speed;
    this.damage = f.damage;
    this.fireRate = f.fireRate;
    this.color = f.color;
    this.weaponLevel = 1;
    this.wingmen = 0;
    this.missiles = 0;
    this.shield = 0;
    this.invuln = 0;
    this.fireTimer = 0;
    this.missileTimer = 0;
    this.dead = false;
  }
  takeDamage(d) {
    if (this.invuln > 0 || this.shield > 0) return false;
    this.hp -= d;
    this.invuln = 1.0;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }
  update(dt, game) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.shield > 0) this.shield -= dt;
    // 按住各自的开火键时加快射速
    const fk = this.control ? this.control.fire : ' ';
    this.fireTimer -= dt * (game.keys && game.keys[fk] ? 1.35 : 1);
    if (this.fireTimer <= 0) this.fire(game);
    if (this.missiles > 0) {
      this.missileTimer -= dt;
      if (this.missileTimer <= 0) {
        game.spawnMissile(this.x - 8, this.y - 12, this.playerIndex);
        game.spawnMissile(this.x + 8, this.y - 12, this.playerIndex);
        this.missiles--;
        this.missileTimer = 0.35;
      }
    }
  }
  fire(game) {
    const w = CONFIG.weapons[this.weaponLevel - 1];
    this.fireTimer = (w.cooldown / this.fireRate) / 1000;
    const dmg = w.damage * this.damage;
    const cx = -Math.PI / 2;
    for (let i = 0; i < w.count; i++) {
      let a = cx;
      if (w.count > 1) a = cx - w.spread * (w.count - 1) / 2 + w.spread * i;
      game.addBullet(this.x, this.y - 16, Math.cos(a) * w.speed, Math.sin(a) * w.speed, dmg, this.color, this.playerIndex);
    }
    for (let i = 0; i < Math.min(this.wingmen, CONFIG.wingmanMax); i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const off = 28 + 16 * Math.floor(i / 2);
      game.addBullet(this.x + side * off, this.y - 4, 0, -w.speed, 3, CONFIG.colors.orange, this.playerIndex);
    }
    // 枪口火花
    game.particles.spawn(this.x, this.y - 20, { vx: rand(-10, 10), vy: rand(-120, -60), life: 0.1, color: '#eafcff', size: 2.5 });
    game.audio.shoot();
  }
  draw(ctx) {
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;
    const now = performance.now() / 1000;

    // 僚机
    for (let i = 0; i < Math.min(this.wingmen, CONFIG.wingmanMax); i++) {
      const side = (i % 2 === 0) ? -1 : 1;
      const off = 28 + 16 * Math.floor(i / 2);
      this.drawWingman(ctx, this.x + side * off, this.y - 4, now);
    }

    this.drawShip(ctx, this.x, this.y, now);

    // 护盾
    if (this.shield > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = 0.5 + 0.3 * Math.sin(now * 6);
      const g = ctx.createRadialGradient(this.x, this.y, 10, this.x, this.y, 30);
      g.addColorStop(0, 'rgba(57,255,136,0)');
      g.addColorStop(0.8, 'rgba(57,255,136,' + (0.18 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(57,255,136,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,255,180,' + (0.55 * a).toFixed(3) + ')';
      ctx.lineWidth = 2; ctx.shadowBlur = 16; ctx.shadowColor = CONFIG.colors.green;
      ctx.beginPath(); ctx.arc(this.x, this.y, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  drawShip(ctx, px, py, now) {
    const id = this.fighter.id;
    ctx.save();
    ctx.translate(px, py);

    // 引擎尾焰（几何图形 + 闪烁）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 1 + Math.sin(now * 28 + px) * 0.18;
    const base = id === 1 ? 24 : id === 2 ? 26 : id === 3 ? 20 : 22;
    const flameLen = Number.isFinite(base * flick) ? base * flick : base;
    const fg = ctx.createLinearGradient(0, 8, 0, 8 + flameLen);
    fg.addColorStop(0, 'rgba(255,255,255,0.95)');
    fg.addColorStop(0.35, this.color);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.shadowBlur = 16; ctx.shadowColor = this.color;
    const drawFlame = (fx, fy) => {
      ctx.beginPath();
      ctx.moveTo(fx - 5, fy);
      ctx.quadraticCurveTo(fx, fy + flameLen * 1.15, fx + 5, fy);
      ctx.closePath(); ctx.fill();
    };
    if (id === 1) { drawFlame(-11, 12); drawFlame(11, 12); }        // 爆破：双引擎
    else if (id === 3) { drawFlame(-14, 12); drawFlame(14, 12); }   // 守护：宽体双引擎
    else drawFlame(0, 10);
    ctx.restore();

    // 战机贴图（AI 生成 PNG，透明底）；未加载完成时回退到矢量造型
    const img = ImgAssets.get(this.fighter.img);
    if (img) {
      const maxH = 74;
      let dw = img.naturalWidth * (maxH / img.naturalHeight);
      let dh = maxH;
      if (dw > 78) { dw = 78; dh = 78 * img.naturalHeight / img.naturalWidth; }
      ctx.save();
      if (id === 1) ctx.rotate(Math.PI);  // 爆破战机源图朝向下，旋转 180°
      ctx.shadowBlur = 18; ctx.shadowColor = this.color;
      ctx.drawImage(img, -dw / 2, -dh / 2 - 2, dw, dh);
      ctx.restore();
      ctx.restore();
      return;
    }

    // 机体轮廓（矢量兜底造型）
    ctx.beginPath();
    if (id === 0) {
      // 夜鹰：均衡滑翔型
      ctx.moveTo(0, -22); ctx.lineTo(6, -6); ctx.lineTo(19, 9); ctx.lineTo(10, 12);
      ctx.lineTo(4, 7); ctx.lineTo(-4, 7); ctx.lineTo(-10, 12); ctx.lineTo(-19, 9); ctx.lineTo(-6, -6);
    } else if (id === 1) {
      // 赤焰：利刃高速型
      ctx.moveTo(0, -26); ctx.lineTo(5, -5); ctx.lineTo(18, 5); ctx.lineTo(21, 16);
      ctx.lineTo(6, 10); ctx.lineTo(0, 16); ctx.lineTo(-6, 10); ctx.lineTo(-21, 16);
      ctx.lineTo(-18, 5); ctx.lineTo(-5, -5);
    } else {
      // 雷霆：重型宽体型
      ctx.moveTo(0, -18); ctx.lineTo(10, -6); ctx.lineTo(24, 9); ctx.lineTo(19, 16);
      ctx.lineTo(8, 12); ctx.lineTo(0, 17); ctx.lineTo(-8, 12); ctx.lineTo(-19, 16); ctx.lineTo(-24, 9); ctx.lineTo(-10, -6);
    }
    ctx.closePath();

    // 机身：深色金属渐变 + 主题色辉光描边
    const hull = ctx.createLinearGradient(0, -26, 0, 18);
    hull.addColorStop(0, '#14243a');
    hull.addColorStop(0.6, '#0a1524');
    hull.addColorStop(1, '#050b14');
    ctx.fillStyle = hull;
    ctx.shadowBlur = 18; ctx.shadowColor = this.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.color; ctx.lineWidth = 1.6; ctx.stroke();

    // 装甲高光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-14, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, 2); ctx.lineTo(14, 10); ctx.stroke();
    ctx.restore();

    // 座舱
    const cg = ctx.createLinearGradient(0, -14, 0, 2);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.5, this.color);
    cg.addColorStop(1, '#0a1a2b');
    ctx.fillStyle = cg;
    ctx.shadowBlur = 10; ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.ellipse(0, -5, 4.2, id === 1 ? 8 : 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 机头灯
    ctx.beginPath(); ctx.arc(0, id === 1 ? -24 : -20, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 8; ctx.shadowColor = this.color; ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  drawWingman(ctx, x, y, now) {
    ctx.save();
    ctx.translate(x, y);
    // 尾焰
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowBlur = 10; ctx.shadowColor = CONFIG.colors.orange;
    ctx.fillStyle = 'rgba(255,170,0,0.8)';
    ctx.beginPath();
    ctx.moveTo(-3, 8); ctx.lineTo(0, 14 + Math.sin(now * 30) * 2); ctx.lineTo(3, 8);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // 机体
    ctx.beginPath();
    ctx.moveTo(0, -10); ctx.lineTo(7, 6); ctx.lineTo(0, 3); ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fillStyle = '#0d1a2b';
    ctx.strokeStyle = CONFIG.colors.orange; ctx.lineWidth = 1.2;
    ctx.shadowBlur = 8; ctx.shadowColor = CONFIG.colors.orange;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}