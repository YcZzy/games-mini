const GameBase = require('./base.js');
const { fillRoundRect, roundRect, text, circle } = require('./draw.js');

const ROW_COLORS = [
    ['#F4917E', '#E97C68'],
    ['#F0A473', '#E68F5C'],
    ['#E9BC72', '#DCA85C'],
    ['#9FCB8C', '#8ABA76'],
    ['#8FC0DA', '#79ADC9'],
];

class Breakout extends GameBase {
    constructor(view, api) {
        super(view, api);

        this.padH = 12;
        this.padW = Math.max(72, this.w * 0.24);
        this.ballR = 7;
        this.brickCols = 6;
        this.brickGap = 5;
        this.brickH = 22;
        this.sidePad = 12;
        this.brickW =
            (this.w - this.sidePad * 2 - this.brickGap * (this.brickCols - 1)) /
            this.brickCols;
        this.brickTop = 26;
        this.padY = this.h - 34;

        this.lives = 3;
        this.score = 0;
        this.level = 1;
    }

    start() {
        this.lives = 3;
        this.score = 0;
        this.level = 1;
        this.finished = false;
        this.padX = (this.w - this.padW) / 2;
        this.buildBricks();
        this.resetBall();
        this.emitScore(0);
    }

    buildBricks() {
        this.bricks = [];
        const rows = Math.min(6, 4 + this.level);
        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < this.brickCols; c += 1) {
                this.bricks.push({
                    x: this.sidePad + c * (this.brickW + this.brickGap),
                    y: this.brickTop + r * (this.brickH + this.brickGap),
                    alive: true,
                    row: r,
                });
            }
        }
    }

    resetBall() {
        this.state = 'ready';
        this.ball = {
            x: this.padX + this.padW / 2,
            y: this.padY - this.ballR - 2,
            vx: 0,
            vy: 0,
        };
        this.speed = 5.4 + (this.level - 1) * 0.55;
    }

    launch() {
        if (this.state !== 'ready') {
            return;
        }
        this.state = 'playing';
        const angle = (Math.random() * 0.5 - 0.25) * Math.PI;
        this.ball.vx = Math.sin(angle) * this.speed;
        this.ball.vy = -Math.cos(angle) * this.speed;
    }

    onTap() {
        if (this.state === 'ready') {
            this.launch();
        }
    }

    onPress(p) {
        this.movePad(p.x);
    }

    onDrag(p) {
        this.movePad(p.x);
    }

    movePad(px) {
        const next = px - this.padW / 2;
        this.padX = Math.max(0, Math.min(this.w - this.padW, next));
        if (this.state === 'ready') {
            this.ball.x = this.padX + this.padW / 2;
            this.ball.y = this.padY - this.ballR - 2;
        }
    }

    update(dt) {
        super.update(dt);
        if (this.state !== 'playing' || this.finished) {
            return;
        }
        let remain = Math.min(dt / 16.6667, 3);
        while (remain > 0) {
            const step = Math.min(remain, 0.5);
            this.physics(step);
            remain -= step;
            if (this.state !== 'playing') {
                break;
            }
        }
    }

    physics(k) {
        const b = this.ball;
        b.x += b.vx * k;
        b.y += b.vy * k;

        if (b.x - this.ballR < 0) {
            b.x = this.ballR;
            b.vx = Math.abs(b.vx);
        } else if (b.x + this.ballR > this.w) {
            b.x = this.w - this.ballR;
            b.vx = -Math.abs(b.vx);
        }

        if (b.y - this.ballR < 0) {
            b.y = this.ballR;
            b.vy = Math.abs(b.vy);
        }

        // 挡板
        if (
            b.vy > 0 &&
            b.y + this.ballR >= this.padY &&
            b.y - this.ballR <= this.padY + this.padH &&
            b.x >= this.padX - this.ballR &&
            b.x <= this.padX + this.padW + this.ballR
        ) {
            const offset = Math.max(
                -1,
                Math.min(1, (b.x - (this.padX + this.padW / 2)) / (this.padW / 2))
            );
            const angle = offset * (Math.PI / 3);
            const mag = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || this.speed;
            b.vx = Math.sin(angle) * mag;
            b.vy = -Math.abs(Math.cos(angle) * mag);
            b.y = this.padY - this.ballR - 0.5;
        }

        // 砖块
        for (let i = 0; i < this.bricks.length; i += 1) {
            const brick = this.bricks[i];
            if (!brick.alive) {
                continue;
            }
            const cx = brick.x + this.brickW / 2;
            const cy = brick.y + this.brickH / 2;
            const dx = Math.abs(b.x - cx);
            const dy = Math.abs(b.y - cy);
            const ox = this.brickW / 2 + this.ballR - dx;
            const oy = this.brickH / 2 + this.ballR - dy;
            if (ox > 0 && oy > 0) {
                if (ox < oy) {
                    b.vx = b.x < cx ? -Math.abs(b.vx) : Math.abs(b.vx);
                    b.x += b.x < cx ? -ox : ox;
                } else {
                    b.vy = b.y < cy ? -Math.abs(b.vy) : Math.abs(b.vy);
                    b.y += b.y < cy ? -oy : oy;
                }
                brick.alive = false;
                this.score += 10;
                this.emitScore(this.score);
                if (this.api.vibrate) {
                    this.api.vibrate('light');
                }
                if (!this.bricks.some((item) => item.alive)) {
                    this.level += 1;
                    this.buildBricks();
                    this.resetBall();
                    this.emitHud(`第 ${this.level} 关`);
                }
                break;
            }
        }

        if (b.y - this.ballR > this.h) {
            this.lives -= 1;
            if (this.lives <= 0) {
                this.state = 'over';
                this.emitOver({ score: this.score });
            } else {
                this.resetBall();
                if (this.api.vibrate) {
                    this.api.vibrate('heavy');
                }
            }
        }
    }

    render(ctx) {
        for (let i = 0; i < this.bricks.length; i += 1) {
            const brick = this.bricks[i];
            if (!brick.alive) {
                continue;
            }
            const colors = ROW_COLORS[brick.row % ROW_COLORS.length];
            fillRoundRect(
                ctx,
                brick.x,
                brick.y,
                this.brickW,
                this.brickH,
                6,
                colors[1]
            );
            fillRoundRect(
                ctx,
                brick.x,
                brick.y,
                this.brickW,
                this.brickH * 0.52,
                6,
                colors[0]
            );
        }

        // 挡板
        fillRoundRect(ctx, this.padX, this.padY, this.padW, this.padH, 6, '#4A5058');
        fillRoundRect(
            ctx,
            this.padX + 2,
            this.padY + 2,
            this.padW - 4,
            this.padH * 0.45,
            4,
            '#6C737C'
        );

        // 球
        circle(ctx, this.ball.x, this.ball.y, this.ballR, '#3F454D');
        circle(
            ctx,
            this.ball.x - this.ballR * 0.3,
            this.ball.y - this.ballR * 0.35,
            this.ballR * 0.32,
            'rgba(255,255,255,0.55)'
        );

        // 生命
        for (let i = 0; i < this.lives; i += 1) {
            circle(ctx, 16 + i * 16, this.h - 12, 5, '#E06B5C');
        }

        if (this.state === 'ready') {
            text(ctx, '点击屏幕发球', this.w / 2, this.h - 70, {
                size: 14,
                color: '#9AA1AA',
            });
        }
    }
}

module.exports = Breakout;
