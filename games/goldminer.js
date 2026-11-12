/**
 * 黄金矿工
 * 摆锤钩爪：点一下放绳，抓到东西自动收回，重量决定收绳速度。
 */
const GameBase = require('./base.js');
const { fillRoundRect, text, circle, clamp } = require('./draw.js');

const dot = circle;

const TYPES = {
    goldS: { r: 9, value: 100, weight: 1.0, kind: 'gold' },
    goldM: { r: 13, value: 250, weight: 1.9, kind: 'gold' },
    goldL: { r: 18, value: 500, weight: 3.0, kind: 'gold' },
    rockS: { r: 14, value: 20, weight: 3.4, kind: 'rock' },
    rockL: { r: 20, value: 30, weight: 4.6, kind: 'rock' },
    diamond: { r: 8, value: 600, weight: 0.65, kind: 'diamond' },
    bag: { r: 11, value: 0, weight: 1.2, kind: 'bag' },
    bomb: { r: 10, value: 0, weight: 0.8, kind: 'bomb' },
};

class GoldMiner extends GameBase {
    constructor(view, api) {
        super(view, api);
        this.score = 0;
        this.level = 1;
        this.state = 'swing';
        this.angle = 0;
        this.len = 34;
        this.carry = null;
        this.shake = 0;
        this.banner = null;
        this.floats = [];
    }

    start() {
        this.pivot = { x: this.w / 2, y: 96 };
        this.maxLen = Math.max(160, this.h - this.pivot.y - 56);
        this.loadLevel(1);
        this.emitScore(0);
    }

    loadLevel(level) {
        this.level = level;
        this.state = 'swing';
        this.angle = 0;
        this.len = 34;
        this.carry = null;
        this.swingSpeed = 1.15 + level * 0.1;
        this.maxAngle = 1.25;
        this.timeLeft = 62000;
        this.quota = 500 + (level - 1) * 320;
        this.levelScore = 0;
        this.items = [];
        this.spawnItems(level);
        this.banner = { text: `第 ${level} 关 · 目标 ${this.quota}`, life: 1500, max: 1500 };
    }

    spawnItems(level) {
        const top = this.pivot.y + 120;
        const bottom = this.h - 54;
        const count = 12 + level * 2;
        let tries = 0;
        while (this.items.length < count && tries < 400) {
            tries += 1;
            const roll = Math.random();
            let key = 'goldS';
            if (roll > 0.94) {
                key = 'diamond';
            } else if (roll > 0.82) {
                key = 'goldL';
            } else if (roll > 0.62) {
                key = 'goldM';
            } else if (roll > 0.5) {
                key = 'rockL';
            } else if (roll > 0.36) {
                key = 'rockS';
            } else if (roll > 0.26) {
                key = 'bag';
            } else if (roll > 0.18) {
                key = 'bomb';
            } else {
                key = 'goldS';
            }
            const def = TYPES[key];
            const x = 26 + Math.random() * (this.w - 52);
            const y = top + Math.random() * (bottom - top);
            const overlap = this.items.some((it) => {
                const dx = it.x - x;
                const dy = it.y - y;
                return Math.sqrt(dx * dx + dy * dy) < it.r + def.r + 8;
            });
            if (overlap) {
                continue;
            }
            this.items.push({
                key,
                x,
                y,
                r: def.r,
                value: def.value,
                weight: def.weight,
                kind: def.kind,
                value2: 0,
                spin: Math.random() * Math.PI,
            });
        }
    }

    /* ---------------- 输入 ---------------- */

    onTap() {
        if (this.state !== 'swing' || this.finished) {
            return;
        }
        this.state = 'out';
        if (this.api.vibrate) {
            this.api.vibrate('light');
        }
    }

    /* ---------------- 更新 ---------------- */

    update(dt) {
        super.update(dt);

        if (this.banner) {
            this.banner.life -= dt;
            if (this.banner.life <= 0) {
                this.banner = null;
            }
        }
        this.floats = this.floats.filter((f) => {
            f.life -= dt;
            f.y -= dt * 0.03;
            return f.life > 0;
        });
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt * 0.005);
        }

        if (this.state === 'swing') {
            this.angle = Math.sin(this.time / 1000 * this.swingSpeed * 2.2) * this.maxAngle;
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.settle();
                return;
            }
        } else if (this.state === 'out') {
            this.timeLeft -= dt;
            this.len += dt * 0.62;
            if (this.len >= this.maxLen) {
                this.len = this.maxLen;
                this.state = 'back';
            }
            this.checkCatch();
            if (this.timeLeft <= 0) {
                this.settle();
                return;
            }
        } else if (this.state === 'back') {
            this.timeLeft -= dt;
            const weight = this.carry ? this.carry.weight : 0.5;
            const speed = 0.62 / Math.max(0.5, weight);
            this.len -= dt * speed;
            if (this.len <= 34) {
                this.len = 34;
                this.collect();
                this.state = 'swing';
            }
            if (this.timeLeft <= 0) {
                this.settle();
                return;
            }
        }
    }

    hookPos() {
        return {
            x: this.pivot.x + Math.sin(this.angle) * this.len,
            y: this.pivot.y + Math.cos(this.angle) * this.len,
        };
    }

    checkCatch() {
        const h = this.hookPos();
        for (let i = 0; i < this.items.length; i += 1) {
            const it = this.items[i];
            const dx = it.x - h.x;
            const dy = it.y - h.y;
            if (Math.sqrt(dx * dx + dy * dy) <= it.r + 10) {
                this.items.splice(i, 1);
                this.carry = it;
                this.state = 'back';
                this.shake = it.weight * 1.4;
                if (this.api.vibrate) {
                    this.api.vibrate(it.weight > 2.5 ? 'heavy' : 'light');
                }
                return;
            }
        }
    }

    collect() {
        const it = this.carry;
        this.carry = null;
        if (!it) {
            return 0;
        }
        let value = it.value;
        if (it.kind === 'bag') {
            value = 60 + Math.floor(Math.random() * 8) * 40;
        }
        if (it.kind === 'bomb') {
            value = -80;
        }
        if (value !== 0) {
            this.score = Math.max(0, this.score + value);
            this.levelScore += value;
            this.emitScore(this.score);
            this.floats.push({
                x: this.pivot.x,
                y: this.pivot.y + 40,
                text: value > 0 ? `+${value}` : `${value}`,
                life: 900,
                max: 900,
                color: value > 0 ? '#C9922E' : '#C2432F',
            });
        }
        if (this.levelScore >= this.quota) {
            this.nextLevel();
        }
        return value;
    }

    settle() {
        if (this.finished) {
            return;
        }
        if (this.levelScore >= this.quota) {
            this.nextLevel();
            return;
        }
        this.emitOver({
            score: this.score,
            message: `时间到，本关差 ${Math.max(0, this.quota - this.levelScore)} 金币`,
        });
    }

    nextLevel() {
        if (this.finished) {
            return;
        }
        const bonus = 200;
        this.score += bonus;
        this.emitScore(this.score);
        this.loadLevel(this.level + 1);
        this.banner = {
            text: `过关 · 奖励 ${bonus}`,
            life: 1500,
            max: 1500,
            good: true,
        };
    }

    /* ---------------- 绘制 ---------------- */

    render(ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this.w, this.h);

        const shakeX = this.shake > 0 ? Math.sin(this.time / 22) * this.shake : 0;

        ctx.save();
        ctx.translate(shakeX, 0);

        this.drawField(ctx);
        this.items.forEach((it) => this.drawItem(ctx, it));

        // 绳索
        const h = this.hookPos();
        const angle = this.angle;
        ctx.strokeStyle = '#8A6B45';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(this.pivot.x, this.pivot.y);
        ctx.lineTo(h.x, h.y);
        ctx.stroke();

        // 钩爪
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(-angle);
        ctx.strokeStyle = '#6E5432';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-8, 6);
        ctx.quadraticCurveTo(-9, -4, 0, -6);
        ctx.quadraticCurveTo(9, -4, 8, 6);
        ctx.stroke();
        ctx.restore();

        if (this.carry) {
            this.drawItem(ctx, {
                ...this.carry,
                x: h.x,
                y: h.y + this.carry.r + 6,
            });
        }

        this.drawMiner(ctx);
        ctx.restore();

        this.floats.forEach((f) => {
            const k = f.life / f.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.5);
            text(ctx, f.text, f.x, f.y, { size: 20, color: f.color, weight: 'bold' });
            ctx.restore();
        });

        this.drawHud(ctx);

        if (this.banner) {
            const k = this.banner.life / this.banner.max;
            ctx.save();
            ctx.globalAlpha = Math.min(1, k * 1.6);
            fillRoundRect(ctx, this.w / 2 - 110, this.h / 2 - 26, 220, 52, 16, 'rgba(32,36,42,0.86)');
            text(ctx, this.banner.text, this.w / 2, this.h / 2, {
                size: 17,
                color: '#FFFFFF',
                weight: 'bold',
            });
            ctx.restore();
        }
    }

    drawField(ctx) {
        const top = this.pivot.y + 60;
        const bands = 5;
        const hh = (this.h - top) / bands;
        const colors = ['#D8C4A6', '#CDB795', '#C2AA86', '#B79E79', '#AC926C'];
        for (let i = 0; i < bands; i += 1) {
            ctx.fillStyle = colors[i];
            ctx.fillRect(0, top + i * hh, this.w, hh + 1);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        for (let i = 0; i < 40; i += 1) {
            const x = ((i * 97) % 100) / 100 * this.w;
            const y = top + ((i * 53) % 100) / 100 * (this.h - top);
            ctx.fillRect(x, y, 2.5, 2.5);
        }
        ctx.fillStyle = '#C9B896';
        ctx.fillRect(0, top - 12, this.w, 12);
    }

    drawItem(ctx, it) {
        if (it.kind === 'gold') {
            const g = ctx.createLinearGradient
                ? ctx.createLinearGradient(it.x - it.r, it.y - it.r, it.x + it.r, it.y + it.r)
                : null;
            if (g) {
                g.addColorStop(0, '#F5D472');
                g.addColorStop(1, '#C9922E');
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = '#E0B44E';
            }
            ctx.beginPath();
            const pts = 7;
            for (let i = 0; i < pts; i += 1) {
                const a = (i / pts) * Math.PI * 2 + it.spin;
                const rr = it.r * (i % 2 === 0 ? 1 : 0.78);
                const px = it.x + Math.cos(a) * rr;
                const py = it.y + Math.sin(a) * rr;
                if (i === 0) {
                    ctx.moveTo(px, py);
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.closePath();
            ctx.fill();
            dot(ctx, it.x - it.r * 0.3, it.y - it.r * 0.35, it.r * 0.22, 'rgba(255,255,255,0.55)');
        } else if (it.kind === 'rock') {
            ctx.fillStyle = '#8C8C8C';
            ctx.beginPath();
            ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#A8A8A8';
            ctx.beginPath();
            ctx.arc(it.x - it.r * 0.22, it.y - it.r * 0.24, it.r * 0.55, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(60,60,60,0.25)';
            ctx.beginPath();
            ctx.arc(it.x + it.r * 0.3, it.y + it.r * 0.32, it.r * 0.32, 0, Math.PI * 2);
            ctx.fill();
        } else if (it.kind === 'diamond') {
            ctx.fillStyle = '#7FD3E8';
            ctx.beginPath();
            ctx.moveTo(it.x, it.y - it.r);
            ctx.lineTo(it.x + it.r, it.y - it.r * 0.15);
            ctx.lineTo(it.x, it.y + it.r);
            ctx.lineTo(it.x - it.r, it.y - it.r * 0.15);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.moveTo(it.x, it.y - it.r);
            ctx.lineTo(it.x + it.r * 0.42, it.y - it.r * 0.1);
            ctx.lineTo(it.x, it.y + it.r * 0.1);
            ctx.closePath();
            ctx.fill();
        } else if (it.kind === 'bag') {
            fillRoundRect(ctx, it.x - it.r, it.y - it.r * 0.8, it.r * 2, it.r * 1.8, it.r * 0.5, '#9C6B3F');
            ctx.strokeStyle = '#7A5130';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(it.x - it.r * 0.4, it.y - it.r * 0.8);
            ctx.lineTo(it.x + it.r * 0.4, it.y - it.r * 0.8);
            ctx.stroke();
            text(ctx, '?', it.x, it.y + 1, { size: it.r * 1.2, color: '#F0DCB4', weight: 'bold' });
        } else if (it.kind === 'bomb') {
            dot(ctx, it.x, it.y, it.r, '#3B3F45');
            dot(ctx, it.x - it.r * 0.3, it.y - it.r * 0.35, it.r * 0.26, 'rgba(255,255,255,0.4)');
            ctx.strokeStyle = '#C9922E';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(it.x + it.r * 0.5, it.y - it.r * 0.7);
            ctx.lineTo(it.x + it.r * 0.9, it.y - it.r * 1.2);
            ctx.stroke();
        }
    }

    drawMiner(ctx) {
        const cx = this.pivot.x;
        const cy = this.pivot.y;
        // 支架
        fillRoundRect(ctx, cx - 30, cy - 6, 60, 8, 3, '#8A6B45');
        // 人物
        dot(ctx, cx, cy - 34, 12, '#F2C79E');
        fillRoundRect(ctx, cx - 13, cy - 48, 26, 9, 4, '#C2432F');
        fillRoundRect(ctx, cx - 14, cy - 26, 28, 22, 8, '#3E6E9E');
        fillRoundRect(ctx, cx - 8, cy - 50, 16, 5, 2, '#A83A28');
        // 手臂
        ctx.strokeStyle = '#3E6E9E';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 18);
        ctx.lineTo(cx - 4, cy - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 10, cy - 18);
        ctx.lineTo(cx + 4, cy - 4);
        ctx.stroke();
    }

    drawHud(ctx) {
        const quota = this.quota;
        const done = Math.min(quota, this.levelScore);
        const ratio = quota > 0 ? done / quota : 0;

        fillRoundRect(ctx, 14, 14, 128, 8, 4, '#E4DCCB');
        fillRoundRect(ctx, 14, 14, Math.max(4, 128 * ratio), 8, 4, '#C9922E');
        text(ctx, `第 ${this.level} 关`, 14, 34, { size: 12, color: '#7A705C', align: 'left' });
        text(ctx, `${done} / ${quota}`, 142, 34, { size: 12, color: '#9A8F78', align: 'right' });

        const sec = Math.max(0, Math.ceil(this.timeLeft / 1000));
        const warn = sec <= 10;
        text(ctx, `${sec}s`, this.w - 16, 22, {
            size: 20,
            color: warn ? '#C2432F' : '#4A4436',
            align: 'right',
            weight: 'bold',
        });
        text(ctx, '剩余时间', this.w - 16, 40, { size: 11, color: '#9A8F78', align: 'right' });

        if (this.state === 'swing' && !this.banner) {
            text(ctx, '点一下屏幕放钩', this.w / 2, this.h - 36, { size: 13, color: '#FFFFFF' });
        }
    }
}

module.exports = GoldMiner;
