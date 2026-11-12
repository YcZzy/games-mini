/**
 * 黑白棋（奥赛罗）
 * 你执黑先行，AI 执白。夹住对方棋子即可翻转，终局子多者胜。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const N = 8;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const DIRS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1],
];

const WEIGHTS = [
    [120, -20, 20, 5, 5, 20, -20, 120],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [5, -5, 3, 3, 3, 3, -5, 5],
    [20, -5, 15, 3, 3, 15, -5, 20],
    [-20, -40, -5, -5, -5, -5, -40, -20],
    [120, -20, 20, 5, 5, 20, -20, 120],
];

class Reversi extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.flipAnims = [];
        this.banner = null;
    }

    start() {
        this.layout();
        this.reset();
    }

    layout() {
        const padTop = 76;
        const availW = this.w - 24;
        const availH = this.h - padTop - 70;
        this.cell = Math.floor(Math.min(availW / N, availH / N, 54));
        this.bw = this.cell * N;
        this.ox = Math.floor((this.w - this.bw) / 2);
        this.oy = Math.floor(padTop + Math.min(14, Math.max(0, (availH - this.bw) / 2)));
    }

    reset() {
        this.board = [];
        for (let r = 0; r < N; r += 1) {
            this.board.push(new Array(N).fill(EMPTY));
        }
        this.board[3][3] = WHITE;
        this.board[4][4] = WHITE;
        this.board[3][4] = BLACK;
        this.board[4][3] = BLACK;

        this.turn = BLACK;
        this.passes = 0;
        this.finished = false;
        this.aiTimer = 0;
        this.flipAnims = [];
        this.lastMove = null;
        this.banner = { text: '你先手，执黑', life: 1300, max: 1300 };
        this.emitScore(this.count(BLACK));
    }

    count(side) {
        let n = 0;
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                if (this.board[r][c] === side) {
                    n += 1;
                }
            }
        }
        return n;
    }

    /* ---------------- 规则 ---------------- */

    captures(r, c, side) {
        if (this.board[r][c] !== EMPTY) {
            return [];
        }
        const out = [];
        for (let i = 0; i < DIRS.length; i += 1) {
            const [dr, dc] = DIRS[i];
            let x = r + dr;
            let y = c + dc;
            const line = [];
            while (x >= 0 && x < N && y >= 0 && y < N && this.board[x][y] === 3 - side) {
                line.push([x, y]);
                x += dr;
                y += dc;
            }
            if (line.length && x >= 0 && x < N && y >= 0 && y < N && this.board[x][y] === side) {
                out.push(...line);
            }
        }
        return out;
    }

    legalMoves(side) {
        const out = [];
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                if (this.captures(r, c, side).length) {
                    out.push({ r, c });
                }
            }
        }
        return out;
    }

    apply(r, c, side) {
        const caps = this.captures(r, c, side);
        if (!caps.length) {
            return false;
        }
        this.board[r][c] = side;
        caps.forEach(([x, y]) => {
            this.board[x][y] = side;
            if (!this.silent) {
                this.flipAnims.push({ r: x, c: y, life: 260, max: 260 });
            }
        });
        if (!this.silent) {
            this.lastMove = { r, c };
        }
        return true;
    }

    /* ---------------- 交互 ---------------- */

    onTap(p) {
        if (this.finished || this.turn !== BLACK) {
            return;
        }
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.oy) / this.cell);
        if (r < 0 || r >= N || c < 0 || c >= N) {
            return;
        }
        if (!this.captures(r, c, BLACK).length) {
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
            return;
        }
        this.apply(r, c, BLACK);
        this.emitScore(this.count(BLACK));
        this.turn = WHITE;
        this.aiTimer = 420;
        this.checkEnd();
    }

    /* ---------------- AI ---------------- */

    evaluate() {
        let v = 0;
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                const s = this.board[r][c];
                if (s === WHITE) {
                    v += WEIGHTS[r][c];
                } else if (s === BLACK) {
                    v -= WEIGHTS[r][c];
                }
            }
        }
        const myMoves = this.legalMoves(WHITE).length;
        const opMoves = this.legalMoves(BLACK).length;
        v += (myMoves - opMoves) * 8;
        v += (this.count(WHITE) - this.count(BLACK)) * 1.2;
        return v;
    }

    search(depth, alpha, beta, side) {
        if (depth <= 0) {
            return this.evaluate();
        }
        const moves = this.legalMoves(side);
        if (!moves.length) {
            return this.evaluate();
        }
        if (moves.length > 10) {
            moves.sort((a, b) => WEIGHTS[b.r][b.c] - WEIGHTS[a.r][a.c]);
        }
        let best = side === WHITE ? -Infinity : Infinity;
        for (let i = 0; i < moves.length; i += 1) {
            const m = moves[i];
            const snapshot = this.board.map((row) => row.slice());
            this.apply(m.r, m.c, side);
            const v = this.search(depth - 1, alpha, beta, 3 - side);
            this.board = snapshot;
            if (side === WHITE) {
                if (v > best) {
                    best = v;
                }
                if (best > alpha) {
                    alpha = best;
                }
            } else {
                if (v < best) {
                    best = v;
                }
                if (best < beta) {
                    beta = best;
                }
            }
            if (beta <= alpha) {
                break;
            }
        }
        return best;
    }

    aiMove() {
        const moves = this.legalMoves(WHITE);
        if (!moves.length) {
            this.passes += 1;
            this.turn = BLACK;
            this.banner = { text: '白棋无子可下，跳过', life: 1100, max: 1100 };
            this.checkEnd();
            return;
        }
        let bestMove = moves[0];
        let bestVal = -Infinity;
        this.silent = true;
        for (let i = 0; i < moves.length; i += 1) {
            const m = moves[i];
            const snapshot = this.board.map((row) => row.slice());
            this.apply(m.r, m.c, WHITE);
            const v = this.search(3, -Infinity, Infinity, BLACK) + Math.random() * 0.6;
            this.board = snapshot;
            if (v > bestVal) {
                bestVal = v;
                bestMove = m;
            }
        }
        this.silent = false;
        this.apply(bestMove.r, bestMove.c, WHITE);
        this.turn = BLACK;
        this.passes = 0;
        this.emitScore(this.count(BLACK));
        this.checkEnd();
    }

    checkEnd() {
        if (this.finished) {
            return;
        }
        const blackMoves = this.legalMoves(BLACK).length;
        const whiteMoves = this.legalMoves(WHITE).length;
        if (blackMoves === 0 && whiteMoves === 0) {
            this.finish();
        } else if (this.turn === BLACK && blackMoves === 0) {
            this.banner = { text: '你无子可下，跳过', life: 1100, max: 1100 };
            this.turn = WHITE;
            this.aiTimer = 700;
        }
    }

    finish() {
        if (this.finished) {
            return;
        }
        const b = this.count(BLACK);
        const w = this.count(WHITE);
        const payload = { score: b, message: `你 ${b} : ${w} 电脑` };
        if (b > w) {
            this.emitWin(payload);
            this.finished = true;
        } else {
            // emitOver 内部会置 finished，这里不能提前置位，否则结算不会触发
            this.emitOver({
                score: b,
                message: b === w ? '平局，势均力敌' : `你 ${b} : ${w} 电脑，再战一局`,
            });
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
        this.flipAnims = this.flipAnims.filter((f) => {
            f.life -= dt;
            return f.life > 0;
        });

        if (this.turn === WHITE && !this.finished) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Infinity;
                this.aiMove();
            }
        }
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);
        this.drawHud(ctx);

        const t = this.cell;
        fillRoundRect(ctx, this.ox - 9, this.oy - 9, this.bw + 18, this.bh + 18, 16, '#2F5D46');
        ctx.fillStyle = '#3E7357';
        ctx.fillRect(this.ox, this.oy, this.bw, this.bw);

        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 1;
        for (let i = 1; i < N; i += 1) {
            ctx.beginPath();
            ctx.moveTo(this.ox + i * t, this.oy);
            ctx.lineTo(this.ox + i * t, this.oy + this.bw);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.ox, this.oy + i * t);
            ctx.lineTo(this.ox + this.bw, this.oy + i * t);
            ctx.stroke();
        }

        // 落子提示
        if (this.turn === BLACK && !this.finished) {
            this.legalMoves(BLACK).forEach((m) => {
                circle(
                    ctx,
                    this.ox + m.c * t + t / 2,
                    this.oy + m.r * t + t / 2,
                    t * 0.12,
                    'rgba(255,255,255,0.42)'
                );
            });
        }

        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                const s = this.board[r][c];
                if (!s) {
                    continue;
                }
                const cx = this.ox + c * t + t / 2;
                const cy = this.oy + r * t + t / 2;
                const anim = this.flipAnims.find((f) => f.r === r && f.c === c);
                let scale = 1;
                if (anim) {
                    const k = 1 - anim.life / anim.max;
                    scale = Math.abs(Math.cos(k * Math.PI));
                    scale = Math.max(0.12, scale);
                }
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(scale, 1);
                this.drawDisc(ctx, s, t * 0.42);
                ctx.restore();
            }
        }

        if (this.lastMove) {
            const cx = this.ox + this.lastMove.c * t + t / 2;
            const cy = this.oy + this.lastMove.r * t + t / 2;
            ctx.strokeStyle = 'rgba(255,214,120,0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, t * 0.46, 0, Math.PI * 2);
            ctx.stroke();
        }

        this.drawFooter(ctx);

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(ctx, this.w / 2 - 96, this.oy + this.bw / 2 - 24, 192, 48, 15, 'rgba(32,36,42,0.86)');
            text(ctx, this.banner.text, this.w / 2, this.oy + this.bw / 2, {
                size: 16,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }
    }

    drawDisc(ctx, side, r) {
        ctx.fillStyle = side === BLACK ? '#22262C' : '#F7F7F5';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = side === BLACK ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.16)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        circle(
            ctx,
            -r * 0.28,
            -r * 0.3,
            r * 0.26,
            side === BLACK ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)'
        );
    }

    drawHud(ctx) {
        const black = this.count(BLACK);
        const white = this.count(WHITE);

        ctx.save();
        ctx.translate(this.w / 2 - 74, 30);
        ctx.scale(0.8, 0.8);
        this.drawDisc(ctx, BLACK, 13);
        ctx.restore();
        text(ctx, black, this.w / 2 - 44, 31, {
            size: 19,
            color: '#23262B',
            align: 'left',
            weight: 'bold',
        });

        ctx.save();
        ctx.translate(this.w / 2 + 26, 30);
        ctx.scale(0.8, 0.8);
        this.drawDisc(ctx, WHITE, 13);
        ctx.restore();
        text(ctx, white, this.w / 2 + 48, 31, {
            size: 19,
            color: '#23262B',
            align: 'left',
            weight: 'bold',
        });

        const label = this.finished
            ? '终局'
            : this.turn === BLACK
            ? '轮到你'
            : '电脑思考中';
        text(ctx, label, this.w / 2, 62, {
            size: 12,
            color: this.turn === BLACK && !this.finished ? '#2F7D46' : '#9AA1AA',
            weight: this.turn === BLACK && !this.finished ? 'bold' : 'normal',
        });
    }

    drawFooter(ctx) {
        const y = this.oy + this.bw + 26;
        if (y > this.h - 10) {
            return;
        }
        text(ctx, '点白点落子，把对方的子夹在中间即可翻转', this.w / 2, y, {
            size: 12,
            color: '#9AA1AA',
        });
    }
}

module.exports = Reversi;
