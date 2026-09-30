# 盖楼游戏 · 抖音小游戏版

> 上线待办、真机验收和换电脑继续开发，请看 [抖音版接力文档](./docs/DOUYIN_HANDOFF.md)。

本版在 `feature/douyin-minigame` 分支开发，基于微信版提交 `4783a27` 创建。沿用同一套 Canvas 2D 玩法、画面和资源，通过 `tt` 适配抖音小游戏；原网页和微信入口仍保留。微信独立分支为 `feature/wechat-minigame`。

当前没有抖音小游戏 AppID，源配置保留 `"appid": ""`。空字符串只是待填写的配置，不是可用的游客 AppID。本次没有执行抖音开发者工具编译、真机验收、上传或发布。

## 构建并导入

在仓库根目录执行，已验证的 Node.js 环境为 `v22.12.0`：

```powershell
npm run test:douyin
npm run build:douyin
npm run check:douyin
npm run preview:douyin
```

这些小游戏脚本使用 Node 内置能力，**无需先执行 `npm install`**。旧网页使用的 `npm start` / `npm run build` 不是抖音版构建命令。若 PowerShell 拒绝运行 `npm.ps1`，可将命令中的 `npm` 换为 `npm.cmd`。

1. 打开抖音开发者工具，导入生成的 **`.build/douyin/`** 目录，确认项目类型为小游戏。
2. 尚无正式 AppID 时，使用开发者工具提供的小游戏测试号；若当前工具要求先创建测试号项目，先按其引导完成，再绑定测试号。测试号可用于预览和调试，不能用于正式上传。[官方工具说明](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/mini-app-developer-instrument)
3. 获得正式小游戏 AppID 后，将它填写到 **`configs/douyin.project.json`** 的 `appid`，重新执行 `npm run build:douyin` 和 `npm run check:douyin`，再用具备项目权限的账号编译、预览。
4. 在模拟器检查包内图片、点击和页面流程，再按接力文档完成真机验收。

不要将仓库根目录导入为抖音项目：根目录 `project.config.json` 仍用于微信。生成目录中的 `game.js`、`game.json`、`project.config.json` 位于同一层；源配置按[抖音小游戏项目配置文档](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/code-edit/project-config)维护，不复用微信的 `miniprogramRoot` / `compileType` 字段。

`.build/` 是可重新生成的输出，不随 Git 保存。修改代码、素材和正式 AppID 后应重新构建；不要只修改输出目录，否则后续构建可能覆盖改动。此客户端工程不需要 AppSecret，也不要把账号凭据放进仓库。

构建会覆盖清单内文件，并在发现清单外文件或目录时停止。如果开发者工具生成了额外个人配置，先检查并备份到生成目录之外，再构建；不要直接删除不明文件。工具中填写的 AppID 若要保留到下次构建，应同步到源配置。

## 当前功能

- 首层居中上手、摇摆投放、整块承重与倾倒、3 次失误结束；吊钩速度保持微信试玩调整后的 **0.75 倍**，由 `RULES.swingSpeedScale` 控制。
- 普通落楼 25 分；连续完美依次奖励 50、75、100……分，普通落楼或失误中断连击。
- 首页、玩法说明、加载与错误重试、暂停、结算和再来一局；随高度上移的相机、楼体轻微摇晃。
- 本机最高分、最高层数和声音偏好；不保存退出后的整局进度，不跨平台同步纪录。
- 抖音输入、窗口安全区与胶囊避让、音频、存储和生命周期适配。切后台停止帧循环和声音，回前台保持暂停，主动继续后恢复。
- 玩家主动成绩分享及菜单分享；不发分享奖励，不把接口回调当作真实分享成功证明。
- 侧边栏复访能力：探测宿主支持情况，有能力时显示入口；仅在玩家点击后跳转，识别冷启动和热启动的侧边栏来源，不发放复访奖励。

侧边栏复访属于抖音小游戏必接能力。当前没有内购或自定义文本输入，相关客服、敏感词接入条件需在以后新增功能时重新核对。[官方必接能力](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)

单机流程不依赖登录、后端、广告、付费或网络下载。平台接口失败时尽量降级，不阻断核心玩法。原版图片和音频已随包保存，授权证据仍需在上线前核实。

## 代码与检查入口

| 文件/目录 | 用途 |
| --- | --- |
| `minigame/game.douyin.js` | 抖音启动入口，构建后命名为 `game.js` |
| `minigame/platform/douyin.js` | `tt` 平台适配与侧边栏能力 |
| `configs/douyin.project.json` | 抖音源配置，正式 AppID 填写位置 |
| `minigame/core/game.js` | 两平台共用的物理、计分、生命、难度 |
| `minigame/app.js`、`renderer.js`、`theme.js` | 两平台共用的状态、交互和 Canvas 画面 |
| `minigame/assets/` | 27 个包内图片/MP3；授权副本位于运行目录 |
| `scripts/build-douyin.js`、`check-douyin.js` | 生成独立运行包并检查配置、引用、语法、资源和包体 |
| `tests/` | 核心、两平台接口 mock 与应用行为回归 |
| `.build/douyin/` | 导入抖音开发者工具的生成目录，不入 Git |

`test:douyin` 会运行共享核心和两平台的回归测试。修改共享代码后也应执行 `npm run check:wechat`，避免影响微信版本。

`preview:douyin` 生成 `.preview/douyin.html`，可直接用浏览器打开。它用于检查共享界面和流程，平台行为为本地模拟；真实音频、抖音分享面板和侧边栏跳转仍须在宿主中测试。`.preview/` 不入 Git，换电脑后重新生成。

自动化检查和浏览器回归的结果见[接力文档验证记录](./docs/DOUYIN_HANDOFF.md#5-验证与后续记录)。本地检查脚本的包体预算用于发现体积变化，正式限制以实际账号、平台文档与开发者工具校验为准。

## 官方参考

- [开发小游戏](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/develop/)
- [小游戏项目配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/code-edit/project-config)
- [小游戏开发工具与测试号](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/mini-app-developer-instrument)
- [必接能力](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)
- [侧边栏跳转 API](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/open-capacity/sidebar-capacity/tt-navigate-to-scene)
- [版本提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)
