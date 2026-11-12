/**
 * 恐龙快跑
 * 无尽跑酷：点一下起跳，下滑蹲下躲飞鸟，速度越来越快。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle } = require('./draw.js');

class DinoRun extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.score = 0;
        this.reset();
    }

    reset() {
        this.groundY = Math.floor(this.h * 0.8);
        this.player = {
            x: Math.max(50, this.w * 0.15),
            y: this.groundY - 54,
            w: 38,
            h: 54,
            vy: 0,
            onGround: true,
            duck: 0,
            legPhase: 0,
        };
        this.obstacles = [];
        this.clouds = [];
        this.speed = 0.42;
        this.distance = 0;
        this.spawnTimer = 900;
        this.over = false;
        this.finished = false;
        this.tick = 0;

        for (let i = 0; i < 4; i += 1) {
            this.clouds.push({
                x: Math.random() * this.w,
                y: 40 + Math.random() * (this.h * 0.35),
                s: 0.5 + Math.random() * 0.6,
            });
        }
        this.emitScore(0);
    }

    start() {
        this.reset();
    }

    /* ---------------- 输入 ---------------- */

    onTap() {
        if (this.over) {
            return;
        }
        const p = this.player;
        if (p.onGround) {
            p.vy = -0.86;
            p.onGround = false;
            p.duck = 0;
            if (this.api.vibrate) {
                this.api.vibrate('light');
            }
        }
    }

    onSwipe(dir) {
        if (this.over) {
            return;
        }
        if (dir === 'down') {
            const p = this.player;
            if (p.onGround) {
                p.duck = 520;
            } else {
                p.vy = Math.max(p.vy, 0.62);
            }
        } else if (dir === 'up') {
            this.onTap();
        }
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);
        if (this.over) {
            return;
        }
        this.tick += dt;
        this.speed = 0.42 + Math.min(0.62, this.distance / 9000);
        this.distance += this.speed * dt;

        const p = this.player;
        p.vy += 0.0028 * dt;
        p.y += p.vy * dt;
        if (p.duck > 0) {
            p.duck -= dt;
        }
        const ducking = p.duck > 0 && p.onGround;
        p.h = ducking ? 36 : 54;
        const floor = this.groundY - p.h;
        if (p.y >= floor) {
            p.y = floor;
            p.vy = 0;
            p.onGround = true;
        }
        if (p.onGround) {
            p.legPhase += dt / 90;
        }

        const score = Math.floor(this.distance / 40);
        if (score !== this.score) {
            this.score = score;
            this.emitScore(score);
        }

        // 障碍生成
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnObstacle();
            const base = 1250 - Math.min(620, this.distance / 26);
            this.spawnTimer = base + Math.random() * 620;
        }

        this.obstacles.forEach((o) => {
            o.x -= this.speed * dt * (o.kind === 'bird' ? 1.18 : 1);
        });
        this.obstacles = this.obstacles.filter((o) => o.x + o.w > -30);

        this.clouds.forEach((c) => {
            c.x -= this.speed * dt * 0.12 * c.s;
            if (c.x < -60) {
                c.x = this.w + 20;
                c.y = 36 + Math.random() * (this.h * 0.34);
            }
        });

        this.checkCollision();
    }

    spawnObstacle() {
        const roll = Math.random();
        const ground = this.groundY;
        if (roll > 0.76 && this.distance > 1200) {
            const hgt = 20;
            this.obstacles.push({
                kind: 'bird',
                x: this.w + 30,
                y: ground - 58 - Math.random() * 8,
                w: 30,
                h: hgt,
                flap: 0,
            });
            return;
        }
        if (roll > 0.42) {
            const w = 16 + Math.random() * 10;
            const h = 40 + Math.random() * 18;
            this.obstacles.push({
                kind: 'cactus',
                x: this.w + 30,
                y: ground - h,
                w,
                h,
            });
            return;
        }
        const w = 34 + Math.random() * 12;
        const h = 30 + Math.random() * 10;
        this.obstacles.push({
            kind: 'cactusBig',
            x: this.w + 30,
            y: ground - h,
            w,
            h,
        });
    }

    checkCollision() {
        const p = this.player;
        const px = p.x + 5;
        const py = p.y + 5;
        const pw = p.w - 12;
        const ph = p.h - 8;
        for (let i = 0; i < this.obstacles.length; i += 1) {
            const o = this.obstacles[i];
            const ox = o.x + 3;
            const oy = o.y + 3;
            const ow = o.w - 6;
            const oh = o.h - 6;
            if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
                this.crash();
                return;
            }
        }
    }

    crash() {
        this.over = true;
        if (this.api.vibrate) {
            this.api.vibrate('heavy');
        }
        this.emitOver({
            score: Math.floor(this.distance / 40),
            message: `跑了 ${Math.floor(this.distance / 40)} 米`,
        });
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        // 天空渐变（用色块模拟）
        ctx.fillStyle = '#F7FAFD';
        ctx.fillRect(0, 0, this.w, this.groundY);

        this.clouds.forEach((c) => {
            this.drawCloud(ctx, c.x, c.y, c.s);
        });

        // 地平线
        ctx.fillStyle = '#F1F4F8';
        ctx.fillRect(0, this.groundY, this.w, this.h - this.groundY);
        ctx.strokeStyle = '#C9D2DC';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.lineTo(this.w, this.groundY);
        ctx.stroke();

        // 地面移动纹理
        const offset = (this.distance * 1.0) % 44;
        ctx.strokeStyle = '#E2E8EF';
        ctx.lineWidth = 2;
        for (let x = -offset; x < this.w; x += 44) {
            ctx.beginPath();
            ctx.moveTo(x, this.groundY + 14);
            ctx.lineTo(x + 18, this.groundY + 14);
            ctx.stroke();
        }
        for (let x = -((offset + 22) % 44); x < this.w; x += 44) {
            ctx.beginPath();
            ctx.moveTo(x, this.groundY + 30);
            ctx.lineTo(x + 10, this.groundY + 30);
            ctx.stroke();
        }

        this.obstacles.forEach((o) => this.drawObstacle(ctx, o));
        this.drawDino(ctx);

        this.drawHud(ctx);

        if (this.over) {
            const cy = this.h * 0.42;
            ctx.save();
            ctx.globalAlpha = 0.92;
            fillRoundRect(ctx, this.w / 2 - 104, cy - 32, 208, 64, 18, 'rgba(32,36,42,0.9)');
            text(ctx, '撞到了', this.w / 2, cy - 6, {
                size: 17,
                color: '#FFFFFF',
                weight: 'bold',
            });
            text(ctx, `跑了 ${this.score} 米`, this.w / 2, cy + 16, {
                size: 13,
                color: 'rgba(255,255,255,0.72)',
            });
            ctx.restore();
        } else {
            text(ctx, '点屏幕起跳，向下滑动蹲下躲飞鸟', this.w / 2, this.groundY + 46, {
                size: 12,
                color: '#9AA3AE',
            });
        }
    }

    drawCloud(ctx, x, y, s) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        const r = 12 * s;
        circle(ctx, x, y, r, '#E8EFF7');
        circle(ctx, x + r * 0.9, y - r * 0.3, r * 0.85, '#E8EFF7');
        circle(ctx, x - r * 0.85, y + r * 0.15, r * 0.7, '#E8EFF7');
        circle(ctx, x + r * 0.3, y + r * 0.35, r * 0.7, '#E8EFF7');
        ctx.restore();
    }

    drawObstacle(ctx, o) {
        if (o.kind === 'bird') {
            const flap = Math.sin(this.tick / 110) * 7;
            ctx.fillStyle = '#6F7A88';
            fillRoundRect(ctx, o.x + 8, o.y + 6, 14, 9, 4, '#6F7A88');
            ctx.strokeStyle = '#6F7A88';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(o.x + 10, o.y + 9);
            ctx.lineTo(o.x + 2, o.y + 9 + flap);
            ctx.moveTo(o.x + 20, o.y + 9);
            ctx.lineTo(o.x + 28, o.y + 9 + flap);
            ctx.stroke();
            circle(ctx, o.x + 20, o.y + 8, 1.6, '#2C323A');
            return;
        }
        const col = '#5F7A62';
        const col2 = '#4E6752';
        const parts = o.kind === 'cactusBig' ? 3 : 2;
        const each = o.w / parts;
        for (let i = 0; i < parts; i += 1) {
            const bx = o.x + i * each + each * 0.12;
            const bw = each * 0.76;
            const bh = o.h * (i === 1 ? 1 : 0.82);
            fillRoundRect(ctx, bx, o.y + (o.h - bh), bw, bh, bw * 0.34, i % 2 ? col2 : col);
            fillRoundRect(ctx, bx + bw * 0.34, o.y + (o.h - bh) + 4, bw * 0.32, bh * 0.4, 2, '#3F5643');
        }
    }

    drawDino(ctx) {
        const p = this.player;
        const x = p.x;
        const y = p.y;
        const w = p.w;
        const h = p.h;
        const body = this.over ? '#B9C2CC' : '#5E6B78';
        const dark = this.over ? '#A3ADB8' : '#4A5661';

        // 尾巴
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + h * 0.42);
        ctx.lineTo(x - 12, y + h * 0.3);
        ctx.lineTo(x + 2, y + h * 0.66);
        ctx.closePath();
        ctx.fill();

        // 身体
        fillRoundRect(ctx, x + 2, y + h * 0.24, w * 0.78, h * 0.56, 7, body);
        // 头
        fillRoundRect(ctx, x + w * 0.46, y, w * 0.56, h * 0.42, 7, body);
        // 嘴
        fillRoundRect(ctx, x + w * 0.86, y + h * 0.2, w * 0.3, h * 0.12, 3, dark);
        // 眼睛
        circle(ctx, x + w * 0.78, y + h * 0.14, 2.4, this.over ? '#8C97A2' : '#FFFFFF');
        circle(ctx, x + w * 0.79, y + h * 0.14, 1.2, '#2C323A');

        // 腿
        if (p.onGround) {
            const phase = Math.sin(p.legPhase);
            ctx.strokeStyle = dark;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x + w * 0.3, y + h * 0.78);
            ctx.lineTo(x + w * 0.3 + phase * 5, y + h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + w * 0.58, y + h * 0.78);
            ctx.lineTo(x + w * 0.58 - phase * 5, y + h);
            ctx.stroke();
        } else {
            ctx.strokeStyle = dark;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x + w * 0.3, y + h * 0.78);
            ctx.lineTo(x + w * 0.22, y + h * 0.99);
            ctx.moveTo(x + w * 0.58, y + h * 0.78);
            ctx.lineTo(x + w * 0.66, y + h * 0.95);
            ctx.stroke();
        }

        // 手臂
        ctx.strokeStyle = body;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.5, y + h * 0.44);
        ctx.lineTo(x + w * 0.66, y + h * 0.52);
        ctx.stroke();
    }

    drawHud(ctx) {
        text(ctx, `${this.score}`, this.w - 16, 26, {
            size: 22,
            color: '#39424E',
            align: 'right',
            weight: 'bold',
        });
        text(ctx, '米', this.w - 16, 44, {
            size: 11,
            color: '#A7AEB8',
            align: 'right',
        });
        const spd = Math.round((this.speed / 0.42) * 100);
        text(ctx, `速度 ${spd}%`, 16, 26, {
            size: 12,
            color: '#9AA1AA',
            align: 'left',
        });
    }
}

module.exports = DinoRun;
