const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp } = require('./draw.js');

class Shooter extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.player = { x: this.w / 2, y: this.h - 90, r: 15 };
        this.target = null;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.stars = [];
        this.lives = 3;
        this.score = 0;
        this.fireTimer = 0;
        this.spawnTimer = 0;
        this.invincible = 0;
        this.shake = 0;
    }

    start() {
        this.player = { x: this.w / 2, y: this.h - 90, r: 15 };
        this.target = null;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.lives = 3;
        this.score = 0;
        this.fireTimer = 0;
        this.spawnTimer = 500;
        this.invincible = 0;
        this.finished = false;
        this.shake = 0;

        this.stars = [];
        for (let i = 0; i < 46; i += 1) {
            this.stars.push({
                x: Math.random() * this.w,
                y: Math.random() * this.h,
                r: 0.6 + Math.random() * 1.2,
                v: 0.35 + Math.random() * 0.9,
            });
        }
        this.emitScore(0);
    }

    onPress(p) {
        this.target = { x: p.x, y: p.y - 46 };
    }

    onDrag(p) {
        this.target = { x: p.x, y: p.y - 46 };
    }

    update(dt) {
        super.update(dt);
        if (this.finished) {
            return;
        }
        const k = Math.min(dt / 16.6667, 3);

        if (this.target) {
            this.player.x += (this.target.x - this.player.x) * 0.32 * k;
            this.player.y += (this.target.y - this.player.y) * 0.32 * k;
        }
        this.player.x = clamp(this.player.x, 20, this.w - 20);
        this.player.y = clamp(this.player.y, this.h * 0.32, this.h - 34);

        this.stars.forEach((s) => {
            s.y += s.v * k;
            if (s.y > this.h) {
                s.y = -4;
                s.x = Math.random() * this.w;
            }
        });

        if (this.invincible > 0) {
            this.invincible -= dt;
        }
        if (this.shake > 0) {
            this.shake -= dt;
        }

        // 自动开火
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
            this.fireTimer = 155;
            this.bullets.push({
                x: this.player.x - 6,
                y: this.player.y - 18,
                vy: -11,
            });
            this.bullets.push({
                x: this.player.x + 6,
                y: this.player.y - 18,
                vy: -11,
            });
        }

        // 子弹
        for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
            const b = this.bullets[i];
            b.y += b.vy * k;
            if (b.y < -14) {
                this.bullets.splice(i, 1);
            }
        }

        // 敌机
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            const gap = Math.max(330, 830 - Math.floor(this.score / 100) * 70);
            this.spawnTimer = gap + Math.random() * 220;
            this.enemies.push({
                x: 26 + Math.random() * (this.w - 52),
                y: -30,
                vy: (1.75 + Math.floor(this.score / 100) * 0.28) * (0.85 + Math.random() * 0.4),
                r: 15,
                hp: 1,
                wobble: Math.random() * Math.PI * 2,
            });
        }

        for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
            const e = this.enemies[i];
            e.y += e.vy * k;
            e.wobble += 0.04 * k;
            e.x += Math.sin(e.wobble) * 0.9 * k;

            if (e.y - e.r > this.h) {
                this.enemies.splice(i, 1);
                continue;
            }

            // 与子弹碰撞
            let destroyed = false;
            for (let j = this.bullets.length - 1; j >= 0; j -= 1) {
                const b = this.bullets[j];
                if (Math.abs(b.x - e.x) < e.r && Math.abs(b.y - e.y) < e.r + 6) {
                    this.bullets.splice(j, 1);
                    destroyed = true;
                    break;
                }
            }
            if (destroyed) {
                this.enemies.splice(i, 1);
                this.score += 10;
                this.emitScore(this.score);
                this.burst(e.x, e.y, '#F08C7A', 10);
                if (this.api.vibrate) {
                    this.api.vibrate('light');
                }
                continue;
            }

            // 与玩家碰撞
            const dx = e.x - this.player.x;
            const dy = e.y - this.player.y;
            const hitRange = e.r + this.player.r * 0.72;
            if (this.invincible <= 0 && dx * dx + dy * dy < hitRange * hitRange) {
                this.enemies.splice(i, 1);
                this.lives -= 1;
                this.invincible = 1400;
                this.shake = 260;
                this.burst(this.player.x, this.player.y, '#FFD9A0', 16);
                if (this.api.vibrate) {
                    this.api.vibrate('heavy');
                }
                if (this.lives <= 0) {
                    this.emitOver({ score: this.score });
                    return;
                }
            }
        }

        // 粒子
        for (let i = this.particles.length - 1; i >= 0; i -= 1) {
            const p = this.particles[i];
            p.x += p.vx * k;
            p.y += p.vy * k;
            p.vy += 0.06 * k;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    burst(x, y, color, count) {
        for (let i = 0; i < count; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.6 + Math.random() * 3;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 320 + Math.random() * 260,
                max: 580,
                color,
                r: 1.2 + Math.random() * 2.2,
            });
        }
    }

    render(ctx) {
        ctx.save();
        if (this.shake > 0) {
            const s = (this.shake / 260) * 5;
            ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
        }

        // 星空
        this.stars.forEach((s) => {
            ctx.globalAlpha = 0.12 + s.v * 0.22;
            circle(ctx, s.x, s.y, s.r, '#4A6AC8');
        });
        ctx.globalAlpha = 1;

        this.enemies.forEach((e) => this.drawEnemy(ctx, e));

        this.bullets.forEach((b) => {
            fillRoundRect(ctx, b.x - 1.6, b.y - 8, 3.2, 14, 1.6, '#5C7BE8');
            fillRoundRect(ctx, b.x - 1.6, b.y - 8, 3.2, 6, 1.6, '#A9BAFF');
        });

        this.particles.forEach((p) => {
            ctx.globalAlpha = Math.max(0, p.life / 420);
            circle(ctx, p.x, p.y, p.r, p.color);
        });
        ctx.globalAlpha = 1;

        if (this.invincible <= 0 || Math.floor(this.time / 110) % 2 === 0) {
            this.drawPlayer(ctx);
        }

        for (let i = 0; i < this.lives; i += 1) {
            this.drawHeart(ctx, 16 + i * 18, this.h - 14, 7);
        }

        ctx.restore();
    }

    drawPlayer(ctx) {
        const { x, y } = this.player;
        ctx.save();
        ctx.translate(x, y);

        // 尾焰
        const flame = 8 + Math.sin(this.time / 60) * 3;
        ctx.beginPath();
        ctx.moveTo(-4, 12);
        ctx.lineTo(0, 14 + flame);
        ctx.lineTo(4, 12);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 176, 92, 0.9)';
        ctx.fill();

        // 机翼
        ctx.beginPath();
        ctx.moveTo(-7, 3);
        ctx.lineTo(-19, 13);
        ctx.lineTo(-7, 11);
        ctx.closePath();
        ctx.fillStyle = '#3E5BC4';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(7, 3);
        ctx.lineTo(19, 13);
        ctx.lineTo(7, 11);
        ctx.closePath();
        ctx.fill();

        // 机身
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(7, -2);
        ctx.lineTo(7, 13);
        ctx.lineTo(-7, 13);
        ctx.lineTo(-7, -2);
        ctx.closePath();
        ctx.fillStyle = '#6F8BF0';
        ctx.fill();

        // 舱盖
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(3.4, -2);
        ctx.lineTo(-3.4, -2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(226, 240, 255, 0.92)';
        ctx.fill();

        ctx.restore();
    }

    drawEnemy(ctx, e) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(-14, -10);
        ctx.lineTo(-5, -6);
        ctx.lineTo(0, -13);
        ctx.lineTo(5, -6);
        ctx.lineTo(14, -10);
        ctx.closePath();
        ctx.fillStyle = '#E06B5C';
        ctx.fill();
        circle(ctx, 0, 0, 3.4, 'rgba(255, 233, 200, 0.95)');
        ctx.restore();
    }

    drawHeart(ctx, cx, cy, size) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy + size * 0.72);
        ctx.bezierCurveTo(cx - size * 1.5, cy - size * 0.5, cx - size * 0.4, cy - size * 1.25, cx, cy - size * 0.35);
        ctx.bezierCurveTo(cx + size * 0.4, cy - size * 1.25, cx + size * 1.5, cy - size * 0.5, cx, cy + size * 0.72);
        ctx.closePath();
        ctx.fillStyle = '#E06B5C';
        ctx.fill();
        ctx.restore();
    }
}

module.exports = Shooter;
