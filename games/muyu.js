const GameBase = require('./base.js');
const { text, circle } = require('./draw.js');

class Muyu extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.cx = this.w / 2;
        this.cy = this.h / 2 + 18;
        this.R = Math.min(this.w * 0.32, this.h * 0.24);
        this.merit = 0;
        this.pulse = 0;
        this.floaters = [];
        this.ripples = [];
    }

    start() {
        this.merit = 0;
        this.pulse = 0;
        this.fireflies = [];
        for (let i = 0; i < 22; i += 1) {
            this.fireflies.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: 0.8 + Math.random() * 1.8,
                v: 0.1 + Math.random() * 0.25,
                phase: Math.random() * Math.PI * 2,
            });
        }
        this.emitScore(0);
    }

    onTap(p) {
        this.merit += 1;
        this.pulse = 1;
        this.emitScore(this.merit);

        this.floaters.push({
            x: this.cx + (Math.random() - 0.5) * this.R * 0.8,
            y: this.cy - this.R * 1.02,
            life: 1000,
            max: 1000,
        });

        this.ripples.push({
            x: this.cx,
            y: this.cy,
            r: this.R * 0.7,
            alpha: 0.5,
            max: this.R * 1.5,
        });

        if (this.api.vibrate) {
            this.api.vibrate('light');
        }
    }

    update(dt) {
        super.update(dt);

        if (this.pulse > 0) {
            this.pulse = Math.max(0, this.pulse - dt / 180);
        }

        for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
            const f = this.floaters[i];
            f.life -= dt;
            f.y -= dt * 0.045;
            if (f.life <= 0) {
                this.floaters.splice(i, 1);
            }
        }

        for (let i = this.ripples.length - 1; i >= 0; i -= 1) {
            const rip = this.ripples[i];
            rip.r += dt * 0.09;
            rip.alpha -= dt * 0.0009;
            if (rip.alpha <= 0) {
                this.ripples.splice(i, 1);
            }
        }

        this.fireflies.forEach((f) => {
            f.phase += dt * 0.0015;
            f.y -= f.v * (dt / 16.67);
            if (f.y < -6) {
                f.y = this.h + 6;
                f.x = Math.random() * this.w;
            }
        });
    }

    render(ctx) {
        // 背景
        const grad = ctx.createLinearGradient(0, 0, 0, this.h);
        grad.addColorStop(0, '#FBF6EE');
        grad.addColorStop(1, '#F3E8D8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.w, this.h);

        this.fireflies.forEach((f) => {
            const alpha = 0.18 + Math.sin(f.phase) * 0.14;
            ctx.globalAlpha = Math.max(0.04, alpha);
            circle(ctx, f.x, f.y, f.r, '#C9A171');
        });
        ctx.globalAlpha = 1;

        // 功德数字
        text(ctx, this.merit, this.w / 2, this.cy - this.R * 1.55, {
            size: Math.min(56, this.w * 0.14),
            color: '#7A5A38',
            weight: 'bold',
        });
        text(ctx, '功德', this.w / 2, this.cy - this.R * 1.55 + Math.min(38, this.w * 0.1), {
            size: 13,
            color: '#B79B76',
        });

        // 涟漪
        this.ripples.forEach((rip) => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, rip.alpha);
            ctx.strokeStyle = '#C9A171';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        });

        this.drawMuyu(ctx);

        // 飘字
        this.floaters.forEach((f) => {
            const t = f.life / f.max;
            ctx.save();
            ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.4));
            text(ctx, '+1', f.x, f.y, {
                size: 20 + (1 - t) * 6,
                color: '#96683C',
                weight: 'bold',
            });
            ctx.restore();
        });
    }

    drawMuyu(ctx) {
        const scale = 1 - this.pulse * 0.06;
        const R = this.R * scale;
        const cx = this.cx;
        const cy = this.cy;

        // 阴影
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.beginPath();
        ctx.ellipse
            ? ctx.ellipse(cx, cy + R * 0.92, R * 0.86, R * 0.16, 0, 0, Math.PI * 2)
            : ctx.arc(cx, cy + R * 0.92, R * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#8A6642';
        ctx.fill();
        ctx.restore();

        // 主体
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.86);
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.restore();

        const bodyGrad = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        bodyGrad.addColorStop(0, '#C79A6B');
        bodyGrad.addColorStop(0.55, '#B4855A');
        bodyGrad.addColorStop(1, '#95683F');
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // 顶部开口槽：扁长椭圆，像木鱼被凿开的缝
        ctx.save();
        ctx.translate(cx - R * 0.02, cy - R * 0.34);
        ctx.scale(1, 0.32);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.58, 0, Math.PI * 2);
        ctx.restore();
        ctx.fillStyle = '#6B4729';
        ctx.fill();

        ctx.save();
        ctx.translate(cx - R * 0.02, cy - R * 0.3);
        ctx.scale(1, 0.26);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.5, 0, Math.PI * 2);
        ctx.restore();
        ctx.fillStyle = 'rgba(58, 36, 18, 0.5)';
        ctx.fill();

        // 鱼嘴缝
        ctx.save();
        ctx.strokeStyle = 'rgba(104, 68, 38, 0.45)';
        ctx.lineWidth = Math.max(1.8, R * 0.026);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.52, cy + R * 0.38);
        ctx.quadraticCurveTo(cx, cy + R * 0.56, cx + R * 0.52, cy + R * 0.36);
        ctx.stroke();
        ctx.restore();

        // 内暗边，体现木质厚度
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.86);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(124, 84, 48, 0.2)';
        ctx.lineWidth = Math.max(2, R * 0.04);
        ctx.stroke();

        // 鱼眼
        circle(ctx, cx + R * 0.5, cy + R * 0.06, R * 0.062, 'rgba(84, 54, 30, 0.72)');
        circle(ctx, cx + R * 0.52, cy + R * 0.04, R * 0.022, 'rgba(255, 255, 255, 0.5)');
    }
}

module.exports = Muyu;
