const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
];

class Gomoku extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.boardSize = Math.min(this.w - 20, this.h - 20);
        this.cell = this.boardSize / SIZE;
        this.originX = (this.w - this.boardSize) / 2 + this.cell / 2;
        this.originY = (this.h - this.boardSize) / 2 + this.cell / 2;
        this.pieceR = this.cell * 0.4;
    }

    start() {
        this.board = [];
        for (let r = 0; r < SIZE; r += 1) {
            this.board.push(new Array(SIZE).fill(EMPTY));
        }
        this.turns = 0;
        this.finished = false;
        this.winner = 0;
        this.thinking = false;
        this.lastMove = null;
        this.winLine = null;
        this.emitScore(0);
    }

    destroy() {
        super.destroy();
        if (this._aiTimer) {
            clearTimeout(this._aiTimer);
            this._aiTimer = null;
        }
    }

    onTap(p) {
        if (this.finished || this.thinking || this.winner) {
            return;
        }
        const c = Math.round((p.x - this.originX) / this.cell);
        const r = Math.round((p.y - this.originY) / this.cell);
        if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) {
            return;
        }
        const dx = p.x - (this.originX + c * this.cell);
        const dy = p.y - (this.originY + r * this.cell);
        if (Math.sqrt(dx * dx + dy * dy) > this.cell * 0.62) {
            return;
        }
        if (this.board[r][c] !== EMPTY) {
            return;
        }
        this.place(r, c, BLACK);
        if (!this.finished) {
            this.thinking = true;
            this.emitHud('电脑思考中…');
            this._aiTimer = setTimeout(() => {
                this._aiTimer = null;
                this.thinking = false;
                this.emitHud('');
                if (this.finished) {
                    return;
                }
                const move = this.pickMove();
                if (move) {
                    this.place(move.r, move.c, WHITE);
                }
            }, 320);
        }
    }

    place(r, c, player) {
        this.board[r][c] = player;
        this.turns += 1;
        this.lastMove = { r, c };
        this.emitScore(this.turns);
        if (this.api.vibrate) {
            this.api.vibrate('light');
        }

        const line = this.findLine(r, c, player);
        if (line) {
            this.winLine = line;
            this.winner = player;
            this.finished = true;
            if (player === BLACK) {
                this.emitWin({ score: this.turns, message: '你赢了' });
            } else {
                this.emitOver({ score: this.turns, success: false });
            }
            return;
        }
        if (this.turns >= SIZE * SIZE) {
            this.emitOver({ score: this.turns, message: '平局' });
        }
    }

    findLine(r, c, player) {
        for (let i = 0; i < DIRECTIONS.length; i += 1) {
            const [dr, dc] = DIRECTIONS[i];
            const cells = [{ r, c }];
            for (let s = 1; s < 5; s += 1) {
                const nr = r + dr * s;
                const nc = c + dc * s;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
                    break;
                }
                if (this.board[nr][nc] !== player) {
                    break;
                }
                cells.push({ r: nr, c: nc });
            }
            for (let s = 1; s < 5; s += 1) {
                const nr = r - dr * s;
                const nc = c - dc * s;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
                    break;
                }
                if (this.board[nr][nc] !== player) {
                    break;
                }
                cells.unshift({ r: nr, c: nc });
            }
            if (cells.length >= 5) {
                return cells;
            }
        }
        return null;
    }

    /* ---------------- AI ---------------- */

    scorePoint(r, c, player) {
        let total = 0;
        for (let i = 0; i < DIRECTIONS.length; i += 1) {
            const [dr, dc] = DIRECTIONS[i];
            let count = 1;
            let openEnds = 0;

            for (let sign = -1; sign <= 1; sign += 2) {
                let step = 1;
                let blocked = false;
                while (step <= 4) {
                    const nr = r + dr * step * sign;
                    const nc = c + dc * step * sign;
                    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
                        blocked = true;
                        break;
                    }
                    const val = this.board[nr][nc];
                    if (val === player) {
                        count += 1;
                        step += 1;
                    } else if (val === EMPTY) {
                        break;
                    } else {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    openEnds += 1;
                }
            }

            if (count >= 5) {
                total += 500000;
            } else if (count === 4) {
                total += openEnds >= 2 ? 60000 : openEnds === 1 ? 8000 : 0;
            } else if (count === 3) {
                total += openEnds >= 2 ? 6000 : openEnds === 1 ? 700 : 0;
            } else if (count === 2) {
                total += openEnds >= 2 ? 500 : openEnds === 1 ? 80 : 0;
            } else {
                total += openEnds * 8;
            }
        }
        return total;
    }

    pickMove() {
        let hasStone = false;
        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                if (this.board[r][c] !== EMPTY) {
                    hasStone = true;
                }
            }
        }
        if (!hasStone) {
            return { r: 7, c: 7 };
        }

        let best = null;
        let bestScore = -1;

        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                if (this.board[r][c] !== EMPTY) {
                    continue;
                }
                if (!this.hasNeighbor(r, c, 2)) {
                    continue;
                }
                const attack = this.scorePoint(r, c, WHITE);
                const defend = this.scorePoint(r, c, BLACK);
                const centerBias =
                    -Math.abs(r - 7) * 3 - Math.abs(c - 7) * 3 + Math.random() * 6;
                const total = attack * 1.12 + defend + centerBias;
                if (total > bestScore) {
                    bestScore = total;
                    best = { r, c };
                }
            }
        }

        if (!best) {
            for (let r = 0; r < SIZE; r += 1) {
                for (let c = 0; c < SIZE; c += 1) {
                    if (this.board[r][c] === EMPTY) {
                        return { r, c };
                    }
                }
            }
        }
        return best;
    }

    hasNeighbor(r, c, range) {
        for (let dr = -range; dr <= range; dr += 1) {
            for (let dc = -range; dc <= range; dc += 1) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) {
                    continue;
                }
                if (this.board[nr][nc] !== EMPTY) {
                    return true;
                }
            }
        }
        return false;
    }

    /* ---------------- 渲染 ---------------- */

    render(ctx) {
        const pad = this.cell * 0.6;
        const left = this.originX - pad;
        const top = this.originY - pad;
        const boardW = this.boardSize;
        const boardH = this.boardSize;

        fillRoundRect(ctx, left, top, boardW, boardH, 10, '#EFDFC2');

        ctx.save();
        ctx.strokeStyle = 'rgba(150, 116, 72, 0.34)';
        ctx.lineWidth = 1;
        for (let i = 0; i < SIZE; i += 1) {
            const y = this.originY + i * this.cell;
            ctx.beginPath();
            ctx.moveTo(this.originX, y);
            ctx.lineTo(this.originX + this.cell * (SIZE - 1), y);
            ctx.stroke();

            const x = this.originX + i * this.cell;
            ctx.beginPath();
            ctx.moveTo(x, this.originY);
            ctx.lineTo(x, this.originY + this.cell * (SIZE - 1));
            ctx.stroke();
        }
        ctx.restore();

        [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([r, c]) => {
            circle(
                ctx,
                this.originX + c * this.cell,
                this.originY + r * this.cell,
                2.2,
                'rgba(150, 116, 72, 0.55)'
            );
        });

        for (let r = 0; r < SIZE; r += 1) {
            for (let c = 0; c < SIZE; c += 1) {
                const val = this.board[r][c];
                if (!val) {
                    continue;
                }
                const x = this.originX + c * this.cell;
                const y = this.originY + r * this.cell;
                const isLast =
                    this.lastMove && this.lastMove.r === r && this.lastMove.c === c;

                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y + 0.8, this.pieceR, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(90, 70, 45, 0.22)';
                ctx.fill();

                const grad = ctx.createRadialGradient(
                    x - this.pieceR * 0.35,
                    y - this.pieceR * 0.35,
                    this.pieceR * 0.15,
                    x,
                    y,
                    this.pieceR
                );
                if (val === BLACK) {
                    grad.addColorStop(0, '#5A5F66');
                    grad.addColorStop(1, '#1C1F23');
                } else {
                    grad.addColorStop(0, '#FFFFFF');
                    grad.addColorStop(1, '#D8DCE2');
                }
                ctx.beginPath();
                ctx.arc(x, y, this.pieceR, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
                ctx.restore();

                if (isLast && !this.winLine) {
                    circle(ctx, x, y, this.pieceR * 0.24, '#E4584C');
                }
            }
        }

        if (this.winLine) {
            ctx.save();
            ctx.strokeStyle = 'rgba(228, 88, 76, 0.85)';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            const first = this.winLine[0];
            const last = this.winLine[this.winLine.length - 1];
            ctx.moveTo(
                this.originX + first.c * this.cell,
                this.originY + first.r * this.cell
            );
            ctx.lineTo(
                this.originX + last.c * this.cell,
                this.originY + last.r * this.cell
            );
            ctx.stroke();
            ctx.restore();
        }
    }
}

module.exports = Gomoku;
