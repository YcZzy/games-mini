/**
 * 德州扑克（无限注），4 人桌：你 + 3 个电脑对手。
 *
 * 实现要点：
 *   1. 牌力用「7 张里枚举 C(7,5) 取最大」的暴力法，正确性由穷举分布验证；
 *   2. 边池按贡献额分层，短筹码只能赢自己够得着的那部分；
 *   3. 电脑按底池赔率决策：翻牌前用 Chen 公式，翻牌后用蒙特卡洛胜率。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp, hitRect } = require('./draw.js');

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_CHAR = ['♠', '♥', '♣', '♦'];
const SUIT_RED = [1, 3];

const START_STACK = 1000;
const SB = 10;
const BB = 20;

/* ==================== 牌 ==================== */

/** 牌用 0..51 的整数表示：id = (点数 - 2) * 4 + 花色 */
function rankOf(id) {
    return (id >> 2) + 2;
}

function suitOf(id) {
    return id & 3;
}

function rankLabel(id) {
    return RANK_LABEL[rankOf(id) - 2];
}

function makeDeck() {
    const deck = [];
    for (let i = 0; i < 52; i += 1) {
        deck.push(i);
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = deck[i];
        deck[i] = deck[j];
        deck[j] = t;
    }
    return deck;
}

/* ==================== 牌力评估 ==================== */

// 15 进制打包：cat * 15^5 + r1 * 15^4 + ... + r5
const CAT_BASE = 759375;

function pack(cat, ranks) {
    let v = cat;
    for (let i = 0; i < 5; i += 1) {
        v = v * 15 + (ranks[i] || 0);
    }
    return v;
}

/** 五张牌强度，数值越大越强 */
function score5(ids) {
    const r0 = rankOf(ids[0]);
    const r1 = rankOf(ids[1]);
    const r2 = rankOf(ids[2]);
    const r3 = rankOf(ids[3]);
    const r4 = rankOf(ids[4]);
    const ranks = [r0, r1, r2, r3, r4];
    ranks.sort((a, b) => b - a);

    const s0 = suitOf(ids[0]);
    const flush =
        suitOf(ids[1]) === s0 &&
        suitOf(ids[2]) === s0 &&
        suitOf(ids[3]) === s0 &&
        suitOf(ids[4]) === s0;

    // 按「张数优先、点数其次」分组
    const groups = [];
    for (let i = 0; i < 5; i += 1) {
        let g = null;
        for (let k = 0; k < groups.length; k += 1) {
            if (groups[k].r === ranks[i]) {
                g = groups[k];
                break;
            }
        }
        if (g) {
            g.n += 1;
        } else {
            groups.push({ r: ranks[i], n: 1 });
        }
    }
    groups.sort((a, b) => b.n - a.n || b.r - a.r);

    // 顺子（5 张点数互不相同才可能）
    let straightHigh = 0;
    if (ranks[0] !== ranks[1] && ranks[1] !== ranks[2] && ranks[2] !== ranks[3] && ranks[3] !== ranks[4]) {
        if (ranks[0] - ranks[4] === 4) {
            straightHigh = ranks[0];
        } else if (ranks[0] === 14 && ranks[1] === 5) {
            straightHigh = 5; // A2345，最小顺子
        }
    }

    if (straightHigh && flush) {
        return pack(8, [straightHigh]);
    }
    if (groups[0].n === 4) {
        return pack(7, [groups[0].r, groups[1].r]);
    }
    if (groups[0].n === 3 && groups[1].n === 2) {
        return pack(6, [groups[0].r, groups[1].r]);
    }
    if (flush) {
        return pack(5, ranks);
    }
    if (straightHigh) {
        return pack(4, [straightHigh]);
    }
    if (groups[0].n === 3) {
        return pack(3, [groups[0].r, groups[1].r, groups[2].r]);
    }
    if (groups[0].n === 2 && groups[1].n === 2) {
        return pack(2, [groups[0].r, groups[1].r, groups[2].r]);
    }
    if (groups[0].n === 2) {
        return pack(1, [groups[0].r, groups[1].r, groups[2].r, groups[3].r]);
    }
    return pack(0, ranks);
}

/** 5~7 张里取最强五张 */
function bestScore(ids) {
    const n = ids.length;
    if (n < 5) {
        return -1;
    }
    if (n === 5) {
        return score5(ids);
    }

    let best = -1;
    const pick = [0, 0, 0, 0, 0];
    function choose(start, depth) {
        if (depth === 5) {
            const five = [
                ids[pick[0]],
                ids[pick[1]],
                ids[pick[2]],
                ids[pick[3]],
                ids[pick[4]],
            ];
            const v = score5(five);
            if (v > best) {
                best = v;
            }
            return;
        }
        const last = n - (5 - depth);
        for (let i = start; i <= last; i += 1) {
            pick[depth] = i;
            choose(i + 1, depth + 1);
        }
    }
    choose(0, 0);
    return best;
}

function categoryOf(score) {
    return Math.floor(score / CAT_BASE);
}

/** 返回凑成最强牌型的那五张牌，用于高亮 */
function bestCombo(ids) {
    const n = ids.length;
    if (n < 5) {
        return ids.slice();
    }
    let best = -1;
    let combo = null;
    const pick = [0, 0, 0, 0, 0];
    function choose(start, depth) {
        if (depth === 5) {
            const five = [
                ids[pick[0]],
                ids[pick[1]],
                ids[pick[2]],
                ids[pick[3]],
                ids[pick[4]],
            ];
            const v = score5(five);
            if (v > best) {
                best = v;
                combo = five;
            }
            return;
        }
        const last = n - (5 - depth);
        for (let i = start; i <= last; i += 1) {
            pick[depth] = i;
            choose(i + 1, depth + 1);
        }
    }
    choose(0, 0);
    return combo;
}

const CAT_NAME = [
    '高牌',
    '一对',
    '两对',
    '三条',
    '顺子',
    '同花',
    '葫芦',
    '四条',
    '同花顺',
];

/* ==================== 底池分层 ==================== */

/**
 * 按每人本局总投入分层，生成主池 + 边池。
 * 弃牌者的筹码计入底池但不在 eligible 里。
 */
function buildPots(players) {
    const levels = [];
    for (let i = 0; i < players.length; i += 1) {
        const t = players[i].total;
        if (t > 0 && levels.indexOf(t) < 0) {
            levels.push(t);
        }
    }
    levels.sort((a, b) => a - b);

    const pots = [];
    let prev = 0;
    for (let i = 0; i < levels.length; i += 1) {
        const lv = levels[i];
        let amount = 0;
        const eligible = [];
        for (let k = 0; k < players.length; k += 1) {
            const p = players[k];
            if (p.total >= lv) {
                amount += lv - prev;
                if (!p.folded) {
                    eligible.push(p);
                }
            }
        }
        if (amount > 0) {
            if (!eligible.length) {
                // 只有弃牌者能够到的层级：并入上一层，不让筹码蒸发
                if (pots.length) {
                    pots[pots.length - 1].amount += amount;
                }
            } else {
                const key = eligible.map((p) => p.id).join(',');
                const last = pots[pots.length - 1];
                if (last && last.key === key) {
                    last.amount += amount;
                } else {
                    pots.push({ amount, eligible, key });
                }
            }
        }
        prev = lv;
    }
    return pots;
}

/** Chen 公式，翻牌前的起手牌评分 */
function chenScore(hole) {
    const r1 = rankOf(hole[0]);
    const r2 = rankOf(hole[1]);
    const hi = Math.max(r1, r2);
    const lo = Math.min(r1, r2);

    let score;
    if (hi === 14) {
        score = 10;
    } else if (hi === 13) {
        score = 8;
    } else if (hi === 12) {
        score = 7;
    } else if (hi === 11) {
        score = 6;
    } else {
        score = hi / 2;
    }

    if (r1 === r2) {
        return Math.max(5, score * 2);
    }

    if (suitOf(hole[0]) === suitOf(hole[1])) {
        score += 2;
    }

    const gap = hi - lo - 1;
    if (gap === 1) {
        score -= 1;
    } else if (gap === 2) {
        score -= 2;
    } else if (gap === 3) {
        score -= 4;
    } else if (gap >= 4) {
        score -= 5;
    }

    if (gap <= 1 && hi < 12) {
        score += 1;
    }

    return Math.ceil(score);
}

/* ==================== 游戏 ==================== */

class Holdem extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.pad = 12;
        this.btnH = 42;
        this.delay = 0;
        this.next = null;
        this.banner = '';
        this.bannerLife = 0;
        this.revealAll = false;
        this.result = null;
        this.highlight = [];
        this.layout();
    }

    /* ---------- 生命周期 ---------- */

    start() {
        this.newGame();
    }

    newGame() {
        this.players = [
            { id: 0, name: '你', human: true, aggressive: 0.5 },
            { id: 1, name: '石头', human: false, aggressive: 0.34 },
            { id: 2, name: '阿七', human: false, aggressive: 0.62 },
            { id: 3, name: '老K', human: false, aggressive: 0.46 },
        ].map((p) => ({
            id: p.id,
            name: p.name,
            human: p.human,
            aggressive: p.aggressive,
            stack: START_STACK,
            hole: [],
            bet: 0,
            total: 0,
            folded: false,
            allIn: false,
            acted: false,
            lastAction: '',
            out: false,
        }));

        this.dealer = 3; // 第一手轮到 0 号做庄
        this.handNo = 0;
        this.board = [];
        this.pot = 0;
        this.street = 'pre';
        this.revealAll = false;
        this.result = null;
        this.highlight = [];
        this.history = [];
        this.peak = START_STACK;
        this.emitScore(START_STACK);
        this.startHand();
    }

    destroy() {
        this.next = null;
        this.delay = 0;
        super.destroy();
    }

    layout() {
        const w = this.w;
        const h = this.h;
        this.seatY = 6;
        this.seatH = 68;
        this.seatW = Math.floor((w - this.pad * 2 - 12) / 3);
        this.cardW = 54;
        this.cardH = 76;
        this.holeW = 74;
        this.holeH = 106;
        this.miniW = 22;
        this.miniH = 32;

        this.btnY = h - this.pad - this.btnH;
        this.seatBottom = this.seatY + this.seatH;

        // 只按比例把公共牌和自己手牌铺开，避免上下留白过大
        const span = this.btnY - this.seatBottom;
        this.boardTop = Math.round(this.seatBottom + span * 0.3 - this.cardH / 2);
        this.boardY = this.boardTop;
        this.playerTop = Math.round(this.seatBottom + span * 0.72 - this.holeH / 2);
        this.potY = this.boardTop - 26;
        this.ovalY = Math.round((this.seatBottom + this.playerTop) / 2 + 6);
        this.ovalH = Math.round((this.playerTop + this.holeH - this.seatBottom) / 2 + 18);
    }

    /* ---------- 一手牌 ---------- */

    alivePlayers() {
        return this.players.filter((p) => !p.out && p.stack > 0);
    }

    nextAlive(from) {
        for (let i = 1; i <= 4; i += 1) {
            const idx = (from + i) % this.players.length;
            if (!this.players[idx].out && this.players[idx].stack > 0) {
                return idx;
            }
        }
        return from;
    }

    startHand() {
        const alive = this.players.filter((p) => !p.out);
        if (alive.length < 2) {
            return;
        }

        this.handNo += 1;
        this.dealer = this.nextAlive(this.dealer);
        this.board = [];
        this.pot = 0;
        this.street = 'pre';
        this.revealAll = false;
        this.result = null;
        this.highlight = [];
        this.currentBet = 0;
        this.minRaise = BB;
        this.streetActions = 0;
        this.waitingHuman = false;

        this.players.forEach((p) => {
            p.hole = [];
            p.bet = 0;
            p.total = 0;
            p.folded = p.out;
            p.allIn = false;
            p.acted = false;
            p.lastAction = '';
        });

        this.deck = shuffle(makeDeck());

        // 盲注位置：两人单挑时庄家就是小盲
        let sbIdx;
        let bbIdx;
        if (alive.length === 2) {
            sbIdx = this.dealer;
            bbIdx = this.nextAlive(this.dealer);
        } else {
            sbIdx = this.nextAlive(this.dealer);
            bbIdx = this.nextAlive(sbIdx);
        }
        this.sbIdx = sbIdx;
        this.bbIdx = bbIdx;

        this.postBlind(sbIdx, SB);
        this.postBlind(bbIdx, BB);
        this.currentBet = BB;
        this.minRaise = BB;

        // 发底牌
        for (let round = 0; round < 2; round += 1) {
            for (let k = 0; k < this.players.length; k += 1) {
                const idx = (sbIdx + k) % this.players.length;
                const p = this.players[idx];
                if (!p.out) {
                    p.hole.push(this.deck.pop());
                }
            }
        }

        this.toAct = this.nextActor(bbIdx);
        this.phase = 'bet';
        this.say(`第 ${this.handNo} 手`);
        this.emitScore(this.players[0].stack);
        this.scheduleTurn(320);
    }

    postBlind(idx, amount) {
        const p = this.players[idx];
        const pay = Math.min(p.stack, amount);
        this.commit(p, pay);
        p.lastAction = '盲注';
    }

    commit(p, pay) {
        const real = Math.min(pay, p.stack);
        p.stack -= real;
        p.bet += real;
        p.total += real;
        if (p.stack <= 0) {
            p.stack = 0;
            p.allIn = true;
        }
        return real;
    }

    displayPot() {
        let sum = this.pot;
        for (let i = 0; i < this.players.length; i += 1) {
            sum += this.players[i].bet;
        }
        return sum;
    }

    activeCount() {
        return this.players.filter((p) => !p.folded && !p.out).length;
    }

    /** 还能继续下注的人数；只剩一人时无需再下注，直接发完剩下的牌 */
    canActCount() {
        return this.players.filter((p) => !p.folded && !p.out && !p.allIn).length;
    }

    nextActor(from) {
        for (let i = 1; i <= 4; i += 1) {
            const idx = (from + i) % this.players.length;
            const p = this.players[idx];
            if (!p.out && !p.folded && !p.allIn) {
                return idx;
            }
        }
        return -1;
    }

    /** 一轮下注是否结束 */
    roundComplete() {
        const active = this.players.filter((p) => !p.folded && !p.out);
        if (active.length <= 1) {
            return true;
        }
        for (let i = 0; i < active.length; i += 1) {
            const p = active[i];
            if (p.allIn) {
                continue;
            }
            if (!p.acted || p.bet < this.currentBet) {
                return false;
            }
        }
        return true;
    }

    /* ---------- 行动 ---------- */

    act(pi, type, amount) {
        const p = this.players[pi];
        if (!p || p.folded || p.out || p.allIn) {
            return false;
        }
        if (this.phase !== 'bet') {
            return false;
        }

        const toCall = Math.max(0, this.currentBet - p.bet);

        if (type === 'fold') {
            p.folded = true;
            p.acted = true;
            p.lastAction = '弃牌';
            this.say(`${p.name} 弃牌`);
        } else if (type === 'check') {
            if (toCall > 0) {
                return false;
            }
            p.acted = true;
            p.lastAction = '过牌';
            this.say(`${p.name} 过牌`);
        } else if (type === 'call') {
            const pay = this.commit(p, toCall);
            p.acted = true;
            p.lastAction = pay >= toCall && p.allIn ? '全下' : '跟注';
            this.say(`${p.name} ${p.lastAction} ${pay}`);
        } else if (type === 'raise') {
            const maxTarget = p.bet + p.stack;
            let target = Math.floor(amount);
            const minTarget = this.currentBet + this.minRaise;
            if (target < minTarget) {
                target = minTarget;
            }
            if (target >= maxTarget) {
                target = maxTarget;
            }
            if (target <= this.currentBet) {
                // 筹码不够加注，只能跟
                const pay = this.commit(p, toCall);
                p.acted = true;
                p.lastAction = p.allIn ? '全下' : '跟注';
                this.say(`${p.name} ${p.lastAction} ${pay}`);
            } else {
                const pay = target - p.bet;
                const raiseBy = target - this.currentBet;
                this.commit(p, pay);
                this.currentBet = p.bet;
                if (raiseBy >= this.minRaise) {
                    this.minRaise = raiseBy;
                }
                for (let i = 0; i < this.players.length; i += 1) {
                    const o = this.players[i];
                    if (o !== p && !o.folded && !o.out && !o.allIn) {
                        o.acted = false;
                    }
                }
                p.acted = true;
                p.lastAction = p.allIn ? '全下' : '加注';
                this.say(`${p.name} ${p.allIn ? '全下' : '加注到'} ${p.bet}`);
            }
        } else {
            return false;
        }

        this.streetActions += 1;
        this.afterAction();
        return true;
    }

    afterAction() {
        if (this.activeCount() <= 1) {
            this.awardUncontested();
            return;
        }
        if (this.roundComplete()) {
            this.endStreet();
            return;
        }
        const nxt = this.nextActor(this.toAct);
        if (nxt < 0) {
            this.endStreet();
            return;
        }
        this.toAct = nxt;
        this.scheduleTurn(0);
    }

    scheduleTurn(extra) {
        this.waitingHuman = false;

        // 只剩一人还有筹码：他若已经跟齐，就没有对手可下注了，直接发牌
        const actors = this.players.filter((p) => !p.folded && !p.out && !p.allIn);
        if (actors.length === 0) {
            this.endStreet();
            return;
        }
        if (actors.length === 1) {
            const solo = actors[0];
            if (solo.acted && solo.bet >= this.currentBet) {
                this.endStreet();
                return;
            }
        }

        const p = this.players[this.toAct];
        if (!p || p.folded || p.allIn) {
            this.endStreet();
            return;
        }

        if (p.human) {
            this.waitingHuman = true;
            return;
        }

        this.delay = (extra || 0) + 360 + Math.random() * 420;
        this.next = () => {
            this.aiAct(p);
        };
    }

    /* ---------- 街 ---------- */

    endStreet() {
        // 收注
        for (let i = 0; i < this.players.length; i += 1) {
            this.pot += this.players[i].bet;
            this.players[i].bet = 0;
            this.players[i].acted = false;
            this.players[i].lastAction = '';
        }
        this.currentBet = 0;
        this.minRaise = BB;
        this.streetActions = 0;
        this.waitingHuman = false;

        if (this.street === 'river') {
            this.delay = 520;
            this.next = () => {
                this.showdown();
            };
            return;
        }

        // 发公共牌
        if (this.street === 'pre') {
            this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
            this.street = 'flop';
        } else if (this.street === 'flop') {
            this.board.push(this.deck.pop());
            this.street = 'turn';
        } else {
            this.board.push(this.deck.pop());
            this.street = 'river';
        }

        const first = this.canActCount() <= 1 ? -1 : this.nextActor(this.dealer);
        if (first < 0) {
            // 全部 all-in，直接跑完剩下的牌
            this.delay = 620;
            this.next = () => {
                this.endStreet();
            };
            return;
        }

        this.toAct = first;
        this.delay = 600;
        this.next = () => {
            this.scheduleTurn(0);
        };
    }

    /* ---------- 结算 ---------- */

    awardUncontested() {
        const winner = this.players.filter((p) => !p.folded && !p.out)[0];
        if (!winner) {
            this.startHand();
            return;
        }
        let amount = this.pot;
        for (let i = 0; i < this.players.length; i += 1) {
            amount += this.players[i].bet;
            this.players[i].bet = 0;
        }
        this.pot = 0;
        this.lastPot = amount;
        winner.stack += amount;
        this.revealAll = false;
        this.highlight = winner.hole.slice();
        this.result = {
            win: winner.human,
            title: winner.human ? `你拿下 ${amount}` : `${winner.name} 拿下 ${amount}`,
            sub: '其他人都弃牌了',
        };
        this.finishHand(1900);
    }

    showdown() {
        this.revealAll = true;
        this.phase = 'show';
        const pots = buildPots(this.players);
        const scores = {};

        this.players.forEach((p) => {
            if (!p.folded && !p.out) {
                scores[p.id] = bestScore(p.hole.concat(this.board));
            }
        });

        const winners = {};
        const details = [];

        pots.forEach((pot) => {
            const contenders = pot.eligible;
            if (!contenders.length) {
                return;
            }
            let best = -1;
            contenders.forEach((p) => {
                const v = scores[p.id] === undefined ? -1 : scores[p.id];
                if (v > best) {
                    best = v;
                }
            });
            const win = contenders.filter((p) => scores[p.id] === best);
            const share = Math.floor(pot.amount / win.length);
            let rest = pot.amount - share * win.length;
            win.forEach((p, i) => {
                let add = share;
                if (i < rest) {
                    add += 1;
                }
                rest -= add - share;
                p.stack += add;
                winners[p.id] = (winners[p.id] || 0) + add;
            });
            details.push({ amount: pot.amount, winners: win, cat: categoryOf(best) });
        });

        this.lastPot = pots.reduce((a, p) => a + p.amount, 0);
        this.pot = 0;

        const ids = Object.keys(winners).map(Number);
        const me = winners[0] || 0;
        // 高亮真正凑成牌型的那五张，而不只是赢家的底牌
        this.highlight = [];
        this.players.forEach((p) => {
            if (winners[p.id] && !p.folded) {
                bestCombo(p.hole.concat(this.board)).forEach((card) => {
                    if (this.highlight.indexOf(card) < 0) {
                        this.highlight.push(card);
                    }
                });
            }
        });

        const mainCat = details.length ? details[0].cat : 0;
        const myPut = this.players[0].total;
        let title;
        let sub;
        if (me > 0) {
            title = ids.length > 1 ? `平分底池 ${me}` : `你赢了 ${me}`;
            sub = `${CAT_NAME[mainCat]} · ${this.board.length ? '摊牌' : '未摊牌'}`;
        } else {
            const lost = Math.max(0, myPut - me);
            title = lost > 0 ? `你输了 ${lost}` : '这手没你';
            const winnerNames = this.players
                .filter((p) => winners[p.id] && !p.folded)
                .map((p) => p.name)
                .join('、');
            sub = `${winnerNames} 赢下 · ${CAT_NAME[mainCat]}`;
        }

        this.result = { win: me > 0, title, sub };
        this.finishHand(2600);
    }

    finishHand(wait) {
        this.phase = 'done';
        this.banner = '';
        this.bannerLife = 0;
        this.peak = Math.max(this.peak || 0, this.players[0].stack);
        this.emitScore(this.players[0].stack);

        this.delay = wait || 2000;
        this.next = () => {
            this.nextHand();
        };
    }

    nextHand() {
        // 出局判定
        this.players.forEach((p) => {
            if (p.stack <= 0) {
                p.out = true;
            }
        });

        const me = this.players[0];
        const alive = this.players.filter((p) => !p.out);

        if (me.out) {
            this.emitOver({ score: this.peak || 0, message: `第 ${this.handNo} 手筹码见底` });
            return;
        }
        if (alive.length <= 1) {
            this.emitWin({ score: this.peak || me.stack, message: `通吃全场，剩 ${me.stack} 筹码` });
            return;
        }

        this.startHand();
    }

    /* ---------- 电脑 ---------- */

    /** 蒙特卡洛估算当前胜率 */
    equity(p) {
        const known = p.hole.concat(this.board);
        const dead = {};
        known.forEach((c) => {
            dead[c] = true;
        });
        const pool = [];
        for (let i = 0; i < 52; i += 1) {
            if (!dead[i]) {
                pool.push(i);
            }
        }

        const opps = this.players.filter((o) => o !== p && !o.folded && !o.out).length;
        if (opps <= 0) {
            return 1;
        }

        const needBoard = 5 - this.board.length;
        const need = needBoard + opps * 2;
        const iter = 110;
        let wins = 0;
        let ties = 0;

        for (let it = 0; it < iter; it += 1) {
            const arr = pool.slice();
            const picks = [];
            for (let k = 0; k < need; k += 1) {
                const j = k + Math.floor(Math.random() * (arr.length - k));
                const t = arr[k];
                arr[k] = arr[j];
                arr[j] = t;
                picks.push(arr[k]);
            }
            const fullBoard = this.board.concat(picks.slice(0, needBoard));
            const mine = bestScore(p.hole.concat(fullBoard));
            let beaten = false;
            let equal = 0;
            for (let o = 0; o < opps; o += 1) {
                const hole = [picks[needBoard + o * 2], picks[needBoard + o * 2 + 1]];
                const v = bestScore(hole.concat(fullBoard));
                if (v > mine) {
                    beaten = true;
                    break;
                }
                if (v === mine) {
                    equal += 1;
                }
            }
            if (!beaten) {
                if (equal === 0) {
                    wins += 1;
                } else {
                    ties += 1;
                }
            }
        }

        return (wins + ties * 0.5) / iter;
    }

    aiAct(p) {
        const toCall = Math.max(0, this.currentBet - p.bet);
        const pot = this.displayPot();

        let decision = 'fold';
        let raiseTo = 0;

        if (this.street === 'pre') {
            const chen = chenScore(p.hole);
            const cheap = toCall <= BB * 2;
            let want = 'fold';
            if (chen >= 9) {
                want = 'raise';
            } else if (chen >= 7) {
                want = Math.random() < 0.4 ? 'raise' : 'call';
            } else if (chen >= 5) {
                want = cheap ? 'call' : 'fold';
            } else if (chen >= 3) {
                want = toCall <= BB && Math.random() < 0.5 ? 'call' : 'fold';
            }
            if (want === 'fold' && toCall === 0) {
                want = 'check';
            }
            // 位置与性格带来的偷鸡
            if (want === 'fold' && Math.random() < p.aggressive * 0.18 && p.stack > pot * 0.4) {
                want = 'raise';
            }
            decision = want;
        } else {
            const eq = this.equity(p);
            const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
            const edge = eq - odds;

            if (eq > 0.8) {
                decision = 'raise';
            } else if (eq > 0.62) {
                decision = Math.random() < 0.55 ? 'raise' : 'call';
            } else if (edge > 0.06) {
                decision = toCall === 0 ? 'check' : 'call';
            } else if (edge > -0.02) {
                decision = toCall === 0 ? 'check' : Math.random() < 0.45 ? 'call' : 'fold';
            } else if (toCall === 0) {
                decision = Math.random() < p.aggressive * 0.3 ? 'raise' : 'check';
            } else {
                decision = 'fold';
            }
            if (decision === 'fold' && toCall <= BB && eq > 0.28) {
                decision = 'call';
            }
            if (decision === 'check' && toCall > 0) {
                decision = 'call';
            }
        }

        // 防止无限加注
        if (this.streetActions > 14) {
            if (decision === 'raise') {
                decision = toCall === 0 ? 'check' : 'call';
            }
        }

        if (decision === 'raise') {
            const base = Math.max(this.minRaise, Math.round(pot * (0.45 + Math.random() * 0.4)));
            raiseTo = this.currentBet + base;
            const maxTarget = p.bet + p.stack;
            if (raiseTo >= maxTarget) {
                raiseTo = maxTarget;
            }
            if (raiseTo <= this.currentBet) {
                decision = toCall === 0 ? 'check' : 'call';
            }
        }

        if (decision === 'call' && toCall === 0) {
            decision = 'check';
        }
        if (decision === 'fold' && toCall === 0) {
            decision = 'check';
        }

        if (decision === 'raise') {
            this.act(p.id, 'raise', raiseTo);
        } else if (decision === 'call') {
            this.act(p.id, 'call');
        } else if (decision === 'check') {
            this.act(p.id, 'check');
        } else {
            this.act(p.id, 'fold');
        }
    }

    /* ---------- 交互 ---------- */

    buttonRects() {
        const gap = 6;
        const bw = Math.floor((this.w - this.pad * 2 - gap * 3) / 4);
        const y = this.btnY;
        const toCall = Math.max(0, this.currentBet - this.players[0].bet);
        const p = this.players[0];
        const raiseTarget = Math.min(
            p.bet + p.stack,
            this.currentBet + Math.max(this.minRaise, Math.round(this.displayPot() * 0.6))
        );
        const canRaise = p.stack > toCall;

        return [
            { key: 'fold', label: '弃牌', x: this.pad, w: bw, y, h: this.btnH, primary: false, disabled: false },
            {
                key: 'call',
                label: toCall > 0 ? (p.stack <= toCall ? `全下 ${p.stack}` : `跟注 ${toCall}`) : '过牌',
                x: this.pad + bw + gap,
                w: bw,
                y,
                h: this.btnH,
                primary: true,
                disabled: false,
            },
            {
                key: 'raise',
                label: canRaise ? `加注 ${raiseTarget - p.bet > 0 ? raiseTarget : '—'}` : '加注',
                x: this.pad + (bw + gap) * 2,
                w: bw,
                y,
                h: this.btnH,
                primary: false,
                disabled: !canRaise,
            },
            {
                key: 'allin',
                label: '全下',
                x: this.pad + (bw + gap) * 3,
                w: this.w - this.pad * 2 - (bw + gap) * 3,
                y,
                h: this.btnH,
                primary: false,
                danger: true,
                disabled: p.stack <= 0,
            },
        ];
    }

    onTap(p) {
        if (this.phase === 'done') {
            // 结算后点一下直接开下一手
            if (this.delay > 400) {
                this.delay = 120;
            }
            return;
        }
        if (!this.waitingHuman || this.phase !== 'bet') {
            return;
        }

        const btns = this.buttonRects();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (b.disabled) {
                continue;
            }
            if (hitRect(p.x, p.y, b.x, b.y, b.w, b.h)) {
                this.humanAction(b.key);
                return;
            }
        }
    }

    humanAction(key) {
        const me = this.players[0];
        const toCall = Math.max(0, this.currentBet - me.bet);
        this.waitingHuman = false;

        if (key === 'fold') {
            this.act(0, 'fold');
        } else if (key === 'call') {
            if (toCall === 0) {
                this.act(0, 'check');
            } else {
                this.act(0, 'call');
            }
        } else if (key === 'raise') {
            const target = Math.min(
                me.bet + me.stack,
                this.currentBet + Math.max(this.minRaise, Math.round(this.displayPot() * 0.6))
            );
            this.act(0, 'raise', target);
        } else if (key === 'allin') {
            const target = me.bet + me.stack;
            if (target > this.currentBet) {
                this.act(0, 'raise', target);
            } else {
                this.act(0, 'call');
            }
        }
    }

    /* ---------- 循环 ---------- */

    say(msg) {
        this.banner = msg;
        this.bannerLife = 1500;
    }

    update(dt) {
        this.time += dt;
        if (this.bannerLife > 0) {
            this.bannerLife -= dt;
            if (this.bannerLife <= 0) {
                this.banner = '';
            }
        }

        if (this.delay > 0) {
            this.delay -= dt;
            if (this.delay <= 0) {
                this.delay = 0;
                const fn = this.next;
                this.next = null;
                if (fn) {
                    fn();
                }
            }
        }
    }

    /* ---------- 绘制 ---------- */

    render(ctx) {
        this.drawTable(ctx);
        this.drawSeats(ctx);
        this.drawBoard(ctx);
        this.drawPlayer(ctx);
        this.drawButtons(ctx);
        this.drawBanner(ctx);
        if (this.phase === 'done') {
            this.drawResult(ctx);
        }
    }

    drawTable(ctx) {
        let bg;
        try {
            bg = ctx.createLinearGradient(0, 0, 0, this.h);
            bg.addColorStop(0, '#2F5D4B');
            bg.addColorStop(1, '#20453A');
        } catch (e) {
            bg = '#28503F';
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, this.w, this.h);

        // 桌面轮廓
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r = 18;
        const x = 6;
        const y = 6;
        const w = this.w - 12;
        const h = this.h - 12;
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        ctx.stroke();

        // 桌心：一层更亮的椭圆，把中间的空场变成「桌面」而不是留白
        ctx.save();
        ctx.translate(this.w / 2, this.ovalY);
        ctx.scale(1, this.ovalH / (this.w * 0.45));
        ctx.beginPath();
        ctx.arc(0, 0, this.w * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
    }

    seatRect(i) {
        return {
            x: this.pad + (this.seatW + 6) * i,
            y: this.seatY,
            w: this.seatW,
            h: this.seatH,
        };
    }

    drawSeats(ctx) {
        const ais = this.players.filter((p) => !p.human);
        ais.forEach((p, i) => {
            const r = this.seatRect(i);
            const active = this.toAct === p.id && (this.phase === 'bet' || this.phase === 'show');
            const dim = p.folded || p.out;
            const revealed = this.revealAll && p.hole.length === 2 && !dim;

            ctx.save();
            ctx.globalAlpha = dim ? 0.42 : 1;

            const cxSeat = r.x + r.w / 2;
            if (revealed) {
                // 摊牌：名字、筹码、底牌紧凑成一组，不留空框
                text(ctx, p.name, cxSeat, r.y + 14, {
                    size: 11,
                    color: '#EAF2EC',
                    weight: 'bold',
                });
                text(ctx, `${p.stack}`, cxSeat, r.y + 27, {
                    size: 10,
                    color: 'rgba(234, 242, 236, 0.62)',
                });
                const cw = 30;
                const ch = 42;
                const cx0 = cxSeat - cw - 3;
                this.drawCard(ctx, cx0, r.y + 36, cw, ch, p.hole[0], false,
                    this.highlight.indexOf(p.hole[0]) >= 0);
                this.drawCard(ctx, cx0 + cw + 6, r.y + 36, cw, ch, p.hole[1], false,
                    this.highlight.indexOf(p.hole[1]) >= 0);
            } else {
                fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, 'rgba(255,255,255,0.07)');
                if (active && this.waitingHuman === false && this.phase === 'bet') {
                    fillRoundRect(ctx, r.x, r.y, r.w, r.h, 12, 'rgba(240, 205, 120, 0.16)');
                }
                const cardX = cxSeat - this.miniW - 2;
                this.drawBack(ctx, cardX, r.y + 5, this.miniW, this.miniH);
                this.drawBack(ctx, cardX + this.miniW + 4, r.y + 5, this.miniW, this.miniH);

                text(ctx, p.name, cxSeat, r.y + 48, {
                    size: 11,
                    color: '#EAF2EC',
                    weight: 'bold',
                });
                text(ctx, `${p.stack}`, cxSeat, r.y + 59, {
                    size: 10,
                    color: 'rgba(234, 242, 236, 0.62)',
                });
            }
            ctx.restore();

            if (!revealed && p.bet > 0) {
                this.drawChip(ctx, cxSeat, r.y + r.h + 12, p.bet);
            }

            if (p.lastAction && !dim && !this.revealAll) {
                text(ctx, p.lastAction, cxSeat, r.y + r.h + 26, {
                    size: 10,
                    color: 'rgba(234, 242, 236, 0.66)',
                });
            }
            if (this.dealer === p.id) {
                this.drawDealer(ctx, r.x + r.w - 10, r.y + 10);
            }
        });
    }

    drawDealer(ctx, x, y) {
        circle(ctx, x, y, 8, '#F7F3E8');
        text(ctx, 'D', x, y + 1, { size: 9, color: '#2B4A3C', weight: 'bold' });
    }

    drawBoard(ctx) {
        const gap = 6;
        const total = this.cardW * 5 + gap * 4;
        const startX = (this.w - total) / 2;
        const y = this.boardY;

        for (let i = 0; i < 5; i += 1) {
            const x = startX + (this.cardW + gap) * i;
            if (this.board[i] !== undefined) {
                const hot = this.highlight.indexOf(this.board[i]) >= 0;
                this.drawCard(ctx, x, y, this.cardW, this.cardH, this.board[i], false, hot);
            } else {
                // 空位
                fillRoundRect(ctx, x, y, this.cardW, this.cardH, 5, 'rgba(255,255,255,0.05)');
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, this.cardW, this.cardH);
            }
        }

        // 底池
        const pot = this.phase === 'done' && this.lastPot ? this.lastPot : this.displayPot();
        const label = `底池 ${pot}`;
        const pw = Math.max(84, label.length * 9 + 30);
        fillRoundRect(ctx, this.w / 2 - pw / 2, this.potY - 12, pw, 24, 12, 'rgba(14, 26, 20, 0.42)');
        // 筹码图标
        circle(ctx, this.w / 2 - pw / 2 + 15, this.potY, 6, '#E6C875');
        circle(ctx, this.w / 2 - pw / 2 + 15, this.potY, 3, 'rgba(20, 34, 26, 0.45)');
        text(ctx, label, this.w / 2 + 6, this.potY, {
            size: 12,
            color: '#F2E3BC',
            weight: 'bold',
        });
    }

    drawPlayer(ctx) {
        const me = this.players[0];
        const cx = this.w / 2;
        const gap = 8;
        const total = this.holeW * 2 + gap;
        const startX = cx - total / 2;
        const y = this.playerTop;

        const active = this.waitingHuman;
        if (active) {
            ctx.save();
            ctx.strokeStyle = 'rgba(240, 205, 120, 0.9)';
            ctx.lineWidth = 2;
            const pad = 8;
            fillRoundRect(
                ctx,
                startX - pad,
                y - pad,
                total + pad * 2,
                this.holeH + pad * 2,
                14,
                'rgba(240, 205, 120, 0.10)'
            );
            ctx.strokeRect(startX - pad, y - pad, total + pad * 2, this.holeH + pad * 2);
            ctx.restore();
        }

        const dim = me.folded || me.out;
        ctx.save();
        ctx.globalAlpha = dim ? 0.4 : 1;
        for (let i = 0; i < 2; i += 1) {
            const x = startX + (this.holeW + gap) * i;
            if (me.hole[i] !== undefined) {
                const hot = this.highlight.indexOf(me.hole[i]) >= 0;
                this.drawCard(ctx, x, y, this.holeW, this.holeH, me.hole[i], false, hot);
            } else {
                this.drawBack(ctx, x, y, this.holeW, this.holeH);
            }
        }
        ctx.restore();

        if (me.bet > 0) {
            this.drawChip(ctx, startX + total + 26, y + this.holeH - 22, me.bet);
        }

        text(ctx, `你 · ${me.stack}`, cx, y + this.holeH + 16, {
            size: 11,
            color: 'rgba(234, 242, 236, 0.72)',
        });

        // 公共牌够三张时，实时提示当前牌型
        if (!dim && this.board.length >= 3 && me.hole.length === 2) {
            const cat = categoryOf(bestScore(me.hole.concat(this.board)));
            text(ctx, CAT_NAME[cat], cx, y - 10, {
                size: 11,
                color: 'rgba(240, 226, 190, 0.8)',
                weight: 'bold',
            });
        }

        if (this.dealer === 0) {
            this.drawDealer(ctx, startX - 16, y + 12);
        }
    }

    drawChip(ctx, x, y, amount) {
        const label = `${amount}`;
        const w = Math.max(34, label.length * 6 + 16);
        fillRoundRect(ctx, x - w / 2, y - 8, w, 16, 8, 'rgba(20, 32, 26, 0.55)');
        circle(ctx, x - w / 2 + 7, y, 4, '#E6C875');
        text(ctx, label, x + 4, y + 1, { size: 9, color: '#F4E6BE' });
    }

    drawButtons(ctx) {
        const show = this.waitingHuman && this.phase === 'bet';
        const btns = this.buttonRects();

        btns.forEach((b) => {
            let bg = 'rgba(255,255,255,0.10)';
            let fg = 'rgba(240, 246, 242, 0.9)';
            if (b.primary) {
                bg = '#E9C877';
                fg = '#2A4034';
            } else if (b.danger) {
                bg = 'rgba(196, 74, 58, 0.85)';
                fg = '#FFFFFF';
            }
            if (!show || b.disabled) {
                ctx.save();
                ctx.globalAlpha = show ? 0.35 : 0.22;
            }
            fillRoundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2, bg);
            text(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, {
                size: 12,
                color: fg,
                weight: b.primary ? 'bold' : 'normal',
            });
            if (!show || b.disabled) {
                ctx.restore();
            }
        });
    }

    drawBanner(ctx) {
        if (!this.banner) {
            return;
        }
        const alpha = Math.min(1, this.bannerLife / 400);
        ctx.save();
        ctx.globalAlpha = alpha;
        const w = Math.min(this.w - 60, 200);
        const y = this.boardTop + this.cardH + 8;
        fillRoundRect(ctx, (this.w - w) / 2, y, w, 22, 11, 'rgba(16, 28, 22, 0.55)');
        text(ctx, this.banner, this.w / 2, y + 11, {
            size: 10,
            color: '#EAF2EC',
        });
        ctx.restore();
    }

    drawResult(ctx) {
        const w = Math.min(this.w - 48, 240);
        const h = 76;
        const x = (this.w - w) / 2;
        const y = this.boardY + this.cardH + 34;

        fillRoundRect(ctx, x, y, w, h, 16, 'rgba(247, 243, 232, 0.97)');
        ctx.strokeStyle = 'rgba(43, 74, 60, 0.14)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);

        text(ctx, this.result.title, x + w / 2, y + 28, {
            size: 16,
            color: this.result.win ? '#2B4A3C' : '#7A4A3E',
            weight: 'bold',
        });
        text(ctx, this.result.sub, x + w / 2, y + 50, {
            size: 11,
            color: '#6C7568',
        });
    }

    /* ---------- 单张牌 ---------- */

    drawBack(ctx, x, y, w, h) {
        const r = Math.max(2, w * 0.1);
        fillRoundRect(ctx, x + 1, y + 1.5, w, h, r, 'rgba(0,0,0,0.18)');
        fillRoundRect(ctx, x, y, w, h, r, '#33566B');
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    }

    drawCard(ctx, x, y, w, h, id, small, hot) {
        const r = Math.max(2, w * 0.09);
        const red = SUIT_RED.indexOf(suitOf(id)) >= 0;
        const color = red ? '#C0492F' : '#2A2E33';

        fillRoundRect(ctx, x + 1, y + 1.5, w, h, r, 'rgba(0,0,0,0.20)');
        fillRoundRect(ctx, x, y, w, h, r, '#FBF8F1');
        if (hot) {
            ctx.strokeStyle = '#E9C877';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
            ctx.stroke();
        }

        const label = rankLabel(id);
        const suit = SUIT_CHAR[suitOf(id)];

        if (small) {
            text(ctx, label, x + 2, y + h * 0.3, {
                size: Math.max(7, h * 0.28),
                color,
                weight: 'bold',
                align: 'left',
            });
            text(ctx, suit, x + 2, y + h * 0.68, {
                size: Math.max(7, h * 0.26),
                color,
                align: 'left',
            });
            return;
        }

        const rankSize = Math.max(10, h * 0.24);
        text(ctx, label, x + w * 0.18, y + h * 0.17, {
            size: rankSize,
            color,
            weight: 'bold',
            align: 'center',
        });
        text(ctx, suit, x + w * 0.18, y + h * 0.35, {
            size: rankSize * 0.82,
            color,
            align: 'center',
        });
        text(ctx, suit, x + w * 0.5, y + h * 0.65, {
            size: h * 0.36,
            color,
        });
    }
}

Holdem.internals = {
    score5,
    bestScore,
    bestCombo,
    categoryOf,
    buildPots,
    chenScore,
    makeDeck,
    shuffle,
    rankOf,
    suitOf,
    makeCard: (r, s) => (r - 2) * 4 + s,
    CAT_NAME,
};

module.exports = Holdem;
