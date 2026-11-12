/**
 * 坦克大战
 * 网格制经典玩法：砖墙可破、钢墙不可破、水域阻挡、树林藏身，守住底部基地。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp } = require('./draw.js');

const dot = circle;

const COLS = 13;
const ROWS = 13;

const EMPTY = 0;
const BRICK = 1;
const STEEL = 2;
const WATER = 3;
const TREE = 4;
const BASE = 5;

const DIRS = {
    up: { x: 0, y: -1, a: -Math.PI / 2 },
    down: { x: 0, y: 1, a: Math.PI / 2 },
    left: { x: -1, y: 0, a: Math.PI },
    right: { x: 1, y: 0, a: 0 },
};

const MAX_LEVEL = 5;

class TankGame extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.banner = null;
        this.notice = null;
    }

    start() {
        this.layout();
        this.loadLevel(1);
        this.emitScore(0);
    }

    layout() {
        const padX = 10;
        const top = 44;
        const bottom = 58;
        const availW = this.w - padX * 2;
        const availH = this.h - top - bottom;
        this.tile = Math.max(14, Math.floor(Math.min(availW / COLS, availH / ROWS)));
        this.bw = this.tile * COLS;
        this.bh = this.tile * ROWS;
        this.ox = Math.floor((this.w - this.bw) / 2);
        this.oy = Math.floor(top + (availH - this.bh) / 2);
    }

    /* ---------------- 关卡 ---------------- */

    loadLevel(level) {
        this.level = level;
        this.map = this.buildMap(level);
        this.bullets = [];
        this.enemies = [];
        this.effects = [];
        this.playerDead = 0;
        this.clearDelay = 0;
        this.respawnDelay = 0;
        this.spawnTimer = 600;
        this.killed = 0;
        this.enemyTotal = 3 + level;
        this.enemyQueue = this.enemyTotal;
        this.maxAlive = Math.min(2 + Math.floor(level / 2) + 1, 4);

        const bx = 6;
        const by = ROWS - 1;
        this.base = { gx: bx, gy: by, alive: true };

        this.player = this.makeTank(4, ROWS - 1, 'player');
        this.player.invincible = 1600;

        this.notice = { text: `第 ${level} 关`, life: 1200, max: 1200 };
    }

    buildMap(level) {
        const g = [];
        for (let y = 0; y < ROWS; y += 1) {
            g.push(new Array(COLS).fill(EMPTY));
        }

        let seed = level * 7919 + 13;
        const rnd = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };

        for (let y = 2; y < ROWS - 1; y += 1) {
            for (let x = 1; x <= Math.floor(COLS / 2); x += 1) {
                if (y === ROWS - 2 && x >= 4 && x <= 8) {
                    continue;
                }
                const r = rnd();
                let t = EMPTY;
                if (r < 0.3) {
                    t = BRICK;
                } else if (r < 0.38) {
                    t = STEEL;
                } else if (r < 0.43) {
                    t = WATER;
                } else if (r < 0.48) {
                    t = TREE;
                }
                if (t) {
                    g[y][x] = t;
                    g[y][COLS - 1 - x] = t;
                }
            }
        }

        // 敌人出生点与通道
        [0, 6, 12].forEach((x) => {
            g[0][x] = EMPTY;
            g[1][x] = EMPTY;
            g[2][x] = EMPTY;
        });

        // 基地周边砖墙
        g[ROWS - 2][5] = BRICK;
        g[ROWS - 2][6] = BRICK;
        g[ROWS - 2][7] = BRICK;
        g[ROWS - 1][5] = BRICK;
        g[ROWS - 1][7] = BRICK;
        g[ROWS - 1][6] = BASE;

        // 玩家出生区
        g[ROWS - 1][4] = EMPTY;
        g[ROWS - 1][3] = EMPTY;
        g[ROWS - 2][4] = EMPTY;

        if (level >= 3) {
            g[ROWS - 3][6] = STEEL;
        }

        return g;
    }

    makeTank(gx, gy, side) {
        return {
            gx,
            gy,
            px: this.ox + gx * this.tile,
            py: this.oy + gy * this.tile,
            dir: side === 'player' ? 'up' : 'down',
            moving: null,
            cool: 0,
            invincible: 0,
            side,
            alive: true,
            think: 0,
            slow: side === 'player' ? 1 : 0.72,
        };
    }

    /* ---------------- 格子查询 ---------------- */

    tileAt(gx, gy) {
        if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) {
            return STEEL;
        }
        return this.map[gy][gx];
    }

    blocked(gx, gy, side) {
        const t = this.tileAt(gx, gy);
        if (t === BRICK || t === STEEL || t === WATER || t === BASE) {
            return true;
        }
        const list = side === 'player' ? this.enemies : [this.player];
        for (let i = 0; i < list.length; i += 1) {
            const e = list[i];
            if (e && e.alive && e.gx === gx && e.gy === gy) {
                return true;
            }
        }
        return false;
    }

    /* ---------------- 输入 ---------------- */

    onButton(action) {
        if (action === 'fire') {
            this.fire(this.player);
            return;
        }
        if (DIRS[action]) {
            this.moveTank(this.player, action);
        }
    }

    onSwipe(dir) {
        this.moveTank(this.player, dir);
    }

    moveTank(tank, dir) {
        if (!tank || !tank.alive || tank.moving) {
            return;
        }
        tank.dir = dir;
        const d = DIRS[dir];
        const nx = tank.gx + d.x;
        const ny = tank.gy + d.y;
        if (this.blocked(nx, ny, tank.side)) {
            return;
        }
        tank.gx = nx;
        tank.gy = ny;
        tank.moving = {
            fx: tank.px,
            fy: tank.py,
            t: 0,
            dur: tank.side === 'player' ? 118 : 165,
        };
    }

    fire(tank) {
        if (!tank || !tank.alive || tank.cool > 0 || this.finished) {
            return;
        }
        tank.cool = tank.side === 'player' ? 330 : 760;
        const d = DIRS[tank.dir];
        const cx = tank.px + this.tile / 2 + d.x * this.tile * 0.46;
        const cy = tank.py + this.tile / 2 + d.y * this.tile * 0.46;
        this.bullets.push({
            x: cx,
            y: cy,
            dx: d.x,
            dy: d.y,
            side: tank.side,
            speed: tank.side === 'player' ? 0.52 : 0.36,
        });
        if (tank.side === 'player' && this.api.vibrate) {
            this.api.vibrate('light');
        }
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);

        if (this.notice) {
            this.notice.life -= dt;
            if (this.notice.life <= 0) {
                this.notice = null;
            }
        }
        if (this.banner) {
            this.banner.life -= dt;
            if (this.banner.life <= 0) {
                this.banner = null;
            }
        }

        if (this.clearDelay > 0) {
            this.clearDelay -= dt;
            if (this.clearDelay <= 0) {
                this.nextLevel();
            }
            return;
        }

        if (this.respawnDelay > 0) {
            this.respawnDelay -= dt;
            if (this.respawnDelay <= 0) {
                this.respawnPlayer();
            }
        }

        this.updateTank(this.player, dt);
        this.enemies.forEach((e) => this.updateEnemy(e, dt));
        this.updateBullets(dt);
        this.updateSpawn(dt);
        this.updateEffects(dt);
    }

    updateTank(tank, dt) {
        if (!tank || !tank.alive) {
            return;
        }
        if (tank.cool > 0) {
            tank.cool -= dt;
        }
        if (tank.invincible > 0) {
            tank.invincible -= dt;
        }
        if (tank.moving) {
            const m = tank.moving;
            m.t += dt;
            const k = clamp(m.t / m.dur, 0, 1);
            const tx = this.ox + tank.gx * this.tile;
            const ty = this.oy + tank.gy * this.tile;
            tank.px = m.fx + (tx - m.fx) * k;
            tank.py = m.fy + (ty - m.fy) * k;
            if (k >= 1) {
                tank.moving = null;
            }
        } else {
            tank.px = this.ox + tank.gx * this.tile;
            tank.py = this.oy + tank.gy * this.tile;
        }
    }

    updateEnemy(e, dt) {
        if (!e.alive) {
            return;
        }
        this.updateTank(e, dt);
        if (e.moving) {
            return;
        }
        e.think -= dt;
        if (e.think > 0) {
            return;
        }
        e.think = 380 + Math.random() * 420;

        const target = this.baseTarget();
        const options = [];
        Object.keys(DIRS).forEach((k) => {
            const d = DIRS[k];
            const nx = e.gx + d.x;
            const ny = e.gy + d.y;
            if (!this.blocked(nx, ny, 'enemy')) {
                const dist = Math.abs(target.gx - nx) + Math.abs(target.gy - ny);
                options.push({ k, dist: dist + Math.random() * 1.4 });
            }
        });

        if (options.length) {
            options.sort((a, b) => a.dist - b.dist);
            this.moveTank(e, options[0].k);
        }

        const lineUp =
            (e.gx === target.gx || e.gy === target.gy) &&
            Math.abs(e.gx - target.gx) + Math.abs(e.gy - target.gy) < 6;
        if (Math.random() < (lineUp ? 0.75 : 0.18)) {
            this.fire(e);
        }
    }

    baseTarget() {
        if (Math.random() < 0.6 || !this.player.alive) {
            return { gx: this.base.gx, gy: this.base.gy };
        }
        return { gx: this.player.gx, gy: this.player.gy };
    }

    updateSpawn(dt) {
        if (this.enemyQueue <= 0) {
            return;
        }
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) {
            return;
        }
        const alive = this.enemies.filter((e) => e.alive).length;
        if (alive >= this.maxAlive) {
            this.spawnTimer = 400;
            return;
        }
        const spots = [0, 6, 12].filter((x) => {
            const taken = this.enemies.some((e) => e.alive && e.gx === x && e.gy === 0);
            return !taken;
        });
        if (!spots.length) {
            this.spawnTimer = 300;
            return;
        }
        const gx = spots[Math.floor(Math.random() * spots.length)];
        const e = this.makeTank(gx, 0, 'enemy');
        e.hp = this.level >= 4 && Math.random() < 0.4 ? 2 : 1;
        this.enemies.push(e);
        this.enemyQueue -= 1;
        this.spawnTimer = Math.max(700, 1800 - this.level * 160);
    }

    updateBullets(dt) {
        const list = [];
        for (let i = 0; i < this.bullets.length; i += 1) {
            const b = this.bullets[i];
            let alive = true;
            let remain = b.speed * dt;
            while (remain > 0 && alive) {
                const step = Math.min(4, remain);
                remain -= step;
                b.x += b.dx * step;
                b.y += b.dy * step;

                if (
                    b.x < this.ox - 4 ||
                    b.x > this.ox + this.bw + 4 ||
                    b.y < this.oy - 4 ||
                    b.y > this.oy + this.bh + 4
                ) {
                    alive = false;
                    break;
                }

                const gx = Math.floor((b.x - this.ox) / this.tile);
                const gy = Math.floor((b.y - this.oy) / this.tile);
                const t = this.tileAt(gx, gy);

                if (t === BRICK) {
                    this.map[gy][gx] = EMPTY;
                    this.boom(b.x, b.y, '#C1663F');
                    alive = false;
                    break;
                }
                if (t === STEEL) {
                    this.boom(b.x, b.y, '#8E99A6');
                    alive = false;
                    break;
                }
                if (t === BASE) {
                    this.base.alive = false;
                    this.map[gy][gx] = EMPTY;
                    this.boom(b.x, b.y, '#D8644F', 26);
                    this.gameOver('基地被摧毁了');
                    alive = false;
                    break;
                }

                if (b.side === 'player') {
                    const hit = this.enemies.find(
                        (e) =>
                            e.alive &&
                            b.x > e.px &&
                            b.x < e.px + this.tile &&
                            b.y > e.py &&
                            b.y < e.py + this.tile
                    );
                    if (hit) {
                        alive = false;
                        this.boom(b.x, b.y, '#D8644F');
                        hit.hp -= 1;
                        if (hit.hp <= 0) {
                            hit.alive = false;
                            this.killed += 1;
                            this.addScore(100);
                        }
                        break;
                    }
                } else {
                    const p = this.player;
                    if (
                        p.alive &&
                        p.invincible <= 0 &&
                        b.x > p.px + 4 &&
                        b.x < p.px + this.tile - 4 &&
                        b.y > p.py + 4 &&
                        b.y < p.py + this.tile - 4
                    ) {
                        alive = false;
                        this.boom(b.x, b.y, '#D8644F');
                        this.killPlayer();
                        break;
                    }
                }
            }
            if (alive) {
                list.push(b);
            }
        }
        this.bullets = list;

        const left = this.enemies.filter((e) => e.alive).length;
        if (left === 0 && this.enemyQueue === 0 && this.clearDelay <= 0 && this.base.alive) {
            this.clearDelay = 1100;
            this.banner = { text: '本关清理完成', life: 1100, max: 1100, good: true };
            this.addScore(200);
        }
    }

    updateEffects(dt) {
        const list = [];
        this.effects.forEach((f) => {
            f.life -= dt;
            if (f.life > 0) {
                list.push(f);
            }
        });
        this.effects = list;
    }

    boom(x, y, color, size) {
        this.effects.push({ x, y, life: 300, max: 300, color, size: size || 12 });
    }

    addScore(v) {
        this.score += v;
        this.emitScore(this.score);
    }

    killPlayer() {
        const p = this.player;
        p.alive = false;
        this.boom(p.px + this.tile / 2, p.py + this.tile / 2, '#7ECB84', 24);
        this.lives -= 1;
        if (this.lives <= 0) {
            this.gameOver('坦克全部损毁');
            return;
        }
        this.respawnDelay = 900;
        if (this.api.vibrate) {
            this.api.vibrate('heavy');
        }
    }

    respawnPlayer() {
        const p = this.player;
        p.gx = 4;
        p.gy = ROWS - 1;
        p.px = this.ox + p.gx * this.tile;
        p.py = this.oy + p.gy * this.tile;
        p.dir = 'up';
        p.alive = true;
        p.moving = null;
        p.invincible = 1800;
        p.cool = 0;
    }

    nextLevel() {
        this.clearDelay = 0;
        if (this.level >= MAX_LEVEL) {
            this.emitWin({ score: this.score, message: `五关全部守住，剩余 ${this.lives} 辆坦克` });
            return;
        }
        this.loadLevel(this.level + 1);
    }

    gameOver(message) {
        if (this.finished) {
            return;
        }
        this.banner = null;
        this.emitOver({ score: this.score, message: message });
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        this.drawHud(ctx);
        this.drawBoard(ctx);

        this.effects.forEach((f) => {
            const k = 1 - f.life / f.max;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - k);
            dot(ctx, f.x, f.y, f.size * (0.4 + k), f.color);
            ctx.restore();
        });

        this.drawTank(ctx, this.player);
        this.enemies.forEach((e) => {
            if (e.alive) {
                this.drawTank(ctx, e);
            }
        });

        // 树林画在坦克之上，形成遮挡
        for (let y = 0; y < ROWS; y += 1) {
            for (let x = 0; x < COLS; x += 1) {
                if (this.map[y][x] === TREE) {
                    this.drawTree(ctx, x, y);
                }
            }
        }

        this.bullets.forEach((b) => {
            dot(ctx, b.x, b.y, Math.max(2.2, this.tile * 0.1), b.side === 'player' ? '#2F7D46' : '#C2432F');
        });

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(
                ctx,
                this.w / 2 - 98,
                this.oy + this.bh / 2 - 26,
                196,
                52,
                16,
                'rgba(32,36,42,0.86)'
            );
            text(ctx, this.banner.text, this.w / 2, this.oy + this.bh / 2, {
                size: 18,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }

        if (this.notice) {
            const k = this.notice.life / this.notice.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 2);
            text(ctx, this.notice.text, this.w / 2, this.oy + this.bh / 2, {
                size: 26,
                color: 'rgba(35,38,43,0.75)',
                weight: 'bold',
            });
            ctx.restore();
        }

        this.drawTip(ctx);
    }

    drawHud(ctx) {
        const y = 16;
        text(ctx, `第 ${this.level} 关`, 16, y, { size: 15, color: '#23262B', align: 'left', weight: 'bold' });
        text(ctx, `剩余 ${this.enemyQueue + this.enemies.filter((e) => e.alive).length}`, 16, y + 20, {
            size: 12,
            color: '#7A828C',
            align: 'left',
        });

        const alive = [];
        for (let i = 0; i < this.lives; i += 1) {
            alive.push(i);
        }
        alive.forEach((i) => {
            const x = this.w - 22 - i * 20;
            fillRoundRect(ctx, x - 5, 12, 12, 14, 3, '#4E9E5F');
            fillRoundRect(ctx, x - 2, 8, 6, 6, 2, '#3C7E4A');
        });
        text(ctx, '生命', this.w - 16, 36, { size: 11, color: '#9AA1AA', align: 'right' });
    }

    drawBoard(ctx) {
        fillRoundRect(ctx, this.ox - 4, this.oy - 4, this.bw + 8, this.bh + 8, 8, '#E9E3D6');
        ctx.fillStyle = '#F7F3EA';
        ctx.fillRect(this.ox, this.oy, this.bw, this.bh);

        const t = this.tile;
        for (let y = 0; y < ROWS; y += 1) {
            for (let x = 0; x < COLS; x += 1) {
                const v = this.map[y][x];
                const px = this.ox + x * t;
                const py = this.oy + y * t;
                if (v === BRICK) {
                    this.drawBrick(ctx, px, py, t);
                } else if (v === STEEL) {
                    fillRoundRect(ctx, px + 1, py + 1, t - 2, t - 2, 2, '#98A3AF');
                    fillRoundRect(ctx, px + 4, py + 4, t - 8, t - 8, 2, '#B4BECA');
                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.fillRect(px + 5, py + 5, t - 10, 2);
                } else if (v === WATER) {
                    const phase = Math.sin(this.time / 420 + y * 0.8 + x * 0.5) * 0.5 + 0.5;
                    ctx.fillStyle = '#8FC0E0';
                    ctx.fillRect(px, py, t, t);
                    ctx.fillStyle = 'rgba(255,255,255,0.55)';
                    const wy = py + t * (0.3 + phase * 0.3);
                    ctx.fillRect(px + t * 0.15, wy, t * 0.45, Math.max(1.5, t * 0.06));
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    ctx.fillRect(px + t * 0.5, wy + t * 0.28, t * 0.35, Math.max(1.5, t * 0.06));
                } else if (v === BASE) {
                    this.drawBase(ctx, px, py, t);
                }
            }
        }
    }

    drawBrick(ctx, px, py, t) {
        ctx.fillStyle = '#C1663F';
        ctx.fillRect(px, py, t, t);
        ctx.fillStyle = 'rgba(255,255,255,0.42)';
        const h2 = t / 2;
        ctx.fillRect(px, py + h2 - 1, t, 2);
        ctx.fillRect(px, py + t - 1, t, 1);
        const off = px + t / 2;
        ctx.fillRect(off - 1, py, 2, h2);
        ctx.fillRect(px + t / 4 - 1, py + h2, 2, h2);
        ctx.fillRect(px + t * 0.75 - 1, py + h2, 2, h2);
        ctx.fillStyle = 'rgba(120,55,30,0.18)';
        ctx.fillRect(px, py, t, 1);
    }

    drawTree(ctx, gx, gy) {
        const t = this.tile;
        const px = this.ox + gx * t;
        const py = this.oy + gy * t;
        ctx.save();
        ctx.globalAlpha = 0.86;
        ctx.fillStyle = '#5E9A5C';
        ctx.fillRect(px, py, t, t);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        const r = t * 0.2;
        dot(ctx, px + t * 0.32, py + t * 0.34, r, 'rgba(255,255,255,0.28)');
        dot(ctx, px + t * 0.68, py + t * 0.6, r * 0.9, 'rgba(255,255,255,0.2)');
        dot(ctx, px + t * 0.5, py + t * 0.78, r * 0.7, 'rgba(40,80,40,0.22)');
        ctx.restore();
    }

    drawBase(ctx, px, py, t) {
        const cx = px + t / 2;
        const cy = py + t / 2;
        ctx.fillStyle = '#B9AE99';
        ctx.fillRect(px + 1, py + t * 0.62, t - 2, t * 0.38);
        ctx.fillStyle = this.base.alive ? '#E8C766' : '#9A9285';
        ctx.beginPath();
        ctx.moveTo(cx, py + t * 0.14);
        ctx.lineTo(px + t * 0.82, py + t * 0.7);
        ctx.lineTo(px + t * 0.18, py + t * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = this.base.alive ? '#7B5F2A' : '#6E6A62';
        ctx.fillRect(cx - t * 0.09, py + t * 0.34, t * 0.18, t * 0.2);
    }

    drawTank(ctx, tank) {
        if (!tank || !tank.alive) {
            return;
        }
        const t = this.tile;
        const x = tank.px;
        const y = tank.py;
        const blink = tank.invincible > 0 && Math.floor(this.time / 110) % 2 === 0;

        ctx.save();
        if (blink) {
            ctx.globalAlpha = 0.45;
        }

        const body = tank.side === 'player' ? '#4E9E5F' : tank.hp > 1 ? '#8E7CC3' : '#C4553F';
        const dark = tank.side === 'player' ? '#3C7E4A' : tank.hp > 1 ? '#6F5FA0' : '#9C3F2E';

        // 履带
        fillRoundRect(ctx, x + t * 0.06, y + t * 0.12, t * 0.2, t * 0.76, 3, dark);
        fillRoundRect(ctx, x + t * 0.74, y + t * 0.12, t * 0.2, t * 0.76, 3, dark);
        // 车体
        fillRoundRect(ctx, x + t * 0.24, y + t * 0.18, t * 0.52, t * 0.64, 3, body);
        // 炮塔
        dot(ctx, x + t / 2, y + t / 2, t * 0.2, dark);

        // 炮管
        const d = DIRS[tank.dir];
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(2, t * 0.13);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + t / 2, y + t / 2);
        ctx.lineTo(x + t / 2 + d.x * t * 0.5, y + t / 2 + d.y * t * 0.5);
        ctx.stroke();

        ctx.restore();
    }

    drawTip(ctx) {
        const y = this.oy + this.bh + 22;
        if (y > this.h - 6) {
            return;
        }
        text(ctx, '方向键移动，开火键射击，别让基地被打穿', this.w / 2, y, {
            size: 12,
            color: '#9AA1AA',
        });
    }
}

module.exports = TankGame;
