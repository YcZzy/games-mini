const GameBase = require('./base.js');
const { fillRoundRect, text } = require('./draw.js');

const SIZE = 4;
const MOVE_MS = 120;

const TILE_COLORS = {
    2: { bg: '#F0E6D8', fg: '#6E6152' },
    4: { bg: '#EDE0C4', fg: '#6E6152' },
    8: { bg: '#F2B179', fg: '#FFFFFF' },
    16: { bg: '#F59663', fg: '#FFFFFF' },
    32: { bg: '#F67C5F', fg: '#FFFFFF' },
    64: { bg: '#F65E3B', fg: '#FFFFFF' },
    128: { bg: '#EDCF72', fg: '#FFFFFF' },
    256: { bg: '#EDCC61', fg: '#FFFFFF' },
    512: { bg: '#EDC850', fg: '#FFFFFF' },
    1024: { bg: '#EDC53F', fg: '#FFFFFF' },
    2048: { bg: '#EDC22E', fg: '#FFFFFF' },
};

class Game2048 extends GameBase {
    constructor(view, api) {
        super(view, api);

        const boardSize = Math.min(this.w - 28, this.h - 130);
        this.boardSize = boardSize;
        this.gap = Math.max(6, boardSize * 0.028);
        this.cell = (boardSize - this.gap * (SIZE + 1)) / SIZE;
        this.originX = (this.w - boardSize) / 2;
        this.originY = Math.max(10, (this.h - boardSize) * 0.44);

        this.nextId = 1;
        this.tiles = [];
        this.dying = [];
        this.grid = [];
        this.score = 0;
        this.best = 0;
        this.animating = false;
        this.animT = 1;
        this.winShown = false;
        this.lastAdd = null;
    }

    start() {
        this.reset();
    }

    reset() {
        this.tiles = [];
        this.dying = [];
        this.grid = this.emptyGrid();
        this.score = 0;
        this.animating = false;
        this.animT = 1;
        this.winShown = false;
        this.finished = false;
        this.addRandomTile();
        this.addRandomTile();
        this.tiles.forEach((t) => {
            t.isNew = false;
        });
        this.emitScore(0);
    }

    emptyGrid() {
        const grid = [];
        for (let r = 0; r < SIZE; r += 1) {
            grid.push(new Array(SIZE).fill(null));
        }
        return grid;
    }

    addRandomTile() {
        const empty = [];
        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                if (!this.grid[r][c]) {
                    empty.push({ r, c });
                }
            }
        }
        if (!empty.length) {
            return;
        }
        const spot = empty[Math.floor(Math.random() * empty.length)];
        const tile = {
            id: this.nextId++,
            v: Math.random() < 0.9 ? 2 : 4,
            r: spot.r,
            c: spot.c,
            pr: spot.r,
            pc: spot.c,
            isNew: true,
            merged: false,
        };
        this.grid[spot.r][spot.c] = tile;
        this.tiles.push(tile);
    }

    cellXY(r, c) {
        return {
            x: this.originX + this.gap + c * (this.cell + this.gap),
            y: this.originY + this.gap + r * (this.cell + this.gap),
        };
    }

    onSwipe(dir) {
        this.move(dir);
    }

    move(dir) {
        if (this.animating || this.finished) {
            return;
        }

        const vertical = dir === 'up' || dir === 'down';
        const forward = dir === 'left' || dir === 'up';
        let changed = false;

        this.tiles.forEach((t) => {
            t.pr = t.r;
            t.pc = t.c;
            t.merged = false;
            t.isNew = false;
        });

        for (let line = 0; line < SIZE; line += 1) {
            const positions = [];
            for (let i = 0; i < SIZE; i += 1) {
                const idx = forward ? i : SIZE - 1 - i;
                positions.push(
                    vertical ? { r: idx, c: line } : { r: line, c: idx }
                );
            }

            const cells = positions
                .map((p) => this.grid[p.r][p.c])
                .filter((t) => !!t);

            const packed = [];
            cells.forEach((tile) => {
                const last = packed[packed.length - 1];
                if (last && last.v === tile.v && !last.merged) {
                    last.v *= 2;
                    last.merged = true;
                    this.score += last.v;
                    tile.dead = true;
                    tile.deadTo = { r: last.r, c: last.c };
                    this.dying.push(tile);
                } else {
                    packed.push(tile);
                }
            });

            packed.forEach((tile, i) => {
                const pos = positions[i];
                if (tile.r !== pos.r || tile.c !== pos.c) {
                    changed = true;
                }
                tile.r = pos.r;
                tile.c = pos.c;
            });
        }

        if (!changed) {
            this.dying = [];
            this.tiles.forEach((t) => {
                t.pr = t.r;
                t.pc = t.c;
            });
            return;
        }

        // 重建网格
        this.grid = this.emptyGrid();
        this.tiles = this.tiles.filter((t) => !t.dead);
        this.tiles.forEach((t) => {
            this.grid[t.r][t.c] = t;
        });

        this.addRandomTile();
        this.animating = true;
        this.animT = 0;
        this.emitScore(this.score);

        const maxTile = this.tiles.reduce((m, t) => (t.v > m ? t.v : m), 0);
        if (maxTile >= 2048 && !this.winShown) {
            this.winShown = true;
            this.emitWin({ score: this.score });
        }
    }

    update(dt) {
        super.update(dt);
        if (!this.animating) {
            this.checkOver();
            return;
        }
        this.animT += dt / MOVE_MS;
        if (this.animT >= 1) {
            this.animT = 1;
            this.animating = false;
            this.dying = [];
            this.tiles.forEach((t) => {
                t.merged = false;
                t.isNew = false;
                t.pr = t.r;
                t.pc = t.c;
            });
        }
    }

    checkOver() {
        if (this.finished) {
            return;
        }
        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                const tile = this.grid[r][c];
                if (!tile) {
                    return;
                }
                const right = c < SIZE - 1 ? this.grid[r][c + 1] : null;
                const down = r < SIZE - 1 ? this.grid[r + 1][c] : null;
                if ((right && right.v === tile.v) || (down && down.v === tile.v)) {
                    return;
                }
            }
        }
        this.emitOver({ score: this.score });
    }

    render(ctx) {
        const { originX, originY, boardSize, gap, cell } = this;

        fillRoundRect(ctx, originX, originY, boardSize, boardSize, 14, '#BBADA0');

        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                const pos = this.cellXY(r, c);
                fillRoundRect(ctx, pos.x, pos.y, cell, cell, 8, '#CDC3B6');
            }
        }

        const t = this.animating ? this.easeOut(this.animT) : 1;

        this.dying.forEach((tile) => {
            const from = this.cellXY(tile.pr, tile.pc);
            const to = this.cellXY(tile.deadTo.r, tile.deadTo.c);
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;
            ctx.globalAlpha = 1 - this.animT * 0.9;
            this.drawTile(ctx, tile.v, x, y, cell, 1);
            ctx.globalAlpha = 1;
        });

        this.tiles.forEach((tile) => {
            const from = this.cellXY(tile.pr, tile.pc);
            const to = this.cellXY(tile.r, tile.c);
            const x = from.x + (to.x - from.x) * t;
            const y = from.y + (to.y - from.y) * t;

            let scale = 1;
            if (tile.isNew) {
                // 移动动画后段弹出
                const p = this.animating ? Math.max(0, (this.animT - 0.55) / 0.45) : 1;
                scale = p <= 0 ? 0 : this.easeOut(p);
            } else if (tile.merged && this.animating) {
                scale = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, this.animT));
            }

            if (scale > 0.02) {
                this.drawTile(ctx, tile.v, x, y, cell, scale);
            }
        });
    }

    drawTile(ctx, value, x, y, size, scale) {
        const s = size * scale;
        const px = x + (size - s) / 2;
        const py = y + (size - s) / 2;
        const theme = TILE_COLORS[value] || { bg: '#3C3A32', fg: '#FFFFFF' };

        fillRoundRect(ctx, px, py, s, s, 8 * scale, theme.bg);

        let fontSize = size * 0.42;
        if (value >= 100 && value < 1000) {
            fontSize = size * 0.34;
        } else if (value >= 1000) {
            fontSize = size * 0.27;
        }
        text(ctx, value, px + s / 2, py + s / 2 + fontSize * 0.02, {
            size: fontSize * scale,
            color: theme.fg,
            weight: 'bold',
        });
    }

    easeOut(v) {
        return 1 - Math.pow(1 - v, 3);
    }
}

module.exports = Game2048;
