/**
 * 爬塔跳跃
 * 一路向上蹦的垂直跳跃：左右拖动控制落点，掉出屏幕即结束。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp } = require('./draw.js');

class TowerClimb extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.reset();
    }

    reset() {
        this.player = {
            x: this.w / 2,
            y: this.h - 140,
            r: 11,
            vy: 0,
            vx: 0,
            face: 1,
        };
        this.platforms = [];
        this.stars = [];
        this.height = 0;
        this.targetX = this.w / 2;
        this.over = false;
        this.finished = false;

        let y = this.h - 90;
        this.platforms.push({ x: this.w / 2 - 34, y, w: 74, type: 'stone', vx: 0 });
        y -= 78;
        while (y > -140) {
            this.addPlatform(y);
            y -= 68 + Math.random() * 24;
        }
        this.topY = y;

        for (let i = 0; i < 26; i += 1) {
            this.stars.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: Math.random() * 1.6 + 0.5,
            });
        }
        this.emitScore(0);
    }

    start() {
        this.reset();
    }

    addPlatform(y) {
        const w = 58 + Math.random() * 26;
        const margin = 10;
        const x = margin + Math.random() * (this.w - w - margin * 2);
        const moving = Math.random() < Math.min(0.32, 0.08 + this.height / 4000);
        this.platforms.push({
            x,
            y,
            w,
            type: moving ? 'move' : 'stone',
            vx: moving ? (Math.random() < 0.5 ? -0.06 : 0.06) : 0,
        });
    }

    /* ---------------- 输入 ---------------- */

    onDrag(p) {
        this.targetX = p.x;
    }

    onPress(p) {
        this.targetX = p.x;
    }

    onButton(action) {
        const step = 34;
        if (action === 'left') {
            this.targetX = clamp(this.targetX - step, 10, this.w - 10);
        } else if (action === 'right') {
            this.targetX = clamp(this.targetX + step, 10, this.w - 10);
        }
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);
        if (this.over) {
            return;
        }
        const p = this.player;

        // 水平跟随
        if (Math.abs(this.targetX - p.x) > 2) {
            const dir = this.targetX > p.x ? 1 : -1;
            p.x += dir * 0.62 * dt;
            p.face = dir;
        }
        if (p.x < -p.r) {
            p.x = this.w + p.r;
        } else if (p.x > this.w + p.r) {
            p.x = -p.r;
        }

        // 平台横移
        this.platforms.forEach((pl) => {
            if (pl.vx) {
                pl.x += pl.vx * dt;
                if (pl.x < 8 || pl.x + pl.w > this.w - 8) {
                    pl.vx *= -1;
                    pl.x = clamp(pl.x, 8, this.w - 8 - pl.w);
                }
            }
        });

        // 重力
        const prevBottom = p.y + p.r;
        p.vy += 0.0024 * dt;
        p.y += p.vy * dt;
        const bottom = p.y + p.r;

        if (p.vy > 0) {
            for (let i = 0; i < this.platforms.length; i += 1) {
                const pl = this.platforms[i];
                if (p.x + p.r * 0.7 < pl.x || p.x - p.r * 0.7 > pl.x + pl.w) {
                    continue;
                }
                if (prevBottom <= pl.y + 4 && bottom >= pl.y) {
                    p.y = pl.y - p.r;
                    p.vy = -0.92;
                    if (this.api.vibrate) {
                        this.api.vibrate('light');
                    }
                    break;
                }
            }
        }

        // 镜头上移
        const line = this.h * 0.42;
        if (p.y < line) {
            const d = line - p.y;
            p.y = line;
            this.platforms.forEach((pl) => {
                pl.y += d;
            });
            this.height += d;
            this.emitScore(Math.floor(this.height / 10));
        }

        // 补充新平台 / 回收旧平台
        this.platforms = this.platforms.filter((pl) => pl.y < this.h + 90);
        let top = Infinity;
        this.platforms.forEach((pl) => {
            if (pl.y < top) {
                top = pl.y;
            }
        });
        if (top === Infinity) {
            top = -80;
        }
        while (top > -120) {
            const gap = 66 + Math.random() * 26;
            top -= gap;
            this.addPlatform(top);
        }

        if (p.y - p.r > this.h + 30) {
            this.over = true;
            if (this.api.vibrate) {
                this.api.vibrate('heavy');
            }
            this.emitOver({
                score: Math.floor(this.height / 10),
                message: `爬到 ${Math.floor(this.height / 10)} 米`,
            });
        }
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#F4F7FB';
        ctx.fillRect(0, 0, this.w, this.h);

        (this.stars || []).forEach((s) => {
            const y = (s.y + this.height * 0.12) % this.h;
            circle(ctx, s.x, y, s.r, 'rgba(150,170,195,0.28)');
        });

        this.platforms.forEach((pl) => {
            if (pl.y > this.h + 40 || pl.y < -60) {
                return;
            }
            const isMove = pl.type === 'move';
            fillRoundRect(ctx, pl.x, pl.y, pl.w, 12, 6, isMove ? '#8FA9D6' : '#C9B79C');
            fillRoundRect(ctx, pl.x + 2, pl.y + 2, pl.w - 4, 7, 4, isMove ? '#A9C0E4' : '#DCCBAF');
            if (isMove) {
                circle(ctx, pl.x + pl.w / 2, pl.y + 6, 2.2, 'rgba(255,255,255,0.7)');
            }
        });

        this.drawPlayer(ctx);
        this.drawHud(ctx);

        if (this.over) {
            ctx.save();
            ctx.globalAlpha = 0.92;
            fillRoundRect(ctx, this.w / 2 - 108, this.h * 0.4, 216, 68, 18, 'rgba(32,36,42,0.9)');
            text(ctx, '掉下去了', this.w / 2, this.h * 0.4 + 26, {
                size: 17,
                color: '#FFFFFF',
                weight: 'bold',
            });
            text(ctx, `高度 ${Math.floor(this.height / 10)} 米`, this.w / 2, this.h * 0.4 + 48, {
                size: 13,
                color: 'rgba(255,255,255,0.72)',
            });
            ctx.restore();
        } else {
            fillRoundRect(ctx, this.w / 2 - 122, this.h - 40, 244, 28, 14, 'rgba(244,247,251,0.94)');
            text(ctx, '左右拖动控制落点，落到平台自动弹起', this.w / 2, this.h - 26, {
                size: 12,
                color: '#9AA1AA',
            });
        }
    }

    drawPlayer(ctx) {
        const p = this.player;
        const squash = clamp(1 - p.vy * 0.12, 0.86, 1.14);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(2 - squash, squash);
        circle(ctx, 0, 0, p.r, '#4E7FAE');
        ctx.restore();
        circle(ctx, p.x, p.y, p.r * 0.66, '#6C9BC9');
        circle(ctx, p.x - p.face * 3.4, p.y - 2.4, 1.8, '#FFFFFF');
        circle(ctx, p.x - p.face * 3.4, p.y - 2.4, 0.9, '#26303A');
    }

    drawHud(ctx) {
        fillRoundRect(ctx, this.w / 2 - 40, 10, 80, 50, 16, 'rgba(244,247,251,0.92)');
        text(ctx, `${Math.floor(this.height / 10)}`, this.w / 2, 28, {
            size: 24,
            color: '#39424E',
            weight: 'bold',
        });
        text(ctx, '米', this.w / 2, 50, { size: 11, color: '#A7AEB8' });
    }
}

module.exports = TowerClimb;
