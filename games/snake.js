const GameBase = require('./base.js');
const { fillRoundRect, circle, text } = require('./draw.js');

const DIRS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
};

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

class Snake extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.cols = 15;
        this.rows = 15;
        const boardSize = Math.min(this.w - 24, this.h - 120);
        this.boardSize = boardSize;
        this.cell = boardSize / this.cols;
        this.originX = (this.w - boardSize) / 2;
        this.originY = (this.h - boardSize) / 2;

        this.stepMs = 190;
        this.acc = 0;
        this.dir = 'right';
        this.queue = [];
        this.eaten = 0;
    }

    start() {
        const mid = Math.floor(this.rows / 2);
        this.snake = [
            { r: mid, c: 5 },
            { r: mid, c: 4 },
            { r: mid, c: 3 },
        ];
        this.dir = 'right';
        this.queue = [];
        this.acc = 0;
        this.stepMs = 190;
        this.eaten = 0;
        this.score = 0;
        this.finished = false;
        this.food = this.spawnFood();
        this.emitScore(0);
    }

    spawnFood() {
        const occupied = {};
        this.snake.forEach((s) => {
            occupied[`${s.r},${s.c}`] = true;
        });
        const free = [];
        for (let r = 0; r < this.rows; r += 1) {
            for (let c = 0; c < this.cols; c += 1) {
                if (!occupied[`${r},${c}`]) {
                    free.push({ r, c });
                }
            }
        }
        if (!free.length) {
            return null;
        }
        return free[Math.floor(Math.random() * free.length)];
    }

    setDir(d) {
        if (!DIRS[d]) {
            return;
        }
        const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
        if (d === last || d === OPPOSITE[last]) {
            return;
        }
        if (this.queue.length < 2) {
            this.queue.push(d);
        }
    }

    onSwipe(dir) {
        this.setDir(dir);
    }

    onButton(action) {
        this.setDir(action);
    }

    update(dt) {
        super.update(dt);
        if (this.finished) {
            return;
        }
        this.acc += dt;
        let guard = 0;
        while (this.acc >= this.stepMs && guard < 4) {
            this.acc -= this.stepMs;
            this.step();
            guard += 1;
            if (this.finished) {
                return;
            }
        }
    }

    step() {
        if (this.queue.length) {
            this.dir = this.queue.shift();
        }
        const delta = DIRS[this.dir];
        const head = this.snake[0];
        const next = { r: head.r + delta.dr, c: head.c + delta.dc };

        if (
            next.r < 0 ||
            next.r >= this.rows ||
            next.c < 0 ||
            next.c >= this.cols
        ) {
            this.emitOver({ score: this.score });
            return;
        }

        const eating = this.food && next.r === this.food.r && next.c === this.food.c;
        const body = eating ? this.snake : this.snake.slice(0, this.snake.length - 1);
        const hitSelf = body.some((s) => s.r === next.r && s.c === next.c);
        if (hitSelf) {
            this.emitOver({ score: this.score });
            return;
        }

        this.snake.unshift(next);

        if (eating) {
            this.eaten += 1;
            this.score += 10;
            this.emitScore(this.score);
            this.food = this.spawnFood();
            this.stepMs = Math.max(85, 190 - Math.floor(this.eaten / 3) * 10);
            if (!this.food) {
                this.emitWin({ score: this.score });
                return;
            }
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
        } else {
            this.snake.pop();
        }
    }

    cellAt(r, c) {
        return {
            x: this.originX + c * this.cell,
            y: this.originY + r * this.cell,
        };
    }

    render(ctx) {
        const { originX, originY, boardSize, cell } = this;

        fillRoundRect(ctx, originX - 6, originY - 6, boardSize + 12, boardSize + 12, 18, '#E7F0E4');
        fillRoundRect(ctx, originX, originY, boardSize, boardSize, 14, '#F3F8F1');

        // 淡淡的棋盘格
        for (let r = 0; r < this.rows; r += 1) {
            for (let c = 0; c < this.cols; c += 1) {
                if ((r + c) % 2 === 0) {
                    const p = this.cellAt(r, c);
                    ctx.fillStyle = 'rgba(120, 168, 110, 0.06)';
                    ctx.fillRect(p.x, p.y, cell, cell);
                }
            }
        }

        if (this.food) {
            const p = this.cellAt(this.food.r, this.food.c);
            const pulse = 1 + Math.sin(this.time / 220) * 0.07;
            const radius = cell * 0.3 * pulse;
            circle(ctx, p.x + cell / 2, p.y + cell / 2, radius, '#E9695C');
            circle(
                ctx,
                p.x + cell / 2 - radius * 0.3,
                p.y + cell / 2 - radius * 0.35,
                radius * 0.26,
                'rgba(255,255,255,0.75)'
            );
        }

        const total = this.snake.length;
        for (let i = total - 1; i >= 0; i -= 1) {
            const seg = this.snake[i];
            const p = this.cellAt(seg.r, seg.c);
            const ratio = i / Math.max(1, total - 1);
            const pad = cell * 0.06;
            const color = i === 0 ? '#3E8B52' : `rgba(96, 170, 108, ${1 - ratio * 0.26})`;
            fillRoundRect(
                ctx,
                p.x + pad,
                p.y + pad,
                cell - pad * 2,
                cell - pad * 2,
                cell * 0.3,
                color
            );
        }

        // 眼睛
        const head = this.snake[0];
        if (head) {
            const p = this.cellAt(head.r, head.c);
            const cx = p.x + cell / 2;
            const cy = p.y + cell / 2;
            const delta = DIRS[this.dir];
            const off = cell * 0.17;
            const ex = delta.dc * off;
            const ey = delta.dr * off;
            const sideX = delta.dr !== 0 ? off : 0;
            const sideY = delta.dc !== 0 ? off : 0;
            const set = [
                { x: cx + ex + sideX * 0.55, y: cy + ey + sideY * 0.55 },
                { x: cx + ex - sideX * 0.55, y: cy + ey - sideY * 0.55 },
            ];
            set.forEach((e) => {
                circle(ctx, e.x, e.y, cell * 0.11, '#FFFFFF');
                circle(ctx, e.x, e.y, cell * 0.055, '#1F2A22');
            });
        }
    }
}

module.exports = Snake;
