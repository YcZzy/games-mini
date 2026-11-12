App({
    globalData: {
        screenWidth: 375,
        screenHeight: 667,
    },

    onLaunch() {
        try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            if (info) {
                this.globalData.screenWidth = info.windowWidth || 375;
                this.globalData.screenHeight = info.windowHeight || 667;
            }
        } catch (err) {
            // 读取失败时保留默认尺寸
        }
    },
});
