// 主控：输入 / 游戏状态机 / 循环
"use strict";

class Game {
  constructor(canvas, overlay, audio) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.audio = audio;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = CONFIG.width * this.dpr;
    canvas.height = CONFIG.height * this.dpr;
    canvas.style.touchAction = 'none';

    this.starfield = new Starfield();
    this.particles = new ParticleSystem();
    this.score = new ScoreSystem();
    this.stats = new StatsSystem();

    this.state = 'menu';
    this.level = 1;
    this.levelIndex = 0;
    this.stage = CONFIG.levels[0];
    this.starfield.setTheme(this.stage);
    this.skillCd = { clear: 0, shield: 0 };
    this.cine = null;
    this.surrendered = false;
    this._levelFrom = 'select';
    this.shake = 0;
    this.hitFlash = 0;
    this.pickupFlash = 0;
    this.notice = null;
    // 双人模式
    this.mode = 'solo';                       // solo | coop | pk
    this.players = [];
    this._duoPick = { p1: 0, p2: 1 };
    this.pkTimer = 0;
    this.duoWinner = -1;
    // 动态难度与生涯
    this.tierIdx = 0;
    this.tier = CONFIG.difficulty[0];
    this.run = this.newRun();
    this._bossSoundT = 0;
    this._bossShakeT = 0;
    this.boss = null;
    this.bombCount = CONFIG.props.bombStart;
    this.currentFighter = 0;
    this.player = null;
    this.keys = {};
    this.input = { pointer: { x: CONFIG.width / 2, y: CONFIG.height - 100, active: false } };

    this.clearEntities();
    this.bindInput();
    this.showMenu();

    this.last = performance.now();
    this._acc = 0;
    this._loop = this.loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  clearEntities() {
    this.bullets = [];
    this.enemyBullets = [];
    this.missiles = [];
    this.enemies = [];
    this.props = [];
  }

  // ---------- 输入 ----------
  bindInput() {
    window.addEventListener('keydown', (e) => {
      this.audio.init();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k.startsWith('arrow') || ['w', 'a', 's', 'd'].includes(k)) this.input.pointer.active = false;
      if (k === ' ') {
        e.preventDefault();
        if (this.state === 'cinematic') { this.endCinematic(); return; }
        if (!e.repeat) this.manualFire(0);
        return;
      }
      if (k === 'enter') {
        e.preventDefault();
        if (this.state === 'cinematic') { this.endCinematic(); return; }
        if (!e.repeat) this.manualFire(1);
        return;
      }
      // 1P 技能（键盘左侧）
      if (k === 'q') { e.preventDefault(); this.useClear(0); }
      if (k === 'e') { e.preventDefault(); this.useShieldSkill(0); }
      if (k === 'b') { e.preventDefault(); this.useBomb(0); }
      // 2P 技能（键盘右侧）
      if (k === 'n') { e.preventDefault(); this.useClear(1); }
      if (k === 'm') { e.preventDefault(); this.useShieldSkill(1); }
      if (k === ',') { e.preventDefault(); this.useBomb(1); }
      if (k === 'r') { e.preventDefault(); this.surrender(); }
      if (k === 'p' || k === 'escape') this.togglePause();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

    const toGame = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (CONFIG.width / r.width), y: (e.clientY - r.top) * (CONFIG.height / r.height) };
    };
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toGame(e); this.input.pointer.x = p.x; this.input.pointer.y = p.y; this.input.pointer.active = true;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      this.audio.init();
      const p = toGame(e); this.input.pointer.x = p.x; this.input.pointer.y = p.y; this.input.pointer.active = true;
    });
  }

  // ---------- 弹丸/敌人辅助 ----------
  addBullet(x, y, vx, vy, damage, color, owner) { this.bullets.push(new Bullet(x, y, vx, vy, damage, color, owner)); }
  addEnemyBullet(x, y, vx, vy, color) { this.enemyBullets.push(new EnemyBullet(x, y, vx, vy, color)); }
  spawnMissile(x, y, owner) { this.missiles.push(new Missile(x, y, owner)); }
  bossActive() { return this.boss !== null && this.boss.hp > 0; }

  newRun() { return { kills: 0, maxCombo: 0, hitsTaken: 0, score: 0, stageCleared: false }; }

  // 距 (x,y) 最近的存活玩家（Boss 瞄准用）
  nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (!p || p.dead) continue;
      const d = dist(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---------- 音乐与动态难度 ----------
  musicStage() {
    if (this.bossActive() || this.state === 'bossWarn') return 'boss';
    if (this.state === 'playing') {
      if (this.tierIdx <= 1) return 'calm';
      if (this.tierIdx === 2) return 'build';
      return 'tense';
    }
    return 'calm';
  }
  refreshMusic() { this.audio.setMusic(this.musicStage()); }

  // 按本局得分升温难度
  updateDifficulty() {
    const tiers = CONFIG.difficulty;
    const s = this.mode === 'pk'
      ? Math.max(this.players[0] ? this.players[0].score : 0, this.players[1] ? this.players[1].score : 0)
      : this.score.score;
    let ti = 0;
    for (let i = 0; i < tiers.length; i++) if (s >= tiers[i].score) ti = i;
    if (ti !== this.tierIdx) {
      this.tierIdx = ti;
      this.tier = tiers[ti];
      if (ti > 0) {
        this.notice = { text: '局势升级 · ' + this.tier.name, color: this.tier.color, t: 1.8 };
        this.audio.warn();
        this.shake = Math.max(this.shake, 6);
      }
    }
  }

  // ---------- 流程 ----------
  startGame(fighterIndex, levelIndex) {
    this.mode = 'solo';
    this.currentFighter = fighterIndex;
    if (levelIndex !== undefined) this.levelIndex = levelIndex;
    this.level = this.levelIndex + 1;
    this.stage = CONFIG.levels[this.levelIndex] || CONFIG.levels[0];
    // 新开一局：重置本局分数与连击（下一关则延续）
    this.score.score = 0;
    this.score.combo = 0;
    this.score.comboTimer = 0;
    this.score.mult = 1;
    this.players = [this.makePlayer(fighterIndex, 0)];
    this.boot();
  }

  makePlayer(fighterIndex, idx) {
    const p = new Player(fighterIndex);
    p.playerIndex = idx;
    p.bombs = CONFIG.props.bombStart;
    p.skillCd = { clear: 0, shield: 0 };
    p.score = 0;
    p.respawnTimer = 0;
    p.control = null;   // 单人：键盘任意 + 指针
    return p;
  }

  resetDuoPlayers() {
    const a = this.makePlayer(this._duoPick.p1, 0);
    const b = this.makePlayer(this._duoPick.p2, 1);
    a.control = { left: 'a', right: 'd', up: 'w', down: 's', fire: ' ' };
    b.control = { left: 'arrowleft', right: 'arrowright', up: 'arrowup', down: 'arrowdown', fire: 'enter' };
    a.x = CONFIG.width * 0.3;
    b.x = CONFIG.width * 0.7;
    this.players = [a, b];
  }

  // 双人开局
  bootDuo(levelIndex) {
    if (levelIndex !== undefined) {
      this.levelIndex = levelIndex;
      this.level = levelIndex + 1;
      this.stage = CONFIG.levels[levelIndex] || CONFIG.levels[0];
    }
    this.score.score = 0; this.score.combo = 0; this.score.comboTimer = 0; this.score.mult = 1;
    this.resetDuoPlayers();
    this.boot();
  }

  nextLevel() {
    if (this.levelIndex + 1 >= CONFIG.levels.length) { this.showMenu(); return; }
    this.levelIndex++;
    this.level = this.levelIndex + 1;
    this.stage = CONFIG.levels[this.levelIndex];
    if (this.mode === 'solo') this.players = [this.makePlayer(this.currentFighter, 0)];
    else this.resetDuoPlayers();
    this.boot();
  }

  boot() {
    this.clearEntities();
    this.boss = null;
    this.cine = null;
    this.surrendered = false;
    this.duoWinner = -1;
    this.notice = null;
    this.player = this.players[0];
    this.bossKillCountdown = this.stage.killTarget;
    this.spawner = new EnemySpawner(this);
    this.starfield.setTheme(this.stage);
    this.state = 'playing';
    this.overlay.style.display = 'none';
    this.overlay.className = 'overlay';
    this.run = this.newRun();
    this.tierIdx = 0;
    this.tier = CONFIG.difficulty[0];
    this.pkTimer = this.mode === 'pk' ? CONFIG.duo.pkTime : 0;
    this.refreshMusic();
  }

  gameOver() {
    this.state = 'gameover';
    this.stats.total.games++;
    this.stats.save();
    const coins = this.score.end();
    this.showGameOver(coins, this.surrendered);
  }

  // 战斗结束过场动画（胜/败/投降）
  startCinematic(type) {
    if (this.state === 'cinematic') return;
    this.state = 'cinematic';
    this.cine = { type, t: 0, dur: type === 'win' ? 3.6 : 2.7 };
    this.overlay.style.display = 'none';
    this.shake = Math.max(this.shake, type === 'win' ? 12 : 8);
    if (type === 'surrender') this.audio.warn();
  }

  endCinematic() {
    if (this.state !== 'cinematic' || !this.cine) return;
    const type = this.cine.type;
    this.cine = null;
    if (type === 'win') {
      this.run.stageCleared = true;
      this.run.score = this.mode === 'pk'
        ? Math.max(this.players[0].score, this.players[1].score)
        : this.score.score;
      this.stats.total.maxStage = Math.max(this.stats.total.maxStage, this.stage.id);
      if (this.mode === 'coop') this.stats.total.coopClears++;
      this.checkAchievements();
      const coins = this.score.end();
      this.state = 'win';
      this.showWin(coins);
    } else if (type === 'duo') {
      this.checkAchievements();
      this.showDuoResult();
    } else {
      this.gameOver();
    }
  }

  // 双人模式结束（PK 计时到点 / 有人阵亡）
  endDuo(winnerIdx) {
    if (this.state === 'cinematic' || this.state !== 'playing' && this.state !== 'bossWarn') return;
    this.duoWinner = winnerIdx;
    if (this.mode === 'pk' && winnerIdx >= 0) this.stats.total.pkWins++;
    this.run.score = Math.max(this.players[0] ? this.players[0].score : 0, this.players[1] ? this.players[1].score : 0);
    this.stats.save();
    this.startCinematic('duo');
  }

  startBossWarning() {
    this.state = 'bossWarn';
    this.warnTimer = 2.2;
    const boss = new Boss(CONFIG.width / 2, -CONFIG.boss.radius * 3);
    boss.hp = boss.maxHp = Math.round(CONFIG.boss.hp * this.stage.bossMul);
    this.boss = boss;
    this.enemies.push(boss);
    this.audio.warn();
    this.shake = 14;
  }

  onBossPhaseChange() {
    this.audio.warn();
    this.shake = 12;
    this.buzz(35);
  }

  // ---------- 主体更新 ----------
  update(dt) {
    this.starfield.update(dt);
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - 50 * dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    this.pickupFlash = Math.max(0, this.pickupFlash - dt * 3);
    if (this.notice) { this.notice.t -= dt; if (this.notice.t <= 0) this.notice = null; }
    this.refreshMusic();

    if (this.state === 'playing' || this.state === 'bossWarn') {
      for (const p of this.players) {
        if (!p.skillCd) continue;
        p.skillCd.clear = Math.max(0, p.skillCd.clear - dt);
        p.skillCd.shield = Math.max(0, p.skillCd.shield - dt);
      }
      this.updateDifficulty();
    }

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'bossWarn') {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) this.state = 'playing';
    } else if (this.state === 'cinematic' && this.cine) {
      this.cine.t += dt;
      if (this.cine.t >= this.cine.dur) this.endCinematic();
    }
  }

  updatePlaying(dt) {
    // 每名玩家：移动 / 尾焰 / 开火
    for (const p of this.players) {
      if (p.dead) {
        if (this.mode === 'coop') {
          p.respawnTimer -= dt;
          if (p.respawnTimer <= 0) {
            p.dead = false;
            p.hp = Math.round(p.maxHp * 0.5);
            p.invuln = 2;
            p.x = CONFIG.width * (p.playerIndex === 0 ? 0.3 : 0.7);
            p.y = CONFIG.height - 90;
            this.audio.pickup();
            this.particles.spawnRing(p.x, p.y, p.color);
          }
        }
        continue;
      }
      const c = p.control;
      let mx = 0, my = 0;
      if (c) {
        if (this.keys[c.left]) mx--;
        if (this.keys[c.right]) mx++;
        if (this.keys[c.up]) my--;
        if (this.keys[c.down]) my++;
      } else {
        if (this.keys['arrowleft'] || this.keys['a']) mx--;
        if (this.keys['arrowright'] || this.keys['d']) mx++;
        if (this.keys['arrowup'] || this.keys['w']) my--;
        if (this.keys['arrowdown'] || this.keys['s']) my++;
      }
      if (!c && this.input.pointer.active && Number.isFinite(this.input.pointer.x) && Number.isFinite(this.input.pointer.y)) {
        const k = Math.min(1, dt * 14);
        p.x += (this.input.pointer.x - p.x) * k;
        p.y += (this.input.pointer.y - p.y) * k;
      } else {
        p.x += mx * p.speed * dt;
        p.y += my * p.speed * dt;
      }
      p.x = clamp(p.x, 12, CONFIG.width - 12);
      p.y = clamp(p.y, 50, CONFIG.height - 52);
      if (!Number.isFinite(p.x)) p.x = CONFIG.width / 2;
      if (!Number.isFinite(p.y)) p.y = CONFIG.height - 90;

      if (Math.random() < 0.6)
        this.particles.spawn(p.x + rand(-4, 4), p.y + 16, { vx: rand(-15, 15), vy: rand(60, 140), life: 0.3, color: p.color, size: 2 });

      p.update(dt, this);
    }

    this.spawner.update(dt);

    for (const e of this.enemies) if (!e.dead) e.update(dt, this);
    for (const b of this.bullets) if (!b.dead) b.update(dt);
    for (const b of this.enemyBullets) if (!b.dead) b.update(dt);
    for (const m of this.missiles) if (!m.dead) m.update(dt, this);
    for (const pr of this.props) if (!pr.dead) pr.update(dt);

    this.collide();

    // 玩家死亡 / PK 计时判定
    if (this.state !== 'playing') return;
    if (this.mode === 'pk') {
      this.pkTimer -= dt;
      for (let i = 0; i < 2; i++) {
        if (this.players[i].dead) { this.endDuo(1 - i); return; }
      }
      if (this.pkTimer <= 0) {
        const s1 = this.players[0].score, s2 = this.players[1].score;
        this.endDuo(s1 === s2 ? -1 : (s1 > s2 ? 0 : 1));
        return;
      }
    } else {
      const alive = this.players.filter((p) => !p.dead);
      if (alive.length === 0) {
        this.startCinematic('fail');
        return;
      }
    }

    // PK 模式本局得分实时更新
    if (this.mode === 'pk')
      this.run.score = Math.max(this.players[0].score, this.players[1].score);
    else
      this.run.score = this.score.score;

    // 清理
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.missiles = this.missiles.filter((m) => !m.dead);
    this.props = this.props.filter((pr) => !pr.dead);
    this.enemies = this.enemies.filter((e) => !e.dead && e.y < CONFIG.height + 120);

    this.score.update(dt);
  }

  collide() {
    // 玩家子弹 vs 敌机 / PK 对家
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (this.mode === 'pk' && b.owner >= 0) {
        const other = this.players[1 - b.owner];
        if (other && !other.dead && circleHit(b, other)) {
          b.dead = true;
          this.pkHit(b.owner, b.x, b.y);
          continue;
        }
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (circleHit(b, e)) {
          b.dead = true; e.takeDamage(b.damage);
          this.particles.explosion(b.x, b.y, b.color, 3, 0.4);
          if (e instanceof Boss) this.bossHitFeedback(b.x, b.y);
          if (e.dead) this.killEnemy(e, b.owner); break;
        }
      }
    }
    // 导弹 vs 敌机
    for (const m of this.missiles) {
      if (m.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (circleHit(m, e)) {
          m.dead = true; e.takeDamage(m.damage);
          this.particles.explosion(m.x, m.y, CONFIG.colors.purple, 10);
          if (e instanceof Boss) this.bossHitFeedback(m.x, m.y);
          if (e.dead) this.killEnemy(e, m.owner); break;
        }
      }
    }
    // 敌弹 vs 玩家
    for (const b of this.enemyBullets) {
      if (b.dead) continue;
      for (const p of this.players) {
        if (p.dead) continue;
        if (circleHit(b, p)) { b.dead = true; this.hitPlayer(p, 10); break; }
      }
    }
    // 敌机 vs 玩家（撞击）
    for (const e of this.enemies) {
      if (e.dead) continue;
      for (const p of this.players) {
        if (p.dead) continue;
        if (circleHit(e, p)) {
          this.hitPlayer(p, 20);
          if (!(e instanceof Boss)) { e.takeDamage(50); if (e.dead) this.killEnemy(e, -1); }
          break;
        }
      }
    }
    // 道具 vs 玩家
    for (const pr of this.props) {
      if (pr.dead) continue;
      for (const p of this.players) {
        if (p.dead) continue;
        if (circleHit(pr, p)) { pr.dead = true; this.applyProp(pr.type, p); break; }
      }
    }
  }

  // PK：命中对方玩家
  pkHit(attackerIdx, x, y) {
    const atk = this.players[attackerIdx];
    const other = this.players[1 - attackerIdx];
    if (!other || other.dead) return;
    other.invuln = 0;   // PK 不吃长无敌帧，避免打不动
    if (other.takeDamage(CONFIG.duo.pkHitDamage)) {
      this.audio.playerHit();
      this.shake = Math.max(this.shake, 6);
      this.hitFlash = 0.2;
    }
    atk.score += CONFIG.duo.pkHitScore;
    this.particles.explosion(x, y, atk.color, 6, 0.6);
  }

  hitPlayer(p, d) {
    if (p.takeDamage(d)) {
      this.audio.playerHit();
      this.shake = Math.max(this.shake, 10);
      this.hitFlash = 0.3;
      this.buzz(25);
      this.run.hitsTaken++;
      if (p.dead) {
        this.particles.explosion(p.x, p.y, p.color, 40, 1.5);
        p.respawnTimer = CONFIG.duo.respawnTime;
      }
    }
  }

  buzz(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // Boss 受击反馈：火花 + 清脆命中音 + 轻微震屏（带节流，避免噪音/抖动过度）
  bossHitFeedback(x, y) {
    const now = performance.now();
    this.particles.explosion(x, y, CONFIG.colors.magenta, 5, 0.5);
    if (now - this._bossSoundT > 55) { this._bossSoundT = now; this.audio.bossHit(); }
    if (now - this._bossShakeT > 90) { this._bossShakeT = now; this.shake = Math.max(this.shake, 3); }
  }

  killEnemy(e, ownerIdx) {
    // PK 模式记分给击杀者，其余模式进总分
    if (this.mode === 'pk' && ownerIdx >= 0 && this.players[ownerIdx]) this.players[ownerIdx].score += e.score;
    else this.score.addKill(e.score);
    this.run.kills++;
    this.stats.total.kills++;
    this.run.maxCombo = Math.max(this.run.maxCombo, this.score.combo);
    this.particles.explosion(e.x, e.y, e.color, 22, 1.2);
    if (e instanceof Boss) {
      this.audio.bossExplode();
      this.shake = 28;
      this.buzz(80);
      this.stats.total.bossKills++;
      this.particles.explosion(e.x, e.y, CONFIG.colors.magenta, 60, 2.2);
      this.particles.spawnRing(e.x, e.y, CONFIG.colors.magenta);
      this.particles.spawnRing(e.x, e.y, '#ffffff');
      this.pickupFlash = 0.5;   // 白屏终结闪光
      this.boss = null;
      this.enemyBullets.length = 0;
      this.onBossDefeated();
    } else {
      this.audio.explode();
      this.shake = Math.max(this.shake, 6);
      if (e instanceof EnemyElite) this.particles.spawnRing(e.x, e.y, e.color);
      if (Math.random() < CONFIG.props.dropRate) this.props.push(new Prop(e.x, e.y));
      this.bossKillCountdown--;
      if (this.bossKillCountdown <= 0 && this.boss === null && this.state === 'playing') this.startBossWarning();
    }
    this.checkAchievements();
  }

  onBossDefeated() {
    this.startCinematic('win');
  }

  applyProp(type, p) {
    p = p || this.player;
    this.audio.pickup();
    this.buzz(15);
    this.particles.converge(p.x, p.y, CONFIG.colors.cyan, p.x, p.y, 10);
    this.pickupFlash = Math.max(this.pickupFlash, 0.22);
    if (type === 'P') { p.weaponLevel = Math.min(5, p.weaponLevel + 1); }
    else if (type === 'W') { p.wingmen = Math.min(CONFIG.wingmanMax, p.wingmen + 1); }
    else if (type === 'S') { p.shield = CONFIG.props.shieldTime / 1000; this.audio.shield(); }
    else if (type === 'B') { p.bombs++; }
    else if (type === 'H') { p.hp = Math.min(p.maxHp, p.hp + CONFIG.props.healAmount); }
    else if (type === 'M') { p.missiles += CONFIG.props.missileCount; }
  }

  useBomb(i) {
    const p = this.players[i || 0];
    if (!p || p.dead || p.bombs <= 0 || (this.state !== 'playing' && this.state !== 'bossWarn')) return;
    p.bombs--;
    this.audio.bomb();
    this.buzz(60);
    this.shake = 20;
    this.enemyBullets.length = 0;
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      if (e instanceof Boss) { e.takeDamage(600); if (e.dead) this.killEnemy(e, i); }
      else { e.dead = true; this.killEnemy(e, i); }
    }
    this.particles.explosion(CONFIG.width / 2, CONFIG.height / 2, CONFIG.colors.orange, 60, 2);
    this.particles.spawnRing(CONFIG.width / 2, CONFIG.height / 2, CONFIG.colors.orange);
  }

  // 空格/回车：立即开火（自动开火常驻，按住开火键还会加快射速）
  manualFire(i) {
    const p = this.players[i || 0];
    if (this.state !== 'playing' || !p || p.dead) return;
    if (p.fireTimer > 0) return;
    p.fire(this);
  }

  // 清屏技能（1P=Q / 2P=N）：清空敌弹 + 重创全场敌人
  useClear(i) {
    const p = this.players[i || 0];
    if (this.state !== 'playing' || !p || p.dead || p.skillCd.clear > 0) return;
    p.skillCd.clear = CONFIG.skills.clear.cd;
    this.enemyBullets.length = 0;
    this.audio.bomb();
    this.buzz(50);
    this.shake = Math.max(this.shake, 18);
    this.particles.explosion(CONFIG.width / 2, CONFIG.height / 2, CONFIG.colors.cyan, 60, 2);
    this.particles.spawnRing(CONFIG.width / 2, CONFIG.height / 2, CONFIG.colors.cyan);
    for (const e of [...this.enemies]) {
      if (e.dead) continue;
      if (e instanceof Boss) e.takeDamage(600);
      else e.takeDamage(99999);
      if (e.dead) this.killEnemy(e, i);
    }
  }

  // 护盾技能（1P=E / 2P=M）：4 秒无敌
  useShieldSkill(i) {
    const p = this.players[i || 0];
    if (this.state !== 'playing' || !p || p.dead || p.skillCd.shield > 0) return;
    p.skillCd.shield = CONFIG.skills.shield.cd;
    p.shield = Math.max(p.shield, CONFIG.skills.shield.time);
    this.audio.shield();
    this.buzz(20);
    this.particles.explosion(p.x, p.y, CONFIG.colors.green, 16, 0.8);
    this.particles.spawnRing(p.x, p.y, CONFIG.colors.green);
  }

  // R：一键投降
  surrender() {
    if (this.state !== 'playing' && this.state !== 'bossWarn' && this.state !== 'paused') return;
    this.surrendered = true;
    this.stats.total.surrenders++;
    this.stats.save();
    this.startCinematic('surrender');
  }

  // 成就判定
  checkAchievements() {
    const s = this.stats.total;
    s.coins = this.score.coins;
    for (const a of CONFIG.achievements) {
      if (this.stats.ach[a.id]) continue;
      let ok = false;
      try { ok = a.check(s, this.run); } catch (e) {}
      if (ok) {
        this.stats.ach[a.id] = Date.now();
        this.stats.save();
        this.showToast('成就解锁 · ' + a.name, a.desc, '#ffd23f');
      }
    }
  }

  // 成就/提示浮层
  showToast(title, sub, color) {
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.style.setProperty('--tc', color || '#ffd23f');
    el.innerHTML = '<b>' + title + '</b><span>' + sub + '</span>';
    this.canvas.parentElement.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    this.audio.medal();
  }

  togglePause() {
    if (this.state === 'playing' || this.state === 'bossWarn') {
      this.audio.init();
      this.state = 'paused';
      this.showPause();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  resume() {
    this.state = this.boss ? 'bossWarn' : 'playing';
    if (this.state === 'bossWarn') this.warnTimer = Math.max(this.warnTimer, 0.3);
    this.overlay.style.display = 'none';
  }

  // ---------- 渲染 ----------
  render() {
    const ctx = this.ctx;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, sx * this.dpr, sy * this.dpr);

    this.starfield.draw(ctx);

    const inGame = ['playing', 'bossWarn', 'win', 'gameover', 'paused', 'cinematic'].includes(this.state) && this.player;
    if (inGame) {
      for (const pr of this.props) pr.draw(ctx);
      for (const e of this.enemies) {
        e.draw(ctx);
        if (e.drawTaunt) e.drawTaunt(ctx);
        // 受击闪白，强化打击反馈（Boss 用外圈闪光，避免持续全身高亮）
        if (e.flash > 0 && !(e instanceof Boss)) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, e.flash * 9) * 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else if (e.flash > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.min(1, e.flash * 10) * 0.6;
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
      for (const b of this.bullets) b.draw(ctx);
      for (const b of this.enemyBullets) b.draw(ctx);
      for (const m of this.missiles) m.draw(ctx);
      for (const p of this.players) if (p && !p.dead) p.draw(ctx);
      // 双人模式玩家标签
      if (this.mode !== 'solo') {
        ctx.save();
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        for (const p of this.players) {
          if (!p || p.dead) continue;
          ctx.fillStyle = p.playerIndex === 0 ? '#00e5ff' : '#ff2d95';
          ctx.fillText(p.playerIndex === 0 ? 'P1' : 'P2', p.x, p.y - 34);
        }
        ctx.restore();
      }
      this.particles.draw(ctx);
      if (this.state !== 'cinematic') drawHUD(ctx, this);
      // 中央提示（难度升级等）
      if (this.notice && this.state === 'playing') {
        const a = Math.min(1, this.notice.t * 2);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = this.notice.color;
        ctx.shadowBlur = 16; ctx.shadowColor = this.notice.color;
        ctx.fillText(this.notice.text, CONFIG.width / 2, CONFIG.height * 0.38);
        ctx.restore();
      }
    }
    if (this.state === 'bossWarn') this.drawBossIntro(ctx);
    // 受击红色闪屏
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,60,60,' + (this.hitFlash * 0.32).toFixed(3) + ')';
      ctx.fillRect(-20, -20, CONFIG.width + 40, CONFIG.height + 40);
      ctx.restore();
    }
    // 拾取/终结白色高亮
    if (this.pickupFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,255,255,' + (this.pickupFlash * 0.22).toFixed(3) + ')';
      ctx.fillRect(-20, -20, CONFIG.width + 40, CONFIG.height + 40);
      ctx.restore();
    }
    // 战斗结束 CG
    if (this.state === 'cinematic' && this.cine) this.drawCinematic(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Boss 出场 CG：黑边 + 警示条纹 + 闪烁警告
  drawBossIntro(ctx) {
    const total = 2.2;
    const p = clamp(1 - this.warnTimer / total, 0, 1);
    const barH = 64 * Math.min(1, p * 2.5);
    ctx.save();
    // 上下黑边
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CONFIG.width, barH);
    ctx.fillRect(0, CONFIG.height - barH, CONFIG.width, barH);
    // 警示条纹
    if (barH > 10) {
      ctx.fillStyle = 'rgba(255,60,60,0.85)';
      for (let x = -40; x < CONFIG.width + 40; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + 18, 0); ctx.lineTo(x - 6, barH); ctx.lineTo(x - 24, barH);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 24, CONFIG.height - barH); ctx.lineTo(x + 42, CONFIG.height - barH);
        ctx.lineTo(x + 18, CONFIG.height); ctx.lineTo(x, CONFIG.height);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,220,120,0.9)';
      ctx.fillRect(0, barH - 2, CONFIG.width, 2);
      ctx.fillRect(0, CONFIG.height - barH, CONFIG.width, 2);
    }
    // 闪烁警告
    if (this.warnTimer > 0.4) {
      const blink = Math.sin(performance.now() * 0.02) > -0.2;
      if (blink) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 46px monospace';
        ctx.fillStyle = CONFIG.colors.red;
        ctx.shadowBlur = 26; ctx.shadowColor = CONFIG.colors.red;
        ctx.fillText('⚠ WARNING', CONFIG.width / 2, CONFIG.height / 2 - 44);
        ctx.shadowBlur = 0;
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#ffd9d9';
        ctx.fillText('歼灭者 MK-I 来袭', CONFIG.width / 2, CONFIG.height / 2 - 6);
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(255,180,180,0.75)';
        ctx.fillText('HP ×' + this.stage.bossMul + ' · 弹幕模式：螺旋 → 扇形 → 环形', CONFIG.width / 2, CONFIG.height / 2 + 18);
      }
    }
    ctx.restore();
  }

  // 过场动画：黑边 + 标题 + 关卡信息
  drawCinematic(ctx) {
    const { t, dur, type } = this.cine;
    const p = Math.min(1, t / 0.5);
    const barH = 62 * Math.min(1, p * 1.2);
    ctx.save();
    // 上下黑边
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CONFIG.width, barH);
    ctx.fillRect(0, CONFIG.height - barH, CONFIG.width, barH);
    // 标题淡入
    const textA = Math.min(1, Math.max(0, (t - 0.25) / 0.5));
    const win = type === 'win';
    const duo = type === 'duo';
    const title = win ? 'MISSION CLEAR' : duo ? 'DUEL OVER' : 'MISSION FAILED';
    const sub = win ? 'BOSS 已歼灭 · 区域已解放'
      : duo ? (this.duoWinner >= 0 ? ((this.duoWinner === 0 ? 'P1' : 'P2') + ' 胜 出') : '战 成 平 局')
      : (type === 'surrender' ? '你已主动投降' : '机体损毁');
    ctx.globalAlpha = textA;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px monospace';
    const mainColor = win ? CONFIG.colors.cyan : duo ? CONFIG.colors.magenta : CONFIG.colors.red;
    ctx.fillStyle = mainColor;
    ctx.shadowBlur = 22; ctx.shadowColor = mainColor;
    ctx.fillText(title, CONFIG.width / 2, CONFIG.height / 2 - 34);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(sub, CONFIG.width / 2, CONFIG.height / 2 + 8);
    ctx.font = '12px monospace';
    ctx.fillStyle = 'rgba(159,195,217,0.85)';
    ctx.fillText('STAGE ' + this.stage.id + ' · ' + this.stage.name, CONFIG.width / 2, CONFIG.height / 2 + 34);
    ctx.fillStyle = 'rgba(120,160,190,0.6)';
    ctx.fillText('按 空格 跳过', CONFIG.width / 2, CONFIG.height - barH + 24);
    ctx.restore();
  }

  loop(now) {
    requestAnimationFrame(this._loop);
    const raw = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;
    this._acc += raw;
    // 高刷新率屏幕限帧，避免重复渲染浪费性能
    if (this._acc < 0.014) return;
    const dt = Math.min(0.05, this._acc);
    this._acc -= 0.014;
    this.update(dt);
    this.render();
  }

  // ---------- 菜单 ----------
  showMenu() {
    this.state = 'menu';
    this.player = null;
    this.levelIndex = 0;
    this.stage = CONFIG.levels[0];
    this.starfield.setTheme(this.stage);
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen menu-screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">SYSTEM ONLINE</span>
        </div>
        <div class="hero">
          <div class="hero-ship"><img class="hero-img" src="assets/images/fighters/fighter_balanced.png" alt=""></div>
          <h1 class="title">星 际 战 机</h1>
          <div class="subtitle">STARFIELD STRIKE</div>
        </div>
        <div class="menu-stats">
          <div><span>最高分</span><b>${this.score.best}</b></div>
          <div><span>金币</span><b>${this.score.coins}</b></div>
        </div>
        <div class="actions">
          <button class="btn primary big" data-act="start">单 人 出 击</button>
          <button class="btn" data-act="duo">双 人 模 式</button>
          <button class="btn" data-act="gallery">勋 章 展 馆</button>
          <button class="btn" data-act="about">关 于 / 操 作 说 明</button>
        </div>
        <div class="tip">开始 → 选择战机 → 选择关卡 → 战斗 → 结算</div>
        <div class="key-hint">空格 开火 · Q 清屏 · E 护盾 · B 炸弹 · R 投降 · P 暂停</div>
      </div>`;
    this.bindOverlay({ start: () => this.showSelect(), duo: () => this.showDuoMode(), gallery: () => this.showGallery(), about: () => this.showAbout() });
  }

  // 双人模式选择
  showDuoMode() {
    this.state = 'menu';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">DUO MODE</span>
        </div>
        <h1 class="title">双 人 模 式</h1>
        <div class="subtitle">TWO PILOTS, ONE SCREEN</div>
        <div class="stage-grid duo-grid">
          <div class="stage-card" data-act="coop" style="--c:#00e5ff">
            <div class="st-top"><span class="st-name">协力作战</span><span class="st-code">CO-OP</span></div>
            <div class="st-meta">双人同阵营闯关，共享 BOSS 战，阵亡 4 秒后复活</div>
            <div class="st-diff"><i class="on"></i><i class="on"></i><i></i><i></i><i></i></div>
          </div>
          <div class="stage-card" data-act="pk" style="--c:#ff2d95">
            <div class="st-top"><span class="st-name">巅峰对决</span><span class="st-code">DUEL</span></div>
            <div class="st-meta">双向对轰，${CONFIG.duo.pkTime} 秒内积分高者获胜</div>
            <div class="st-diff"><i class="on"></i><i class="on"></i><i class="on"></i><i class="on"></i><i></i></div>
          </div>
        </div>
        <div class="key-hint">1P：WASD 移动 · 空格开火 · Q 清屏 · E 护盾 · B 炸弹<br>2P：方向键移动 · 回车开火 · N 清屏 · M 护盾 · , 炸弹</div>
        <div class="actions">
          <button class="btn ghost" data-act="back">返回主菜单</button>
        </div>
      </div>`;
    this.bindOverlay({
      coop: () => { this.mode = 'coop'; this.showSelect('p1'); },
      pk: () => { this.mode = 'pk'; this.showSelect('p1'); },
      back: () => { this.mode = 'solo'; this.showMenu(); },
    });
  }

  showAbout() {
    this.state = 'menu';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">ABOUT</span>
        </div>
        <h1 class="title">关于 / 操作说明</h1>
        <div class="subtitle">PILOT MANUAL</div>
        <div class="about-list">
          <div><span class="key">WASD</span> 或方向键移动，鼠标/触屏拖动同样可用</div>
          <div><span class="key">空格</span> 立即开火，按住可加快射速（自动开火常驻）</div>
          <div><span class="key">Q</span> 一键清屏：清除全部敌弹并重创敌人（冷却 ${CONFIG.skills.clear.cd}s）</div>
          <div><span class="key">E</span> 护盾技能：无敌 ${CONFIG.skills.shield.time}s（冷却 ${CONFIG.skills.shield.cd}s）</div>
          <div><span class="key">B</span> 炸弹：清弹幕 + 秒杀小怪 + 重创 BOSS</div>
          <div><span class="key">R</span> 一键投降：立即结束本局</div>
          <div><span class="key">P</span> / <span class="key">ESC</span> 暂停，可暂停中跳关或投降</div>
        </div>
        <div class="about-note">纯前端实现：Canvas 2D 矢量绘制 + Web Audio 合成音效，无外部素材依赖。</div>
        <div class="actions">
          <button class="btn primary" data-act="back">返 回 主 菜 单</button>
        </div>
      </div>`;
    this.bindOverlay({ back: () => this.showMenu() });
  }

  showSelect(role) {
    this.state = 'select';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    const isDuo = this.mode !== 'solo';
    const cur = role === 'p2' ? this._duoPick.p2 : role === 'p1' ? this._duoPick.p1 : this.currentFighter;
    const label = role === 'p1' ? '1P 战机（WASD + 空格 + Q/E/B）' : role === 'p2' ? '2P 战机（方向键 + 回车 + N/M/,）' : '';
    const step = role === 'p1' ? 'STEP 1 / 3 · 1P 机体' : role === 'p2' ? 'STEP 1 / 3 · 2P 机体' : 'STEP 1 / 3 · 机体';
    const cards = CONFIG.fighters.map((f, i) => `
      <div class="fighter-card ${i === cur ? 'active' : ''}" data-idx="${i}" style="--c:${f.color}">
        <div class="ship-preview"><img class="ship-img" src="${f.img}" alt="${f.name}"></div>
        <div class="fc-name">${f.name}</div>
        <div class="fc-desc">${f.desc}</div>
        <div class="fc-stats">HP ${f.hp}<br>攻 ×${f.damage} · 速 ${f.speed}</div>
      </div>`).join('');
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">${step}</span>
        </div>
        <h1 class="title">${isDuo ? '选择 ' + (role === 'p1' ? '1P' : '2P') + ' 战机' : '选择战机'}</h1>
        <div class="subtitle">${label || 'SELECT AIRFRAME'}</div>
        <div class="fighters">${cards}</div>
        <div class="actions">
          <button class="btn primary big" data-act="next">${role === 'p1' ? '下 一 步 · 2P 选机' : '下 一 步 · 选择关卡'}</button>
          <button class="btn ghost" data-act="back">返回</button>
        </div>
      </div>`;
    this.overlay.querySelectorAll('.fighter-card').forEach((c) => {
      c.onclick = () => {
        const idx = parseInt(c.dataset.idx, 10);
        if (role === 'p1') this._duoPick.p1 = idx;
        else if (role === 'p2') this._duoPick.p2 = idx;
        else this.currentFighter = idx;
        this.overlay.querySelectorAll('.fighter-card').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
      };
    });
    this.bindOverlay({
      next: () => (role === 'p1' ? this.showSelect('p2') : this.showLevelSelect(isDuo ? 'duo' : 'select')),
      back: () => {
        if (role === 'p2') return this.showSelect('p1');
        if (isDuo) return this.showDuoMode();
        this.showMenu();
      },
    });
  }

  showLevelSelect(from) {
    this.state = 'levelSelect';
    this._levelFrom = from || 'select';
    this._pickLevel = this.levelIndex;
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    const cards = CONFIG.levels.map((lv, i) => {
      const dots = Array.from({ length: 5 }, (_, d) => `<i class="${d < lv.id ? 'on' : ''}"></i>`).join('');
      return `
      <div class="stage-card ${i === this.levelIndex ? 'active' : ''}" data-idx="${i}" style="--c:${lv.color}">
        <div class="st-top"><span class="st-name">${lv.name}</span><span class="st-code">${lv.code}</span></div>
        <div class="st-meta">敌机 ×${lv.hpMul} · BOSS ×${lv.bossMul}</div>
        <div class="st-diff">${dots}</div>
      </div>`;
    }).join('');
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">STEP 2 / 3 · 关卡</span>
        </div>
        <h1 class="title">选择关卡</h1>
        <div class="subtitle">SELECT MISSION</div>
        <div class="stage-grid">${cards}</div>
        <div class="actions">
          <button class="btn primary big" data-act="go">进 入 战 斗</button>
          <button class="btn ghost" data-act="back">${this._levelFrom === 'pause' ? '返回暂停菜单' : '返回选机'}</button>
        </div>
      </div>`;
    this.overlay.querySelectorAll('.stage-card').forEach((c) => {
      c.onclick = () => {
        this._pickLevel = parseInt(c.dataset.idx, 10);
        this.overlay.querySelectorAll('.stage-card').forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
      };
    });
    this.bindOverlay({
      go: () => (this._levelFrom === 'duo' ? this.bootDuo(this._pickLevel) : this.startGame(this.currentFighter, this._pickLevel)),
      back: () => (this._levelFrom === 'pause' ? this.showPause() : this._levelFrom === 'duo' ? this.showSelect('p2') : this.showSelect()),
    });
  }

  // 双人结算（PK 比分 / 协力通关）
  showDuoResult() {
    const p1 = this.players[0], p2 = this.players[1];
    const coins = Math.floor((p1.score + p2.score) / 200);
    this.score.coins += coins;
    this.score.save();
    this.state = 'duoResult';
    const isPk = this.mode === 'pk';
    const winnerName = this.duoWinner >= 0 ? CONFIG.fighters[this.duoWinner === 0 ? this._duoPick.p1 : this._duoPick.p2].name : '平局';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">${isPk ? 'DUEL RESULT' : 'CO-OP RESULT'}</span>
        </div>
        <h1 class="title">${isPk ? '对 决 结 束' : '任 务 结 束'}</h1>
        <div class="subtitle">${isPk ? (this.duoWinner >= 0 ? '胜者 · ' + winnerName : '战 成 平 局') : 'SHARED VICTORY'}</div>
        <div class="duo-board">
          <div class="duo-row ${this.duoWinner === 0 ? 'win' : ''}" style="--c:${CONFIG.fighters[this._duoPick.p1].color}">
            <span>P1 · ${CONFIG.fighters[this._duoPick.p1].name}</span><b>${p1.score}</b>
          </div>
          <div class="duo-row ${this.duoWinner === 1 ? 'win' : ''}" style="--c:${CONFIG.fighters[this._duoPick.p2].color}">
            <span>P2 · ${CONFIG.fighters[this._duoPick.p2].name}</span><b>${p2.score}</b>
          </div>
        </div>
        <div class="result">金币 +<b>${coins}</b></div>
        <div class="actions">
          <button class="btn primary" data-act="retry">再 来 一 局</button>
          <button class="btn ghost" data-act="stage">更 换 关 卡</button>
          <button class="btn ghost" data-act="menu">返回主菜单</button>
        </div>
      </div>`;
    this.bindOverlay({
      retry: () => this.bootDuo(this.levelIndex),
      stage: () => this.showLevelSelect('duo'),
      menu: () => { this.mode = 'solo'; this.showMenu(); },
    });
  }

  // 勋章展馆：时间轴展示已获得/未获得的成就
  showGallery() {
    this.state = 'menu';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    const unlocked = CONFIG.achievements.filter((a) => this.stats.ach[a.id])
      .sort((x, y) => this.stats.ach[y.id] - this.stats.ach[x.id]);
    const locked = CONFIG.achievements.filter((a) => !this.stats.ach[a.id]);
    const items = unlocked.concat(locked).map((a) => {
      const ts = this.stats.ach[a.id];
      const time = ts ? new Date(ts).toLocaleString('zh-CN', { hour12: false }) : '未达成';
      return `
        <div class="ach-item ${ts ? '' : 'locked'}">
          <div class="ach-badge">${a.icon}</div>
          <div class="ach-info">
            <div class="ach-name">${a.name}</div>
            <div class="ach-desc">${a.desc}</div>
          </div>
          <div class="ach-time">${time}</div>
        </div>`;
    }).join('');
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">MEDAL HALL · ${unlocked.length}/${CONFIG.achievements.length}</span>
        </div>
        <h1 class="title">勋 章 展 馆</h1>
        <div class="subtitle">HALL OF HONOR</div>
        <div class="ach-timeline">${items}</div>
        <div class="actions">
          <button class="btn primary" data-act="back">返 回 主 菜 单</button>
        </div>
      </div>`;
    this.bindOverlay({ back: () => this.showMenu() });
  }

  showGameOver(coins, surrendered) {
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">MISSION FAILED</span>
        </div>
        <h1 class="title danger">${surrendered ? '已 投 降' : '任 务 失 败'}</h1>
        <div class="subtitle">${surrendered ? 'SURRENDERED' : 'AIRFRAME DESTROYED'}</div>
        <div class="result">得分 <b>${this.score.score}</b></div>
        <div class="result">最高分 <b>${this.score.best}</b></div>
        <div class="result">金币 +<b>${coins}</b></div>
        <div class="result small">STAGE ${this.stage.id} · ${this.stage.name}</div>
        <div class="actions">
          <button class="btn primary" data-act="retry">再 来 一 局</button>
          <button class="btn ghost" data-act="stage">更 换 关 卡</button>
          <button class="btn ghost" data-act="menu">返回主菜单</button>
        </div>
      </div>`;
    this.bindOverlay({
      retry: () => (this.mode === 'solo' ? this.startGame(this.currentFighter, this.levelIndex) : this.bootDuo(this.levelIndex)),
      stage: () => this.showLevelSelect(this.mode === 'solo' ? 'select' : 'duo'),
      menu: () => { this.mode = 'solo'; this.showMenu(); },
    });
  }

  showWin(coins) {
    const last = this.levelIndex >= CONFIG.levels.length - 1;
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">MISSION CLEAR</span>
        </div>
        <h1 class="title">${last ? '全 部 通 关' : '关 卡 完 成'}</h1>
        <div class="subtitle">${last ? 'ALL SECTORS LIBERATED' : 'STAGE ' + this.stage.id + ' CLEAR · ' + this.stage.name}</div>
        <div class="result">得分 <b>${this.score.score}</b></div>
        <div class="result">最高分 <b>${this.score.best}</b></div>
        <div class="result">金币 +<b>${coins}</b></div>
        <div class="actions">
          <button class="btn primary" data-act="${last ? 'retry' : 'next'}">${last ? '再 次 挑 战' : '下 一 关'}</button>
          <button class="btn ghost" data-act="stage">选 择 关 卡</button>
          <button class="btn ghost" data-act="menu">返回主菜单</button>
        </div>
      </div>`;
    this.bindOverlay({
      next: () => this.nextLevel(),
      retry: () => (this.mode === 'solo' ? this.startGame(this.currentFighter, this.levelIndex) : this.bootDuo(this.levelIndex)),
      stage: () => this.showLevelSelect(this.mode === 'solo' ? 'select' : 'duo'),
      menu: () => { this.mode = 'solo'; this.showMenu(); },
    });
  }

  showPause() {
    this.state = 'paused';
    this.overlay.style.display = 'flex';
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="screen">
        <div class="screen-head">
          <span class="brand">STRIKE FORCE</span>
          <span class="step">PAUSED · STAGE ${this.stage.id}</span>
        </div>
        <h1 class="title">已 暂 停</h1>
        <div class="subtitle">${this.stage.name}</div>
        <div class="key-hint">Q 清屏 · E 护盾 · B 炸弹 · R 投降 · 空格 开火</div>
        <div class="actions">
          <button class="btn primary" data-act="resume">继 续 战 斗</button>
          <button class="btn" data-act="stage">跳 关 / 更 换 关 卡</button>
          <button class="btn danger" data-act="surrender">一 键 投 降</button>
          <button class="btn ghost" data-act="menu">返回主菜单</button>
        </div>
      </div>`;
    this.bindOverlay({
      resume: () => this.resume(),
      stage: () => this.showLevelSelect('pause'),
      surrender: () => this.surrender(),
      menu: () => this.showMenu(),
    });
  }

  bindOverlay(map) {
    this.overlay.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => { this.audio.init(); const fn = map[b.dataset.act]; if (fn) fn(); };
    });
  }
}

// ---------- 启动 ----------
const audio = new AudioMgr();
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('overlay');
  const game = new Game(canvas, overlay, audio);
  window.game = game;
});