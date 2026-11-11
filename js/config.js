// 全局配置中心：所有数值调优都在这里
const CONFIG = {
  width: 480,
  height: 720,

  // 可选战机（4 架，属性差异化，使用预渲染战机图片）
  fighters: [
    { id: 0, name: '平衡型', color: '#00e5ff', hp: 140, speed: 330, damage: 1.0,  fireRate: 1.0,  desc: '均衡型 · 默认战机', img: 'assets/images/fighters/fighter_balanced.png' },
    { id: 1, name: '爆破',   color: '#ff2d95', hp: 125, speed: 300, damage: 1.35, fireRate: 0.85, desc: '攻击型 · 火力强大', img: 'assets/images/fighters/fighter_bomber.png' },
    { id: 2, name: '闪电',   color: '#ffd23f', hp: 110, speed: 420, damage: 0.9,  fireRate: 1.25, desc: '速度型 · 极速突进', img: 'assets/images/fighters/fighter_lightning.png' },
    { id: 3, name: '守护',   color: '#39ff88', hp: 240, speed: 265, damage: 0.95, fireRate: 0.8,  desc: '防御型 · 高生命',   img: 'assets/images/fighters/fighter_guardian.png' },
  ],

  // 主炮等级 1~5（count=弹数, spread=扩散弧度, speed=弹速, cooldown=射击间隔ms, damage=伤害）
  weapons: [
    { level: 1, count: 1, spread: 0.00, speed: 520, cooldown: 170, damage: 7 },
    { level: 2, count: 2, spread: 0.08, speed: 550, cooldown: 160, damage: 7 },
    { level: 3, count: 3, spread: 0.14, speed: 570, cooldown: 150, damage: 9 },
    { level: 4, count: 4, spread: 0.20, speed: 600, cooldown: 140, damage: 9 },
    { level: 5, count: 5, spread: 0.28, speed: 640, cooldown: 120, damage: 12 },
  ],

  wingmanMax: 2,      // 僚机数量上限
  missileSpeed: 420,  // 追踪导弹速度

  enemies: {
    normal: { hp: 15, speed: 110, score: 100, radius: 15, color: '#7a5cff', fireChance: 0.30, fireInterval: 1600 },
    elite:  { hp: 48, speed: 75,  score: 300, radius: 22, color: '#ff5c5c', fireChance: 0.6, fireInterval: 1400 },
  },

  boss: {
    hp: 3800, score: 5000, radius: 56, speed: 90,
    enterY: 150, bulletSpeed: 170,
  },

  props: {
    dropRate: 0.16,     // 敌机死亡掉率
    shieldTime: 6000,   // 护盾持续 ms
    healAmount: 30,
    missileCount: 12,
    bombStart: 1,
  },

  combo: { window: 2200, maxMult: 8 },

  // 关卡：难度倍率 + 星空主题色 + BOSS 血量倍率
  levels: [
    { id: 1, name: '近地轨道', code: 'ORBIT-01', color: '#00e5ff', hpMul: 1.0, speedMul: 1.0, spawnMul: 1.0, bossMul: 1.0, killTarget: 30, nebula: [[0, 150, 255], [0, 220, 255], [150, 0, 255], [255, 0, 140]], grid: [0, 180, 255] },
    { id: 2, name: '陨石带', code: 'BELT-02', color: '#ffaa00', hpMul: 1.3, speedMul: 1.08, spawnMul: 0.9, bossMul: 1.2, killTarget: 35, nebula: [[255, 140, 0], [255, 80, 0], [0, 140, 255], [255, 0, 120]], grid: [255, 150, 60] },
    { id: 3, name: '深空裂隙', code: 'RIFT-03', color: '#9d5cff', hpMul: 1.55, speedMul: 1.16, spawnMul: 0.8, bossMul: 1.45, killTarget: 40, nebula: [[150, 0, 255], [90, 0, 220], [0, 180, 255], [255, 0, 160]], grid: [160, 90, 255] },
    { id: 4, name: '湮灭星云', code: 'NEBULA-04', color: '#ff2d95', hpMul: 1.85, speedMul: 1.25, spawnMul: 0.7, bossMul: 1.7, killTarget: 45, nebula: [[255, 0, 140], [255, 60, 60], [120, 0, 255], [0, 200, 255]], grid: [255, 60, 150] },
    { id: 5, name: '终焉边界', code: 'FINIS-05', color: '#ff4d4d', hpMul: 2.2, speedMul: 1.35, spawnMul: 0.62, bossMul: 2.0, killTarget: 50, nebula: [[255, 40, 40], [255, 120, 0], [160, 0, 80], [120, 0, 255]], grid: [255, 80, 80] },
  ],

  // 技能（全部键盘触发）
  skills: {
    clear:  { name: '清屏', cd: 18 },
    shield: { name: '护盾', cd: 14, time: 4 },
  },

  // 敌机嘲讽气泡文案
  taunts: [
    '就这？', '打不着我~', '手抖了？', '这火力是挠痒痒吗？', '菜鸟，躲啊！',
    '我还没热身呢', '你的僚机都比你准', '再来啊，别怂', '瞄准都不会？', '送你一程吧',
    '这操作，幼儿园水平', '你是来送人头的吧', '别打了，投降吧',
  ],

  // 动态难度：按本局得分逐级升温（轻松 → 紧张 → 决战）
  difficulty: [
    { score: 0,     name: '轻松', color: '#39ff88', spawn: 1.0,  hp: 1.0,  speed: 1.0  },
    { score: 1500,  name: '热身', color: '#00e5ff', spawn: 0.9,  hp: 1.05, speed: 1.05 },
    { score: 4000,  name: '紧张', color: '#ffaa00', spawn: 0.75, hp: 1.1,  speed: 1.12 },
    { score: 8000,  name: '激战', color: '#ff5c5c', spawn: 0.6,  hp: 1.18, speed: 1.2  },
    { score: 15000, name: '决战', color: '#ff2d95', spawn: 0.5,  hp: 1.25, speed: 1.3  },
  ],

  // 双人模式
  duo: {
    pkTime: 60,          // PK 时长（秒）
    respawnTime: 4,      // 协力模式复活时间（秒）
    pkHitScore: 30,      // PK 命中对方得分
    pkHitDamage: 6,      // PK 命中对方伤害
  },

  // 成就勋章（check(stats, run) 返回 true 即解锁）
  achievements: [
    { id: 'first_blood', name: '初露锋芒', desc: '击落第一架敌机', icon: '壹', check: (s) => s.kills >= 1 },
    { id: 'ace50',       name: '空中猎手', desc: '单局击落 50 架敌机', icon: '猎', check: (s, run) => run.kills >= 50 },
    { id: 'combo10',     name: '连击大师', desc: '达成 10 连击', icon: '连', check: (s, run) => run.maxCombo >= 10 },
    { id: 'boss_slayer', name: '屠魔者', desc: '首次击败 BOSS', icon: '王', check: (s) => s.bossKills >= 1 },
    { id: 'stage5',      name: '终焉征服者', desc: '通关「终焉边界」', icon: '终', check: (s) => s.maxStage >= 5 },
    { id: 'untouchable', name: '无伤者', desc: '通关任意关卡且全程未受伤', icon: '隐', check: (s, run) => run.stageCleared && run.hitsTaken === 0 },
    { id: 'score50k',    name: '高分传说', desc: '单局得分达到 50000', icon: '分', check: (s, run) => run.score >= 50000 },
    { id: 'rich',        name: '收藏家', desc: '累计金币达到 500', icon: '金', check: (s) => s.coins >= 500 },
    { id: 'duo_win',     name: '竞技之王', desc: '双人 PK 获胜一次', icon: '冠', check: (s) => s.pkWins >= 1 },
    { id: 'surrender',   name: '识时务者', desc: '主动投降一次', icon: '降', check: (s) => s.surrenders >= 1 },
  ],

  colors: {
    bg: '#050a14',
    grid: '#0f2440',
    cyan: '#00e5ff',
    magenta: '#ff2d95',
    orange: '#ffaa00',
    red: '#ff4d4d',
    green: '#39ff88',
    purple: '#9d5cff',
    white: '#eaf6ff',
  },
};