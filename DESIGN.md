---
version: alpha
colors:
  sky: "#69e6f0"
  skyBottom: "#c8ff96"
  ink: "#513928"
  paper: "#fff7de"
  primary: "#ffcc4d"
  accent: "#ed6645"
  muted: "#795b42"
  white: "#ffffff"
  shadow: "#bf7b2f"
  night: "#354177"
typography:
  body:
    fontFamily: "sans-serif"
  score:
    fontFamily: "sans-serif"
rounded:
  DEFAULT: "16px"
spacing:
  button-height: "52px"
components:
  button:
    backgroundColor: "#ffcc4d"
    color: "#513928"
  panel:
    backgroundColor: "#fff7de"
    color: "#513928"
---

# 盖楼小游戏设计约定

## Overview

为单手、短时游玩的简体中文玩家保留原项目的卡通城市：红砖楼层、蓝绿天空、吊钩悬挂的黄色木牌，是游戏的视觉识别。来源为原始 `assets/`、`index.html` 与 `README.zh-CN.md`；不改变原网页外观。

本轮是微信和抖音共用的原生 Canvas 游戏，不是网页管理工具。持久视觉变量由 `minigame/theme.js` 作为唯一运行来源，本文件镜像已采用的值并说明用途。不引入表格、表单、CRUD 或复杂路由约定。

## Colors

天空 sky/skyBottom 沿用原始渐变色，20 层以后使用 night。paper 承载文字以隔开复杂背景；ink 用于正文和按钮；primary 用于开始/继续/重开；accent 用于大分数和落楼反馈；muted 用于辅助说明。失败同时显示剩余机会，不只改变颜色。界面仅有一种主题。

## Typography

中文正文使用系统 sans-serif，不把旧网页专用数字字体套到汉字上。常规文本 14–18 逻辑像素，按钮 18，得分 24（长数字缩到 18），结算分数 52。正文按系统中文字体回退，大标题保留原始吊牌图片，避免引入网络字体。

## Layout

逻辑宽度 375，高度按首屏比例限制在 560–850。Canvas 按实际 DPR 绘制（最多 3），窗口改变后保持当前游戏坐标，等比缩放并居中，触摸使用反向映射。顶部避让 safeTop/胶囊底部，底部避让 safeBottom。主要按钮 52 高，小功能按钮不低于 40 逻辑像素。

首页由吊牌、简短说明、最高纪录和开始按钮构成。抖音版额外预留底部侧边栏入口行，异步能力检测不移动开始按钮；不支持时隐藏入口，小屏缩小吊牌以保持说明与按钮间距。吊牌高度最多占屏幕 34%，避免小屏挤压操作。游戏中顶部只放得分、楼层、生命和暂停，底部提示点击投放。平板/横向测试使用等比留白；正式配置固定竖屏。

## Elevation & Depth

按钮底部使用 4px 实色阴影，对应木牌的厚度感。普通信息纸板不使用模糊阴影。暂停、说明、结算覆盖层使用半透明深色遮罩，保持后方游戏可辨但禁止投放。游戏使用 Canvas，没有浏览器 DOM 对话框。

## Shapes

按钮默认 16px 圆角，信息面板 18–24px，提示条使用胶囊形。角色和建筑轮廓始终使用原始 PNG，禁止裁切楼层来替代整块倾倒规则。

## Components

| 能力 | 唯一所有者 | 说明及验证 |
| --- | --- | --- |
| 颜色/字体/按钮尺寸 | `minigame/theme.js` | DESIGN 同名 token 对应运行时属性 |
| 按钮/命中区域/面板 | `Renderer.button/box/hit` | 同一渲染尺寸计算命中；测试 DPR/resize |
| 加载及错误重试 | `assets.js` 与 `GameApp.load` | 有进度、12 秒单资源超时，失败可重试 |
| 页面与暂停 | `GameApp` | loading/error/home/help/playing/paused/gameover |
| 提示 | `GameApp.notify` 与 renderer | 缓存/分享不可用文案，重开清除旧提示 |
| 物理/计分 | `TowerGame` | 固定步进、可见摆幅、三次失误、连击；核心测试 |
| 平台能力 | `platform/wechat.js`、`platform/douyin.js` | 无需账号的单机行为与可选分享；平台 mock 测试 |

按下开始只开始一局，不透传成投放；只有 playing 且当前楼层处于 swing 时允许投放。返回前台不自动恢复游戏，必须点击继续。再盖一次清除分数、生命、连击、楼层和旧提示；保留最高纪录及音量开关。分享不增加游戏奖励。侧边栏跳转只响应主动点击，启动和恢复仅识别来源，不自动导航或发放奖励；跳转和分享失败以短提示反馈，仍能继续游戏。

文字/按钮置于纯色面板；主要操作以明确中文动词表示。使用轻微振动提示完美落楼，不采用闪屏。摆动和下落是玩法必需的运动，可随时暂停。原生 Canvas 无 DOM 语义树，尚不宣称完整屏幕阅读器或 WCAG 合规；浏览器开发预览额外提供空格/P 操作，微信及抖音真机触控待验收。

## Do's and Don'ts

- 保留吊牌、红砖与整块楼层，保持轻快的单机玩法。
- UI 文案只说明玩家能做的事，不展示引擎、缓存或平台实现细节。
- 保持画面内吊块可见，背景切换与装饰不得阻断投放。
- 不把开始按钮、暂停按钮与投放共用一次触摸，不通过分享奖励诱导操作。
- 不将浏览器预览或 mock 测试结果表述成微信或抖音真机通过。
