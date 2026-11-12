const GameBase = require('./base.js');
const { fillRoundRect, roundRect, text } = require('./draw.js');

const N = 4;
const TOTAL = N * N;

class Puzzle extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.boardSize = Math.min(this.w - 40, this.h - 80);
        this.cellSize = this.boardSize / N;
        this.originX = (this.w - this.boardSize) / 2;
        this.originY = (this.h - this.boardSize) / 2;
    }

    start() {
        this.grid = [];
        for (let i = 0; i < TOTAL; i += 1) {
            this.grid.push(i === TOTAL - 1 ? 0 : i + 1);
        }
        this.blank = TOTAL - 1;
        this.steps = 0;
        this.finished = false;
        this.shuffle();
        this.emitScore(0);
    }

    neighbors(index) {
        const r = Math.floor(index / N);
        const c = index % N;
        const out = [];
        if (r > 0) {
            out.push(index - N);
        }
        if (r < N - 1) {
            out.push(index + N);
        }
        if (c > 0) {
            out.push(index - 1);
        }
        if (c < N - 1) {
            out.push(index + 1);
        }
        return out;
    }

    swap(a, b) {
        const tmp = this.grid[a];
        this.grid[a] = this.grid[b];
        this.grid[b] = tmp;
    }

    shuffle() {
        let guard = 0;
        do {
            let blank = this.blank;
            let last = -1;
            for (let i = 0; i < 240; i += 1) {
                const options = this.neighbors(blank).filter((n) => n !== last);
                const pick = options[Math.floor(Math.random() * options.length)];
                this.swap(blank, pick);
                last = blank;
                blank = pick;
            }
            this.blank = blank;
            guard += 1;
        } while (this.isSolved() && guard < 8);
    }

    isSolved() {
        for (let i = 0; i < TOTAL - 1; i += 1) {
            if (this.grid[i] !== i + 1) {
                return false;
            }
        }
        return this.grid[TOTAL - 1] === 0;
    }

    onTap(p) {
        if (this.finished) {
            return;
        }
        const c = Math.floor((p.x - this.originX) / this.cellSize);
        const r = Math.floor((p.y - this.originY) / this.cellSize);
        if (r < 0 || r >= N || c < 0 || c >= N) {
            return;
        }
        const index = r * N + c;
        if (this.neighbors(index).indexOf(this.blank) < 0) {
            return;
        }
        this.swap(index, this.blank);
        this.blank = index;
        this.steps += 1;
        this.emitScore(this.steps);
        if (this.api.vibrate) {
            this.api.vibrate('light');
        }
        if (this.isSolved()) {
            this.finished = true;
            if (this.api.vibrate) {
                this.api.vibrate('heavy');
            }
            this.emitWin({ score: this.steps, message: '还原完成' });
        }
    }

    render(ctx) {
        fillRoundRect(
            ctx,
            this.originX - 4,
            this.originY - 4,
            this.boardSize + 8,
            this.boardSize + 8,
            16,
            '#D9EDE9'
        );

        for (let i = 0; i < TOTAL; i += 1) {
            const r = Math.floor(i / N);
            const c = i % N;
            const x = this.originX + c * this.cellSize;
            const y = this.originY + r * this.cellSize;
            const pad = 3;
            const size = this.cellSize - pad * 2;
            const value = this.grid[i];

            if (value === 0) {
                fillRoundRect(
                    ctx,
                    x + pad,
                    y + pad,
                    size,
                    size,
                    this.cellSize * 0.18,
                    'rgba(84, 188, 172, 0.12)'
                );
                ctx.save();
                ctx.strokeStyle = 'rgba(84, 188, 172, 0.28)';
                ctx.lineWidth = 1.5;
                roundRect(ctx, x + pad, y + pad, size, size, this.cellSize * 0.18);
                ctx.stroke();
                ctx.restore();
                continue;
            }

            const isHome = value === i + 1;
            fillRoundRect(
                ctx,
                x + pad,
                y + pad,
                size,
                size,
                this.cellSize * 0.18,
                isHome ? '#3FAE9C' : '#FFFFFF'
            );
            if (!isHome) {
                fillRoundRect(
                    ctx,
                    x + pad,
                    y + pad,
                    size,
                    size * 0.46,
                    this.cellSize * 0.18,
                    'rgba(84, 188, 172, 0.1)'
                );
            }
            text(ctx, value, x + this.cellSize / 2, y + this.cellSize / 2 + 1, {
                size: this.cellSize * 0.36,
                color: isHome ? '#FFFFFF' : '#2E8E80',
                weight: 'bold',
            });
        }
    }
}

module.exports = Puzzle;
