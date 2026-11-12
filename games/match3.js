/**
 * 宝石消消乐
 * 交换相邻宝石，三个以上同色消除，掉落补充，支持连击连锁。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp } = require('./draw.js');

const N = 8;
const COLORS = [
    { main: '#E8697D', light: '#F49BAC', dark: '#C44E62' },
    { main: '#EFA95F', light: '#F7C48D', dark: '#CE8A43' },
    { main: '#E7C85B', light: '#F3DE92', dark: '#C4A73C' },
    { main: '#7ECB84', light: '#A7DDA9', dark: '#5FA968' },
    { main: '#54BCAC', light: '#84D4C7', dark: '#3B9A8C' },
    { main: '#6E93E0', light: '#96B3EC', dark: '#4E71BD' },
];

class Match3 extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.score = 0;
        this.level = 1;
        this.phase = 'idle';
        this.phaseTimer = 0;
        this.selected = null;
        this.cascade = 0;
        this.banner = null;
        this.floats = [];
    }

    start() {
        this.layout();
        this.loadLevel(1);
        this.emitScore(0);
    }

    layout() {
        const padTop = 88;
        const availW = this.w - 20;
        const availH = this.h - padTop - 54;
        this.cell = Math.floor(Math.min(availW / N, availH / N, 52));
        this.bw = this.cell * N;
        this.ox = Math.floor((this.w - this.bw) / 2);
        this.oy = Math.floor(padTop + Math.min(14, Math.max(0, (availH - this.bw) / 2)));
    }

    loadLevel(level) {
        this.level = level;
        this.moves = 20;
        this.target = 800 + (level - 1) * 700;
        this.levelScore = 0;
        this.phase = 'idle';
        this.selected = null;
        this.cascade = 0;
        this.banner = { text: `第 ${level} 关 · 目标 ${this.target}`, life: 1500, max: 1500 };
        this.grid = [];
        for (let r = 0; r < N; r += 1) {
            this.grid.push(new Array(N).fill(0));
        }
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                let color = 1 + Math.floor(Math.random() * COLORS.length);
                let guard = 0;
                while (guard < 12 && this.wouldMatch(r, c, color)) {
                    color = 1 + Math.floor(Math.random() * COLORS.length);
                    guard += 1;
                }
                this.grid[r][c] = { color, pop: 0 };
            }
        }
        if (!this.hasMove()) {
            this.shuffle();
        }
    }

    wouldMatch(r, c, color) {
        if (c >= 2) {
            const a = this.grid[r][c - 1];
            const b = this.grid[r][c - 2];
            if (a && b && a.color === color && b.color === color) {
                return true;
            }
        }
        if (r >= 2) {
            const a = this.grid[r - 1][c];
            const b = this.grid[r - 2][c];
            if (a && b && a.color === color && b.color === color) {
                return true;
            }
        }
        return false;
    }

    /* ---------------- 匹配 ---------------- */

    findMatches() {
        const marks = {};
        for (let r = 0; r < N; r += 1) {
            let run = 1;
            for (let c = 1; c <= N; c += 1) {
                const same =
                    c < N &&
                    this.grid[r][c] &&
                    this.grid[r][c - 1] &&
                    this.grid[r][c].color === this.grid[r][c - 1].color;
                if (same) {
                    run += 1;
                } else {
                    if (run >= 3) {
                        for (let k = c - run; k < c; k += 1) {
                            marks[`${r},${k}`] = { r, c: k, len: run };
                        }
                    }
                    run = 1;
                }
            }
        }
        for (let c = 0; c < N; c += 1) {
            let run = 1;
            for (let r = 1; r <= N; r += 1) {
                const same =
                    r < N &&
                    this.grid[r][c] &&
                    this.grid[r - 1][c] &&
                    this.grid[r][c].color === this.grid[r - 1][c].color;
                if (same) {
                    run += 1;
                } else {
                    if (run >= 3) {
                        for (let k = r - run; k < r; k += 1) {
                            marks[`${k},${c}`] = { r: k, c, len: run };
                        }
                    }
                    run = 1;
                }
            }
        }
        return marks;
    }

    hasMove() {
        const swapTest = (r1, c1, r2, c2) => {
            const a = this.grid[r1][c1];
            const b = this.grid[r2][c2];
            this.grid[r1][c1] = b;
            this.grid[r2][c2] = a;
            const ok = Object.keys(this.findMatches()).length > 0;
            this.grid[r1][c1] = a;
            this.grid[r2][c2] = b;
            return ok;
        };
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                if (c + 1 < N && swapTest(r, c, r, c + 1)) {
                    return true;
                }
                if (r + 1 < N && swapTest(r, c, r + 1, c)) {
                    return true;
                }
            }
        }
        return false;
    }

    shuffle() {
        for (let attempt = 0; attempt < 24; attempt += 1) {
            for (let r = 0; r < N; r += 1) {
                for (let c = 0; c < N; c += 1) {
                    const r2 = Math.floor(Math.random() * N);
                    const c2 = Math.floor(Math.random() * N);
                    const tmp = this.grid[r][c];
                    this.grid[r][c] = this.grid[r2][c2];
                    this.grid[r2][c2] = tmp;
                }
            }
            if (!Object.keys(this.findMatches()).length && this.hasMove()) {
                this.banner = { text: '没有可消除的组合，已重排', life: 1200, max: 1200 };
                return;
            }
        }
        // 极端情况：整盘重建，但不影响分数与步数
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                let color = 1 + Math.floor(Math.random() * COLORS.length);
                let guard = 0;
                while (guard < 12 && this.wouldMatch(r, c, color)) {
                    color = 1 + Math.floor(Math.random() * COLORS.length);
                    guard += 1;
                }
                this.grid[r][c] = { color, pop: 260 };
            }
        }
        this.banner = { text: '没有可消除的组合，已重排', life: 1200, max: 1200 };
    }

    /* ---------------- 交互 ---------------- */

    onTap(p) {
        if (this.phase !== 'idle' || this.finished) {
            return;
        }
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.oy) / this.cell);
        if (r < 0 || r >= N || c < 0 || c >= N) {
            return;
        }

        if (!this.selected) {
            this.selected = { r, c };
            return;
        }
        const s = this.selected;
        if (s.r === r && s.c === c) {
            this.selected = null;
            return;
        }
        const adjacent = Math.abs(s.r - r) + Math.abs(s.c - c) === 1;
        if (!adjacent) {
            this.selected = { r, c };
            return;
        }
        this.trySwap(s.r, s.c, r, c);
    }

    trySwap(r1, c1, r2, c2) {
        const a = this.grid[r1][c1];
        const b = this.grid[r2][c2];
        this.grid[r1][c1] = b;
        this.grid[r2][c2] = a;
        this.selected = null;

        if (Object.keys(this.findMatches()).length === 0) {
            this.grid[r1][c1] = a;
            this.grid[r2][c2] = b;
            this.banner = { text: '这样换不出三连', life: 700, max: 700 };
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
            return;
        }

        this.moves -= 1;
        this.phase = 'clear';
        this.phaseTimer = 190;
        this.cascade = 0;
        if (this.api.vibrate) {
            this.api.vibrate('light');
        }
    }

    /* ---------------- 消除流程 ---------------- */

    update(dt) {
        super.update(dt);

        if (this.banner) {
            this.banner.life -= dt;
            if (this.banner.life <= 0) {
                this.banner = null;
            }
        }
        this.floats = this.floats.filter((f) => {
            f.life -= dt;
            f.y -= dt * 0.04;
            return f.life > 0;
        });

        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                const t = this.grid[r][c];
                if (t && t.pop > 0) {
                    t.pop = Math.max(0, t.pop - dt);
                }
            }
        }

        if (this.phase === 'idle') {
            return;
        }

        this.phaseTimer -= dt;
        if (this.phaseTimer > 0) {
            return;
        }

        if (this.phase === 'clear') {
            const marks = this.findMatches();
            const list = Object.keys(marks);
            if (!list.length) {
                this.phase = 'idle';
                this.afterTurn();
                return;
            }
            const mult = 1 + this.cascade * 0.5;
            let gained = 0;
            list.forEach((k) => {
                const m = marks[k];
                const tile = this.grid[m.r][m.c];
                if (tile) {
                    gained += (m.len >= 5 ? 100 : m.len === 4 ? 60 : 30) ;
                    this.grid[m.r][m.c] = 0;
                }
            });
            const add = Math.round(gained * mult);
            this.score += add;
            this.levelScore += add;
            this.emitScore(this.score);
            if (list.length) {
                const first = marks[list[0]];
                this.floats.push({
                    x: this.ox + first.c * this.cell + this.cell / 2,
                    y: this.oy + first.r * this.cell,
                    text: `+${add}${this.cascade > 0 ? ` x${(1 + this.cascade * 0.5).toFixed(1)}` : ''}`,
                    life: 780,
                    max: 780,
                });
            }
            if (this.api.vibrate) {
                this.api.vibrate(this.cascade > 0 ? 'heavy' : 'light');
            }
            this.phase = 'fall';
            this.phaseTimer = 200;
            this.collapse();
            this.cascade += 1;
            return;
        }

        if (this.phase === 'fall') {
            if (Object.keys(this.findMatches()).length) {
                this.phase = 'clear';
                this.phaseTimer = 190;
                return;
            }
            this.phase = 'idle';
            this.cascade = 0;
            this.afterTurn();
        }
    }

    collapse() {
        for (let c = 0; c < N; c += 1) {
            const stack = [];
            for (let r = N - 1; r >= 0; r -= 1) {
                if (this.grid[r][c]) {
                    stack.push(this.grid[r][c]);
                }
            }
            for (let r = N - 1; r >= 0; r -= 1) {
                const i = N - 1 - r;
                if (i < stack.length) {
                    this.grid[r][c] = stack[i];
                } else {
                    this.grid[r][c] = {
                        color: 1 + Math.floor(Math.random() * COLORS.length),
                        pop: 260,
                    };
                }
            }
        }
    }

    afterTurn() {
        if (!this.hasMove()) {
            this.shuffle();
            return;
        }
        if (this.levelScore >= this.target) {
            this.nextLevel();
            return;
        }
        if (this.moves <= 0) {
            this.emitOver({
                score: this.score,
                message: `差 ${Math.max(0, this.target - this.levelScore)} 分达标`,
            });
        }
    }

    nextLevel() {
        if (this.level >= 5) {
            this.emitWin({ score: this.score, message: `五关全清，总分 ${this.score}` });
            return;
        }
        this.score += 300;
        this.emitScore(this.score);
        this.loadLevel(this.level + 1);
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        const t = this.cell;
        fillRoundRect(ctx, this.ox - 8, this.oy - 8, this.bw + 16, this.bw + 16, 16, '#F3F1EC');
        ctx.fillStyle = '#FBF9F5';
        ctx.fillRect(this.ox, this.oy, this.bw, this.bw);

        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                const tile = this.grid[r][c];
                if (!tile) {
                    continue;
                }
                let scale = 1;
                if (tile.pop > 0) {
                    scale = 0.6 + 0.4 * (1 - tile.pop / 260);
                }
                const cx = this.ox + c * t + t / 2;
                const cy = this.oy + r * t + t / 2;
                const isSel = this.selected && this.selected.r === r && this.selected.c === c;
                if (isSel) {
                    fillRoundRect(
                        ctx,
                        this.ox + c * t + 1,
                        this.oy + r * t + 1,
                        t - 2,
                        t - 2,
                        t * 0.24,
                        'rgba(110,147,224,0.16)'
                    );
                }
                this.drawGem(ctx, cx, cy, t * 0.4 * scale, tile.color, isSel);
            }
        }

        this.floats.forEach((f) => {
            const k = f.life / f.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            text(ctx, f.text, f.x, f.y, { size: 16, color: '#C9922E', weight: 'bold' });
            ctx.restore();
        });

        this.drawHud(ctx);

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(ctx, this.w / 2 - 108, this.oy + this.bw / 2 - 24, 216, 48, 15, 'rgba(32,36,42,0.86)');
            text(ctx, this.banner.text, this.w / 2, this.oy + this.bw / 2, {
                size: 15,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }

        const ty = this.oy + this.bw + 24;
        if (ty < this.h - 6) {
            text(ctx, '点一个宝石，再点相邻的宝石交换', this.w / 2, ty, {
                size: 12,
                color: '#A7AEB8',
            });
        }
    }

    drawGem(ctx, cx, cy, r, colorIdx, selected) {
        const c = COLORS[colorIdx - 1] || COLORS[0];
        ctx.save();
        if (selected) {
            ctx.translate(cx, cy);
            ctx.scale(1.08, 1.08);
            ctx.translate(-cx, -cy);
        }
        // 底座
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = c.dark;
        ctx.fill();
        // 主体
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.06, r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = c.main;
        ctx.fill();
        // 高光
        circle(ctx, cx - r * 0.3, cy - r * 0.34, r * 0.28, c.light);
        circle(ctx, cx + r * 0.28, cy + r * 0.3, r * 0.14, c.light);
        ctx.restore();
    }

    drawHud(ctx) {
        const ratio = clamp(this.target > 0 ? this.levelScore / this.target : 0, 0, 1);
        text(ctx, `第 ${this.level} 关`, 14, 22, {
            size: 15,
            color: '#23262B',
            align: 'left',
            weight: 'bold',
        });
        text(ctx, `${this.levelScore} / ${this.target}`, 14, 42, {
            size: 12,
            color: '#8A93A0',
            align: 'left',
        });

        const barX = 14;
        const barY = 54;
        const barW = this.w - 120;
        fillRoundRect(ctx, barX, barY, barW, 7, 3.5, '#EDEFF2');
        fillRoundRect(ctx, barX, barY, Math.max(4, barW * ratio), 7, 3.5, '#7ECB84');

        text(ctx, `剩余 ${Math.max(0, this.moves)} 步`, this.w - 14, 22, {
            size: 14,
            color: this.moves <= 5 ? '#C2432F' : '#4A515B',
            align: 'right',
            weight: 'bold',
        });
        text(ctx, `总分 ${this.score}`, this.w - 14, 42, {
            size: 12,
            color: '#8A93A0',
            align: 'right',
        });
    }
}

module.exports = Match3;
