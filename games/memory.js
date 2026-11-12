const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const PAIRS = 8;
const SYMBOL_COLORS = [
    '#E9695C',
    '#E9A25B',
    '#E5C367',
    '#7ECB84',
    '#5FA9C7',
    '#7590F2',
    '#A78BDB',
    '#E991AC',
];

class Memory extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.cols = 4;
        this.rows = 4;
        this.boardSize = Math.min(this.w - 36, this.h - 60);
        this.gap = this.boardSize * 0.04;
        this.cellSize = (this.boardSize - this.gap * (this.cols + 1)) / this.cols;
        this.originX = (this.w - this.boardSize) / 2;
        this.originY = (this.h - this.boardSize) / 2;
    }

    start() {
        const deck = [];
        for (let i = 0; i < PAIRS; i += 1) {
            deck.push({ sym: i, id: this.idSeq() });
            deck.push({ sym: i, id: this.idSeq() });
        }
        for (let i = deck.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }

        this.cards = deck.map((item) => ({
            sym: item.sym,
            flipped: false,
            matched: false,
            flipT: 0,
            dir: 0,
        }));
        this.picked = [];
        this.lock = false;
        this.moves = 0;
        this.matchedPairs = 0;
        this.finished = false;
        this.emitScore(0);
    }

    idSeq() {
        this._id = (this._id || 0) + 1;
        return this._id;
    }

    cardRect(index) {
        const r = Math.floor(index / this.cols);
        const c = index % this.cols;
        return {
            x: this.originX + this.gap + c * (this.cellSize + this.gap),
            y: this.originY + this.gap + r * (this.cellSize + this.gap),
            w: this.cellSize,
            h: this.cellSize,
        };
    }

    onTap(p) {
        if (this.lock || this.finished) {
            return;
        }
        for (let i = 0; i < this.cards.length; i += 1) {
            const rect = this.cardRect(i);
            if (
                p.x >= rect.x &&
                p.x <= rect.x + rect.w &&
                p.y >= rect.y &&
                p.y <= rect.y + rect.h
            ) {
                const card = this.cards[i];
                if (card.matched || card.flipped) {
                    return;
                }
                card.flipped = true;
                card.flipT = 0;
                card.dir = 1;
                this.picked.push(i);
                if (this.api.vibrate) {
                    this.api.vibrate('light');
                }
                if (this.picked.length === 2) {
                    this.moves += 1;
                    this.emitScore(this.moves);
                    this.checkPair();
                }
                return;
            }
        }
    }

    checkPair() {
        const [a, b] = this.picked;
        if (this.cards[a].sym === this.cards[b].sym) {
            this.cards[a].matched = true;
            this.cards[b].matched = true;
            this.picked = [];
            this.matchedPairs += 1;
            if (this.matchedPairs >= PAIRS) {
                this.finished = true;
                if (this.api.vibrate) {
                    this.api.vibrate('heavy');
                }
                this.emitWin({ score: this.moves, message: '全部配对完成' });
            }
        } else {
            this.lock = true;
            this._flipTimer = setTimeout(() => {
                this._flipTimer = null;
                [a, b].forEach((idx) => {
                    this.cards[idx].flipped = false;
                    this.cards[idx].dir = -1;
                });
                this.picked = [];
                this.lock = false;
            }, 620);
        }
    }

    destroy() {
        super.destroy();
        if (this._flipTimer) {
            clearTimeout(this._flipTimer);
            this._flipTimer = null;
        }
    }

    update(dt) {
        super.update(dt);
        this.cards.forEach((card) => {
            if (card.dir > 0) {
                card.flipT = Math.min(1, card.flipT + dt / 200);
                if (card.flipT >= 1) {
                    card.dir = 0;
                }
            } else if (card.dir < 0) {
                card.flipT = Math.max(0, card.flipT - dt / 200);
                if (card.flipT <= 0) {
                    card.dir = 0;
                }
            }
        });
    }

    render(ctx) {
        this.cards.forEach((card, i) => {
            const rect = this.cardRect(i);
            const half = Math.abs(Math.cos(Math.PI * card.flipT));
            const showFront = card.flipT > 0.5;
            const w = Math.max(2, rect.w * half);
            const x = rect.x + (rect.w - w) / 2;
            const y = rect.y;

            if (showFront) {
                fillRoundRect(ctx, x, y, w, rect.h, 10, '#FFFFFF');
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, w, rect.h);
                ctx.clip();
                const color = SYMBOL_COLORS[card.sym % SYMBOL_COLORS.length];
                drawSymbol(ctx, card.sym, rect.x + rect.w / 2, y + rect.h / 2, rect.w * 0.62, color);
                ctx.restore();
                if (card.matched) {
                    fillRoundRect(
                        ctx,
                        rect.x + 1,
                        y + 1,
                        rect.w - 2,
                        rect.h - 2,
                        10,
                        'rgba(126, 203, 132, 0.2)'
                    );
                }
            } else {
                fillRoundRect(ctx, x, y, w, rect.h, 10, '#8E93A8');
                fillRoundRect(ctx, x, y, w, rect.h * 0.5, 10, 'rgba(255,255,255,0.14)');
                if (w > rect.w * 0.5) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, w, rect.h);
                    ctx.clip();
                    circle(
                        ctx,
                        rect.x + rect.w / 2,
                        y + rect.h / 2,
                        rect.w * 0.13,
                        'rgba(255,255,255,0.28)'
                    );
                    ctx.restore();
                }
            }
        });
    }
}

function drawSymbol(ctx, sym, cx, cy, size, color) {
    const r = size / 2;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, size * 0.09);
    ctx.lineJoin = 'round';

    switch (sym % 8) {
        case 0: {
            circle(ctx, cx, cy, r * 0.86, color);
            break;
        }
        case 1: {
            fillRoundRect(ctx, cx - r * 0.8, cy - r * 0.8, r * 1.6, r * 1.6, r * 0.22, color);
            break;
        }
        case 2: {
            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 0.86);
            ctx.lineTo(cx + r * 0.9, cy + r * 0.66);
            ctx.lineTo(cx - r * 0.9, cy + r * 0.66);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 3: {
            ctx.beginPath();
            ctx.moveTo(cx, cy - r * 0.9);
            ctx.lineTo(cx + r * 0.8, cy);
            ctx.lineTo(cx, cy + r * 0.9);
            ctx.lineTo(cx - r * 0.8, cy);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 4: {
            ctx.beginPath();
            for (let i = 0; i < 10; i += 1) {
                const radius = i % 2 === 0 ? r * 0.92 : r * 0.4;
                const angle = (Math.PI / 5) * i - Math.PI / 2;
                const px = cx + Math.cos(angle) * radius;
                const py = cy + Math.sin(angle) * radius;
                if (i === 0) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 5: {
            ctx.beginPath();
            ctx.moveTo(cx, cy + r * 0.82);
            ctx.bezierCurveTo(cx - r * 1.15, cy - r * 0.2, cx - r * 0.42, cy - r * 1.1, cx, cy - r * 0.34);
            ctx.bezierCurveTo(cx + r * 0.42, cy - r * 1.1, cx + r * 1.15, cy - r * 0.2, cx, cy + r * 0.82);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 6: {
            fillRoundRect(ctx, cx - r * 0.22, cy - r * 0.9, r * 0.44, r * 1.8, r * 0.12, color);
            fillRoundRect(ctx, cx - r * 0.9, cy - r * 0.22, r * 1.8, r * 0.44, r * 0.12, color);
            break;
        }
        default: {
            ctx.beginPath();
            for (let i = 0; i < 6; i += 1) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                const px = cx + Math.cos(angle) * r * 0.9;
                const py = cy + Math.sin(angle) * r * 0.9;
                if (i === 0) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
    }
    ctx.restore();
}

module.exports = Memory;
