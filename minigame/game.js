const { createWechatPlatform } = require('./platform/wechat')
const { GameApp } = require('./app')

new GameApp(createWechatPlatform(wx))
