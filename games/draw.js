/**
 * Canvas 绘制小工具，所有游戏共用。
 */

function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
}

function text(ctx, str, x, y, options) {
    const opts = options || {};
    const size = opts.size || 14;
    ctx.save();
    ctx.fillStyle = opts.color || '#23262b';
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    ctx.font = `${opts.weight || 'normal'} ${size}px -apple-system, "PingFang SC", sans-serif`;
    ctx.fillText(String(str), x, y);
    ctx.restore();
}

function circle(ctx, x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function clear(ctx, w, h, color) {
    ctx.fillStyle = color || '#ffffff';
    ctx.fillRect(0, 0, w, h);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
}

function hitRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
}

module.exports = {
    roundRect,
    fillRoundRect,
    text,
    circle,
    clear,
    lerp,
    clamp,
    hitRect,
};
