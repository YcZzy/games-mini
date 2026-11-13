/**
 * 一笔画（欧拉路径）。
 *
 * 关键设计：题目不是随机撒边再去验证可解性，而是用「游走 + 回溯」直接构造边集。
 * 走过的轨迹本身就是一条合法解，所以每一关都必定可解，不需要事后校验。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const LEVELS = [
    { rows: 3, cols: 3, steps: 9, name: '入门' },
    { rows: 4, cols: 4, steps: 15, name: '小径' },
    { rows: 4, cols: 5, steps: 22, name: '回廊' },
    { rows: 5, cols: 5, steps: 30, name: '迷宫' },
    { rows: 5, cols: 6, steps: 40, name: '长廊' },
    { rows: 6, cols: 6, steps: 50, name: '终局' },
];

function edgeKey(a, b) {
    const k1 = `${a.r},${a.c}`;
    const k2 = `${b.r},${b.c}`;
    return k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
}

/**
 * 构造一个必定可一笔画的边集。
 *
 * 只用「一条连续、不重复边的路径」当题目：这样的边集首尾各一个奇度点，
 * 天然满足欧拉路径的存在条件，走过的轨迹就是标准答案。
 * 选下一格时用 Warnsdorff 启发式（优先走向未用边最少的邻居），能显著拉长路径。
 */
function walkOnce(rows, cols, targetSteps) {
    const edgeSet = {};
    const edges = [];
    const start = {
        r: Math.floor(Math.random() * rows),
        c: Math.floor(Math.random() * cols),
    };
    let current = start;
    let guard = 0;

    while (edges.length < targetSteps && guard < 500) {
        guard += 1;
        const opts = [];
        for (let i = 0; i < 4; i += 1) {
            const nr = current.r + DIRS[i][0];
            const nc = current.c + DIRS[i][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                continue;
            }
            const key = edgeKey(current, { r: nr, c: nc });
            if (edgeSet[key]) {
                continue;
            }
            let deg = 0;
            for (let j = 0; j < 4; j += 1) {
                const tr = nr + DIRS[j][0];
                const tc = nc + DIRS[j][1];
                if (tr < 0 || tr >= rows || tc < 0 || tc >= cols) {
                    continue;
                }
                if (!edgeSet[edgeKey({ r: nr, c: nc }, { r: tr, c: tc })]) {
                    deg += 1;
                }
            }
            opts.push({ r: nr, c: nc, deg, key });
        }
        if (!opts.length) {
            break;
        }
        opts.sort((a, b) => a.deg - b.deg);
        // 大部分时候走最「窄」的方向，偶尔随机，避免每局都一样
        const pick = Math.random() < 0.78 ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
        edgeSet[pick.key] = true;
        edges.push({ a: current, b: { r: pick.r, c: pick.c } });
        current = { r: pick.r, c: pick.c };
    }

    return { edges, edgeSet, rows, cols };
}

/**
 * 从 start 出发找一个「回到 start」的环，环上的边必须都是新的。
 * 环里每个节点的度数 +2，不会改变奇偶性，所以可以在保持可解的前提下加长题目。
 */
function findCycle(edgeSet, start, rows, cols, maxLen) {
    const temp = {};
    const path = [];
    let found = null;

    function dfs(node, depth) {
        if (found || depth > maxLen) {
            return;
        }
        const order = [0, 1, 2, 3];
        for (let i = order.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = order[i];
            order[i] = order[j];
            order[j] = t;
        }
        for (let i = 0; i < order.length; i += 1) {
            const nr = node.r + DIRS[order[i]][0];
            const nc = node.c + DIRS[order[i]][1];
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                continue;
            }
            const k = edgeKey(node, { r: nr, c: nc });
            if (edgeSet[k] || temp[k]) {
                continue;
            }
            if (nr === start.r && nc === start.c) {
                if (path.length + 1 >= 2) {
                    found = path.concat([{ a: { r: node.r, c: node.c }, b: { r: start.r, c: start.c } }]);
                    return;
                }
                continue;
            }
            if (depth + 1 >= maxLen) {
                continue;
            }
            temp[k] = true;
            path.push({ a: { r: node.r, c: node.c }, b: { r: nr, c: nc } });
            dfs({ r: nr, c: nc }, depth + 1);
            if (found) {
                return;
            }
            path.pop();
            delete temp[k];
        }
    }

    dfs(start, 0);
    return found;
}

function buildPuzzle(rows, cols, targetSteps) {
    let best = null;
    for (let i = 0; i < 14; i += 1) {
        const res = walkOnce(rows, cols, targetSteps);
        if (!best || res.edges.length > best.edges.length) {
            best = res;
        }
        if (best.edges.length >= targetSteps) {
            break;
        }
    }
    if (!best) {
        return walkOnce(rows, cols, targetSteps);
    }

    // 用加环的方式继续加长，直到接近目标或加不动
    const edgeSet = best.edgeSet;
    const edges = best.edges;
    const nodes = {};
    edges.forEach((e) => {
        nodes[e.a.r + ',' + e.a.c] = e.a;
        nodes[e.b.r + ',' + e.b.c] = e.b;
    });
    const keys = Object.keys(nodes);
    let guard = 0;
    while (edges.length < targetSteps && guard < 240) {
        guard += 1;
        const v = nodes[keys[Math.floor(Math.random() * keys.length)]];
        const cycle = findCycle(edgeSet, v, rows, cols, 14);
        if (!cycle) {
            continue;
        }
        cycle.forEach((e) => {
            const k = edgeKey(e.a, e.b);
            if (edgeSet[k]) {
                return;
            }
            edgeSet[k] = true;
            edges.push(e);
            nodes[e.a.r + ',' + e.a.c] = e.a;
            nodes[e.b.r + ',' + e.b.c] = e.b;
        });
    }

    return { edges, edgeSet, rows, cols };
}

class EulerPath extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.level = 0;
        this.passCount = 0;
    }

    start() {
        this.passCount = 0;
        this.loadLevel(0);
    }

    loadLevel(index) {
        this.level = Math.max(0, Math.min(index, LEVELS.length - 1));
        const cfg = LEVELS[this.level];
        const puzzle = buildPuzzle(cfg.rows, cfg.cols, cfg.steps);
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.edges = puzzle.edges;
        this.edgeSet = puzzle.edgeSet;
        this.used = {};
        this.path = [];
        this.current = null;
        this.done = false;
        this.finished = false;
        this.name = cfg.name;
        this.totalEdges = this.edges.length;
        this.layout();
        this.emitScore(this.passCount);
        this.emitHud(`${this.name} · ${this.totalEdges} 条线`);
    }

    layout() {
        const topPad = 48;
        const availW = this.w - 36;
        this.btnY = this.h - 52;
        const availH = this.btnY - 28 - topPad;
        this.step = Math.floor(Math.min(availW / (this.cols - 1), availH / (this.rows - 1), 108));
        this.gridW = this.step * (this.cols - 1);
        this.gridH = this.step * (this.rows - 1);
        this.ox = Math.floor((this.w - this.gridW) / 2);
        this.oy = Math.floor(topPad + Math.max(0, (availH - this.gridH) / 2));
        this.nodeR = Math.max(4, Math.min(9, this.step * 0.13));
    }

    nodeXY(node) {
        return {
            x: this.ox + node.c * this.step,
            y: this.oy + node.r * this.step,
        };
    }

    nodeAt(p) {
        const c = Math.round((p.x - this.ox) / this.step);
        const r = Math.round((p.y - this.oy) / this.step);
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
            return null;
        }
        const xy = this.nodeXY({ r, c });
        const d = Math.hypot(p.x - xy.x, p.y - xy.y);
        if (d > this.step * 0.42) {
            return null;
        }
        return { r, c };
    }

    hasEdge(a, b) {
        return !!this.edgeSet[edgeKey(a, b)];
    }

    isUsed(a, b) {
        return !!this.used[edgeKey(a, b)];
    }

    /** 尝试从当前点走到相邻点 */
    stepTo(node) {
        if (this.done) {
            return false;
        }
        if (!this.current) {
            // 起点必须是图上存在的节点
            const exists = this.edges.some(
                (e) => (e.a.r === node.r && e.a.c === node.c) || (e.b.r === node.r && e.b.c === node.c)
            );
            if (!exists) {
                return false;
            }
            this.current = node;
            this.path = [node];
            if (this.api.vibrate) {
                this.api.vibrate();
            }
            return true;
        }

        const cur = this.current;
        if (cur.r === node.r && cur.c === node.c) {
            return false;
        }
        const adjacent = Math.abs(cur.r - node.r) + Math.abs(cur.c - node.c) === 1;
        if (!adjacent) {
            return false;
        }
        if (!this.hasEdge(cur, node)) {
            return false;
        }
        if (this.isUsed(cur, node)) {
            return false;
        }
        this.used[edgeKey(cur, node)] = true;
        this.path.push(node);
        this.current = node;
        if (this.api.vibrate) {
            this.api.vibrate();
        }
        this.checkDone();
        return true;
    }

    checkDone() {
        const usedCount = Object.keys(this.used).length;
        if (usedCount >= this.totalEdges) {
            this.done = true;
            this.passCount += 1;
            this.emitScore(this.passCount);
            if (this.level >= LEVELS.length - 1) {
                this.finished = true;
                this.emitWin({ score: this.passCount, message: '六关全通，一笔画高手' });
            } else {
                this.emitWin({
                    score: this.passCount,
                    message: `${this.name} 完成，用了 ${this.path.length - 1} 步`,
                });
            }
        }
    }

    onTap(p) {
        const node = this.nodeAt(p);
        if (node) {
            this.stepTo(node);
            return;
        }
        if (p.y >= this.btnY) {
            this.hitButton(p);
        }
    }

    onDrag(p) {
        const node = this.nodeAt(p);
        if (node) {
            this.stepTo(node);
        }
    }

    onSwipe(dir) {
        if (!this.current) {
            return;
        }
        const map = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
        const d = map[dir];
        if (!d) {
            return;
        }
        this.stepTo({ r: this.current.r + d[0], c: this.current.c + d[1] });
    }

    hitButton(p) {
        const btns = this.buttons();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= this.btnY && p.y <= this.btnY + 32) {
                if (b.key === 'undo') {
                    this.undo();
                } else if (b.key === 'reset') {
                    this.loadLevel(this.level);
                    this.passCount = this.passCount;
                } else if (b.key === 'next') {
                    this.loadLevel(Math.min(this.level + 1, LEVELS.length - 1));
                }
                return;
            }
        }
    }

    undo() {
        if (this.done || this.path.length < 2) {
            return;
        }
        const last = this.path.pop();
        const prev = this.path[this.path.length - 1];
        delete this.used[edgeKey(prev, last)];
        this.current = prev;
    }

    buttons() {
        const list = this.done
            ? [{ key: 'next', label: '下一关' }, { key: 'reset', label: '重画' }]
            : [{ key: 'undo', label: '撤销' }, { key: 'reset', label: '重画' }];
        const gap = 12;
        const bw = Math.min(100, (this.w - 60 - gap) / 2);
        const total = bw * list.length + gap * (list.length - 1);
        const startX = (this.w - total) / 2;
        return list.map((it, i) => ({ key: it.key, label: it.label, x: startX + i * (bw + gap), w: bw }));
    }

    update(dt) {
        this.time += dt;
    }

    /* ---------- 绘制 ---------- */

    render(ctx) {
        this.drawHeader(ctx);
        this.drawEdges(ctx);
        this.drawNodes(ctx);
        this.drawButtons(ctx);
    }

    drawHeader(ctx) {
        const usedCount = Object.keys(this.used).length;
        text(ctx, `${this.level + 1} / ${LEVELS.length} · ${this.name}`, this.w / 2, 22, {
            size: 15,
            color: '#39424E',
            weight: 'bold',
        });
        const tip = this.done
            ? '全部画完了！'
            : this.current
                ? `已画 ${usedCount} / ${this.totalEdges} 条，点相邻的点继续`
                : '从一个点开始，点相邻的点连线';
        text(ctx, tip, this.w / 2, 42, { size: 11, color: this.done ? '#5EA97C' : '#A7AEB8' });
    }

    drawEdges(ctx) {
        // 未走过的线
        ctx.lineCap = 'round';
        this.edges.forEach((e) => {
            const key = edgeKey(e.a, e.b);
            const a = this.nodeXY(e.a);
            const b = this.nodeXY(e.b);
            const used = !!this.used[key];
            ctx.strokeStyle = used ? '#5C93D6' : '#D5DBE2';
            ctx.lineWidth = used ? Math.max(4, this.step * 0.085) : Math.max(2.5, this.step * 0.05);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        });
    }

    drawNodes(ctx) {
        const seen = {};
        this.edges.forEach((e) => {
            [e.a, e.b].forEach((n) => {
                seen[n.r + ',' + n.c] = n;
            });
        });

        Object.keys(seen).forEach((k) => {
            const n = seen[k];
            const xy = this.nodeXY(n);
            const onPath = this.path.some((p) => p.r === n.r && p.c === n.c);
            const isCurrent = this.current && this.current.r === n.r && this.current.c === n.c;
            const isStart = this.path.length && this.path[0].r === n.r && this.path[0].c === n.c;

            circle(ctx, xy.x, xy.y, this.nodeR + 2, '#FFFFFF');
            circle(ctx, xy.x, xy.y, this.nodeR, onPath ? '#5C93D6' : '#B4BEC9');

            if (isCurrent) {
                ctx.strokeStyle = '#2F6FB0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(xy.x, xy.y, this.nodeR + 6, 0, Math.PI * 2);
                ctx.stroke();
            } else if (isStart) {
                ctx.strokeStyle = 'rgba(92, 147, 214, 0.5)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(xy.x, xy.y, this.nodeR + 5, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    drawButtons(ctx) {
        this.buttons().forEach((b) => {
            fillRoundRect(ctx, b.x, this.btnY, b.w, 32, 16, '#EFF2F5');
            text(ctx, b.label, b.x + b.w / 2, this.btnY + 16, { size: 13, color: '#4A5560' });
        });
    }
}

module.exports = EulerPath;
module.exports.LEVELS = LEVELS;
module.exports.buildPuzzle = buildPuzzle;
module.exports.edgeKey = edgeKey;
