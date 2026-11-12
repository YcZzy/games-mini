/**
 * 数独
 * 随机生成完整解，再按难度挖空并保证唯一解；带笔记、提示、冲突检测。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, clamp } = require('./draw.js');

const DIFF = {
    easy: { name: '轻松', blanks: 38 },
    normal: { name: '标准', blanks: 48 },
    hard: { name: '困难', blanks: 55 },
};

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

function boxOf(r, c) {
    return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

/** 统计解的个数，最多数到 limit 就停 */
function countSolutions(grid, limit) {
    const rows = new Array(9).fill(0);
    const cols = new Array(9).fill(0);
    const boxes = new Array(9).fill(0);
    const empties = [];

    for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
            const v = grid[r * 9 + c];
            if (v) {
                const bit = 1 << (v - 1);
                rows[r] |= bit;
                cols[c] |= bit;
                boxes[boxOf(r, c)] |= bit;
            } else {
                empties.push(r * 9 + c);
            }
        }
    }

    let found = 0;

    const step = () => {
        if (found >= limit) {
            return;
        }
        let best = -1;
        let bestMask = 0;
        let bestCount = 10;

        for (let i = 0; i < empties.length; i += 1) {
            const idx = empties[i];
            if (grid[idx]) {
                continue;
            }
            const r = Math.floor(idx / 9);
            const c = idx % 9;
            const used = rows[r] | cols[c] | boxes[boxOf(r, c)];
            let mask = 0;
            let n = 0;
            for (let v = 1; v <= 9; v += 1) {
                if (!(used & (1 << (v - 1)))) {
                    mask |= 1 << (v - 1);
                    n += 1;
                }
            }
            if (n === 0) {
                return;
            }
            if (n < bestCount) {
                bestCount = n;
                best = idx;
                bestMask = mask;
                if (n === 1) {
                    break;
                }
            }
        }

        if (best < 0) {
            found += 1;
            return;
        }

        const r = Math.floor(best / 9);
        const c = best % 9;
        const b = boxOf(r, c);

        for (let v = 1; v <= 9; v += 1) {
            const bit = 1 << (v - 1);
            if (!(bestMask & bit)) {
                continue;
            }
            grid[best] = v;
            rows[r] |= bit;
            cols[c] |= bit;
            boxes[b] |= bit;
            step();
            grid[best] = 0;
            rows[r] &= ~bit;
            cols[c] &= ~bit;
            boxes[b] &= ~bit;
            if (found >= limit) {
                return;
            }
        }
    };

    step();
    return found;
}

function generateFull() {
    const grid = new Array(81).fill(0);
    const rows = new Array(9).fill(0);
    const cols = new Array(9).fill(0);
    const boxes = new Array(9).fill(0);

    const fill = (pos) => {
        if (pos === 81) {
            return true;
        }
        const r = Math.floor(pos / 9);
        const c = pos % 9;
        const b = boxOf(r, c);
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (let i = 0; i < 9; i += 1) {
            const v = nums[i];
            const bit = 1 << (v - 1);
            if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) {
                continue;
            }
            grid[pos] = v;
            rows[r] |= bit;
            cols[c] |= bit;
            boxes[b] |= bit;
            if (fill(pos + 1)) {
                return true;
            }
            grid[pos] = 0;
            rows[r] &= ~bit;
            cols[c] &= ~bit;
            boxes[b] &= ~bit;
        }
        return false;
    };

    fill(0);
    return grid;
}

function makePuzzle(blanks) {
    const solution = generateFull();
    const puzzle = solution.slice();
    const order = shuffle([...new Array(81).keys()]);
    let removed = 0;

    for (let i = 0; i < order.length && removed < blanks; i += 1) {
        const idx = order[i];
        const backup = puzzle[idx];
        puzzle[idx] = 0;
        if (countSolutions(puzzle.slice(), 2) !== 1) {
            puzzle[idx] = backup;
        } else {
            removed += 1;
        }
    }

    return { puzzle, solution };
}

class Sudoku extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.difficulty = 'normal';
        this.noteMode = false;
        this.selected = null;
        this.banner = null;
        this.elapsed = 0;
    }

    start() {
        this.build();
        this.newRound();
    }

    build() {
        const padBottom = 156;
        const availW = this.w - 20;
        const availH = this.h - padBottom - 20;
        this.cell = Math.floor(Math.min(availW / 9, availH / 9));
        this.board = this.cell * 9;
        this.ox = Math.floor((this.w - this.board) / 2);
        this.oy = 14;

        // 数字键盘
        const keyW = Math.floor((this.w - 24) / 9);
        this.keyW = keyW;
        this.keyH = 46;
        this.keyY = this.oy + this.board + 18;
        this.keyX = Math.floor((this.w - keyW * 9) / 2);

        // 功能键
        this.fnY = this.keyY + this.keyH + 12;
        this.fnH = 38;
        this.fnW = Math.floor((this.w - 24 - 16) / 3);
    }

    newRound() {
        const conf = DIFF[this.difficulty];
        const made = makePuzzle(conf.blanks);
        this.solution = made.solution;
        this.given = made.puzzle.slice();
        this.grid = made.puzzle.slice();
        this.notes = new Array(81).fill(0);
        this.selected = null;
        this.elapsed = 0;
        this._lastSec = 0;
        this.finished = false;
        this.banner = null;
        this.emitScore(0);
    }

    /* ---------------- 交互 ---------------- */

    onTap(p) {
        if (this.finished) {
            return;
        }

        // 数字键
        if (p.y >= this.keyY && p.y <= this.keyY + this.keyH) {
            const col = Math.floor((p.x - this.keyX) / this.keyW);
            if (col >= 0 && col < 9) {
                this.input(col + 1);
                return;
            }
        }

        // 功能键
        if (p.y >= this.fnY && p.y <= this.fnY + this.fnH) {
            const slot = Math.floor((p.x - 12) / (this.fnW + 8));
            if (slot === 0) {
                this.noteMode = !this.noteMode;
            } else if (slot === 1) {
                this.hint();
            } else if (slot === 2) {
                this.erase();
            }
            return;
        }

        // 棋盘
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.oy) / this.cell);
        if (r >= 0 && r < 9 && c >= 0 && c < 9) {
            this.selected = { r, c };
        }
    }

    input(v) {
        if (!this.selected) {
            return;
        }
        const { r, c } = this.selected;
        const idx = r * 9 + c;
        if (this.given[idx]) {
            return;
        }
        if (this.noteMode) {
            const bit = 1 << (v - 1);
            this.notes[idx] ^= bit;
            return;
        }
        this.grid[idx] = this.grid[idx] === v ? 0 : v;
        if (this.grid[idx]) {
            this.notes[idx] = 0;
        }
        if (this.grid[idx] && this.grid[idx] !== this.solution[idx]) {
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
        }
        this.checkWin();
    }

    erase() {
        if (!this.selected) {
            return;
        }
        const idx = this.selected.r * 9 + this.selected.c;
        if (this.given[idx]) {
            return;
        }
        this.grid[idx] = 0;
        this.notes[idx] = 0;
    }

    hint() {
        const blanks = [];
        for (let i = 0; i < 81; i += 1) {
            if (!this.grid[i]) {
                blanks.push(i);
            }
        }
        if (!blanks.length) {
            return;
        }
        const idx = blanks[Math.floor(Math.random() * blanks.length)];
        this.grid[idx] = this.solution[idx];
        this.notes[idx] = 0;
        this.selected = { r: Math.floor(idx / 9), c: idx % 9 };
        this.hintFlash = { idx, life: 900 };
        this.checkWin();
    }

    checkWin() {
        for (let i = 0; i < 81; i += 1) {
            if (this.grid[i] !== this.solution[i]) {
                return;
            }
        }
        this.finished = true;
        this.emitWin({
            score: Math.max(1, Math.round(this.elapsed / 1000)),
            message: `${DIFF[this.difficulty].name}难度 · 用时 ${this.formatTime()}`,
        });
    }

    formatTime() {
        const sec = Math.round(this.elapsed);
        return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);
        if (!this.finished) {
            this.elapsed += dt;
            const sec = Math.round(this.elapsed / 1000);
            if (sec !== this._lastSec) {
                this._lastSec = sec;
                this.emitScore(sec);
            }
        }
        if (this.hintFlash) {
            this.hintFlash.life -= dt;
            if (this.hintFlash.life <= 0) {
                this.hintFlash = null;
            }
        }
        if (this.banner) {
            this.banner.life -= dt;
            if (this.banner.life <= 0) {
                this.banner = null;
            }
        }
    }

    /* ---------------- 绘制 ---------------- */

    conflictSet() {
        const bad = new Set();
        const groups = [];
        for (let i = 0; i < 9; i += 1) {
            const row = [];
            const col = [];
            const box = [];
            for (let j = 0; j < 9; j += 1) {
                row.push(i * 9 + j);
                col.push(j * 9 + i);
                const br = Math.floor(i / 3) * 3 + Math.floor(j / 3);
                const bc = (i % 3) * 3 + (j % 3);
                box.push(br * 9 + bc);
            }
            groups.push(row, col, box);
        }
        groups.forEach((g) => {
            const seen = {};
            g.forEach((idx) => {
                const v = this.grid[idx];
                if (!v) {
                    return;
                }
                if (seen[v] !== undefined) {
                    bad.add(idx);
                    bad.add(seen[v]);
                } else {
                    seen[v] = idx;
                }
            });
        });
        return bad;
    }

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        const bad = this.conflictSet();
        const sel = this.selected;
        const selVal = sel ? this.grid[sel.r * 9 + sel.c] : 0;

        // 背景格
        for (let r = 0; r < 9; r += 1) {
            for (let c = 0; c < 9; c += 1) {
                const idx = r * 9 + c;
                const x = this.ox + c * this.cell;
                const y = this.oy + r * this.cell;
                let bg = '#FFFFFF';
                if (sel) {
                    const sameRow = sel.r === r;
                    const sameCol = sel.c === c;
                    const sameBox =
                        Math.floor(sel.r / 3) === Math.floor(r / 3) &&
                        Math.floor(sel.c / 3) === Math.floor(c / 3);
                    if (sameRow || sameCol || sameBox) {
                        bg = '#F3F6FA';
                    }
                    if (selVal && this.grid[idx] === selVal) {
                        bg = '#E7F0FB';
                    }
                    if (sel.r === r && sel.c === c) {
                        bg = '#DCE9F8';
                    }
                }
                if (bad.has(idx)) {
                    bg = '#FBE4E0';
                }
                ctx.fillStyle = bg;
                ctx.fillRect(x, y, this.cell, this.cell);

                if (this.hintFlash && this.hintFlash.idx === idx) {
                    const k = this.hintFlash.life / 900;
                    ctx.save();
                    ctx.globalAlpha = k * 0.55;
                    ctx.fillStyle = '#C9922E';
                    ctx.fillRect(x, y, this.cell, this.cell);
                    ctx.restore();
                }
            }
        }

        // 网格线
        for (let i = 0; i <= 9; i += 1) {
            const thick = i % 3 === 0;
            ctx.strokeStyle = thick ? '#5A6472' : '#D6DDE6';
            ctx.lineWidth = thick ? 1.8 : 1;
            ctx.beginPath();
            ctx.moveTo(this.ox + i * this.cell, this.oy);
            ctx.lineTo(this.ox + i * this.cell, this.oy + this.board);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.ox, this.oy + i * this.cell);
            ctx.lineTo(this.ox + this.board, this.oy + i * this.cell);
            ctx.stroke();
        }

        // 数字
        const fs = Math.floor(this.cell * 0.56);
        for (let r = 0; r < 9; r += 1) {
            for (let c = 0; c < 9; c += 1) {
                const idx = r * 9 + c;
                const v = this.grid[idx];
                const cx = this.ox + c * this.cell + this.cell / 2;
                const cy = this.oy + r * this.cell + this.cell / 2;
                if (v) {
                    text(ctx, v, cx, cy, {
                        size: fs,
                        color: this.given[idx] ? '#2A2F36' : bad.has(idx) ? '#C2432F' : '#3A6EA5',
                        weight: this.given[idx] ? 'bold' : 'normal',
                    });
                } else if (this.notes[idx]) {
                    const nr = fs * 0.36;
                    for (let n = 1; n <= 9; n += 1) {
                        if (!(this.notes[idx] & (1 << (n - 1)))) {
                            continue;
                        }
                        const bx = cx + ((n - 1) % 3 - 1) * this.cell * 0.29;
                        const by = cy + (Math.floor((n - 1) / 3) - 1) * this.cell * 0.29;
                        text(ctx, n, bx, by, { size: nr, color: '#8A93A0' });
                    }
                }
            }
        }

        this.drawKeys(ctx);

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(ctx, this.w / 2 - 110, this.oy + this.board / 2 - 26, 220, 52, 16, 'rgba(32,36,42,0.86)');
            text(ctx, this.banner.text, this.w / 2, this.oy + this.board / 2, {
                size: 17,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }

        text(ctx, '点格子选中，再点下方数字键填数', this.w / 2, this.fnY + this.fnH + 20, {
            size: 12,
            color: '#A7AEB8',
        });
    }

    drawKeys(ctx) {
        const remaining = {};
        for (let n = 1; n <= 9; n += 1) {
            remaining[n] = 9;
        }
        for (let i = 0; i < 81; i += 1) {
            if (this.grid[i]) {
                remaining[this.grid[i]] -= 1;
            }
        }

        for (let n = 1; n <= 9; n += 1) {
            const x = this.keyX + (n - 1) * this.keyW;
            const done = remaining[n] <= 0;
            fillRoundRect(
                ctx,
                x + 2,
                this.keyY,
                this.keyW - 4,
                this.keyH,
                9,
                done ? '#F0F2F5' : '#F5F7FA'
            );
            text(ctx, n, x + this.keyW / 2, this.keyY + this.keyH / 2 + 1, {
                size: 21,
                color: done ? '#C7CDD6' : '#2F353D',
                weight: 'bold',
            });
        }

        const items = [
            { label: this.noteMode ? '笔记 开' : '笔记', on: this.noteMode },
            { label: '提示', on: false },
            { label: '擦除', on: false },
        ];
        items.forEach((it, i) => {
            const x = 12 + i * (this.fnW + 8);
            fillRoundRect(
                ctx,
                x,
                this.fnY,
                this.fnW,
                this.fnH,
                10,
                it.on ? 'rgba(201,146,46,0.16)' : '#F5F7FA'
            );
            text(ctx, it.label, x + this.fnW / 2, this.fnY + this.fnH / 2 + 1, {
                size: 14,
                color: it.on ? '#A87A22' : '#4A515B',
                weight: it.on ? 'bold' : 'normal',
            });
        });
    }
}

module.exports = Sudoku;
module.exports.countSolutions = countSolutions;
module.exports.makePuzzle = makePuzzle;
