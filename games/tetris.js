const GameBase = require('./base.js');
const { fillRoundRect, text, hitRect } = require('./draw.js');

const COLS = 10;
const ROWS = 20;

const SHAPES = {
    I: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ],
    O: [
        [1, 1],
        [1, 1],
    ],
    T: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0],
    ],
    S: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0],
    ],
    Z: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0],
    ],
    J: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0],
    ],
    L: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0],
    ],
};

const COLORS = {
    I: '#63BFD4',
    O: '#E5C367',
    T: '#A78BDB',
    S: '#7ECB84',
    Z: '#E07A6E',
    J: '#7590F2',
    L: '#F0A35E',
};

const KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

class Tetris extends GameBase {
    constructor(view, api) {
        super(view, api);

        const maxW = this.w - 36;
        const maxH = this.h - 44;
        this.cell = Math.floor(Math.min(maxW / COLS, maxH / ROWS));
        this.boardW = this.cell * COLS;
        this.boardH = this.cell * ROWS;
        this.originX = (this.w - this.boardW) / 2;
        this.originY = (this.h - this.boardH) / 2;
    }

    start() {
        this.grid = [];
        for (let r = 0; r < ROWS; r += 1) {
            this.grid.push(new Array(COLS).fill(null));
        }
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.finished = false;
        this.dropTimer = 0;
        this.dropInterval = 780;
        this.clearing = null;
        this.spawn();
        this.emitScore(0);
        this.emitHud(`第 1 关`);
    }

    spawn() {
        const key = KEYS[Math.floor(Math.random() * KEYS.length)];
        const shape = SHAPES[key].map((row) => row.slice());
        this.current = {
            key,
            shape,
            x: Math.floor((COLS - shape[0].length) / 2),
            y: key === 'I' ? -1 : 0,
        };
        if (this.collides(this.current.shape, this.current.x, this.current.y)) {
            this.emitOver({ score: this.score });
        }
    }

    collides(shape, px, py) {
        for (let r = 0; r < shape.length; r += 1) {
            for (let c = 0; c < shape[r].length; c += 1) {
                if (!shape[r][c]) {
                    continue;
                }
                const nr = py + r;
                const nc = px + c;
                if (nc < 0 || nc >= COLS || nr >= ROWS) {
                    return true;
                }
                if (nr >= 0 && this.grid[nr][nc]) {
                    return true;
                }
            }
        }
        return false;
    }

    onButton(action) {
        if (this.finished || this.clearing) {
            return;
        }
        const cur = this.current;
        if (!cur) {
            return;
        }

        if (action === 'left') {
            if (!this.collides(cur.shape, cur.x - 1, cur.y)) {
                cur.x -= 1;
            }
        } else if (action === 'right') {
            if (!this.collides(cur.shape, cur.x + 1, cur.y)) {
                cur.x += 1;
            }
        } else if (action === 'rotate') {
            const rotated = this.rotate(cur.shape);
            for (let kick = 0; kick <= 2; kick += 1) {
                if (!this.collides(rotated, cur.x + kick, cur.y)) {
                    cur.shape = rotated;
                    cur.x += kick;
                    break;
                }
                if (!this.collides(rotated, cur.x - kick, cur.y)) {
                    cur.shape = rotated;
                    cur.x -= kick;
                    break;
                }
            }
        } else if (action === 'down') {
            this.softDrop();
            this.dropTimer = 0;
        } else if (action === 'drop') {
            let guard = 0;
            while (!this.collides(cur.shape, cur.x, cur.y + 1) && guard < ROWS) {
                cur.y += 1;
                this.score += 2;
                guard += 1;
            }
            this.lock();
            this.emitScore(this.score);
        }
    }

    rotate(shape) {
        const n = shape.length;
        const out = [];
        for (let r = 0; r < n; r += 1) {
            out.push(new Array(n).fill(0));
        }
        for (let r = 0; r < n; r += 1) {
            for (let c = 0; c < n; c += 1) {
                out[c][n - 1 - r] = shape[r][c];
            }
        }
        return out;
    }

    softDrop() {
        const cur = this.current;
        if (!cur) {
            return;
        }
        if (!this.collides(cur.shape, cur.x, cur.y + 1)) {
            cur.y += 1;
            this.score += 1;
            this.emitScore(this.score);
        } else {
            this.lock();
        }
    }

    lock() {
        const cur = this.current;
        const shape = cur.shape;
        for (let r = 0; r < shape.length; r += 1) {
            for (let c = 0; c < shape[r].length; c += 1) {
                if (!shape[r][c]) {
                    continue;
                }
                const nr = cur.y + r;
                const nc = cur.x + c;
                if (nr >= 0) {
                    this.grid[nr][nc] = cur.key;
                }
            }
        }
        this.current = null;

        const fullRows = [];
        for (let r = 0; r < ROWS; r += 1) {
            if (this.grid[r].every((v) => !!v)) {
                fullRows.push(r);
            }
        }

        if (fullRows.length) {
            this.clearing = { rows: fullRows, timer: 180 };
            this.pendingScore = [0, 100, 300, 500, 800][fullRows.length] * this.level;
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
        } else {
            this.spawn();
        }
    }

    finishClear() {
        const rows = this.clearing.rows;
        // 一次性过滤掉整行，再在顶部补齐空行，避免连续 splice 造成行索引错位
        const kept = this.grid.filter((_, r) => rows.indexOf(r) < 0);
        while (kept.length < ROWS) {
            kept.unshift(new Array(COLS).fill(null));
        }
        this.grid = kept;
        this.lines += rows.length;
        this.score += this.pendingScore || 0;
        this.pendingScore = 0;
        this.clearing = null;
        this.emitScore(this.score);

        const nextLevel = Math.floor(this.lines / 10) + 1;
        if (nextLevel !== this.level) {
            this.level = nextLevel;
            this.dropInterval = Math.max(140, 780 - (this.level - 1) * 62);
            this.emitHud(`第 ${this.level} 关`);
        }
        this.spawn();
    }

    update(dt) {
        super.update(dt);
        if (this.finished) {
            return;
        }

        if (this.clearing) {
            this.clearing.timer -= dt;
            if (this.clearing.timer <= 0) {
                this.finishClear();
            }
            return;
        }

        if (!this.current) {
            return;
        }

        this.dropTimer += dt;
        while (this.dropTimer >= this.dropInterval) {
            this.dropTimer -= this.dropInterval;
            if (!this.collides(this.current.shape, this.current.x, this.current.y + 1)) {
                this.current.y += 1;
            } else {
                this.lock();
                break;
            }
        }
    }

    render(ctx) {
        fillRoundRect(
            ctx,
            this.originX - 3,
            this.originY - 3,
            this.boardW + 6,
            this.boardH + 6,
            10,
            '#E4E1F2'
        );
        fillRoundRect(ctx, this.originX, this.originY, this.boardW, this.boardH, 8, '#FBF9FF');

        ctx.save();
        ctx.strokeStyle = 'rgba(120, 112, 180, 0.09)';
        ctx.lineWidth = 1;
        for (let c = 1; c < COLS; c += 1) {
            const x = this.originX + c * this.cell;
            ctx.beginPath();
            ctx.moveTo(x, this.originY);
            ctx.lineTo(x, this.originY + this.boardH);
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r += 1) {
            const y = this.originY + r * this.cell;
            ctx.beginPath();
            ctx.moveTo(this.originX, y);
            ctx.lineTo(this.originX + this.boardW, y);
            ctx.stroke();
        }
        ctx.restore();

        for (let r = 0; r < ROWS; r += 1) {
            for (let c = 0; c < COLS; c += 1) {
                const key = this.grid[r][c];
                if (!key) {
                    continue;
                }
                const isClearing = this.clearing && this.clearing.rows.indexOf(r) >= 0;
                this.drawBlock(
                    ctx,
                    this.originX + c * this.cell,
                    this.originY + r * this.cell,
                    COLORS[key],
                    isClearing ? 0.35 : 1
                );
            }
        }

        if (this.current) {
            const cur = this.current;
            const color = COLORS[cur.key];
            // 落点提示
            let ghostY = cur.y;
            while (!this.collides(cur.shape, cur.x, ghostY + 1)) {
                ghostY += 1;
            }
            for (let r = 0; r < cur.shape.length; r += 1) {
                for (let c = 0; c < cur.shape[r].length; c += 1) {
                    if (cur.shape[r][c] && ghostY + r >= 0) {
                        this.drawBlock(
                            ctx,
                            this.originX + (cur.x + c) * this.cell,
                            this.originY + (ghostY + r) * this.cell,
                            color,
                            0.14
                        );
                    }
                }
            }
            for (let r = 0; r < cur.shape.length; r += 1) {
                for (let c = 0; c < cur.shape[r].length; c += 1) {
                    if (cur.shape[r][c] && cur.y + r >= 0) {
                        this.drawBlock(
                            ctx,
                            this.originX + (cur.x + c) * this.cell,
                            this.originY + (cur.y + r) * this.cell,
                            color,
                            1
                        );
                    }
                }
            }
        }
    }

    drawBlock(ctx, x, y, color, alpha) {
        const pad = 1.4;
        const size = this.cell - pad * 2;
        ctx.save();
        ctx.globalAlpha = alpha;
        fillRoundRect(ctx, x + pad, y + pad, size, size, this.cell * 0.2, color);
        fillRoundRect(
            ctx,
            x + pad,
            y + pad,
            size,
            size * 0.42,
            this.cell * 0.2,
            'rgba(255,255,255,0.28)'
        );
        ctx.restore();
    }
}

module.exports = Tetris;
