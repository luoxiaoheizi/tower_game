# 盖楼游戏 · 微信小游戏版

本版在 `feature/wechat-minigame` 分支开发，原网页 `index.html`、`src/`、`dist/` 保留。微信运行包在 `minigame/`；导入微信开发者工具时选择仓库根目录 `tower_game`，由根目录 `project.config.json` 指向它。

## 打开游戏

1. 打开微信开发者工具，选择导入项目，目录选择 `D:\MyAgent\Empower\tower_game`。
2. 使用自己注册的**微信小游戏 AppID**。仓库中的 `touristappid` 只是本地占位，不是可上传的正式 AppID；若工具不支持游客小游戏，需要填写自己的小游戏 AppID 才能继续。
3. 确认项目类型为「小游戏」、根目录为 `minigame/`，点击编译。无需 npm 安装、npm 构建、云开发或服务器域名。
4. 在模拟器点击「开始盖楼」，点击画面投放楼层；使用「暂停」暂停。真机预览需小游戏 AppID、开发者权限及微信扫码。

AppID 是项目标识；这里不需要、也不要填写 AppSecret。个人工具设置文件 `project.private.config.json` 已忽略。

## 已实现

- 沿用原版楼房、吊牌、云朵、飞行装饰和音效素材。
- 首层固定居中用于上手；随后点击释放摇摆楼层，偏得过多会倾倒。
- 普通落楼 25 分；完美落楼按连续次数奖励 50、75、100……分。普通落楼或失误打断连击，3 次失误结束。
- 相机随楼层上移，楼体随高度轻微摇晃。无关帧率的固定物理步进与长帧保护，回收离屏楼层。
- 首页、玩法说明、加载进度、资源错误重试、暂停、结算和重开。
- 声音开关、本机最高分和最高层数。两项纪录分别取最大值；仅保存这两项及声音偏好，不保存中断的整局。缓存失败不阻断游戏。
- 切后台停止帧循环并暂停全部音效，回前台停留在暂停页，点击「继续盖楼」才恢复。
- 微信胶囊/安全区避让、高清 Canvas、窗口尺寸变化及触摸坐标映射。
- 玩家主动点击的成绩分享与右上角分享菜单。分享不提供复活或计分奖励，也不判断是否真正分享成功。

本轮使用平台原生 Canvas 2D 与 `wx` 接口实现；没有用 `web-view` 包装网页。单机流程不依赖网络、账号登录、后端、广告或付费服务。

## 相对网页的适配

玩法和计分来自 `README.zh-CN.md`、`src/block.js`、`src/utils.js`。本版重新实现了独立物理核心，保留主要规则，并做了手机适配：吊钩横向摆幅按画面宽度约束，避免长屏时大半时间出屏；不迁移旧版的屏外 `hardMode`。UI 改为中文 Canvas 按钮和暂停流程，不复用网页 DOM、Zepto、cooljs 或统计脚本。装饰飞行采用循环展示，未逐帧还原原版演出。

## 代码位置

| 位置 | 作用 |
| --- | --- |
| `project.config.json` | 微信工具入口，`compileType: game` |
| `minigame/game.js`、`game.json` | 微信游戏启动与竖屏配置 |
| `minigame/core/game.js` | 平台无关的玩法、碰撞、计分、相机 |
| `minigame/platform/wechat.js` | 微信窗口、输入、生命周期、音频、缓存、分享适配 |
| `minigame/app.js` | 加载、页面状态、纪录与音效编排 |
| `minigame/renderer.js`、`theme.js` | Canvas 画面、按钮命中、安全区与视觉变量 |
| `minigame/assets/` | 27 个包内图片/MP3，约 0.51 MiB |
| `tests/` | 无需第三方依赖的核心、平台、应用行为测试 |

调整难度、生命和分数请从 `core/game.js` 的 `RULES` 开始。完整小游戏运行目录约 0.55 MiB，以 `npm run check:wechat` 实测输出为准。

## 本地检查

使用 Node.js 18 或更新版本，不需要 `npm install`：

```powershell
cd D:\MyAgent\Empower\tower_game
npm run test:wechat
npm run check:wechat
npm run preview:wechat
```

最后一条命令生成 `.preview/wechat.html`，可以直接用浏览器打开，无需服务器。本地浏览器使用同一核心、控制器和渲染器；提供空格投放、P 暂停及后台/前台模拟按钮（桌面宽度显示）。预览中的声音、振动和微信分享不生效。

如本机已有 Playwright，可选运行浏览器回归，生成三种尺寸截图与 JSON 报告：

```powershell
node scripts/verify-browser.js <本机已安装的Playwright目录> msedge
```

没有 Playwright 时，直接手动打开 HTML；项目不要求安装它。`.preview/` 是自动生成的本地验证产物，已被 Git 忽略。

## 本轮验证记录（2026-09-30）

- `npm run test:wechat`：36 项通过，包含核心、微信 API mock 与完整应用状态流程。
- `npm run check:wechat`：配置、CommonJS 引用、语法、资源副本和包体检查通过；运行包约 558 KiB。
- 已安装的 Edge 无头浏览器：320×568、375×667、390×844 三种尺寸完成首页、说明、投放、暂停、前后台、三次失败、结算、重开；无浏览器脚本错误。截图及报告在 `.preview/`。
- 界面规范静态检查：`premium-audit.json` 为 0 findings；不能代替原生 Canvas 无障碍与微信真机验证。
- DESIGN 文档及 theme 变量已人工核对；未安装额外的 `designmd` lint 工具。
- 未执行原网页的旧 webpack 构建（本轮未修改其源码）、微信上传或发布；未修改依赖版本及锁文件。

## 微信发布前仍需实测

代码测试和浏览器流程验证不能代替微信模拟器与 iOS/Android 真机。请按以下顺序检查：

1. 填入正式小游戏 AppID，确认开发者工具无编译错误、所有包内图片正常加载。
2. iOS 和 Android 各测试普通落楼、连续完美、倾倒、三次失误、再来一局。
3. 在投放途中切后台/锁屏，回来后确认楼层保持暂停，音效没有叠加。
4. 测试刘海屏、小屏、长屏和工具缩放；确认胶囊不挡按钮，点击区域与画面一致。
5. 检查声音开关、系统静音、耳机和音频中断；微信端播放失败会静默降级，不影响游戏。
6. 关闭并重新进入小游戏，确认本机最高纪录/声音设置保留；测试微信分享面板。

此仓库已保留原 MIT `LICENSE` 与运行包中的授权副本。素材仍来自原项目。上线所需的账号、类目、资料与审核以微信平台当时的后台要求为准，本次没有上传或发布。

## 后续抖音版

微信版本确认后再创建 `feature/douyin-minigame`。复用 `core/`、`app.js`、`renderer.js`、`theme.js` 和资源，增加抖音平台适配与对应项目配置；重点重新验证 `tt` 输入、音频、生命周期、安全区和分享。当前没有声称抖音版已完成。

微信版本使用独立分支 `feature/wechat-minigame`。切换到另一条开发分支前，先确认当前修改已保存、工作区干净，避免把微信改动意外带过去。

## 官方参考

- [微信官方小游戏示例](https://github.com/wechat-miniprogram/minigame-demo)
- [微信官方小游戏 API 类型定义](https://github.com/wechat-miniprogram/minigame-api-typings)
- [微信小游戏文档](https://developers.weixin.qq.com/minigame/dev/guide/)
