const STORAGE_KEY = 'moyu_game_box_records';

/**
 * 本地记录结构：
 * { [gameKey]: { best: number, plays: number, updatedAt: number } }
 */
function readAll() {
    try {
        const raw = wx.getStorageSync(STORAGE_KEY);
        if (raw && typeof raw === 'object') {
            return raw;
        }
    } catch (err) {
        // 读取异常时返回空记录
    }
    return {};
}

function writeAll(records) {
    try {
        wx.setStorageSync(STORAGE_KEY, records);
    } catch (err) {
        // 写入失败静默忽略，不打断游戏
    }
}

function getRecord(gameKey) {
    const all = readAll();
    const item = all[gameKey];
    if (!item) {
        return { best: 0, plays: 0 };
    }
    return {
        best: item.best || 0,
        plays: item.plays || 0,
    };
}

/**
 * 提交一次成绩。reverse 为 true 时越小越好（步数类游戏）。
 */
function submitScore(gameKey, score, reverse) {
    const all = readAll();
    const prev = all[gameKey] || { best: 0, plays: 0, updatedAt: 0 };
    let best = prev.best || 0;

    if (score > 0) {
        if (!best || (reverse ? score < best : score > best)) {
            best = score;
        }
    }

    all[gameKey] = {
        best,
        plays: (prev.plays || 0) + 1,
        updatedAt: Date.now(),
    };
    writeAll(all);
    return { best, plays: all[gameKey].plays };
}

module.exports = {
    getRecord,
    submitScore,
    readAll,
};
