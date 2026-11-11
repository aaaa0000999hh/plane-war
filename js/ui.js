// UI：星空背景 / HUD
"use strict";

// ---------- 科技风滚动星空 + 网格 ----------
class Starfield {
  constructor() {
    // 三层视差星空，营造纵深
    const specs = [
      { n: 90,  size: [0.5, 1.3], speed: [16, 44], alpha: 0.45 },
      { n: 56,  size: [1.0, 2.2], speed: [52, 108], alpha: 0.7 },
      { n: 26,  size: [1.8, 3.4], speed: [130, 240], alpha: 0.95, streak: true },
    ];
    this.layers = specs.map((sp) => {
      const arr = [];
      for (let i = 0; i < sp.n; i++) {
        arr.push({
          x: rand(0, CONFIG.width), y: rand(0, CONFIG.height),
          s: rand(sp.size[0], sp.size[1]), v: rand(sp.speed[0], sp.speed[1]),
          a: sp.alpha * rand(0.65, 1), streak: !!sp.streak,
        });
      }
      return arr;
    });
    this.layerAlpha = specs.map((sp) => sp.alpha);
    this.gridOffset = 0;
    this.gridColor = 'rgba(0,180,255,0.10)';
    this.nebula = this.makeNebula([
      { x: 0.18, y: 0.22, r: 300, col: [0, 150, 255] },
      { x: 0.82, y: 0.50, r: 340, col: [150, 0, 255] },
      { x: 0.40, y: 0.88, r: 280, col: [0, 220, 255] },
      { x: 0.72, y: 0.10, r: 220, col: [255, 0, 140] },
    ]);
    this.vignette = this.makeVignette();
    this.bgGrad = null;
  }

  // 按关卡切换星云配色与网格色
  setTheme(level) {
    if (!level) return;
    const cols = level.nebula;
    this.nebula = this.makeNebula([
      { x: 0.18, y: 0.22, r: 300, col: cols[0] },
      { x: 0.82, y: 0.50, r: 340, col: cols[1] },
      { x: 0.40, y: 0.88, r: 280, col: cols[2] },
      { x: 0.72, y: 0.10, r: 220, col: cols[3] },
    ]);
    this.gridColor = 'rgba(' + level.grid.join(',') + ',0.10)';
  }

  // 预渲染星云，避免逐帧创建渐变
  makeNebula(blobs) {
    const c = document.createElement('canvas');
    c.width = CONFIG.width; c.height = CONFIG.height;
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'lighter';
    for (const b of blobs) {
      const cx = b.x * CONFIG.width, cy = b.y * CONFIG.height;
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, b.r);
      rg.addColorStop(0, 'rgba(' + b.col[0] + ',' + b.col[1] + ',' + b.col[2] + ',0.20)');
      rg.addColorStop(0.45, 'rgba(' + b.col[0] + ',' + b.col[1] + ',' + b.col[2] + ',0.07)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(cx - b.r, cy - b.r, b.r * 2, b.r * 2);
    }
    return c;
  }

  // 预渲染暗角，提升画面档次
  makeVignette() {
    const c = document.createElement('canvas');
    c.width = CONFIG.width; c.height = CONFIG.height;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(CONFIG.width / 2, CONFIG.height / 2, CONFIG.height * 0.25, CONFIG.width / 2, CONFIG.height / 2, CONFIG.height * 0.72);
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = rg;
    g.fillRect(0, 0, CONFIG.width, CONFIG.height);
    return c;
  }

  update(dt) {
    for (const layer of this.layers) {
      for (const s of layer) {
        s.y += s.v * dt;
        if (s.y > CONFIG.height + 6) { s.y = -6; s.x = rand(0, CONFIG.width); }
      }
    }
    this.gridOffset = (this.gridOffset + 70 * dt) % 56;
  }

  draw(ctx) {
    const now = performance.now();
    // 夜空渐变
    if (!this.bgGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, CONFIG.height);
      g.addColorStop(0, '#04070f');
      g.addColorStop(0.55, '#071223');
      g.addColorStop(1, '#0a1830');
      this.bgGrad = g;
    }
    ctx.fillStyle = this.bgGrad;
    ctx.fillRect(-20, -20, CONFIG.width + 40, CONFIG.height + 40);

    // 星云（缓慢呼吸）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 + 0.2 * Math.sin(now * 0.0006);
    ctx.drawImage(this.nebula, 0, 0);
    ctx.restore();

    // 透视网格（合并为单条路径，减少状态切换）
    ctx.save();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 1;
    const step = 56;
    ctx.beginPath();
    for (let y = this.gridOffset - step; y < CONFIG.height; y += step) {
      ctx.moveTo(-20, y); ctx.lineTo(CONFIG.width + 20, y);
    }
    for (let x = 0; x < CONFIG.width; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.height);
    }
    ctx.stroke();
    ctx.restore();

    // 三层星点（按层设置透明度，光迹合并为单次描边）
    ctx.save();
    ctx.fillStyle = '#cfe9ff';
    ctx.strokeStyle = '#dff3ff';
    for (let li = 0; li < this.layers.length; li++) {
      const arr = this.layers[li];
      ctx.globalAlpha = this.layerAlpha[li];
      for (const s of arr) if (!s.streak) ctx.fillRect(s.x, s.y, s.s, s.s);
      let hasStreak = false;
      ctx.beginPath();
      for (const s of arr) {
        if (!s.streak) continue;
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x, s.y - s.v * 0.06);
        hasStreak = true;
      }
      if (hasStreak) { ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.restore();

    // 暗角
    ctx.drawImage(this.vignette, 0, 0);
  }
}

// ---------- HUD ----------
function drawBar(ctx, x, y, w, h, ratio, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(2,10,20,0.78)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = 'rgba(120,200,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
  const r = clamp(ratio, 0, 1);
  if (r > 0) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, color);
    g.addColorStop(1, '#eafcff');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, Math.max(0, w * r), h);
  }
  ctx.restore();
}

function drawHUD(ctx, game) {
  const duo = game.mode !== 'solo';
  const p1 = game.players[0] || game.player;
  const p2 = game.players[1];
  ctx.save();
  ctx.textBaseline = 'top';

  // 顶部信息面板（提升可读性，渐变只创建一次）
  if (!game._hudPanel) {
    const pg = ctx.createLinearGradient(0, 0, 0, 128);
    pg.addColorStop(0, 'rgba(2,8,18,0.78)');
    pg.addColorStop(1, 'rgba(2,8,18,0)');
    game._hudPanel = pg;
  }
  ctx.fillStyle = game._hudPanel;
  ctx.fillRect(0, 0, CONFIG.width, 128);

  // 关卡标签 + 局势等级
  if (game.stage) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = game.stage.color;
    ctx.shadowBlur = 8; ctx.shadowColor = game.stage.color;
    ctx.fillText('STAGE ' + game.stage.id + ' · ' + game.stage.name, CONFIG.width / 2, 8);
    ctx.shadowBlur = 0;
    if (game.tier) {
      ctx.fillStyle = game.tier.color;
      ctx.fillText('局势 · ' + game.tier.name, CONFIG.width / 2, 22);
    }
    ctx.textAlign = 'left';
  }

  if (!duo) {
    // 单人：HP / 分数 / 连击 / 装备
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#eaf6ff'; ctx.fillText('HP', 10, 10);
    drawBar(ctx, 34, 10, 120, 12, p1.hp / p1.maxHp, CONFIG.colors.green);

    ctx.fillStyle = '#eaf6ff'; ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'right';
    ctx.shadowBlur = 10; ctx.shadowColor = CONFIG.colors.cyan;
    ctx.fillText(String(game.score.score), CONFIG.width - 10, 8);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = CONFIG.colors.cyan;
    ctx.fillText('SCORE', CONFIG.width - 10, 30);

    if (game.score.combo >= 2) {
      ctx.textAlign = 'left';
      ctx.fillStyle = CONFIG.colors.orange;
      ctx.font = 'bold 14px monospace';
      ctx.shadowBlur = 8; ctx.shadowColor = CONFIG.colors.orange;
      ctx.fillText(game.score.combo + ' COMBO x' + game.score.mult, 10, 28);
      ctx.shadowBlur = 0;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = CONFIG.colors.cyan; ctx.font = 'bold 12px monospace';
    ctx.fillText('火力' + p1.weaponLevel + '  僚机' + p1.wingmen + '  导弹' + p1.missiles, 10, 48);
  } else {
    // 双人：左右 HP + 各自积分
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#00e5ff'; ctx.fillText('P1', 10, 10);
    drawBar(ctx, 34, 10, 120, 12, p1.hp / p1.maxHp, CONFIG.colors.green);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(String(p1.score), 10, 26);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff2d95'; ctx.fillText('P2', CONFIG.width - 10, 10);
    ctx.textAlign = 'left';
    drawBar(ctx, CONFIG.width - 154, 10, 120, 12, p2.hp / p2.maxHp, CONFIG.colors.magenta);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(String(p2.score), CONFIG.width - 10, 26);
    ctx.textAlign = 'left';

    // PK 倒计时
    if (game.mode === 'pk' && game.pkTimer > 0) {
      const t = Math.ceil(game.pkTimer);
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = t <= 10 ? CONFIG.colors.red : '#eaf6ff';
      ctx.shadowBlur = 10; ctx.shadowColor = t <= 10 ? CONFIG.colors.red : CONFIG.colors.cyan;
      ctx.fillText(t + 's', CONFIG.width / 2, 36);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }
  }

  // 底部技能栏（全部键盘触发）
  const sy = CONFIG.height - 34;
  ctx.fillStyle = 'rgba(2,8,18,0.72)';
  ctx.fillRect(0, sy, CONFIG.width, 34);
  ctx.strokeStyle = 'rgba(120,200,255,0.18)';
  ctx.beginPath(); ctx.moveTo(0.5, sy); ctx.lineTo(CONFIG.width, sy); ctx.stroke();
  ctx.font = 'bold 10px monospace';
  ctx.textBaseline = 'middle';

  const chip = (x, w, k, n, ok, note, right) => {
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillStyle = ok ? CONFIG.colors.cyan : '#5d7a91';
    ctx.fillText(k, right ? x + w - 8 : x + 8, sy + 12);
    ctx.fillStyle = ok ? '#eaf6ff' : '#7aa2bd';
    ctx.fillText(n, right ? x + w - 8 : x + 8, sy + 25);
    ctx.textAlign = right ? 'left' : 'right';
    ctx.fillStyle = ok ? CONFIG.colors.green : CONFIG.colors.orange;
    ctx.fillText(note, right ? x + 8 : x + w - 8, sy + 18);
  };

  if (!duo) {
    const cdC = Math.max(0, Math.ceil(p1.skillCd.clear));
    const cdS = Math.max(0, Math.ceil(p1.skillCd.shield));
    const cw = CONFIG.width / 4;
    chip(0 * cw, cw, 'Q', '清屏', cdC <= 0, cdC > 0 ? cdC + 's' : '就绪');
    chip(1 * cw, cw, 'E', '护盾', cdS <= 0, cdS > 0 ? cdS + 's' : '就绪');
    chip(2 * cw, cw, 'B', '炸弹', p1.bombs > 0, 'x' + p1.bombs);
    chip(3 * cw, cw, 'R', '投降', true, '随时');
  } else {
    const c1c = Math.max(0, Math.ceil(p1.skillCd.clear));
    const c1s = Math.max(0, Math.ceil(p1.skillCd.shield));
    chip(0, 80, 'Q', '清屏', c1c <= 0, c1c > 0 ? c1c + 's' : '就绪');
    chip(80, 80, 'E', '护盾', c1s <= 0, c1s > 0 ? c1s + 's' : '就绪');
    chip(160, 80, 'B', '炸弹', p1.bombs > 0, 'x' + p1.bombs);
    if (p2 && !p2.dead) {
      const c2c = Math.max(0, Math.ceil(p2.skillCd.clear));
      const c2s = Math.max(0, Math.ceil(p2.skillCd.shield));
      chip(240, 80, 'N', '清屏', c2c <= 0, c2c > 0 ? c2c + 's' : '就绪', true);
      chip(320, 80, 'M', '护盾', c2s <= 0, c2s > 0 ? c2s + 's' : '就绪', true);
      chip(400, 80, ',', '炸弹', p2.bombs > 0, 'x' + p2.bombs, true);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Boss 血条
  if (game.bossActive()) {
    const b = game.boss;
    const bh = 14, bw = CONFIG.width * 0.7, bx = (CONFIG.width - bw) / 2, by = 92;
    ctx.fillStyle = '#eaf6ff'; ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 8; ctx.shadowColor = CONFIG.colors.magenta;
    ctx.fillText('BOSS', CONFIG.width / 2, by - 16);
    ctx.shadowBlur = 0;
    drawBar(ctx, bx, by, bw, bh, b.hp / b.maxHp, CONFIG.colors.magenta);
    // Boss 受击时血条闪白，强化命中反馈
    if (b.flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.flash * 8) * 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), bh);
      ctx.restore();
    }
    ctx.textAlign = 'left';
  }
  ctx.restore();
}