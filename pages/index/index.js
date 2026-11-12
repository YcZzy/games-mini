const registry = require('../../games/registry.js');
const storage = require('../../utils/storage.js');

Page({
    data: {
        games: [],
        visibleGames: [],
        tags: ['全部', '益智', '街机', '对战', '解压'],
        activeTag: '全部',
        totalGames: 0,
        playedCount: 0,
        totalPlays: 0,
    },

    onShow() {
        this.refresh();
    },

    refresh() {
        const records = storage.readAll();
        let playedCount = 0;
        let totalPlays = 0;

        const games = registry.map((item) => {
            const record = records[item.key] || { best: 0, plays: 0 };
            if (record.plays > 0) {
                playedCount += 1;
                totalPlays += record.plays;
            }
            return {
                key: item.key,
                name: item.name,
                label: item.label,
                labelSize: item.labelSize,
                desc: item.desc,
                tag: item.tag,
                control: item.control,
                colorFrom: item.colors[0],
                colorTo: item.colors[1],
                best: record.best || 0,
                recordText: record.best ? this.formatRecord(item, record.best) : '',
            };
        });

        this.setData({
            games,
            totalGames: games.length,
            playedCount,
            totalPlays,
        });
        this.applyFilter();
    },

    formatRecord(meta, best) {
        const prefix = meta.recordPrefix || (meta.reverse ? '最少' : '最高');
        const unit = meta.recordUnit || (meta.reverse ? '步' : '');
        return unit ? `${prefix} ${best} ${unit}` : `${prefix} ${best}`;
    },

    applyFilter() {
        const tag = this.data.activeTag;
        const list =
            tag === '全部'
                ? this.data.games
                : this.data.games.filter((item) => item.tag === tag);
        this.setData({ visibleGames: list });
    },

    onTagTap(e) {
        const tag = e.currentTarget.dataset.tag;
        if (tag === this.data.activeTag) {
            return;
        }
        this.setData({ activeTag: tag });
        this.applyFilter();
    },

    openGame(e) {
        const key = e.currentTarget.dataset.key;
        wx.navigateTo({ url: `/pages/game/game?key=${key}` });
    },

    openRandom() {
        const list = this.data.visibleGames.length
            ? this.data.visibleGames
            : this.data.games;
        if (!list.length) {
            return;
        }
        const pick = list[Math.floor(Math.random() * list.length)];
        wx.navigateTo({ url: `/pages/game/game?key=${pick.key}` });
    },

    resetRecords() {
        wx.showModal({
            title: '清空记录',
            content: '所有游戏的最佳成绩和游玩次数都会被清除，确定吗？',
            confirmColor: '#D8644F',
            success: (res) => {
                if (!res.confirm) {
                    return;
                }
                try {
                    wx.removeStorageSync('moyu_game_box_records');
                } catch (err) {
                    // 忽略清理失败
                }
                this.refresh();
                wx.showToast({ title: '已清空', icon: 'none' });
            },
        });
    },
});
