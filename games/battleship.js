/**
 * 海战棋（Battleship）。
 *
 * 8×8 海域，5 艘舰船（4/3/3/2/1）。玩家先手，双方轮流开火。
 * 电脑用「猎杀—锁定」策略：命中后优先打相邻格，沉船后回到棋盘格扫描。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const N = 8;
const SHIPS = [4, 3, 3, 2, 1];
const COLS = 'ABCDEFGH';

const COLOR = {
    sea: '#DCE7F0',
    seaDark: '#C6D6E4',
    ship: '#5A7590',
    hit: '#C9584C',
    miss: '#9FAEBE',
    sunk: '#8E3A31',
    grid: '#B9C9D8',
};

function key(r, c) {
    return r + ',' + c;
}

function placeShips() {
    const occupied = {};
    const ships = [];
    SHIPS.forEach((size) => {
        let placed = false;
        let guard = 0;
        while (!placed && guard < 800) {
            guard += 1;
            const horizontal = Math.random() < 0.5;
            const maxR = horizontal ? N : N - size;
            const maxC = horizontal ? N - size : N;
            const r = Math.floor(Math.random() * maxR);
            const c = Math.floor(Math.random() * maxC);
            const cells = [];
            let ok = true;
            for (let i = 0; i < size; i += 1) {
                const cr = horizontal ? r : r + i;
                const cc = horizontal ? c + i : c;
                if (occupied[key(cr, cc)]) {
                    ok = false;
                    break;
                }
                cells.push({ r: cr, c: cc });
            }
            if (!ok) {
                continue;
            }
            cells.forEach((x) => {
                occupied[key(x.r, x.c)] = true;
            });
            ships.push({ cells, hits: 0, sunk: false });
            placed = true;
        }
    });
    return ships;
}

class Battleship extends GameBase {
    constructor(view, api) {
        super(view, api);
    }

    start() {
        this.rounds = 0;
        this.hits = 0;
        this.result = null;
        this.turn = 'player';
        this.message = '';
        this.messageLife = 0;
        this.aiTimer = 0;
        this.aiTargets = [];
        this.reset();
    }

    reset() {
        this.myShips = placeShips();
        this.enemyShips = placeShips();
        this.myShots = {};
        this.enemyShots = {};
        this.result = null;
        this.turn = 'player';
        this.rounds = 0;
        this.hits = 0;
        this.aiTargets = [];
        this.aiTimer = 0;
        this.finished = false;
        this.selected = null;
        this.layout();
        this.emitScore(0);
        this.syncHud();
    }

    layout() {
        const topPad = 44;
        const botPad = 66;
        const availH = this.h - topPad - botPad;
        const availW = this.w - 32;
        this.cell = Math.floor(Math.min(availW / N, (availH - 46) / (N * 2)));
        this.gridW = this.cell * N;
        this.ox = Math.floor((this.w - this.gridW) / 2);
        this.enemyTop = topPad + 26;
        this.myTop = this.enemyTop + this.gridW + 18;
        this.btnY = this.h - 40;
    }

    syncHud() {
        const myAlive = this.myShips.filter((s) => !s.sunk).length;
        const enemyAlive = this.enemyShips.filter((s) => !s.sunk).length;
        this.emitHud(`你剩 ${myAlive} 艘 · 敌方剩 ${enemyAlive} 艘`);
    }

    say(msg) {
        this.message = msg;
        this.messageLife = 1400;
    }

    cellAtEnemy(p) {
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.enemyTop) / this.cell);
        if (r < 0 || r >= N || c < 0 || c >= N) {
            return null;
        }
        return { r, c };
    }

    onTap(p) {
        if (this.result) {
            if (p.y >= this.btnY) {
                this.hitButton(p);
            }
            return;
        }
        if (p.y >= this.btnY) {
            this.hitButton(p);
            return;
        }
        if (this.turn !== 'player') {
            return;
        }
        const hit = this.cellAtEnemy(p);
        if (!hit) {
            return;
        }
        if (this.myShots[key(hit.r, hit.c)]) {
            this.say('这里已经打过了');
            return;
        }
        this.playerFire(hit.r, hit.c);
    }

    playerFire(r, c) {
        this.myShots[key(r, c)] = true;
        const ship = this.enemyShips.find((s) => s.cells.some((x) => x.r === r && x.c === c));
        if (ship) {
            ship.hits += 1;
            this.hits += 1;
            this.emitScore(this.hits);
            if (this.api.vibrate) {
                this.api.vibrate();
            }
            if (ship.hits >= ship.cells.length) {
                ship.sunk = true;
                this.say('击沉一艘！');
            } else {
                this.say('命中');
            }
        } else {
            this.say('未命中');
        }

        this.syncHud();
        if (this.enemyShips.every((s) => s.sunk)) {
            this.result = 'win';
            this.emitWin({ score: this.rounds + 1, message: `全歼敌舰，用了 ${this.rounds + 1} 回合` });
            return;
        }
        this.turn = 'ai';
        this.aiTimer = 620;
    }

    /* ---------- 电脑回合 ---------- */

    aiPick() {
        // 1. 有锁定目标就打目标
        while (this.aiTargets.length) {
            const t = this.aiTargets.shift();
            if (!this.enemyShots[key(t.r, t.c)]) {
                return t;
            }
        }
        // 2. 棋盘格扫描，命中率比纯随机高
        const candidates = [];
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                if (this.enemyShots[key(r, c)]) {
                    continue;
                }
                if ((r + c) % 2 === 0) {
                    candidates.push({ r, c });
                }
            }
        }
        if (!candidates.length) {
            for (let r = 0; r < N; r += 1) {
                for (let c = 0; c < N; c += 1) {
                    if (!this.enemyShots[key(r, c)]) {
                        candidates.push({ r, c });
                    }
                }
            }
        }
        if (!candidates.length) {
            return null;
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    aiFire() {
        const pick = this.aiPick();
        if (!pick) {
            return;
        }
        this.enemyShots[key(pick.r, pick.c)] = true;
        const ship = this.myShips.find((s) => s.cells.some((x) => x.r === pick.r && x.c === pick.c));
        if (ship) {
            ship.hits += 1;
            if (ship.hits >= ship.cells.length) {
                ship.sunk = true;
                this.aiTargets = this.aiTargets.filter(
                    (t) => !ship.cells.some((x) => x.r === t.r && x.c === t.c)
                );
                this.say('你的船被击沉了');
            } else {
                this.say('你的船中弹');
                [
                    [-1, 0], [1, 0], [0, -1], [0, 1],
                ].forEach(([dr, dc]) => {
                    const nr = pick.r + dr;
                    const nc = pick.c + dc;
                    if (nr >= 0 && nr < N && nc >= 0 && nc < N && !this.enemyShots[key(nr, nc)]) {
                        this.aiTargets.push({ r: nr, c: nc });
                    }
                });
            }
        }

        this.syncHud();
        if (this.myShips.every((s) => s.sunk)) {
            this.result = 'lose';
            this.emitOver({ score: this.hits, message: `你的舰队全灭了，共命中 ${this.hits} 次` });
            return;
        }
        this.rounds += 1;
        this.turn = 'player';
    }

    hitButton(p) {
        const btns = this.buttons();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= this.btnY && p.y <= this.btnY + 30) {
                if (b.key === 'restart') {
                    this.reset();
                }
                return;
            }
        }
    }

    buttons() {
        const label = this.result ? '再来一局' : '重开';
        const bw = 104;
        return [{ key: 'restart', label, x: (this.w - bw) / 2, w: bw }];
    }

    update(dt) {
        this.time += dt;
        if (this.messageLife > 0) {
            this.messageLife -= dt;
            if (this.messageLife <= 0) {
                this.message = '';
            }
        }
        if (this.turn === 'ai' && !this.result) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiFire();
            }
        }
    }

    /* ---------- 绘制 ---------- */

    render(ctx) {
        this.drawHeader(ctx);
        this.drawEnemyGrid(ctx);
        this.drawMyGrid(ctx);
        this.drawButton(ctx);
        if (this.message) {
            const tw = 200;
            const x = (this.w - tw) / 2;
            const y = this.enemyTop + this.gridW - 54;
            fillRoundRect(ctx, x, y, tw, 28, 14, 'rgba(40, 46, 54, 0.9)');
            text(ctx, this.message, this.w / 2, y + 14, { size: 12, color: '#FFFFFF' });
        }
    }

    drawHeader(ctx) {
        const myAlive = this.myShips.filter((s) => !s.sunk).length;
        const enemyAlive = this.enemyShips.filter((s) => !s.sunk).length;
        let msg = '轮到你开火';
        let color = '#39424E';
        if (this.result === 'win') {
            msg = '全歼敌舰';
            color = '#3E8B5C';
        } else if (this.result === 'lose') {
            msg = '舰队全灭';
            color = '#C05850';
        } else if (this.turn === 'ai') {
            msg = '电脑开火中…';
            color = '#6B7684';
        }
        text(ctx, msg, this.w / 2, 18, { size: 15, color, weight: 'bold' });
        text(ctx, `你 ${myAlive} 艘 · 敌方 ${enemyAlive} 艘 · 命中 ${this.hits}`, this.w / 2, 36, {
            size: 11,
            color: '#A7AEB8',
        });
    }

    drawGridBase(ctx, top) {
        fillRoundRect(ctx, this.ox - 3, top - 3, this.gridW + 6, this.gridW + 6, 6, COLOR.seaDark);
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                ctx.fillStyle = (r + c) % 2 === 0 ? COLOR.sea : '#E4EDF5';
                ctx.fillRect(this.ox + c * this.cell, top + r * this.cell, this.cell, this.cell);
            }
        }
        ctx.strokeStyle = COLOR.grid;
        ctx.lineWidth = 0.8;
        for (let i = 0; i <= N; i += 1) {
            ctx.beginPath();
            ctx.moveTo(this.ox + i * this.cell, top);
            ctx.lineTo(this.ox + i * this.cell, top + this.gridW);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(this.ox, top + i * this.cell);
            ctx.lineTo(this.ox + this.gridW, top + i * this.cell);
            ctx.stroke();
        }
        ctx.strokeStyle = '#93A8BC';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(this.ox, top, this.gridW, this.gridW);
    }

    drawEnemyGrid(ctx) {
        const top = this.enemyTop;
        this.drawGridBase(ctx, top);
        text(ctx, '敌方海域（点击开火）', this.w / 2, top - 9, { size: 10, color: '#8996A5' });

        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                const cx = this.ox + c * this.cell + this.cell / 2;
                const cy = top + r * this.cell + this.cell / 2;
                if (!this.myShots[key(r, c)]) {
                    continue;
                }
                const ship = this.enemyShips.find((s) => s.cells.some((x) => x.r === r && x.c === c));
                if (ship) {
                    const sunk = ship.sunk;
                    fillRoundRect(
                        ctx,
                        this.ox + c * this.cell + 2,
                        top + r * this.cell + 2,
                        this.cell - 4,
                        this.cell - 4,
                        3,
                        sunk ? COLOR.sunk : COLOR.hit
                    );
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    const p = this.cell * 0.24;
                    ctx.moveTo(cx - p, cy - p);
                    ctx.lineTo(cx + p, cy + p);
                    ctx.moveTo(cx + p, cy - p);
                    ctx.lineTo(cx - p, cy + p);
                    ctx.stroke();
                } else {
                    circle(ctx, cx, cy, Math.max(2, this.cell * 0.11), COLOR.miss);
                }
            }
        }
    }

    drawMyGrid(ctx) {
        const top = this.myTop;
        this.drawGridBase(ctx, top);
        text(ctx, '你的海域', this.w / 2, top - 9, { size: 10, color: '#8996A5' });

        // 自己的船
        this.myShips.forEach((ship) => {
            ship.cells.forEach((x) => {
                const shot = this.enemyShots[key(x.r, x.c)];
                fillRoundRect(
                    ctx,
                    this.ox + x.c * this.cell + 2,
                    top + x.r * this.cell + 2,
                    this.cell - 4,
                    this.cell - 4,
                    3,
                    ship.sunk ? COLOR.sunk : shot ? COLOR.hit : COLOR.ship
                );
            });
        });

        // 敌方打空的格
        for (let r = 0; r < N; r += 1) {
            for (let c = 0; c < N; c += 1) {
                if (!this.enemyShots[key(r, c)]) {
                    continue;
                }
                const hasShip = this.myShips.some((s) => s.cells.some((x) => x.r === r && x.c === c));
                if (!hasShip) {
                    circle(
                        ctx,
                        this.ox + c * this.cell + this.cell / 2,
                        top + r * this.cell + this.cell / 2,
                        Math.max(2, this.cell * 0.11),
                        COLOR.miss
                    );
                }
            }
        }
    }

    drawButton(ctx) {
        this.buttons().forEach((b) => {
            fillRoundRect(ctx, b.x, this.btnY, b.w, 30, 15, '#EFF2F5');
            text(ctx, b.label, b.x + b.w / 2, this.btnY + 15, { size: 13, color: '#4A5560' });
        });
    }
}

module.exports = Battleship;
module.exports.placeShips = placeShips;
module.exports.N = N;
