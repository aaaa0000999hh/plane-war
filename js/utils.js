// 数学工具与对象池
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }

// 十六进制颜色 + 透明度 -> rgba 字符串
function rgba(hex, a) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

// 圆-圆碰撞
function circleHit(a, b) {
  const rr = (a.radius + b.radius) * (a.radius + b.radius);
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy <= rr;
}

// 通用对象池（子弹/粒子复用）
class Pool {
  constructor(factory) {
    this.factory = factory;
    this.free = [];
  }
  acquire() {
    return this.free.length ? this.free.pop() : this.factory();
  }
  release(obj) {
    if (this.free.length < 4000) this.free.push(obj);
  }
}

// 图片资源缓存（战机贴图等）
const ImgAssets = {
  _cache: {},
  get(src) {
    let im = this._cache[src];
    if (!im) {
      im = new Image();
      im.src = src;
      this._cache[src] = im;
    }
    return (im.complete && im.naturalWidth > 0) ? im : null;
  },
};

// 预渲染发光贴图：替代逐帧 shadowBlur，性能关键
const GlowSprites = {
  _cache: {},
  get(color) {
    if (this._cache[color]) return this._cache[color];
    const s = 48, half = s / 2;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(half, half, 0, half, half, half);
    rg.addColorStop(0, 'rgba(255,255,255,0.75)');
    rg.addColorStop(0.18, rgba(color, 0.75));
    rg.addColorStop(0.45, rgba(color, 0.32));
    rg.addColorStop(0.75, rgba(color, 0.08));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(half, half, half, 0, Math.PI * 2); g.fill();
    this._cache[color] = c;
    return c;
  },
};

// 预渲染激光束贴图（竖向光束，绘制时按飞行方向旋转）
const LaserSprites = {
  _cache: {},
  get(color) {
    if (this._cache[color]) return this._cache[color];
    const w = 24, h = 64;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // 横向：外发光 -> 高亮核心 -> 外发光
    const hg = g.createLinearGradient(0, 0, w, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(0.30, rgba(color, 0.25));
    hg.addColorStop(0.45, rgba(color, 0.8));
    hg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    hg.addColorStop(0.55, rgba(color, 0.8));
    hg.addColorStop(0.70, rgba(color, 0.25));
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hg;
    g.fillRect(0, 0, w, h);
    // 纵向两端柔化
    g.globalCompositeOperation = 'destination-in';
    const vg = g.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.16, 'rgba(0,0,0,1)');
    vg.addColorStop(0.84, 'rgba(0,0,0,1)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    this._cache[color] = c;
    return c;
  },
};