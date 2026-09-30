const { createDouyinPlatform } = require('./platform/douyin')
const { GameApp } = require('./app')

new GameApp(createDouyinPlatform(tt))
