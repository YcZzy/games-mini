const GameBase = require('./base.js');
const { fillRoundRect, roundRect, text, circle, hitRect } = require('./draw.js');

const COLS = 9;
const ROWS = 9;
const MINES = 10;

const NUM_COLORS = [
    '',
    '#3C7BD6',
    '#3E9C5A',
    '#D8544A',
    '#4A4AA8',
    '#8A5A32',
    '#2E9CA8',
    '#3A3A3A',
    '#7A8089',
];

class Minesweeper extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.infoH = 40;
        const boardSize = Math.min(this.w - 30, this.h - this.infoH - 26);
        this.boardSize = boardSize;
        this.cell = boardSize / COLS;
        this.originX = (this.w - boardSize) / 2;
        this.originY = (this.h - this.infoH - boardSize) / 2 + this.infoH;
        this.infoY = Math.max(8, this.originY - this.infoH - 6);

        this.elapsed = 0;
        this.lastSecond = -1;
    }

    start() {
        this.mines = [];
        this.nums = [];
        this.opened = [];
        this.flagged = [];
        for (let r = 0; r < ROWS; r += 1) {
            this.mines.push(new Array(COLS).fill(false));
            this.nums.push(new Array(COLS).fill(0));
            this.opened.push(new Array(COLS).fill(false));
            this.flagged.push(new Array(COLS).fill(false));
        }
        this.started = false;
        this.dead = false;
        this.won = false;
        this.finished = false;
        this.openedCount = 0;
        this.flagCount = 0;
        this.elapsed = 0;
        this.lastSecond = -1;
        this.boomCell = null;
        this.emitScore(0);
    }

    plantMines(sr, sc) {
        let placed = 0;
        while (placed < MINES) {
            const r = Math.floor(Math.random() * ROWS);
            const c = Math.floor(Math.random() * COLS);
            if (this.mines[r][c]) {
                continue;
            }
            if (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1) {
                continue;
            }
            this.mines[r][c] = true;
            placed += 1;
        }
        for (let r = 0; r < ROWS; r += 1) {
            for (let c = 0; c < COLS; c += 1) {
                let count = 0;
                this.forEachNeighbor(r, c, (nr, nc) => {
                    if (this.mines[nr][nc]) {
                        count += 1;
                    }
                });
                this.nums[r][c] = count;
            }
        }
    }

    forEachNeighbor(r, c, fn) {
        for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
                if (dr === 0 && dc === 0) {
                    continue;
                }
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
                    fn(nr, nc);
                }
            }
        }
    }

    hitCell(p) {
        if (
            !hitRect(p.x, p.y, this.originX, this.originY, this.boardSize, this.boardSize)
        ) {
            return null;
        }
        const c = Math.floor((p.x - this.originX) / this.cell);
        const r = Math.floor((p.y - this.originY) / this.cell);
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
            return null;
        }
        return { r, c };
    }

    onTap(p) {
        const hit = this.hitCell(p);
        if (!hit || this.dead || this.won) {
            return;
        }
        if (this.flagged[hit.r][hit.c] || this.opened[hit.r][hit.c]) {
            return;
        }
        if (!this.started) {
            this.plantMines(hit.r, hit.c);
            this.started = true;
        }
        this.openCell(hit.r, hit.c);
    }

    onLongPress(p) {
        const hit = this.hitCell(p);
        if (!hit || this.dead || this.won || !this.started) {
            return;
        }
        if (this.opened[hit.r][hit.c]) {
            return;
        }
        const { r, c } = hit;
        if (this.flagged[r][c]) {
            this.flagged[r][c] = false;
            this.flagCount -= 1;
        } else if (this.flagCount < MINES) {
            this.flagged[r][c] = true;
            this.flagCount += 1;
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
        }
        this.emitScore(this.elapsed);
    }

    openCell(sr, sc) {
        if (this.mines[sr][sc]) {
            this.dead = true;
            this.boomCell = { r: sr, c: sc };
            this.opened[sr][sc] = true;
            if (this.api.vibrate) {
                this.api.vibrate('heavy');
            }
            this.emitOver({ score: this.elapsed, success: false });
            return;
        }

        const stack = [{ r: sr, c: sc }];
        while (stack.length) {
            const cur = stack.pop();
            const { r, c } = cur;
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) {
                continue;
            }
            if (this.opened[r][c] || this.flagged[r][c]) {
                continue;
            }
            this.opened[r][c] = true;
            this.openedCount += 1;
            if (this.nums[r][c] === 0) {
                this.forEachNeighbor(r, c, (nr, nc) => {
                    if (!this.opened[nr][nc]) {
                        stack.push({ r: nr, c: nc });
                    }
                });
            }
        }

        if (this.openedCount >= ROWS * COLS - MINES) {
            this.won = true;
            this.flagged.forEach((row, r) => {
                row.forEach((_, c) => {
                    if (this.mines[r][c]) {
                        this.flagged[r][c] = true;
                    }
                });
            });
            this.emitWin({ score: this.elapsed });
        }
    }

    update(dt) {
        super.update(dt);
        if (this.finished || this.won || this.dead) {
            return;
        }
        if (this.started) {
            this.elapsed += dt / 1000;
            const sec = Math.floor(this.elapsed);
            if (sec !== this.lastSecond) {
                this.lastSecond = sec;
                this.emitScore(sec);
            }
        }
    }

    cellOrigin(r, c) {
        return {
            x: this.originX + c * this.cell,
            y: this.originY + r * this.cell,
        };
    }

    render(ctx) {
        const { originX, originY, boardSize, cell } = this;

        // 信息条
        this.drawInfoBar(ctx);

        fillRoundRect(ctx, originX - 5, originY - 5, boardSize + 10, boardSize + 10, 14, '#DCE2EA');

        for (let r = 0; r < ROWS; r += 1) {
            for (let c = 0; c < COLS; c += 1) {
                const p = this.cellOrigin(r, c);
                const pad = 1.2;
                const w = cell - pad * 2;

                if (this.opened[r][c]) {
                    fillRoundRect(ctx, p.x + pad, p.y + pad, w, w, 4, '#F2F4F7');
                    if (this.mines[r][c]) {
                        const isBoom =
                            this.boomCell && this.boomCell.r === r && this.boomCell.c === c;
                        fillRoundRect(
                            ctx,
                            p.x + pad,
                            p.y + pad,
                            w,
                            w,
                            4,
                            isBoom ? '#E9695C' : '#D9DEE6'
                        );
                        this.drawMine(ctx, p.x + cell / 2, p.y + cell / 2, cell * 0.26, isBoom);
                    } else if (this.nums[r][c] > 0) {
                        text(ctx, this.nums[r][c], p.x + cell / 2, p.y + cell / 2 + 0.5, {
                            size: cell * 0.56,
                            color: NUM_COLORS[this.nums[r][c]],
                            weight: 'bold',
                        });
                    }
                } else {
                    fillRoundRect(ctx, p.x + pad, p.y + pad, w, w, 4, '#C3CCD8');
                    fillRoundRect(
                        ctx,
                        p.x + pad,
                        p.y + pad,
                        w,
                        w * 0.55,
                        4,
                        'rgba(255,255,255,0.35)'
                    );
                    if (this.flagged[r][c]) {
                        this.drawFlag(ctx, p.x + cell / 2, p.y + cell / 2, cell * 0.5);
                    }
                }
            }
        }

        // 失败时暴露出错旗
        if (this.dead) {
            for (let r = 0; r < ROWS; r += 1) {
                for (let c = 0; c < COLS; c += 1) {
                    if (this.flagged[r][c] && !this.mines[r][c]) {
                        const p = this.cellOrigin(r, c);
                        text(ctx, '×', p.x + cell / 2, p.y + cell / 2, {
                            size: cell * 0.62,
                            color: '#D8544A',
                            weight: 'bold',
                        });
                    }
                }
            }
        }
    }

    drawInfoBar(ctx) {
        const w = this.boardSize;
        const x = this.originX;
        const y = this.infoY;
        fillRoundRect(ctx, x, y, w, this.infoH - 8, 10, '#FFFFFF');

        const cy = y + (this.infoH - 8) / 2;
        const remain = MINES - this.flagCount;

        this.drawFlag(ctx, x + 20, cy, 15);
        text(ctx, remain, x + 38, cy + 1, {
            size: 15,
            color: '#3A4149',
            align: 'left',
            weight: 'bold',
        });

        const sec = Math.floor(this.elapsed);
        const mm = Math.floor(sec / 60);
        const ss = sec % 60;
        const timeStr = `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`;
        text(ctx, timeStr, x + w - 18, cy + 1, {
            size: 15,
            color: '#3A4149',
            align: 'right',
            weight: 'bold',
        });
    }

    drawFlag(ctx, cx, cy, size) {
        ctx.save();
        ctx.strokeStyle = '#4A5260';
        ctx.lineWidth = Math.max(1.5, size * 0.11);
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.28, cy - size * 0.42);
        ctx.lineTo(cx - size * 0.28, cy + size * 0.42);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - size * 0.22, cy - size * 0.38);
        ctx.lineTo(cx + size * 0.36, cy - size * 0.18);
        ctx.lineTo(cx - size * 0.22, cy + size * 0.02);
        ctx.closePath();
        ctx.fillStyle = '#E4584C';
        ctx.fill();
        ctx.restore();
    }

    drawMine(ctx, cx, cy, radius, boom) {
        ctx.save();
        ctx.strokeStyle = boom ? '#FFFFFF' : '#39404A';
        ctx.lineWidth = Math.max(1.4, radius * 0.4);
        for (let i = 0; i < 8; i += 1) {
            const angle = (Math.PI / 4) * i;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
            ctx.lineTo(
                cx + Math.cos(angle) * radius * 1.55,
                cy + Math.sin(angle) * radius * 1.55
            );
            ctx.stroke();
        }
        circle(ctx, cx, cy, radius, boom ? '#FFFFFF' : '#39404A');
        circle(
            ctx,
            cx - radius * 0.3,
            cy - radius * 0.3,
            radius * 0.26,
            'rgba(255,255,255,0.85)'
        );
        ctx.restore();
    }
}

module.exports = Minesweeper;
