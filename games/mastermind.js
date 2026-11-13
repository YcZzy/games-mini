/**
 * 猜码（Mastermind）。
 *
 * 密码 4 位、6 种颜色、允许重复，8 次机会。
 * 反馈黑钉 = 颜色与位置都对；白钉 = 颜色对但位置错。
 * 重复颜色的计数严格按「先扣掉黑钉再按颜色取最小值」，不会多算。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const COLORS = ['#D9614F', '#E8A33D', '#E3CE5A', '#5FAE6B', '#5C93D6', '#4FB0BE'];
const NAMES = ['红', '橙', '黄', '绿', '蓝', '青'];
const LEN = 4;
const MAX_TRIES = 8;

function feedback(secret, guess) {
    let black = 0;
    const sRest = {};
    const gRest = {};
    for (let i = 0; i < LEN; i += 1) {
        if (secret[i] === guess[i]) {
            black += 1;
        } else {
            sRest[secret[i]] = (sRest[secret[i]] || 0) + 1;
            gRest[guess[i]] = (gRest[guess[i]] || 0) + 1;
        }
    }
    let white = 0;
    Object.keys(gRest).forEach((k) => {
        const have = sRest[k] || 0;
        white += Math.min(gRest[k], have);
    });
    return { black, white };
}

class Mastermind extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.wins = 0;
    }

    start() {
        this.wins = 0;
        this.newRound();
    }

    newRound() {
        this.secret = [];
        for (let i = 0; i < LEN; i += 1) {
            this.secret.push(Math.floor(Math.random() * COLORS.length));
        }
        this.rows = [];
        this.current = [-1, -1, -1, -1];
        this.cursor = 0;
        this.solved = false;
        this.failed = false;
        this.finished = false;
        this.result = null;
        this.message = '';
        this.messageLife = 0;
        this.reveal = 0;
        this.layout();
        this.emitScore(this.rows.length);
    }

    layout() {
        const topPad = 46;
        const paletteH = 48;
        const btnH = 38;
        const gapAfter = 12;
        const availH = this.h - topPad - paletteH - btnH - gapAfter * 2 - 8;
        this.rowH = Math.floor(Math.min(availH / MAX_TRIES, 46));
        this.peg = Math.min(30, Math.floor(this.rowH * 0.68));

        const feedbackW = 44;
        const gapPeg = 6;
        const totalW = this.peg * LEN + gapPeg * (LEN - 1) + feedbackW + 10;
        this.padX = Math.floor((this.w - totalW) / 2);
        this.boardTop = topPad + 6;
        this.gapPeg = gapPeg;
        this.feedbackW = feedbackW;

        this.paletteY = this.boardTop + this.rowH * MAX_TRIES + 10;
        this.btnY = this.paletteY + paletteH + 4;
        this.paletteR = Math.min(17, (this.w - 40) / (COLORS.length * 2.6));
    }

    pegX(i) {
        return this.padX + i * (this.peg + this.gapPeg);
    }

    rowY(r) {
        return this.boardTop + r * this.rowH + (this.rowH - this.peg) / 2;
    }

    palettePositions() {
        const n = COLORS.length;
        const gap = (this.w - this.paletteR * 2 * n) / (n + 1);
        const out = [];
        for (let i = 0; i < n; i += 1) {
            out.push({
                x: gap + this.paletteR + i * (this.paletteR * 2 + gap),
                y: this.paletteY + this.paletteR + 4,
                color: i,
            });
        }
        return out;
    }

    buttonRects() {
        const bw = 88;
        const gap = 12;
        const total = bw * 2 + gap;
        const startX = (this.w - total) / 2;
        return [
            { key: 'undo', label: '撤销', x: startX, w: bw },
            { key: 'submit', label: '提交', x: startX + bw + gap, w: bw },
        ];
    }

    say(msg) {
        this.message = msg;
        this.messageLife = 1500;
    }

    onTap(p) {
        if (this.result) {
            if (this.reveal > 0) {
                this.newRound();
            }
            return;
        }

        // 调色板
        const pals = this.palettePositions();
        for (let i = 0; i < pals.length; i += 1) {
            const dx = p.x - pals[i].x;
            const dy = p.y - pals[i].y;
            if (dx * dx + dy * dy <= (this.paletteR + 6) * (this.paletteR + 6)) {
                this.pickColor(pals[i].color);
                return;
            }
        }

        // 按钮
        if (p.y >= this.btnY && p.y <= this.btnY + 34) {
            const btns = this.buttonRects();
            for (let i = 0; i < btns.length; i += 1) {
                const b = btns[i];
                if (p.x >= b.x && p.x <= b.x + b.w) {
                    if (b.key === 'undo') {
                        this.undo();
                    } else {
                        this.submit();
                    }
                    return;
                }
            }
        }

        // 当前行格子
        const y = this.rowY(this.rows.length);
        if (p.y >= y - 4 && p.y <= y + this.peg + 4) {
            for (let i = 0; i < LEN; i += 1) {
                const x = this.pegX(i);
                if (p.x >= x && p.x <= x + this.peg) {
                    this.cursor = i;
                    return;
                }
            }
        }
    }

    pickColor(color) {
        if (this.cursor >= LEN) {
            this.cursor = LEN - 1;
        }
        this.current[this.cursor] = color;
        this.cursor = Math.min(this.cursor + 1, LEN - 1);
        if (this.api.vibrate) {
            this.api.vibrate();
        }
    }

    undo() {
        for (let i = LEN - 1; i >= 0; i -= 1) {
            if (this.current[i] !== -1) {
                this.current[i] = -1;
                this.cursor = i;
                return;
            }
        }
    }

    submit() {
        for (let i = 0; i < LEN; i += 1) {
            if (this.current[i] === -1) {
                this.say('先把四个颜色都填满');
                return;
            }
        }
        const fb = feedback(this.secret, this.current);
        this.rows.push({ guess: this.current.slice(), black: fb.black, white: fb.white });
        this.current = [-1, -1, -1, -1];
        this.cursor = 0;
        this.emitScore(this.rows.length);

        if (fb.black === LEN) {
            this.result = 'win';
            this.reveal = 1;
            this.emitWin({
                score: this.rows.length,
                message: `${this.rows.length} 次猜中，密码是 ${this.secret.map((c) => NAMES[c]).join(' ')}`,
            });
            return;
        }
        if (this.rows.length >= MAX_TRIES) {
            this.result = 'lose';
            this.reveal = 1;
            this.emitOver({
                score: MAX_TRIES,
                message: `没猜中，答案是 ${this.secret.map((c) => NAMES[c]).join(' ')}`,
            });
        }
    }

    update(dt) {
        this.time += dt;
        if (this.messageLife > 0) {
            this.messageLife -= dt;
            if (this.messageLife <= 0) {
                this.message = '';
            }
        }
    }

    /* ---------- 绘制 ---------- */

    render(ctx) {
        this.drawHeader(ctx);
        this.drawBoard(ctx);
        this.drawPalette(ctx);
        this.drawButtons(ctx);
        if (this.message) {
            const tw = 220;
            const x = (this.w - tw) / 2;
            const y = this.boardTop - 4;
            fillRoundRect(ctx, x, y, tw, 28, 14, 'rgba(44, 50, 58, 0.92)');
            text(ctx, this.message, this.w / 2, y + 14, { size: 12, color: '#FFFFFF' });
        }
        if (this.result) {
            this.drawEndMask(ctx);
        }
    }

    drawHeader(ctx) {
        const left = MAX_TRIES - this.rows.length;
        let label = `还剩 ${left} 次机会`;
        if (this.result === 'win') {
            label = `${this.rows.length} 次猜中`;
        } else if (this.result === 'lose') {
            label = '机会用完了';
        }
        text(ctx, label, this.w / 2, 22, { size: 15, color: '#39424E', weight: 'bold' });
        text(ctx, '先点格子再点颜色，凑齐四格后提交', this.w / 2, 42, {
            size: 11,
            color: '#A7AEB8',
        });
    }

    drawBoard(ctx) {
        const curb = this.rows.length;
        for (let r = 0; r < MAX_TRIES; r += 1) {
            const y = this.rowY(r);
            const active = r === curb && !this.result;
            const record = this.rows[r];

            if (active) {
                fillRoundRect(
                    ctx,
                    this.pegX(0) - 8,
                    y - 5,
                    this.peg * LEN + this.gapPeg * (LEN - 1) + this.feedbackW + 26,
                    this.peg + 10,
                    10,
                    'rgba(92, 147, 214, 0.1)'
                );
            }

            for (let i = 0; i < LEN; i += 1) {
                const x = this.pegX(i);
                const value = record ? record.guess[i] : active ? this.current[i] : -1;
                if (value >= 0) {
                    fillRoundRect(ctx, x, y, this.peg, this.peg, this.peg * 0.32, COLORS[value]);
                } else {
                    fillRoundRect(ctx, x, y, this.peg, this.peg, this.peg * 0.32, '#EDEFF2');
                }
                if (active && this.cursor === i && value === -1) {
                    ctx.strokeStyle = '#5C93D6';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, this.peg - 2, this.peg - 2);
                }
            }

            if (record) {
                this.drawFeedback(ctx, record, r);
            }
        }
    }

    drawFeedback(ctx, record, rowIndex) {
        const r = Math.max(3, this.peg * 0.13);
        const baseX = this.pegX(LEN - 1) + this.peg + 12;
        const total = record.black + record.white;
        const perRow = 4;
        const topY = this.rowY(rowIndex) + r + 2;
        for (let i = 0; i < 8; i += 1) {
            const col = i % perRow;
            const row = Math.floor(i / perRow);
            const cx = baseX + 8 + col * (r * 2 + 3);
            const cy = topY + row * (r * 2 + 3);
            if (i < total) {
                circle(ctx, cx, cy, r, i < record.black ? '#2C323A' : '#FFFFFF');
                if (i >= record.black) {
                    ctx.strokeStyle = '#B9C1CB';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
            } else {
                ctx.strokeStyle = '#E1E5EA';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    drawPalette(ctx) {
        const pals = this.palettePositions();
        const used = {};
        this.current.forEach((v) => {
            if (v >= 0) {
                used[v] = (used[v] || 0) + 1;
            }
        });
        pals.forEach((p) => {
            circle(ctx, p.x, p.y, this.paletteR, COLORS[p.color]);
            if (used[p.color]) {
                ctx.strokeStyle = 'rgba(44, 50, 58, 0.55)';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, this.paletteR + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    drawButtons(ctx) {
        this.buttonRects().forEach((b) => {
            const isSubmit = b.key === 'submit';
            fillRoundRect(
                ctx,
                b.x,
                this.btnY,
                b.w,
                34,
                17,
                isSubmit ? '#39424E' : '#EFF2F5'
            );
            text(ctx, b.label, b.x + b.w / 2, this.btnY + 17, {
                size: 14,
                color: isSubmit ? '#FFFFFF' : '#4A5560',
                weight: isSubmit ? 'bold' : 'normal',
            });
        });
    }

    drawEndMask(ctx) {
        const w = Math.min(this.w - 48, 260);
        const h = 92;
        const x = (this.w - w) / 2;
        const y = this.boardTop + (this.rowH * MAX_TRIES - h) / 2;
        fillRoundRect(ctx, x, y, w, h, 16, 'rgba(252, 251, 247, 0.97)');
        ctx.strokeStyle = '#E2DCD0';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);

        text(ctx, this.result === 'win' ? '解开了' : '答案揭晓', x + w / 2, y + 24, {
            size: 15,
            color: '#39424E',
            weight: 'bold',
        });

        const gap = 8;
        const peg = 24;
        const total = LEN * peg + gap * (LEN - 1);
        const startX = x + (w - total) / 2;
        this.secret.forEach((c, i) => {
            fillRoundRect(ctx, startX + i * (peg + gap), y + 40, peg, peg, 8, COLORS[c]);
        });

        text(ctx, '点一下开新局', x + w / 2, y + 78, { size: 11, color: '#A7AEB8' });
    }
}

module.exports = Mastermind;
module.exports.feedback = feedback;
