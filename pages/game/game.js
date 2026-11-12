const registry = require('../../games/registry.js');
const implementations = require('../../games/index.js');
const storage = require('../../utils/storage.js');

const BUTTON_META = {
    up: { icon: '↑', label: '上' },
    down: { icon: '↓', label: '下' },
    left: { icon: '←', label: '左' },
    right: { icon: '→', label: '右' },
    rotate: { icon: '↻', label: '旋转' },
    drop: { icon: '⇩', label: '落下' },
    fire: { icon: '◎', label: '开火' },
};

const REPEAT_ACTIONS = { left: true, right: true, down: true };

Page({
    data: {
        meta: null,
        scoreLabel: '分数',
        score: 0,
        best: 0,
        buttons: [],
        overlay: '',
        overTitle: '',
        overDesc: '',
        overScore: 0,
        isBest: false,
        canContinue: false,
        hudText: '',
        loadState: 'loading',
        colorFrom: '#5B6472',
        colorTo: '#3A4149',
    },

    onLoad(options) {
        const key = options.key;
        const meta = registry.find((item) => item.key === key);
        if (!meta) {
            wx.showToast({ title: '游戏不存在', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 600);
            return;
        }

        this.key = key;
        this.meta = meta;
        const record = storage.getRecord(key);

        const buttons = (meta.buttons || []).map((action) => ({
            action,
            icon: (BUTTON_META[action] || {}).icon || '•',
            label: (BUTTON_META[action] || {}).label || '',
        }));

        this.setData({
            meta,
            scoreLabel: meta.scoreLabel || '分数',
            best: record.best,
            buttons,
            colorFrom: meta.colors[0],
            colorTo: meta.colors[1],
        });

        wx.setNavigationBarTitle({ title: meta.name });
    },

    onReady() {
        this.initCanvas();
    },

    onShow() {
        if (this.canvas) {
            this.startLoop();
        }
    },

    onHide() {
        this.pauseBySystem();
        this.stopLoop();
    },

    onUnload() {
        this.destroyed = true;
        this.stopLoop();
        this.clearPads();
        if (this.game && this.game.destroy) {
            this.game.destroy();
        }
        this.game = null;
        if (this._scoreTimer) {
            clearTimeout(this._scoreTimer);
            this._scoreTimer = null;
        }
    },

    /* ---------------- canvas 与主循环 ---------------- */

    initCanvas() {
        const query = wx.createSelectorQuery();
        query
            .select('#stage')
            .fields({ node: true, size: true, rect: true })
            .exec((res) => {
                const info = res && res[0];
                if (!info || !info.node || !info.width) {
                    if (!this._retried) {
                        this._retried = true;
                        setTimeout(() => this.initCanvas(), 120);
                    } else {
                        this.setData({ loadState: 'error' });
                    }
                    return;
                }

                const canvas = info.node;
                const ctx = canvas.getContext('2d');
                let dpr = 2;
                try {
                    const win = wx.getWindowInfo
                        ? wx.getWindowInfo()
                        : wx.getSystemInfoSync();
                    dpr = Math.min(win.pixelRatio || 2, 3);
                } catch (err) {
                    dpr = 2;
                }

                canvas.width = Math.floor(info.width * dpr);
                canvas.height = Math.floor(info.height * dpr);
                ctx.scale(dpr, dpr);

                this.canvas = canvas;
                this.ctx = ctx;
                this.viewWidth = info.width;
                this.viewHeight = info.height;
                this.rect = { left: info.left, top: info.top };

                this.createGame();
                this.setData({ loadState: 'ready' });
                this.startLoop();
            });
    },

    createGame() {
        if (this.game && this.game.destroy) {
            this.game.destroy();
        }
        const GameClass = implementations[this.key];
        if (!GameClass) {
            this.setData({ loadState: 'error' });
            return;
        }

        const api = {
            onScore: (value) => this.handleScore(value),
            onOver: (payload) => this.handleFinish(payload, false),
            onWin: (payload) => this.handleFinish(payload, true),
            onHud: (text) => this.showHud(text),
            vibrate: (type) => {
                try {
                    wx.vibrateShort({ type: type === 'heavy' ? 'heavy' : 'light' });
                } catch (err) {
                    // 部分机型不支持震动，忽略
                }
            },
        };

        this.game = new GameClass(
            { width: this.viewWidth, height: this.viewHeight },
            api
        );
        this.game.start();
        this._running = true;
    },

    startLoop() {
        if (this._loopId || !this.canvas || this.destroyed) {
            return;
        }
        this.lastTs = 0;
        const step = (ts) => {
            if (this.destroyed || !this.canvas) {
                return;
            }
            const now = typeof ts === 'number' ? ts : Date.now();
            const dt = this.lastTs ? Math.min(50, now - this.lastTs) : 16;
            this.lastTs = now;

            const ctx = this.ctx;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

            if (this.game) {
                if (this._running && !this._blocked) {
                    this.game.update(dt);
                }
                this.game.render(ctx);
            }
            this._loopId = this.canvas.requestAnimationFrame(step);
        };
        this._loopId = this.canvas.requestAnimationFrame(step);
    },

    stopLoop() {
        if (this._loopId && this.canvas) {
            this.canvas.cancelAnimationFrame(this._loopId);
        }
        this._loopId = null;
    },

    /* ---------------- 分数与结束 ---------------- */

    handleScore(value) {
        this._score = value;
        const now = Date.now();
        if (now - (this._lastScoreSet || 0) > 80) {
            this._lastScoreSet = now;
            this.setData({ score: value });
            return;
        }
        if (this._scoreTimer) {
            clearTimeout(this._scoreTimer);
        }
        this._scoreTimer = setTimeout(() => {
            this._scoreTimer = null;
            this.setData({ score: this._score });
        }, 90);
    },

    handleFinish(payload, isWin) {
        const score = (payload && payload.score) || this._score || 0;
        const reversed = !!this.meta.reverse;

        let record = { best: this.data.best };
        if (isWin || score > 0) {
            record = storage.submitScore(this.key, score, reversed);
        }

        const better =
            !this.data.best ||
            (reversed ? score < this.data.best : score > this.data.best);

        this._running = false;
        this._blocked = true;

        let desc = '';
        if (isWin) {
            desc = payload && payload.message ? payload.message : '达成目标';
        } else if (payload && payload.message) {
            desc = payload.message;
        } else if (this.meta.reverse) {
            desc = '再来一次，试试更少的步数';
        } else {
            desc = '再来一局，刷新记录';
        }

        this.setData({
            overlay: isWin ? 'win' : 'over',
            overTitle: isWin ? '过关' : '游戏结束',
            overDesc: desc,
            overScore: score,
            best: record.best,
            isBest: score > 0 && better,
            canContinue: isWin && this.key === 'g2048',
        });
    },

    showHud(text) {
        if (!text) {
            this.setData({ hudText: '' });
            return;
        }
        this.setData({ hudText: text });
        if (this._hudTimer) {
            clearTimeout(this._hudTimer);
        }
        this._hudTimer = setTimeout(() => {
            this._hudTimer = null;
            this.setData({ hudText: '' });
        }, 1200);
    },

    /* ---------------- 交互 ---------------- */

    pointOf(e) {
        const touch =
            (e.touches && e.touches[0]) ||
            (e.changedTouches && e.changedTouches[0]);
        if (!touch) {
            return null;
        }
        if (typeof touch.x === 'number' && typeof touch.y === 'number') {
            return { x: touch.x, y: touch.y };
        }
        const left = this.rect ? this.rect.left : 0;
        const top = this.rect ? this.rect.top : 0;
        return {
            x: (touch.clientX || 0) - left,
            y: (touch.clientY || 0) - top,
        };
    },

    onStageTouchStart(e) {
        if (!this.game || this._blocked) {
            return;
        }
        const p = this.pointOf(e);
        if (p) {
            this.game.handleTouchStart(p);
        }
    },

    onStageTouchMove(e) {
        if (!this.game || this._blocked) {
            return;
        }
        const p = this.pointOf(e);
        if (p) {
            this.game.handleTouchMove(p);
        }
    },

    onStageTouchEnd(e) {
        if (!this.game || this._blocked) {
            return;
        }
        const p = this.pointOf(e);
        if (p) {
            this.game.handleTouchEnd(p);
        }
    },

    onPadDown(e) {
        if (!this.game || this._blocked) {
            return;
        }
        const action = e.currentTarget.dataset.action;
        this.game.onButton(action);

        if (REPEAT_ACTIONS[action]) {
            this.clearPads();
            this._padDelay = setTimeout(() => {
                this._padDelay = null;
                this._padRepeat = setInterval(() => {
                    if (this.game && !this._blocked) {
                        this.game.onButton(action);
                    }
                }, 105);
            }, 250);
        }
    },

    onPadUp() {
        this.clearPads();
    },

    clearPads() {
        if (this._padDelay) {
            clearTimeout(this._padDelay);
            this._padDelay = null;
        }
        if (this._padRepeat) {
            clearInterval(this._padRepeat);
            this._padRepeat = null;
        }
    },

    /* ---------------- 遮罩操作 ---------------- */

    togglePause() {
        if (this.data.overlay === 'pause') {
            this.resumeGame();
            return;
        }
        if (this.data.overlay) {
            return;
        }
        this._running = false;
        this._blocked = true;
        this.setData({ overlay: 'pause' });
    },

    pauseBySystem() {
        if (this.data.overlay || !this.game) {
            return;
        }
        this._running = false;
        this._blocked = true;
        this.setData({ overlay: 'pause' });
    },

    resumeGame() {
        if (!this.game) {
            return;
        }
        this._running = true;
        this._blocked = false;
        this.lastTs = 0;
        this.setData({ overlay: '' });
    },

    replay() {
        this.setData({ overlay: '', score: 0 });
        this._blocked = false;
        this._running = true;
        this.lastTs = 0;
        this.createGame();
    },

    continueGame() {
        this._running = true;
        this._blocked = false;
        this.lastTs = 0;
        this.setData({ overlay: '', canContinue: false });
    },

    goBack() {
        wx.navigateBack();
    },

    switchGame() {
        wx.navigateBack();
    },
});
