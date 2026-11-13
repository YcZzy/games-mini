/**
 * 国际象棋。
 *
 * 规则完整度：王车易位（含路径受攻击检查）、吃过路兵、升变（可选后/车/象/马）、
 * 将军 / 将死 / 逼和、五十步和棋、三次重复局面、子力不足和棋。
 *
 * AI：minimax + alpha-beta 剪枝，深度 3，走法按 MVV-LVA 排序。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const COLOR = {
    light: '#F0E6D6',
    dark: '#B9A184',
    edge: '#8A7458',
    white: '#FCFBF7',
    black: '#33383F',
    whiteLine: '#2E333A',
    blackLine: '#0D1014',
};

function other(side) {
    return side === 'w' ? 'b' : 'w';
}

function onBoard(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function at(b, r, c) {
    return onBoard(r, c) ? b[r][c] : null;
}

function cloneBoard(b) {
    return [b[0].slice(), b[1].slice(), b[2].slice(), b[3].slice(),
        b[4].slice(), b[5].slice(), b[6].slice(), b[7].slice()];
}

function initialBoard() {
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const b = [back.map((t) => 'b' + t), new Array(8).fill('bp')];
    for (let i = 0; i < 4; i += 1) {
        b.push(new Array(8).fill(null));
    }
    b.push(new Array(8).fill('wp'));
    b.push(back.map((t) => 'w' + t));
    return b;
}

function initialState() {
    return {
        turn: 'w',
        castle: { wK: true, wQ: true, bK: true, bQ: true },
        ep: null,
        halfmove: 0,
        fullmove: 1,
        sigs: [],
    };
}

function boardSig(b, st) {
    let s = st.turn;
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            s += b[r][c] || '.';
        }
    }
    s += st.castle.wK ? '1' : '0';
    s += st.castle.wQ ? '1' : '0';
    s += st.castle.bK ? '1' : '0';
    s += st.castle.bQ ? '1' : '0';
    if (st.ep) {
        s += st.ep.r + '' + st.ep.c;
    }
    return s;
}

/* ---------- 攻击判定 ---------- */

function attacked(b, r, c, by) {
    for (let i = 0; i < 4; i += 1) {
        let nr = r + ROOK_D[i][0];
        let nc = c + ROOK_D[i][1];
        while (onBoard(nr, nc)) {
            const p = b[nr][nc];
            if (p) {
                if (p[0] === by && (p[1] === 'r' || p[1] === 'q')) {
                    return true;
                }
                break;
            }
            nr += ROOK_D[i][0];
            nc += ROOK_D[i][1];
        }
    }
    for (let i = 0; i < 4; i += 1) {
        let nr = r + BISHOP_D[i][0];
        let nc = c + BISHOP_D[i][1];
        while (onBoard(nr, nc)) {
            const p = b[nr][nc];
            if (p) {
                if (p[0] === by && (p[1] === 'b' || p[1] === 'q')) {
                    return true;
                }
                break;
            }
            nr += BISHOP_D[i][0];
            nc += BISHOP_D[i][1];
        }
    }
    for (let i = 0; i < 8; i += 1) {
        const p = at(b, r + KNIGHT_D[i][0], c + KNIGHT_D[i][1]);
        if (p && p[0] === by && p[1] === 'n') {
            return true;
        }
    }
    const pd = by === 'w' ? 1 : -1;
    for (let k = -1; k <= 1; k += 2) {
        const p = at(b, r + pd, c + k);
        if (p && p[0] === by && p[1] === 'p') {
            return true;
        }
    }
    for (let i = 0; i < 8; i += 1) {
        const p = at(b, r + KING_D[i][0], c + KING_D[i][1]);
        if (p && p[0] === by && p[1] === 'k') {
            return true;
        }
    }
    return false;
}

function findKing(b, side) {
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            if (b[r][c] === side + 'k') {
                return { r, c };
            }
        }
    }
    return null;
}

function inCheck(b, side) {
    const k = findKing(b, side);
    if (!k) {
        return false;
    }
    return attacked(b, k.r, k.c, other(side));
}

/* ---------- 走法生成 ---------- */

function pushStep(b, r, c, side, dirs, out) {
    for (let i = 0; i < dirs.length; i += 1) {
        const nr = r + dirs[i][0];
        const nc = c + dirs[i][1];
        if (!onBoard(nr, nc)) {
            continue;
        }
        const p = b[nr][nc];
        if (!p) {
            out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: 'quiet' });
        } else if (p[0] !== side) {
            out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: 'capture' });
        }
    }
}

function pushSlide(b, r, c, side, dirs, out) {
    for (let i = 0; i < dirs.length; i += 1) {
        let nr = r + dirs[i][0];
        let nc = c + dirs[i][1];
        while (onBoard(nr, nc)) {
            const p = b[nr][nc];
            if (!p) {
                out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: 'quiet' });
            } else {
                if (p[0] !== side) {
                    out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: 'capture' });
                }
                break;
            }
            nr += dirs[i][0];
            nc += dirs[i][1];
        }
    }
}

function pushPawn(b, st, r, c, side, out) {
    const dir = side === 'w' ? -1 : 1;
    const startRow = side === 'w' ? 6 : 1;
    const promoRow = side === 'w' ? 0 : 7;
    const nr = r + dir;

    if (onBoard(nr, c) && !b[nr][c]) {
        out.push({ fr: r, fc: c, tr: nr, tc: c, kind: nr === promoRow ? 'promo' : 'quiet' });
        const nr2 = r + dir * 2;
        if (r === startRow && !b[nr2][c]) {
            out.push({ fr: r, fc: c, tr: nr2, tc: c, kind: 'double' });
        }
    }

    for (let k = -1; k <= 1; k += 2) {
        const nc = c + k;
        if (!onBoard(nr, nc)) {
            continue;
        }
        const p = b[nr][nc];
        if (p && p[0] !== side) {
            out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: nr === promoRow ? 'promo' : 'capture' });
        } else if (!p && st.ep && st.ep.r === nr && st.ep.c === nc) {
            out.push({ fr: r, fc: c, tr: nr, tc: nc, kind: 'ep' });
        }
    }
}

function pushCastle(b, st, r, c, side, out) {
    const homeRow = side === 'w' ? 7 : 0;
    if (r !== homeRow || c !== 4) {
        return;
    }
    if (inCheck(b, side)) {
        return;
    }
    const foe = other(side);
    if (st.castle[side + 'K'] && !b[r][5] && !b[r][6] && b[r][7] === side + 'r') {
        if (!attacked(b, r, 5, foe) && !attacked(b, r, 6, foe)) {
            out.push({ fr: r, fc: 4, tr: r, tc: 6, kind: 'castleK' });
        }
    }
    if (st.castle[side + 'Q'] && !b[r][3] && !b[r][2] && !b[r][1] && b[r][0] === side + 'r') {
        if (!attacked(b, r, 3, foe) && !attacked(b, r, 2, foe)) {
            out.push({ fr: r, fc: 4, tr: r, tc: 2, kind: 'castleQ' });
        }
    }
}

function pseudoMoves(b, st) {
    const out = [];
    const side = st.turn;
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const p = b[r][c];
            if (!p || p[0] !== side) {
                continue;
            }
            const t = p[1];
            if (t === 'p') {
                pushPawn(b, st, r, c, side, out);
            } else if (t === 'n') {
                pushStep(b, r, c, side, KNIGHT_D, out);
            } else if (t === 'b') {
                pushSlide(b, r, c, side, BISHOP_D, out);
            } else if (t === 'r') {
                pushSlide(b, r, c, side, ROOK_D, out);
            } else if (t === 'q') {
                pushSlide(b, r, c, side, BISHOP_D.concat(ROOK_D), out);
            } else if (t === 'k') {
                pushStep(b, r, c, side, KING_D, out);
                pushCastle(b, st, r, c, side, out);
            }
        }
    }
    return out;
}

/** 在棋盘上临时走一步，判断是否让己方王暴露 */
function leavesKingSafe(b, m, side) {
    const moving = b[m.fr][m.fc];
    const captured = b[m.tr][m.tc];
    let epR = -1;
    let epC = -1;
    let epCap = null;

    b[m.tr][m.tc] = moving;
    b[m.fr][m.fc] = null;
    if (m.kind === 'ep') {
        epR = m.fr;
        epC = m.tc;
        epCap = b[epR][epC];
        b[epR][epC] = null;
    }

    const safe = !inCheck(b, side);

    b[m.fr][m.fc] = moving;
    b[m.tr][m.tc] = captured;
    if (m.kind === 'ep') {
        b[epR][epC] = epCap;
    }
    return safe;
}

function legalMoves(b, st) {
    const side = st.turn;
    const all = pseudoMoves(b, st);
    const out = [];
    for (let i = 0; i < all.length; i += 1) {
        if (leavesKingSafe(b, all[i], side)) {
            out.push(all[i]);
        }
    }
    return out;
}

/* ---------- 落子 ---------- */

function applyMove(b, st, m) {
    const nb = cloneBoard(b);
    const nst = {
        turn: other(st.turn),
        castle: {
            wK: st.castle.wK,
            wQ: st.castle.wQ,
            bK: st.castle.bK,
            bQ: st.castle.bQ,
        },
        ep: null,
        halfmove: st.halfmove + 1,
        fullmove: st.fullmove + (st.turn === 'b' ? 1 : 0),
        sigs: st.sigs.slice(),
    };

    const piece = nb[m.fr][m.fc];
    const side = piece[0];
    const type = piece[1];
    const isCapture = !!nb[m.tr][m.tc] || m.kind === 'ep';

    nb[m.tr][m.tc] = m.kind === 'promo' ? side + (m.promo || 'q') : piece;
    nb[m.fr][m.fc] = null;

    if (m.kind === 'ep') {
        nb[m.fr][m.tc] = null;
    }

    if (m.kind === 'double') {
        nst.ep = { r: (m.fr + m.tr) / 2, c: m.fc };
    }

    if (m.kind === 'castleK') {
        nb[m.tr][5] = nb[m.tr][7];
        nb[m.tr][7] = null;
    } else if (m.kind === 'castleQ') {
        nb[m.tr][3] = nb[m.tr][0];
        nb[m.tr][0] = null;
    }

    if (type === 'k') {
        nst.castle[side + 'K'] = false;
        nst.castle[side + 'Q'] = false;
    }
    if (type === 'r') {
        if (m.fc === 0) {
            nst.castle[side + 'Q'] = false;
        }
        if (m.fc === 7) {
            nst.castle[side + 'K'] = false;
        }
    }
    // 车被吃，对应易位权失效
    if (m.tc === 0 && m.tr === (side === 'w' ? 0 : 7)) {
        nst.castle[other(side) + 'Q'] = false;
    }
    if (m.tc === 7 && m.tr === (side === 'w' ? 0 : 7)) {
        nst.castle[other(side) + 'K'] = false;
    }

    if (type === 'p' || isCapture) {
        nst.halfmove = 0;
    }

    nst.sigs.push(boardSig(nb, nst));

    return { board: nb, state: nst };
}

/* ---------- 局面评估 ---------- */

function centerScore(r, c) {
    const dr = Math.abs(r - 3.5);
    const dc = Math.abs(c - 3.5);
    return Math.round((7 - dr - dc) * 3);
}

function evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const p = b[r][c];
            if (!p) {
                continue;
            }
            const sign = p[0] === 'w' ? 1 : -1;
            let v = PIECE_VAL[p[1]];
            if (p[1] !== 'k') {
                v += centerScore(r, c);
            }
            if (p[1] === 'p') {
                // 兵越靠近对方底线越值钱
                const adv = p[0] === 'w' ? 6 - r : r - 1;
                v += Math.max(0, adv) * 6;
            }
            score += sign * v;
        }
    }
    return score;
}

function moveScore(b, m) {
    const victim = b[m.tr][m.tc];
    const attacker = b[m.fr][m.fc];
    let s = 0;
    if (victim) {
        s = PIECE_VAL[victim[1]] * 10 - PIECE_VAL[attacker[1]];
    }
    if (m.kind === 'promo') {
        s += 800;
    }
    return s;
}

function orderedMoves(b, st) {
    const moves = legalMoves(b, st);
    const scored = moves.map((m) => ({ m, s: moveScore(b, m) }));
    scored.sort((a, b2) => b2.s - a.s);
    return scored.map((x) => x.m);
}

const MATE = 100000;

function search(b, st, depth, alpha, beta) {
    const moves = orderedMoves(b, st);
    if (!moves.length) {
        if (inCheck(b, st.turn)) {
            return -MATE - depth;
        }
        return 0;
    }
    if (depth === 0) {
        return evaluate(b) * (st.turn === 'w' ? 1 : -1);
    }

    let best = -Infinity;
    let a = alpha;
    for (let i = 0; i < moves.length; i += 1) {
        const nx = applyMove(b, st, moves[i]);
        const v = -search(nx.board, nx.state, depth - 1, -beta, -a);
        if (v > best) {
            best = v;
        }
        if (v > a) {
            a = v;
        }
        if (a >= beta) {
            break;
        }
    }
    return best;
}

function bestMove(b, st, depth) {
    const moves = orderedMoves(b, st);
    if (!moves.length) {
        return null;
    }
    let best = moves[0];
    let bestVal = -Infinity;
    let alpha = -Infinity;
    for (let i = 0; i < moves.length; i += 1) {
        const nx = applyMove(b, st, moves[i]);
        let v = -search(nx.board, nx.state, depth - 1, -Infinity, -alpha);
        v += Math.random() * 8;
        if (v > bestVal) {
            bestVal = v;
            best = moves[i];
        }
        if (v > alpha) {
            alpha = v;
        }
    }
    return best;
}

/* ---------- 和棋判断 ---------- */

function insufficientMaterial(b) {
    const pieces = [];
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const p = b[r][c];
            if (p && p[1] !== 'k') {
                pieces.push({ p, r, c });
            }
        }
    }
    if (!pieces.length) {
        return true;
    }
    if (pieces.length === 1 && (pieces[0].p[1] === 'n' || pieces[0].p[1] === 'b')) {
        return true;
    }
    if (pieces.length === 2 && pieces[0].p[1] === 'b' && pieces[1].p[1] === 'b'
        && pieces[0].p[0] !== pieces[1].p[0]) {
        const c0 = (pieces[0].r + pieces[0].c) % 2;
        const c1 = (pieces[1].r + pieces[1].c) % 2;
        return c0 === c1;
    }
    return false;
}

/* ---------- 棋子绘制 ---------- */

function ellipsePath(ctx, cx, cy, rx, ry) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.closePath();
    ctx.restore();
}

function paint(ctx, fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
}

function drawPawn(ctx, cx, cy, s, fill, stroke, lw) {
    circle(ctx, cx, cy - s * 0.18, s * 0.115, fill);
    circle(ctx, cx, cy - s * 0.18, s * 0.115, fill);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.18, s * 0.115, 0, Math.PI * 2);
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.075, cy - s * 0.075);
    ctx.lineTo(cx + s * 0.075, cy - s * 0.075);
    ctx.lineTo(cx + s * 0.17, cy + s * 0.16);
    ctx.lineTo(cx - s * 0.17, cy + s * 0.16);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ellipsePath(ctx, cx, cy + s * 0.19, s * 0.2, s * 0.055);
    paint(ctx, fill, stroke, lw);
}

function drawRook(ctx, cx, cy, s, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.2, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.15, cy - s * 0.1);
    ctx.lineTo(cx - s * 0.2, cy - s * 0.1);
    ctx.lineTo(cx - s * 0.2, cy - s * 0.26);
    ctx.lineTo(cx - s * 0.1, cy - s * 0.26);
    ctx.lineTo(cx - s * 0.1, cy - s * 0.17);
    ctx.lineTo(cx - s * 0.03, cy - s * 0.17);
    ctx.lineTo(cx - s * 0.03, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.03, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.03, cy - s * 0.17);
    ctx.lineTo(cx + s * 0.1, cy - s * 0.17);
    ctx.lineTo(cx + s * 0.1, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.26);
    ctx.lineTo(cx + s * 0.2, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.2);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ellipsePath(ctx, cx, cy + s * 0.215, s * 0.21, s * 0.05);
    paint(ctx, fill, stroke, lw);
}

function drawKnight(ctx, cx, cy, s, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.16, cy + s * 0.19);
    ctx.lineTo(cx - s * 0.06, cy + s * 0.02);
    ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.12, cx - s * 0.06, cy - s * 0.24);
    ctx.lineTo(cx - s * 0.09, cy - s * 0.29);
    ctx.lineTo(cx + s * 0.02, cy - s * 0.3);
    ctx.quadraticCurveTo(cx + s * 0.2, cy - s * 0.22, cx + s * 0.17, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.14, cy + s * 0.19);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    circle(ctx, cx - s * 0.005, cy - s * 0.155, s * 0.028, stroke);

    ellipsePath(ctx, cx, cy + s * 0.205, s * 0.19, s * 0.05);
    paint(ctx, fill, stroke, lw);
}

function drawBishop(ctx, cx, cy, s, fill, stroke, lw) {
    circle(ctx, cx, cy - s * 0.29, s * 0.045, fill);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.29, s * 0.045, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.235);
    ctx.quadraticCurveTo(cx + s * 0.13, cy - s * 0.13, cx + s * 0.12, cy + s * 0.02);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.02);
    ctx.quadraticCurveTo(cx - s * 0.13, cy - s * 0.13, cx, cy - s * 0.235);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.12, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.12, cy + s * 0.02);
    ctx.lineTo(cx + s * 0.16, cy + s * 0.14);
    ctx.lineTo(cx - s * 0.16, cy + s * 0.14);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ellipsePath(ctx, cx, cy + s * 0.185, s * 0.2, s * 0.055);
    paint(ctx, fill, stroke, lw);
}

function drawQueen(ctx, cx, cy, s, fill, stroke, lw) {
    circle(ctx, cx, cy - s * 0.33, s * 0.045, fill);
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.33, s * 0.045, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.22, cy - s * 0.12);
    ctx.lineTo(cx - s * 0.16, cy - s * 0.28);
    ctx.lineTo(cx - s * 0.08, cy - s * 0.15);
    ctx.lineTo(cx, cy - s * 0.31);
    ctx.lineTo(cx + s * 0.08, cy - s * 0.15);
    ctx.lineTo(cx + s * 0.16, cy - s * 0.28);
    ctx.lineTo(cx + s * 0.22, cy - s * 0.12);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.19, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.19, cy - s * 0.1);
    ctx.lineTo(cx + s * 0.12, cy + s * 0.16);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.16);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ellipsePath(ctx, cx, cy + s * 0.2, s * 0.21, s * 0.055);
    paint(ctx, fill, stroke, lw);
}

function drawKing(ctx, cx, cy, s, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.36);
    ctx.lineTo(cx, cy - s * 0.24);
    ctx.moveTo(cx - s * 0.055, cy - s * 0.31);
    ctx.lineTo(cx + s * 0.055, cy - s * 0.31);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2, lw * 1.35);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.21, cy - s * 0.1);
    ctx.lineTo(cx - s * 0.15, cy - s * 0.22);
    ctx.lineTo(cx - s * 0.07, cy - s * 0.11);
    ctx.lineTo(cx, cy - s * 0.23);
    ctx.lineTo(cx + s * 0.07, cy - s * 0.11);
    ctx.lineTo(cx + s * 0.15, cy - s * 0.22);
    ctx.lineTo(cx + s * 0.21, cy - s * 0.1);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy - s * 0.08);
    ctx.lineTo(cx + s * 0.18, cy - s * 0.08);
    ctx.lineTo(cx + s * 0.12, cy + s * 0.16);
    ctx.lineTo(cx - s * 0.12, cy + s * 0.16);
    ctx.closePath();
    paint(ctx, fill, stroke, lw);

    ellipsePath(ctx, cx, cy + s * 0.2, s * 0.21, s * 0.055);
    paint(ctx, fill, stroke, lw);
}

const DRAWERS = {
    p: drawPawn,
    r: drawRook,
    n: drawKnight,
    b: drawBishop,
    q: drawQueen,
    k: drawKing,
};

function drawPiece(ctx, piece, cx, cy, size) {
    const side = piece[0];
    const fill = side === 'w' ? COLOR.white : COLOR.black;
    const stroke = side === 'w' ? COLOR.whiteLine : COLOR.blackLine;
    const lw = Math.max(1.3, size * 0.04);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    DRAWERS[piece[1]](ctx, cx, cy, size, fill, stroke, lw);
    ctx.restore();
}

/* ---------- 游戏本体 ---------- */

const PROMO_LIST = [
    { t: 'q', name: '后' },
    { t: 'r', name: '车' },
    { t: 'b', name: '象' },
    { t: 'n', name: '马' },
];

class Chess extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.depth = 3;
    }

    start() {
        this.board = initialBoard();
        this.state = initialState();
        this.selected = null;
        this.moves = [];
        this.lastMove = null;
        this.pending = null;
        this.promoPick = null;
        this.thinking = 0;
        this.result = null;
        this.hintCells = [];
        this.history = [];
        this.layout();
        this.syncHud();
    }

    layout() {
        const topPad = 62;
        const botPad = 112;
        const availH = this.h - topPad - botPad;
        const availW = this.w - 28;
        this.cell = Math.floor(Math.min(availW / 8, availH / 8));
        this.bw = this.cell * 8;
        this.ox = Math.floor((this.w - this.bw) / 2);
        this.oy = Math.floor(topPad + (availH - this.bw) / 2);
        this.buttonY = this.oy + this.bw + 30;
    }

    syncHud() {
        const side = this.state.turn === 'w' ? '白方' : '黑方';
        this.emitHud(`${side}走棋 · 第 ${this.state.fullmove} 回合`);
        this.emitScore(this.state.fullmove);
    }

    cellAt(p) {
        const c = Math.floor((p.x - this.ox) / this.cell);
        const r = Math.floor((p.y - this.oy) / this.cell);
        if (r < 0 || r > 7 || c < 0 || c > 7) {
            return null;
        }
        return { r, c };
    }

    onTap(p) {
        if (this.result || this.pending) {
            return;
        }
        if (this.state.turn !== 'w' || this.thinking > 0) {
            return;
        }

        const hit = this.cellAt(p);
        if (!hit) {
            this.tryButtons(p);
            return;
        }

        if (this.selected) {
            const target = this.moves.find((m) => m.tr === hit.r && m.tc === hit.c);
            if (target) {
                if (target.kind === 'promo') {
                    this.pending = target;
                    return;
                }
                this.doMove(target);
                return;
            }
        }

        const piece = this.board[hit.r][hit.c];
        if (piece && piece[0] === 'w') {
            this.selected = hit;
            this.moves = legalMoves(this.board, this.state)
                .filter((m) => m.fr === hit.r && m.fc === hit.c);
        } else {
            this.selected = null;
            this.moves = [];
        }
    }

    tryButtons(p) {
        const y = this.buttonY;
        const btns = this.layoutButtons();
        for (let i = 0; i < btns.length; i += 1) {
            const b = btns[i];
            if (p.x >= b.x && p.x <= b.x + b.w && p.y >= y && p.y <= y + 34) {
                this.onAction(b.key);
                return;
            }
        }
    }

    layoutButtons() {
        const list = [
            { key: 'undo', label: '悔棋' },
            { key: 'hint', label: '提示' },
            { key: 'restart', label: '新局' },
        ];
        const gap = 10;
        const bw = Math.min(88, (this.bw - gap * 2) / 3);
        const total = bw * list.length + gap * (list.length - 1);
        const startX = this.ox + (this.bw - total) / 2;
        return list.map((it, i) => ({
            key: it.key,
            label: it.label,
            x: startX + i * (bw + gap),
            w: bw,
        }));
    }

    onAction(key) {
        if (key === 'restart') {
            this.start();
            return;
        }
        if (key === 'undo') {
            if (this.history.length >= 2) {
                const back = this.history.splice(this.history.length - 2, 2);
                this.board = back[0].board;
                this.state = back[0].state;
                this.lastMove = back.length > 0 ? back[0].lastMove : null;
                this.selected = null;
                this.moves = [];
                this.result = null;
                this.thinking = 0;
                this.finished = false;
                this.syncHud();
            }
            return;
        }
        if (key === 'hint') {
            const m = bestMove(this.board, this.state, 2);
            if (m) {
                this.hintCells = [{ r: m.fr, c: m.fc }, { r: m.tr, c: m.tc }];
            }
        }
    }

    doMove(m) {
        this.history.push({ board: this.board, state: this.state, lastMove: this.lastMove });
        const nx = applyMove(this.board, this.state, m);
        this.board = nx.board;
        this.state = nx.state;
        this.lastMove = m;
        this.selected = null;
        this.moves = [];
        this.hintCells = [];
        this.pending = null;
        this.promoPick = null;

        if (this.api.vibrate) {
            this.api.vibrate();
        }

        this.syncHud();
        if (this.checkEnd()) {
            return;
        }
        this.thinking = 300;
    }

    checkEnd() {
        const st = this.state;
        const side = st.turn;
        const moves = legalMoves(this.board, st);
        const checked = inCheck(this.board, side);

        if (!moves.length) {
            if (checked) {
                const winner = other(side);
                const payload = {
                    score: st.fullmove,
                    message: winner === 'w' ? '将死黑王，你赢了' : '被将死了，再战一局',
                };
                if (winner === 'w') {
                    this.result = 'win';
                    this.emitWin(payload);
                } else {
                    this.result = 'lose';
                    this.emitOver(payload);
                }
            } else {
                this.result = 'draw';
                this.emitOver({ score: st.fullmove, message: '逼和，无子可动' });
            }
            return true;
        }

        if (st.halfmove >= 100) {
            this.result = 'draw';
            this.emitOver({ score: st.fullmove, message: '五十步无吃子无动兵，和棋' });
            return true;
        }

        if (insufficientMaterial(this.board)) {
            this.result = 'draw';
            this.emitOver({ score: st.fullmove, message: '双方子力不足，和棋' });
            return true;
        }

        const sig = boardSig(this.board, st);
        let count = 0;
        for (let i = 0; i < st.sigs.length; i += 1) {
            if (st.sigs[i] === sig) {
                count += 1;
            }
        }
        if (count >= 3) {
            this.result = 'draw';
            this.emitOver({ score: st.fullmove, message: '三次重复局面，和棋' });
            return true;
        }

        return false;
    }

    update(dt) {
        this.time += dt;
        if (this.thinking > 0) {
            this.thinking -= dt;
            if (this.thinking <= 0) {
                this.thinking = 0;
                const m = bestMove(this.board, this.state, this.depth);
                if (m) {
                    this.history.push({ board: this.board, state: this.state, lastMove: this.lastMove });
                    const nx = applyMove(this.board, this.state, m);
                    this.board = nx.board;
                    this.state = nx.state;
                    this.lastMove = m;
                    this.syncHud();
                    this.checkEnd();
                }
            }
        }
    }

    render(ctx) {
        this.drawBoard(ctx);
        this.drawStatus(ctx);
        this.drawButtons(ctx);
        if (this.pending) {
            this.drawPromo(ctx);
        }
    }

    drawBoard(ctx) {
        const cell = this.cell;
        fillRoundRect(ctx, this.ox - 6, this.oy - 6, this.bw + 12, this.bw + 12, 10, COLOR.edge);

        for (let r = 0; r < 8; r += 1) {
            for (let c = 0; c < 8; c += 1) {
                const x = this.ox + c * cell;
                const y = this.oy + r * cell;
                ctx.fillStyle = (r + c) % 2 === 0 ? COLOR.light : COLOR.dark;
                ctx.fillRect(x, y, cell, cell);
            }
        }

        if (this.lastMove) {
            [this.lastMove, { fr: this.lastMove.tr, fc: this.lastMove.tc, tr: this.lastMove.fr, tc: this.lastMove.fc }]
                .forEach((m) => {
                    if (!m) {
                        return;
                    }
                    ctx.fillStyle = 'rgba(214, 168, 74, 0.42)';
                    ctx.fillRect(this.ox + m.fc * cell, this.oy + m.fr * cell, cell, cell);
                });
        }

        if (this.selected) {
            ctx.fillStyle = 'rgba(96, 168, 128, 0.45)';
            ctx.fillRect(
                this.ox + this.selected.c * cell,
                this.oy + this.selected.r * cell,
                cell,
                cell
            );
        }

        this.hintCells.forEach((h) => {
            ctx.strokeStyle = 'rgba(92, 148, 214, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(
                this.ox + h.c * cell + 2,
                this.oy + h.r * cell + 2,
                cell - 4,
                cell - 4
            );
        });

        for (let r = 0; r < 8; r += 1) {
            for (let c = 0; c < 8; c += 1) {
                const p = this.board[r][c];
                if (p) {
                    drawPiece(ctx, p, this.ox + c * cell + cell / 2, this.oy + r * cell + cell / 2, cell);
                }
            }
        }

        this.moves.forEach((m) => {
            const cx = this.ox + m.tc * cell + cell / 2;
            const cy = this.oy + m.tr * cell + cell / 2;
            const capture = this.board[m.tr][m.tc] || m.kind === 'ep';
            if (capture) {
                ctx.strokeStyle = 'rgba(196, 88, 78, 0.8)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy, cell * 0.4, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                circle(ctx, cx, cy, cell * 0.13, 'rgba(72, 108, 88, 0.42)');
            }
        });

        if (inCheck(this.board, this.state.turn)) {
            const k = findKing(this.board, this.state.turn);
            if (k) {
                ctx.strokeStyle = 'rgba(198, 74, 64, 0.85)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(
                    this.ox + k.c * cell + cell / 2,
                    this.oy + k.r * cell + cell / 2,
                    cell * 0.42,
                    0,
                    Math.PI * 2
                );
                ctx.stroke();
            }
        }

        // 坐标标注
        for (let c = 0; c < 8; c += 1) {
            text(ctx, 'abcdefgh'[c], this.ox + c * cell + cell / 2, this.oy + this.bw + 12, {
                size: 10,
                color: '#9A8B76',
            });
        }
        for (let r = 0; r < 8; r += 1) {
            text(ctx, String(8 - r), this.ox - 11, this.oy + r * cell + cell / 2, {
                size: 10,
                color: '#9A8B76',
            });
        }
    }

    drawStatus(ctx) {
        let msg = '';
        let color = '#39424E';
        if (this.result === 'win') {
            msg = '你赢了';
            color = '#3E8B5C';
        } else if (this.result === 'lose') {
            msg = '被将死了';
            color = '#C05850';
        } else if (this.result === 'draw') {
            msg = '和棋';
            color = '#7C7468';
        } else if (this.thinking > 0) {
            msg = '电脑思考中…';
            color = '#6B7684';
        } else if (this.state.turn === 'w') {
            msg = inCheck(this.board, 'w') ? '将军！快应一手' : '轮到你走';
            color = inCheck(this.board, 'w') ? '#C05850' : '#39424E';
        } else {
            msg = '轮到电脑';
            color = '#6B7684';
        }

        text(ctx, msg, this.w / 2, 26, { size: 15, color, weight: 'bold' });
        text(ctx, `第 ${this.state.fullmove} 回合 · 深度 ${this.depth}`, this.w / 2, 46, {
            size: 11,
            color: '#A7AEB8',
        });
    }

    drawButtons(ctx) {
        const y = this.buttonY;
        this.layoutButtons().forEach((b) => {
            fillRoundRect(ctx, b.x, y, b.w, 34, 17, '#EFF2F5');
            text(ctx, b.label, b.x + b.w / 2, y + 17, { size: 13, color: '#4A5560' });
        });
    }

    drawPromo(ctx) {
        const size = Math.min(this.bw * 0.72, 250);
        const x = this.ox + (this.bw - size) / 2;
        const y = this.oy + (this.bw - size) / 2;
        fillRoundRect(ctx, x, y, size, size, 16, 'rgba(252, 251, 247, 0.98)');
        ctx.strokeStyle = '#D8D2C6';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, size, size);

        text(ctx, '兵升变为', x + size / 2, y + 24, { size: 13, color: '#6B7684' });

        const cell = size / 4;
        PROMO_LIST.forEach((it, i) => {
            const cx = x + cell * (i + 0.5);
            const cy = y + 40 + cell / 2;
            drawPiece(ctx, 'w' + it.t, cx, cy, cell * 0.86);
            text(ctx, it.name, cx, cy + cell * 0.55, { size: 11, color: '#8A8072' });
        });

        this.promoRects = PROMO_LIST.map((it, i) => ({
            t: it.t,
            x: x + cell * i,
            y: y + 40,
            w: cell,
            h: cell,
        }));

        this.promoLayout = { x, y, size, cell };
    }

    onTapPromo(p) {
        if (!this.promoRects) {
            return false;
        }
        for (let i = 0; i < this.promoRects.length; i += 1) {
            const r = this.promoRects[i];
            if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
                const move = Object.assign({}, this.pending, { promo: r.t });
                this.pending = null;
                this.doMove(move);
                return true;
            }
        }
        return false;
    }
}

// 升变面板需要优先吃掉点击
const originalOnTap = Chess.prototype.onTap;
Chess.prototype.onTap = function onTap(p) {
    if (this.pending) {
        if (!this.onTapPromo(p)) {
            this.pending = null;
            this.promoRects = null;
        }
        return;
    }
    originalOnTap.call(this, p);
};

module.exports = Chess;
// 供离线测试使用（perft 校验走法生成）
module.exports.internals = {
    legalMoves,
    applyMove,
    initialBoard,
    initialState,
    inCheck,
    attacked,
    boardSig,
};
