/**
 * 推箱子
 * 经典 Sokoban：把箱子推上目标点。支持撤销、重来、关卡推进。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const dot = circle;

// # 墙 · 空格地板 · . 目标 · $ 箱子 · * 箱子在目标上 · @ 人 · + 人在目标上
const LEVELS = [
    [
        '#######',
        '#     #',
        '# .$@ #',
        '#     #',
        '#######',
    ],
    [
        '########',
        '#      #',
        '#  $   #',
        '# .@   #',
        '#      #',
        '########',
    ],
    [
        '#########',
        '#       #',
        '#  $ $  #',
        '# .   . #',
        '#   @   #',
        '#########',
    ],
    [
        '#########',
        '#       #',
        '#  ###  #',
        '#  $ $  #',
        '# .# #. #',
        '#   @   #',
        '#########',
    ],
    [
        '##########',
        '#        #',
        '#  $  .  #',
        '#  #  #  #',
        '#  $  .  #',
        '#   @    #',
        '##########',
    ],
    [
        '#########',
        '#       #',
        '# $ $ $ #',
        '# . . . #',
        '#   @   #',
        '#########',
    ],
    [
        '##########',
        '#        #',
        '#  ####  #',
        '#  $  .  #',
        '#  $  .  #',
        '#   @    #',
        '##########',
    ],
    [
        '##########',
        '#        #',
        '#  .  .  #',
        '#  $  $  #',
        '#   ##   #',
        '#   @    #',
        '##########',
    ],
    [
        '##########',
        '#  . .   #',
        '#   .    #',
        '#  $ $   #',
        '#   $    #',
        '#   @    #',
        '##########',
    ],
    [
        '###########',
        '#         #',
        '# . $ $ . #',
        '#   ###   #',
        '# . $ $ . #',
        '#    @    #',
        '###########',
    ],
];

const DIR = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
};

class Sokoban extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.levelIndex = 0;
        this.totalSteps = 0;
        this.banner = null;
    }

    start() {
        this.loadLevel(0);
        this.emitScore(0);
    }

    loadLevel(index) {
        this.levelIndex = index;
        const raw = LEVELS[index];
        const rows = raw.length;
        const cols = Math.max(...raw.map((r) => r.length));

        this.cols = cols;
        this.rows = rows;
        this.walls = [];
        this.goals = [];
        this.boxes = [];
        this.player = { x: 0, y: 0 };

        for (let y = 0; y < rows; y += 1) {
            this.walls.push(new Array(cols).fill(false));
            for (let x = 0; x < cols; x += 1) {
                const ch = raw[y][x] || ' ';
                if (ch === '#') {
                    this.walls[y][x] = true;
                }
                if (ch === '.' || ch === '*' || ch === '+') {
                    this.goals.push({ x, y });
                }
                if (ch === '$' || ch === '*') {
                    this.boxes.push({ x, y });
                }
                if (ch === '@' || ch === '+') {
                    this.player = { x, y };
                }
            }
        }

        this.history = [];
        this.steps = 0;
        this.finished = false;
        this.banner = { text: `第 ${index + 1} 关`, life: 1200, max: 1200 };

        const padTop = 62;
        const padBottom = 88;
        const availW = this.w - 20;
        const availH = this.h - padTop - padBottom;
        this.cell = Math.floor(Math.min(availW / cols, availH / rows, 56));
        this.bw = this.cell * cols;
        this.bh = this.cell * rows;
        this.ox = Math.floor((this.w - this.bw) / 2);
        this.oy = Math.floor(padTop + (availH - this.bh) / 2);
    }

    /* ---------------- 规则 ---------------- */

    wallAt(x, y) {
        if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) {
            return true;
        }
        return this.walls[y][x];
    }

    boxAt(x, y) {
        return this.boxes.findIndex((b) => b.x === x && b.y === y);
    }

    onGoal(x, y) {
        return this.goals.some((g) => g.x === x && g.y === y);
    }

    move(dir) {
        if (this.finished) {
            return;
        }
        const d = DIR[dir];
        if (!d) {
            return;
        }
        const nx = this.player.x + d.x;
        const ny = this.player.y + d.y;
        if (this.wallAt(nx, ny)) {
            return;
        }
        const bi = this.boxAt(nx, ny);
        if (bi >= 0) {
            const bx = nx + d.x;
            const by = ny + d.y;
            if (this.wallAt(bx, by) || this.boxAt(bx, by) >= 0) {
                return;
            }
            this.snapshot();
            this.boxes[bi].x = bx;
            this.boxes[bi].y = by;
        } else {
            this.snapshot();
        }
        this.player.x = nx;
        this.player.y = ny;
        this.steps += 1;
        this.totalSteps += 1;
        this.emitScore(this.totalSteps);
        if (this.api.vibrate) {
            this.api.vibrate('light');
        }
        this.checkWin();
    }

    snapshot() {
        this.history.push({
            player: { x: this.player.x, y: this.player.y },
            boxes: this.boxes.map((b) => ({ x: b.x, y: b.y })),
            steps: this.steps,
        });
        if (this.history.length > 400) {
            this.history.shift();
        }
    }

    undo() {
        const last = this.history.pop();
        if (!last) {
            return;
        }
        this.player = last.player;
        this.boxes = last.boxes;
        this.steps = last.steps;
        this.totalSteps = Math.max(0, this.totalSteps - 1);
        this.emitScore(this.totalSteps);
    }

    reset() {
        const idx = this.levelIndex;
        const total = this.totalSteps - this.steps;
        this.loadLevel(idx);
        this.totalSteps = total;
        this.emitScore(this.totalSteps);
    }

    checkWin() {
        const done = this.boxes.every((b) => this.onGoal(b.x, b.y));
        if (!done) {
            return;
        }
        this.finished = true;
        if (this.levelIndex >= LEVELS.length - 1) {
            this.emitWin({
                score: this.totalSteps,
                message: `${LEVELS.length} 关全部通关，共 ${this.totalSteps} 步`,
            });
            return;
        }
        this.banner = { text: '过关', life: 1000, max: 1000, good: true };
        this.finished = false;
        this.pending = 1000;
    }

    /* ---------------- 输入 ---------------- */

    onButton(action) {
        if (DIR[action]) {
            this.move(action);
        }
    }

    onSwipe(dir) {
        this.move(dir);
    }

    onTap(p) {
        // 撤销
        if (p.y > this.oy + this.bh + 8 && p.y < this.oy + this.bh + 46) {
            const mid = this.w / 2;
            if (p.x < mid) {
                this.undo();
            } else {
                this.reset();
            }
        }
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);
        if (this.banner) {
            this.banner.life -= dt;
            if (this.banner.life <= 0) {
                this.banner = null;
            }
        }
        if (this.pending) {
            this.pending -= dt;
            if (this.pending <= 0) {
                this.pending = 0;
                this.loadLevel(this.levelIndex + 1);
                this.totalSteps = this.totalSteps;
                this.emitScore(this.totalSteps);
            }
        }
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        const t = this.cell;
        const r = Math.max(3, t * 0.16);

        // 地板
        fillRoundRect(ctx, this.ox - 6, this.oy - 6, this.bw + 12, this.bh + 12, 12, '#F1EEE7');
        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(this.ox, this.oy, this.bw, this.bh);

        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.cols; x += 1) {
                const px = this.ox + x * t;
                const py = this.oy + y * t;
                if (this.walls[y][x]) {
                    fillRoundRect(ctx, px + 1, py + 1, t - 2, t - 2, 4, '#8D8171');
                    fillRoundRect(ctx, px + 3, py + 3, t - 6, t - 6, 3, '#A79A87');
                    continue;
                }
                if (this.onGoal(x, y)) {
                    dot(ctx, px + t / 2, py + t / 2, t * 0.16, '#D9C8A8');
                    ctx.strokeStyle = '#C9B491';
                    ctx.lineWidth = Math.max(1.4, t * 0.05);
                    ctx.beginPath();
                    ctx.arc(px + t / 2, py + t / 2, t * 0.24, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }

        // 箱子
        this.boxes.forEach((b) => {
            const px = this.ox + b.x * t;
            const py = this.oy + b.y * t;
            const on = this.onGoal(b.x, b.y);
            fillRoundRect(
                ctx,
                px + t * 0.1,
                py + t * 0.1,
                t * 0.8,
                t * 0.8,
                r,
                on ? '#C9922E' : '#C48A5A'
            );
            fillRoundRect(
                ctx,
                px + t * 0.18,
                py + t * 0.18,
                t * 0.64,
                t * 0.64,
                r * 0.7,
                on ? '#DCA94A' : '#D19C6D'
            );
            ctx.strokeStyle = on ? 'rgba(120,80,20,0.5)' : 'rgba(120,74,40,0.45)';
            ctx.lineWidth = Math.max(1.6, t * 0.055);
            ctx.beginPath();
            ctx.moveTo(px + t * 0.26, py + t * 0.26);
            ctx.lineTo(px + t * 0.74, py + t * 0.74);
            ctx.moveTo(px + t * 0.74, py + t * 0.26);
            ctx.lineTo(px + t * 0.26, py + t * 0.74);
            ctx.stroke();
        });

        // 小人
        const pcx = this.ox + this.player.x * t + t / 2;
        const pcy = this.oy + this.player.y * t + t / 2;
        dot(ctx, pcx, pcy, t * 0.3, '#4E7FAE');
        dot(ctx, pcx, pcy - t * 0.1, t * 0.17, '#F2C79E');
        fillRoundRect(ctx, pcx - t * 0.16, pcy - t * 0.02, t * 0.32, t * 0.22, t * 0.08, '#3E6E9E');

        this.drawHud(ctx);

        // 撤销 / 重来
        const by = this.oy + this.bh + 8;
        if (by + 38 < this.h) {
            const halfW = (this.w - 36) / 2;
            fillRoundRect(ctx, 12, by, halfW, 38, 10, '#F5F7FA');
            text(ctx, '撤销一步', 12 + halfW / 2, by + 19, { size: 14, color: '#4A515B' });
            fillRoundRect(ctx, 24 + halfW, by, halfW, 38, 10, '#F5F7FA');
            text(ctx, '重来本关', 24 + halfW + halfW / 2, by + 19, { size: 14, color: '#4A515B' });
        }

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(ctx, this.w / 2 - 90, this.oy + this.bh / 2 - 26, 180, 52, 16, 'rgba(32,36,42,0.86)');
            text(ctx, this.banner.text, this.w / 2, this.oy + this.bh / 2, {
                size: 17,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }
    }

    drawHud(ctx) {
        text(ctx, `第 ${this.levelIndex + 1} / ${LEVELS.length} 关`, 14, 22, {
            size: 15,
            color: '#23262B',
            align: 'left',
            weight: 'bold',
        });
        const on = this.boxes.filter((b) => this.onGoal(b.x, b.y)).length;
        text(ctx, `箱子 ${on} / ${this.boxes.length}`, 14, 42, {
            size: 12,
            color: '#8A93A0',
            align: 'left',
        });
        text(ctx, `本关 ${this.steps} 步`, this.w - 14, 22, {
            size: 13,
            color: '#4A515B',
            align: 'right',
        });
        text(ctx, `累计 ${this.totalSteps} 步`, this.w - 14, 42, {
            size: 12,
            color: '#8A93A0',
            align: 'right',
        });
    }
}

module.exports = Sokoban;
module.exports.LEVELS = LEVELS;
