/**
 * 所有小游戏的统一基类。
 *
 * 容器页面只和这个接口打交道：
 *   start()            开局
 *   update(dt)         逻辑推进，dt 为毫秒
 *   render(ctx)        绘制，坐标系为 canvas 的 CSS 像素
 *   handleTouchStart/Move/End   原始触摸事件
 *   onButton(action)   底部虚拟按键
 *   destroy()          释放定时器
 *
 * 子类按需实现语义钩子：
 *   onPress / onDrag / onTap / onLongPress / onSwipe / onRelease
 */
class GameBase {
    constructor(view, api) {
        this.w = view.width;
        this.h = view.height;
        this.api = api || {};
        this.time = 0;
        this.finished = false;
        this._lpTimer = null;
        this._startPoint = null;
    }

    start() {}

    update(dt) {
        this.time += dt;
    }

    render() {}

    destroy() {
        this.clearLongPress();
    }

    /* ---------- 对外通知 ---------- */

    emitScore(value) {
        if (this.api.onScore) {
            this.api.onScore(value);
        }
    }

    emitHud(text) {
        if (this.api.onHud) {
            this.api.onHud(text);
        }
    }

    emitOver(payload) {
        if (this.finished) {
            return;
        }
        this.finished = true;
        if (this.api.onOver) {
            this.api.onOver(payload || {});
        }
    }

    /** 胜利后仍可能继续游戏，因此不锁定输入 */
    emitWin(payload) {
        if (this.api.onWin) {
            this.api.onWin(payload || {});
        }
    }

    /* ---------- 触摸语义化 ---------- */

    clearLongPress() {
        if (this._lpTimer) {
            clearTimeout(this._lpTimer);
            this._lpTimer = null;
        }
    }

    handleTouchStart(p) {
        if (this.finished) {
            return;
        }
        this._startPoint = { x: p.x, y: p.y };
        this._startTime = Date.now();
        this._moved = false;
        this._lpFired = false;
        this.clearLongPress();

        this._lpTimer = setTimeout(() => {
            this._lpTimer = null;
            this._lpFired = true;
            this.onLongPress(p);
        }, 330);

        this.onPress(p);
    }

    handleTouchMove(p) {
        if (!this._startPoint) {
            return;
        }
        const dx = p.x - this._startPoint.x;
        const dy = p.y - this._startPoint.y;
        if (!this._moved && Math.sqrt(dx * dx + dy * dy) > 10) {
            this._moved = true;
            this.clearLongPress();
        }
        this.onDrag(p, this._startPoint, dx, dy);
    }

    handleTouchEnd(p) {
        this.clearLongPress();
        if (!this._startPoint) {
            return;
        }

        const dx = p.x - this._startPoint.x;
        const dy = p.y - this._startPoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const duration = Date.now() - this._startTime;

        if (!this._moved && !this._lpFired && duration < 600) {
            this.onTap(p);
        } else if (this._moved && dist > 24) {
            let dir = 'up';
            if (Math.abs(dx) > Math.abs(dy)) {
                dir = dx > 0 ? 'right' : 'left';
            } else {
                dir = dy > 0 ? 'down' : 'up';
            }
            this.onSwipe(dir, p, dx, dy);
        }

        this.onRelease(p);
        this._startPoint = null;
    }

    /* ---------- 子类可覆盖的空实现 ---------- */

    onPress() {}

    onDrag() {}

    onTap() {}

    onLongPress() {}

    onSwipe() {}

    onRelease() {}

    onButton() {}
}

module.exports = GameBase;
