/**
 * 数织（Nonogram / Picross）。
 *
 * 全部 14 张图案都经过离线「行列候选交集」求解器校验，保证能纯靠线索推出，
 * 不需要靠猜。尺寸从 5×5 递进到 8×8。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

function cluesOf(line) {
    const out = [];
    let run = 0;
    for (let i = 0; i < line.length; i += 1) {
        if (line[i] === 1) {
            run += 1;
        } else if (run) {
            out.push(run);
            run = 0;
        }
    }
    if (run) {
        out.push(run);
    }
    return out;
}

const LEVELS = [
    { name: '十字', rows: ['..#..', '..#..', '#####', '..#..', '..#..'] },
    { name: '爱心', rows: ['.##..', '#####', '#####', '.###.', '..#..'] },
    { name: '笑脸', rows: ['.#.#.', '#####', '#...#', '#...#', '.###.'] },
    { name: '箭头', rows: ['..#..', '.###.', '#####', '..#..', '..#..'] },
    { name: '沙漏', rows: ['#####', '.###.', '..#..', '.###.', '#####'] },
    { name: '棋子', rows: ['.###.', '..#..', '.###.', '#####', '.###.'] },
    { name: '方块', rows: ['#####', '#...#', '#.#.#', '#...#', '#####'] },
    { name: '树木', rows: [
        '...##...', '...##...', '..####..', '.######.',
        '########', '...##...', '...##...', '...##...',
    ] },
    { name: '星形', rows: [
        '...##...', '...##...', '.######.', '########',
        '..####..', '..#..#..', '.##..##.', '........',
    ] },
    { name: '猫咪', rows: [
        '#......#', '##....##', '########', '#.#..#.#',
        '########', '.#.##.#.', '..####..', '..#..#..',
    ] },
    { name: '爱心', rows: [
        '.##..##.', '########', '########', '########',
        '.######.', '..####..', '...##...', '....#...',
    ] },
    { name: '房子', rows: [
        '...##...', '..####..', '.######.', '########',
        '###..###', '###..###', '###..###', '########',
    ] },
    { name: '音符', rows: [
        '....###.', '....#.#.', '....#.#.', '....#.#.',
        '..###.#.', '.#####..', '.#####..', '..###...',
    ] },
    { name: '窗格', rows: [
        '########', '#......#', '#.####.#', '#.#..#.#',
        '#.#..#.#', '#.####.#', '#......#', '########',
    ] },
];

class Nonogram extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.level = 0;
        this.passCount = 0;
    }

    start() {
        this.loadLevel(0);
        this.passCount = 0;
    }

    loadLevel(index) {
        this.level = Math.max(0, Math.min(index, LEVELS.length - 1));
        const lv = LEVELS[this.level];
        this.n = lv.rows.length;
        this.answer = lv.rows.map((r) => r.split('').map((ch) => (ch === '#' ? 1 : 0)));
        this.rowClues = this.answer.map((r) => cluesOf(r));
        this.colClues = [];
        for (let c = 0; c < this.n; c += 1) {
            const col = [];
            for (let r = 0; r < this.n; r += 1) {
                col.push(this.answer[r][c]);
            }
            this.colClues.push(cluesOf(col));
        }
        this.grid = [];
        for (let r = 0; r < this.n; r += 1) {
            this.grid.push(new Array(this.n).fill(0));
        }
        this.mode = 'fill';
        this.history = [];
        this.wrongFlash = 0;
        this.wrongCells = [];
        this.done = false;
        this.finished = false;
        this.name = lv.name;
        this.layout();
        this.emitScore(this.passCount);
        this.emitHud(`第 ${this.level + 1} 关 · ${this.name}`);
    }

    layout() {
        const n = this.n;
        const topPad = 48;
        const botPad = 96;
        const availW = this.w - 24;
        const availH = this.h - topPad - botPad;

        this.maxRowClue = Math.max(1, ...this.rowClues.map((c) => c.length || 1));
        this.maxColClue = Math.max(1, ...this.colClues.map((c) => c.length || 1));

        const cellW = availW / (n + this.maxRowClue * 0.52);
        const cellH = availH / (n + this.maxColClue * 0.52);
        this.cell = Math.floor(Math.min(cellW, cellH, 56));

        this.clueW = Math.round(this.cell * 0.52);
        this.gridW = this.cell * n;
        this.gridH = this.cell * n;

        this.btnY = this.h - 52;

        const contentW = this.gridW + this.maxRowClue * this.clueW;
        this.ox = Math.floor((this.w - contentW) / 2) + this.maxRowClue * this.clueW;

        const contentH = this.gridH + this.maxColClue * this.clueW;
        const areaTop = topPad;
        const areaBottom = this.btnY - 18;
        const slack = Math.max(0, areaBottom - areaTop - contentH);
        this.oy = Math.floor(areaTop + slack / 2) + this.maxColClue * this.clueW;
    }

    cellAt(p) {
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.oy) / this.cell);
        if (r < 0 || r >= this.n || c < 0 || c >= this.n) {
            return null;
        }
        return { r, c };
    }

    onTap(p) {
        if (this.done) {
            if (p.y >= this.btnY) {
                this.hitButton(p);
            }
            return;
        }
        const hit = this.cellAt(p);
        if (hit) {
            this.paint(hit.r, hit.c, this.mode === 'fill' ? 1 : 2);
            return;
        }
        this.hitButton(p);
    }

    onLongPress(p) {
        const hit = this.cellAt(p);
        if (hit && !this.done) {
            this.paint(hit.r, hit.c, this.grid[hit.r][hit.c] === 2 ? 0 : 2);
        }
    }

    onDrag(p, start, dx, dy) {
        if (this.done) {
            return;
        }
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
            return;
        }
        const hit = this.cellAt(p);
        if (hit) {
            const v = this.mode === 'fill' ? 1 : 2;
            if (this.grid[hit.r][hit.c] !== v) {
                this.paint(hit.r, hit.c, v, true);
            }
        }
    }

    paint(r, c, value, bulk) {
        const old = this.grid[r][c];
        if (old === value) {
            if (!bulk) {
                this.grid[r][c] = 0;
                this.history.push({ r, c, from: old, to: 0 });
                this.afterChange();
            }
            return;
        }
        this.grid[r][c] = value;
        this.history.push({ r, c, from: old, to: value });
        this.afterChange();
    }

    afterChange() {
        this.checkDone();
        if (!this.done) {
            this.emitScore(this.passCount);
        }
    }

    lineValues(values) {
        return values.map((v) => (v === 1 ? 1 : 0));
    }

    rowDone(r) {
        const cl = cluesOf(this.lineValues(this.grid[r]));
        return cl.join(',') === this.rowClues[r].join(',');
    }

    colDone(c) {
        const col = [];
        for (let r = 0; r < this.n; r += 1) {
            col.push(this.grid[r][c] === 1 ? 1 : 0);
        }
        const cl = cluesOf(col);
        return cl.join(',') === this.colClues[c].join(',');
    }

    checkDone() {
        for (let r = 0; r < this.n; r += 1) {
            for (let c = 0; c < this.n; c += 1) {
                if (this.grid[r][c] === 1 && !this.answer[r][c]) {
                    return;
                }
                if (this.answer[r][c] && this.grid[r][c] !== 1) {
                    return;
                }
            }
        }
        this.done = true;
        this.passCount += 1;
        this.emitScore(this.passCount);
        const payload = {
            score: this.passCount,
            message: `第 ${this.level + 1} 关「${this.name}」完成`,
        };
        if (this.level >= LEVELS.length - 1) {
            this.finished = true;
            this.emitWin({ score: this.passCount, message: '全部 14 关都画完了' });
        } else {
            this.emitWin(payload);
        }
    }

    hitButton(p) {
        const btns = this.buttons();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= this.btnY && p.y <= this.btnY + 32) {
                if (b.key === 'toggle') {
                    this.mode = this.mode === 'fill' ? 'mark' : 'fill';
                } else if (b.key === 'undo') {
                    this.undo();
                } else if (b.key === 'reset') {
                    this.loadLevel(this.level);
                    this.passCount = this.passCount;
                } else if (b.key === 'next') {
                    this.loadLevel(Math.min(this.level + 1, LEVELS.length - 1));
                }
                return;
            }
        }
    }

    undo() {
        const last = this.history.pop();
        if (!last) {
            return;
        }
        this.grid[last.r][last.c] = last.from;
    }

    buttons() {
        const list = [
            { key: 'toggle', label: this.mode === 'fill' ? '填格模式' : '打叉模式' },
            { key: 'undo', label: '撤销' },
            { key: this.done ? 'next' : 'reset', label: this.done ? '下一关' : '重来' },
        ];
        const gap = 8;
        const bw = Math.min(96, (this.w - 32 - gap * 2) / 3);
        const total = bw * 3 + gap * 2;
        const startX = (this.w - total) / 2;
        return list.map((it, i) => ({ key: it.key, label: it.label, x: startX + i * (bw + gap), w: bw }));
    }

    update(dt) {
        this.time += dt;
        if (this.wrongFlash > 0) {
            this.wrongFlash -= dt;
        }
    }

    /* ---------- 绘制 ---------- */

    render(ctx) {
        this.drawTopInfo(ctx);
        this.drawColClues(ctx);
        this.drawRowClues(ctx);
        this.drawGrid(ctx);
        this.drawButtons(ctx);
    }

    drawTopInfo(ctx) {
        text(ctx, `${this.level + 1} / ${LEVELS.length} · ${this.name}`, this.w / 2, 22, {
            size: 15,
            color: '#39424E',
            weight: 'bold',
        });
        text(ctx, this.done ? '完成！点下一关继续' : '点按填格，长按打叉', this.w / 2, 42, {
            size: 11,
            color: '#A7AEB8',
        });
    }

    drawColClues(ctx) {
        const cell = this.cell;
        for (let c = 0; c < this.n; c += 1) {
            const clues = this.colClues[c];
            const done = this.colDone(c) && clues.length > 0;
            const n = clues.length;
            for (let i = 0; i < n; i += 1) {
                const y = this.oy - (n - i) * this.clueW + this.clueW / 2;
                text(ctx, clues[i], this.ox + c * cell + cell / 2, y, {
                    size: Math.max(9, Math.round(cell * 0.36)),
                    color: done ? '#8CC4A0' : '#5B6470',
                    weight: 'bold',
                });
            }
        }
    }

    drawRowClues(ctx) {
        const cell = this.cell;
        for (let r = 0; r < this.n; r += 1) {
            const clues = this.rowClues[r];
            const done = this.rowDone(r) && clues.length > 0;
            const n = clues.length;
            for (let i = 0; i < n; i += 1) {
                const x = this.ox - (n - i) * this.clueW + this.clueW / 2;
                text(ctx, clues[i], x, this.oy + r * cell + cell / 2, {
                    size: Math.max(9, Math.round(cell * 0.36)),
                    color: done ? '#8CC4A0' : '#5B6470',
                    weight: 'bold',
                });
            }
        }
    }

    drawGrid(ctx) {
        const cell = this.cell;
        const n = this.n;

        fillRoundRect(ctx, this.ox - 2, this.oy - 2, this.gridW + 4, this.gridH + 4, 6, '#F4F1EA');

        for (let r = 0; r < n; r += 1) {
            for (let c = 0; c < n; c += 1) {
                const x = this.ox + c * cell;
                const y = this.oy + r * cell;
                const v = this.grid[r][c];
                if (v === 1) {
                    fillRoundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.16, '#3E4652');
                } else if (v === 2) {
                    const pad = cell * 0.3;
                    ctx.strokeStyle = '#A9B2BC';
                    ctx.lineWidth = Math.max(1.4, cell * 0.055);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x + pad, y + pad);
                    ctx.lineTo(x + cell - pad, y + cell - pad);
                    ctx.moveTo(x + cell - pad, y + pad);
                    ctx.lineTo(x + pad, y + cell - pad);
                    ctx.stroke();
                }
            }
        }

        ctx.strokeStyle = '#DCD5C8';
        ctx.lineWidth = 1;
        for (let i = 0; i <= n; i += 1) {
            ctx.beginPath();
            ctx.moveTo(this.ox + i * cell, this.oy);
            ctx.lineTo(this.ox + i * cell, this.oy + this.gridH);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.ox, this.oy + i * cell);
            ctx.lineTo(this.ox + this.gridW, this.oy + i * cell);
            ctx.stroke();
        }

        ctx.strokeStyle = '#9A917F';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.ox, this.oy, this.gridW, this.gridH);

        if (this.done) {
            ctx.fillStyle = 'rgba(140, 196, 160, 0.16)';
            ctx.fillRect(this.ox, this.oy, this.gridW, this.gridH);
        }
    }

    drawButtons(ctx) {
        this.buttons().forEach((b) => {
            const active = b.key === 'toggle' && this.mode === 'fill';
            fillRoundRect(ctx, b.x, this.btnY, b.w, 32, 16, active ? '#E4EBF3' : '#EFF2F5');
            text(ctx, b.label, b.x + b.w / 2, this.btnY + 16, {
                size: 12,
                color: active ? '#3E5A78' : '#4A5560',
            });
        });
    }
}

module.exports = Nonogram;
// 供离线校验使用
module.exports.LEVELS = LEVELS;
module.exports.cluesOf = cluesOf;
