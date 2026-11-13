/**
 * 空当接龙（FreeCell）。
 *
 * 52 张牌，8 列牌堆 + 4 个自由格 + 4 个基础堆。
 * 一次能搬动的连续牌数量 = (空自由格 + 1) × 2^空列数，这是 FreeCell 的核心规则。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function isRed(card) {
    return card.s === 1 || card.s === 2;
}

function rankLabel(card) {
    return RANKS[card.r];
}

function makeDeck(seed) {
    const deck = [];
    for (let s = 0; s < 4; s += 1) {
        for (let r = 1; r <= 13; r += 1) {
            deck.push({ s, r });
        }
    }
    // 线性同余洗牌，保证同种子同牌局
    let x = seed % 2147483647;
    if (x <= 0) {
        x += 2147483646;
    }
    const rnd = () => {
        x = (x * 16807) % 2147483647;
        return (x - 1) / 2147483646;
    };
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
    }
    return deck;
}

/* ---------- 花色绘制 ---------- */

function drawSuit(ctx, s, cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    if (s === 1) {
        // 红心
        ctx.moveTo(cx, cy + size * 0.42);
        ctx.bezierCurveTo(cx - size * 0.62, cy - size * 0.02, cx - size * 0.34, cy - size * 0.5, cx, cy - size * 0.18);
        ctx.bezierCurveTo(cx + size * 0.34, cy - size * 0.5, cx + size * 0.62, cy - size * 0.02, cx, cy + size * 0.42);
        ctx.fill();
    } else if (s === 2) {
        // 方块
        ctx.moveTo(cx, cy - size * 0.46);
        ctx.lineTo(cx + size * 0.34, cy);
        ctx.lineTo(cx, cy + size * 0.46);
        ctx.lineTo(cx - size * 0.34, cy);
        ctx.closePath();
        ctx.fill();
    } else if (s === 0) {
        // 黑桃（倒心 + 茎）
        ctx.moveTo(cx, cy - size * 0.48);
        ctx.bezierCurveTo(cx + size * 0.55, cy - size * 0.02, cx + size * 0.36, cy + size * 0.3, cx, cy + size * 0.1);
        ctx.bezierCurveTo(cx - size * 0.36, cy + size * 0.3, cx - size * 0.55, cy - size * 0.02, cx, cy - size * 0.48);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx, cy + size * 0.08);
        ctx.lineTo(cx + size * 0.16, cy + size * 0.44);
        ctx.lineTo(cx - size * 0.16, cy + size * 0.44);
        ctx.closePath();
        ctx.fill();
    } else {
        // 梅花（三圆 + 茎）
        const rr = size * 0.23;
        circle(ctx, cx, cy - size * 0.2, rr, color);
        circle(ctx, cx - size * 0.24, cy + size * 0.12, rr, color);
        circle(ctx, cx + size * 0.24, cy + size * 0.12, rr, color);
        ctx.beginPath();
        ctx.moveTo(cx, cy + size * 0.05);
        ctx.lineTo(cx + size * 0.13, cy + size * 0.44);
        ctx.lineTo(cx - size * 0.13, cy + size * 0.44);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function suitSymbol(s) {
    return SUITS[s];
}

/* ---------- 游戏 ---------- */

class FreeCell extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.seed = Math.floor(Math.random() * 1000000) + 1;
    }

    start() {
        this.deal(this.seed);
    }

    newGame() {
        this.seed = Math.floor(Math.random() * 1000000) + 1;
        this.deal(this.seed);
    }

    deal(seed) {
        const deck = makeDeck(seed);
        this.cols = [[], [], [], [], [], [], [], []];
        let idx = 0;
        for (let r = 0; r < 7; r += 1) {
            for (let c = 0; c < 8; c += 1) {
                if (r < 6 || c < 4) {
                    this.cols[c].push(deck[idx]);
                    idx += 1;
                }
            }
        }
        this.free = [null, null, null, null];
        this.foundation = [[], [], [], []];
        this.selected = null;
        this.history = [];
        this.result = null;
        this.finished = false;
        this.moves = 0;
        this.message = '';
        this.messageLife = 0;
        this.layout();
        this.emitScore(0);
    }

    layout() {
        const pad = 8;
        const gap = 4;
        this.cardW = Math.floor((this.w - pad * 2 - gap * 7) / 8);
        this.cardH = Math.round(this.cardW * 1.42);
        this.padX = Math.floor((this.w - (this.cardW * 8 + gap * 7)) / 2);
        this.slotY = 6;
        this.colTop = this.slotY + this.cardH + 32;
        this.btnY = this.h - 34;
        this.colBottom = this.btnY - 10;
    }

    /** 一次能搬动的牌数上限。目标列本身是空列时，它不能算作中转位。 */
    capacityFor(targetIsEmpty) {
        const freeCount = this.free.filter((x) => !x).length;
        let emptyCols = this.cols.filter((c) => c.length === 0).length;
        if (targetIsEmpty) {
            emptyCols -= 1;
        }
        if (emptyCols < 0) {
            emptyCols = 0;
        }
        return (freeCount + 1) * Math.pow(2, emptyCols);
    }

    maxMovable() {
        return this.capacityFor(false);
    }

    colX(i) {
        return this.padX + i * (this.cardW + 4);
    }

    freeX(i) {
        return this.padX + i * (this.cardW + 4);
    }

    foundX(i) {
        return this.padX + (4 + i) * (this.cardW + 4);
    }

    colOffset(len) {
        const avail = this.colBottom - this.colTop - this.cardH;
        if (len <= 1) {
            return 0;
        }
        const step = avail / (len - 1);
        return Math.max(15, Math.min(step, this.cardH * 0.56));
    }

    cardY(colIndex, cardIndex) {
        const len = this.cols[colIndex].length;
        return this.colTop + cardIndex * this.colOffset(len);
    }

    say(msg) {
        this.message = msg;
        this.messageLife = 1600;
    }

    canDropOn(card, target) {
        return target.r === card.r + 1 && isRed(card) !== isRed(target);
    }

    isSequence(col, from) {
        for (let i = from; i < col.length - 1; i += 1) {
            if (!this.canDropOn(col[i], col[i + 1])) {
                return false;
            }
        }
        return true;
    }

    snapshot() {
        this.history.push({
            cols: this.cols.map((c) => c.slice()),
            free: this.free.slice(),
            foundation: this.foundation.map((f) => f.slice()),
            moves: this.moves,
        });
        if (this.history.length > 200) {
            this.history.shift();
        }
    }

    pushToFoundation(card, from) {
        const pile = this.foundation[card.s];
        if (card.r !== pile.length + 1) {
            return false;
        }
        pile.push(card);
        return true;
    }

    /* ---------- 交互 ---------- */

    onTap(p) {
        if (this.result) {
            return;
        }
        if (p.y >= this.btnY) {
            this.onButtonHit(p);
            return;
        }

        // 顶部槽位
        if (p.y >= this.slotY && p.y <= this.slotY + this.cardH) {
            for (let i = 0; i < 4; i += 1) {
                const x = this.freeX(i);
                if (p.x >= x && p.x <= x + this.cardW) {
                    this.tapFree(i);
                    return;
                }
            }
            for (let i = 0; i < 4; i += 1) {
                const x = this.foundX(i);
                if (p.x >= x && p.x <= x + this.cardW) {
                    this.tapFoundation(i);
                    return;
                }
            }
            return;
        }

        // 列
        for (let i = 0; i < 8; i += 1) {
            const x = this.colX(i);
            if (p.x < x || p.x > x + this.cardW) {
                continue;
            }
            const col = this.cols[i];
            if (!col.length) {
                this.tapColumn(i);
                return;
            }
            for (let j = col.length - 1; j >= 0; j -= 1) {
                const y = this.cardY(i, j);
                const bottom = j === col.length - 1 ? y + this.cardH : this.cardY(i, j + 1);
                if (p.y >= y && p.y <= bottom) {
                    this.tapColumnCard(i, j);
                    return;
                }
            }
            return;
        }

        this.selected = null;
    }

    tapFree(i) {
        const card = this.free[i];
        if (this.selected) {
            if (this.selected.type === 'free' && this.selected.index === i) {
                this.selected = null;
                return;
            }
            if (this.selected.type === 'col' && this.selected.cards.length === 1) {
                const moving = this.selected.cards[0];
                if (!card) {
                    this.snapshot();
                    this.cols[this.selected.col].pop();
                    this.free[i] = moving;
                    this.moves += 1;
                    this.selected = null;
                    this.emitScore(this.moves);
                    return;
                }
            }
            this.selected = null;
            return;
        }
        if (card) {
            this.selected = { type: 'free', index: i, cards: [card] };
        }
    }

    tapFoundation(i) {
        if (this.selected && this.selected.cards.length === 1) {
            const card = this.selected.cards[0];
            if (card.s === i && card.r === this.foundation[i].length + 1) {
                this.snapshot();
                if (this.selected.type === 'free') {
                    this.free[this.selected.index] = null;
                } else {
                    this.cols[this.selected.col].pop();
                }
                this.foundation[i].push(card);
                this.moves += 1;
                this.selected = null;
                this.emitScore(this.moves);
                this.checkWin();
                return;
            }
        }
        // 未选中时，点基础堆把能收的牌收上去
        this.autoCollect();
        this.selected = null;
    }

    tapColumn(colIndex) {
        if (!this.selected) {
            return;
        }
        if (this.selected.type === 'col' && this.selected.col === colIndex) {
            this.selected = null;
            return;
        }
        const cards = this.selected.cards;
        const target = this.cols[colIndex];
        const cap = this.capacityFor(target.length === 0);

        if (target.length === 0) {
            if (cards.length > cap) {
                this.say(`空位只够搬 ${cap} 张`);
                this.selected = null;
                return;
            }
        } else {
            const top = target[target.length - 1];
            if (!this.canDropOn(cards[0], top)) {
                this.selected = null;
                return;
            }
            if (cards.length > cap) {
                this.say(`最多能搬 ${cap} 张`);
                this.selected = null;
                return;
            }
        }
        this.snapshot();
        this.takeSelected();
        cards.forEach((c) => target.push(c));
        this.moves += 1;
        this.selected = null;
        this.emitScore(this.moves);
        this.checkWin();
    }

    tapColumnCard(colIndex, cardIndex) {
        if (this.selected) {
            // 目标就是当前选中的起点，取消
            if (this.selected.type === 'col' && this.selected.col === colIndex
                && this.selected.from === cardIndex) {
                this.selected = null;
                return;
            }
            this.tapColumn(colIndex);
            return;
        }
        const col = this.cols[colIndex];
        if (!this.isSequence(col, cardIndex)) {
            this.say('只能搬动颜色交替的连号牌');
            return;
        }
        const cards = col.slice(cardIndex);
        if (cards.length > this.maxMovable()) {
            this.say(`最多能搬 ${this.maxMovable()} 张`);
            return;
        }
        this.selected = { type: 'col', col: colIndex, from: cardIndex, cards };
    }

    takeSelected() {
        if (this.selected.type === 'free') {
            this.free[this.selected.index] = null;
        } else {
            this.cols[this.selected.col].length = this.selected.from;
        }
    }

    hasCollectable() {
        for (let i = 0; i < 4; i += 1) {
            const c = this.free[i];
            if (c && c.r === this.foundation[c.s].length + 1) {
                return true;
            }
        }
        for (let i = 0; i < 8; i += 1) {
            const col = this.cols[i];
            if (!col.length) {
                continue;
            }
            const top = col[col.length - 1];
            if (top.r === this.foundation[top.s].length + 1) {
                return true;
            }
        }
        return false;
    }

    autoCollect() {
        if (!this.hasCollectable()) {
            return 0;
        }
        this.snapshot();
        let moved = 0;
        let guard = 0;
        let changed = true;
        while (changed && guard < 60) {
            changed = false;
            guard += 1;
            for (let i = 0; i < 4; i += 1) {
                const c = this.free[i];
                if (c && this.pushToFoundation(c)) {
                    this.free[i] = null;
                    moved += 1;
                    changed = true;
                }
            }
            for (let i = 0; i < 8; i += 1) {
                const col = this.cols[i];
                if (!col.length) {
                    continue;
                }
                const top = col[col.length - 1];
                if (this.pushToFoundation(top)) {
                    col.pop();
                    moved += 1;
                    changed = true;
                }
            }
        }
        if (moved) {
            this.moves += moved;
            this.emitScore(this.moves);
            this.checkWin();
        }
        return moved;
    }

    onButtonHit(p) {
        const btns = this.buttons();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= this.btnY && p.y <= this.btnY + 30) {
                if (b.key === 'undo') {
                    this.undo();
                } else if (b.key === 'collect') {
                    const n = this.autoCollect();
                    if (!n) {
                        this.say('暂时没有能收的牌');
                    }
                } else if (b.key === 'new') {
                    this.snapshot();
                    this.newGame();
                }
                return;
            }
        }
    }

    buttons() {
        const list = [
            { key: 'undo', label: '撤回' },
            { key: 'collect', label: '收牌' },
            { key: 'new', label: '新局' },
        ];
        const gap = 10;
        const bw = Math.min(84, (this.w - 40 - gap * 2) / 3);
        const total = bw * 3 + gap * 2;
        const startX = (this.w - total) / 2;
        return list.map((it, i) => ({ key: it.key, label: it.label, x: startX + i * (bw + gap), w: bw }));
    }

    undo() {
        if (!this.history.length) {
            this.say('没有可撤回的操作');
            return;
        }
        const h = this.history.pop();
        this.cols = h.cols;
        this.free = h.free;
        this.foundation = h.foundation;
        this.moves = h.moves;
        this.selected = null;
        this.emitScore(this.moves);
    }

    checkWin() {
        const total = this.foundation.reduce((acc, f) => acc + f.length, 0);
        if (total === 52) {
            this.result = 'win';
            this.emitWin({ score: this.moves, message: `全部收完，用了 ${this.moves} 步` });
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
        this.drawSlots(ctx);
        this.drawColumns(ctx);
        this.drawButtons(ctx);
        if (this.selected) {
            this.drawSelectedGhost(ctx);
        }
        if (this.message) {
            const tw = Math.min(this.w - 40, 260);
            const x = (this.w - tw) / 2;
            const y = this.colTop + 40;
            fillRoundRect(ctx, x, y, tw, 34, 17, 'rgba(40, 46, 54, 0.9)');
            text(ctx, this.message, this.w / 2, y + 17, { size: 12, color: '#FFFFFF' });
        }
        this.drawProgress(ctx);
    }

    drawProgress(ctx) {
        let done = 0;
        for (let i = 0; i < 4; i += 1) {
            done += this.foundation[i].length;
        }
        text(ctx, `已收 ${done}/52 · 第 ${this.seed} 局`, this.w / 2, this.slotY + this.cardH + 14, {
            size: 10,
            color: '#A7AEB8',
        });
    }

    drawEmptySlot(ctx, x, y, w, h, label) {
        fillRoundRect(ctx, x, y, w, h, 6, 'rgba(232, 236, 241, 0.85)');
        ctx.strokeStyle = 'rgba(196, 204, 214, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash && ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash && ctx.setLineDash([]);
        if (label) {
            text(ctx, label, x + w / 2, y + h / 2, { size: 11, color: '#B6BFCA' });
        }
    }

    drawCardFace(ctx, card, x, y, w, h) {
        fillRoundRect(ctx, x, y, w, h, 6, '#FFFFFF');
        ctx.strokeStyle = 'rgba(180, 188, 198, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        const color = isRed(card) ? '#C93B3B' : '#2A3038';
        const fs = Math.max(9, Math.round(w * 0.32));
        text(ctx, rankLabel(card), x + w * 0.22, y + fs * 0.72, {
            size: fs,
            color,
            weight: 'bold',
            baseline: 'middle',
        });
        drawSuit(ctx, card.s, x + w * 0.24, y + fs * 1.65, fs * 0.72, color);

        drawSuit(ctx, card.s, x + w * 0.53, y + h * 0.58, w * 0.46, color);
    }

    drawSlots(ctx) {
        const w = this.cardW;
        const h = this.cardH;
        for (let i = 0; i < 4; i += 1) {
            const x = this.freeX(i);
            const card = this.free[i];
            if (card) {
                this.drawCardFace(ctx, card, x, this.slotY, w, h);
                if (this.selected && this.selected.type === 'free' && this.selected.index === i) {
                    ctx.strokeStyle = '#5C94D6';
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(x - 1, this.slotY - 1, w + 2, h + 2);
                }
            } else {
                this.drawEmptySlot(ctx, x, this.slotY, w, h, '空');
            }
        }
        for (let i = 0; i < 4; i += 1) {
            const x = this.foundX(i);
            const pile = this.foundation[i];
            if (pile.length) {
                this.drawCardFace(ctx, pile[pile.length - 1], x, this.slotY, w, h);
            } else {
                this.drawEmptySlot(ctx, x, this.slotY, w, h, '');
                drawSuit(ctx, i, x + w / 2, this.slotY + h / 2, w * 0.4, 'rgba(180, 188, 198, 0.55)');
            }
        }
    }

    drawColumns(ctx) {
        const w = this.cardW;
        const h = this.cardH;
        for (let i = 0; i < 8; i += 1) {
            const x = this.colX(i);
            const col = this.cols[i];
            if (!col.length) {
                this.drawEmptySlot(ctx, x, this.colTop, w, h, '');
                continue;
            }
            for (let j = 0; j < col.length; j += 1) {
                const y = this.cardY(i, j);
                const isSel = this.selected && this.selected.type === 'col'
                    && this.selected.col === i && j >= this.selected.from;
                if (!isSel || j !== this.selected.from) {
                    this.drawCardFace(ctx, col[j], x, y, w, h);
                } else {
                    this.drawCardFace(ctx, col[j], x, y, w, h);
                    ctx.strokeStyle = '#5C94D6';
                    ctx.lineWidth = 2.5;
                    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
                }
            }
        }
    }

    drawSelectedGhost(ctx) {
        // 被选中的牌堆整体下沉一点，视觉上"拿起来了"
        const sel = this.selected;
        if (!sel.cards.length) {
            return;
        }
        void sel;
    }

    drawButtons(ctx) {
        this.buttons().forEach((b) => {
            fillRoundRect(ctx, b.x, this.btnY, b.w, 30, 15, '#EFF2F5');
            text(ctx, b.label, b.x + b.w / 2, this.btnY + 15, { size: 13, color: '#4A5560' });
        });
    }
}

module.exports = FreeCell;
module.exports.suitSymbol = suitSymbol;
