# 抖音小游戏上线待办与换电脑交接

最后更新：2026-09-30。接续开发先核对实际分支、工作区和本文状态；只对已经完成的事项打勾，验证后补充设备和代码提交。

## 1. 当前状态

| 项目 | 当前情况 |
| --- | --- |
| 远程仓库 | <https://github.com/luoxiaoheizi/tower_game> |
| 抖音开发分支 | `feature/douyin-minigame` |
| 创建基线 | 微信版 `4783a27`，包含吊钩摆动速度调整为首版的 0.75 倍 |
| 微信独立分支 | `feature/wechat-minigame`；微信导入步骤见 `README.wechat.md` |
| 产品范围 | 原生 Canvas 2D 单机小游戏，共享玩法和渲染，独立 `tt` 适配及构建输出 |
| 抖音 AppID | 用户尚未提供，`configs/douyin.project.json` 保留空字符串；不是有效游客 AppID |
| 平台验收 | 抖音开发者工具编译、iOS/Android 真机及多宿主验收均待完成 |
| 上传、提审、发布 | 均未完成；Git 推送不等于抖音上线 |
| 原电脑目录 | `D:\MyAgent\Empower\tower_game`；新电脑可自行选择位置 |

远程默认分支仍为 `master`，克隆时必须显式选择抖音分支。根目录 `package.json` 中的原作者仓库字段是历史元数据，远程地址以 `git remote -v` 为准。

已实现范围和代码位置见 [README.douyin.md](../README.douyin.md)。当前没有账号登录、后端、云存档、排行榜、广告、内购、文本输入或统计 SDK。只在本机保存最高分、最高层数和声音设置；退出后不续局。分享和侧边栏复访均不发奖励。

## 2. 换电脑恢复

准备 Git、可用的仓库访问权限和 Node.js/npm；本轮验证环境为 Node.js `v22.12.0`。小游戏工作流无需安装 npm 依赖。另需抖音开发者工具用于平台验收；开发者工具账号、Git 凭据和手机登录状态不会随仓库迁移。

在准备存放项目的父目录执行：

```powershell
git clone --branch feature/douyin-minigame https://github.com/luoxiaoheizi/tower_game.git
cd tower_game
git branch --show-current
git status --short
node --version
npm run test:douyin
npm run build:douyin
npm run check:douyin
npm run check:wechat
npm run preview:douyin
```

分支应为 `feature/douyin-minigame`，首次克隆的 `git status --short` 应无输出。脚本输出是当前测试数与包体大小的准确信息。若 PowerShell 的执行策略阻止 `npm.ps1`，使用 `npm.cmd run …`，无需为此改系统策略。

已经有仓库时先保存本地改动，再同步；不要用强制覆盖处理未提交内容：

```powershell
git status --short
git fetch origin
git switch feature/douyin-minigame
git pull --ff-only origin feature/douyin-minigame
```

若本地还没有该分支，可使用 `git switch --track origin/feature/douyin-minigame`。`--ff-only` 报分叉时应先核对双方提交。

### 抖音开发者工具导入

1. 构建完成后选择 **`.build/douyin/`** 导入为小游戏。仓库根目录配置仍用于微信，不能直接作为抖音项目入口。
2. 无正式 AppID 时按工具引导选择或创建小游戏测试号。空字符串只是待配置状态，不能假设直接导入即可获得有效 AppID。测试号仅供调试和预览，不能上传。[官方工具说明](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/mini-app-developer-instrument)
3. 正式 AppID 应填入 **`configs/douyin.project.json`**，重新构建，再用具备开发者权限的账号编译。项目不需要 AppSecret。
4. 更改源码或素材后重新执行 `build:douyin` 和 `check:douyin`；生成目录不作为手写代码来源。

构建仅覆盖清单内文件；发现清单外文件/目录会报错并停止。如果 IDE 生成了个人配置或额外文件，先核实用途，备份到 `.build/douyin/` 之外后再运行，不要为了通过检查而直接删除不明内容。IDE 对生成配置的修改不会自动同步回源配置；需要长期保留的 AppID 应填写到 `configs/douyin.project.json`。

导入目录的 `game.js`、`game.json`、`project.config.json` 位于同一层。微信源入口 `minigame/game.js` 与抖音源入口 `minigame/game.douyin.js` 分开，构建脚本只导出抖音需要的代码和资源。

以下本地内容不随 Git 迁移：

- `.build/`：生成的运行包；从已跟踪源码重新构建。
- `.preview/`：浏览器试玩页、截图和回归报告；重新生成。
- 开发者工具个人配置、账号会话、Git 凭据和手机上的本地最高纪录。
- `node_modules/`：当前小游戏脚本不依赖它；旧网页工具链是另一套流程。

## 3. 上线待办

### P0：解除上线阻塞

- [ ] **获得正式抖音小游戏 AppID。** 确定注册主体，完成后台要求的账号与开发者权限设置，更新源配置并重建。
- [ ] **核实账号适用资质。** 在实际后台确认主体认证、备案、ICP 核准、游戏类目资质、软著、版号、实名/防沉迷及相关声明中哪些适用于当前主体与运营方式，保存核实日期和结论。免费、离线或无内购不等于自动免除要求；本次未完成实际账号材料核验。
- [ ] **确认素材授权。** 原图片和音频沿用旧项目，MIT `LICENSE` 与运行包副本已保留；仍需整理图片、音乐和音效来源及商用授权证据。根目录 `package.json` / 锁文件的 ISC 与 MIT 声明存在历史差异，确认权利后统一。无法确认的素材在发布前替换。
- [ ] **完成开发者工具及真机验收。** 使用下方验收表，至少覆盖 iOS、Android、小屏和刘海屏；记录实际版本与问题。
- [ ] **完成侧边栏必接能力验收。** 确认宿主能力探测、用户点击跳转、返回入口识别及 IDE 必接预检通过。代码存在接口调用不等于平台已验收。[官方必接能力](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)

### P1：准备并提交版本

- [ ] 确定正式名称、简介、图标、联系信息、版本号和更新说明。
- [ ] 按实际功能核对后台隐私声明；当前无自行收集头像、手机号或位置的功能，未来新增登录、广告、统计或云服务时重新评估。
- [ ] 准备 **3 张真实游戏内截图**。现有浏览器截图可辅助检查布局，提交前应从最终运行版本取得并检查内容。[官方提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)
- [ ] 使用正式 AppID 在工具中上传测试版本，记录版本号、提交号、上传通道和更新说明。
- [ ] 对测试版本完成体验与多宿主回归，再提交审核；按后台提示补全信息，记录驳回与修复。
- [ ] 审核通过后再执行发布，确认真实线上入口和功能。未决定自动发布时不要预先勾选相关选项。

截至本次查阅，官方说明自 2026-04-20 起，提审会覆盖已接入且符合条件的合作 App，QA 会进行多端回归。因此不能只用抖音 App 的单一设备结果代替最终验收；以后台显示的适用宿主和最新要求为准。[官方提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)

当前没有内购和自定义文本输入；后续若新增，重新核对客服和敏感词等必接能力。排行榜、广告、付费、复活、云存档和定制分享图属于后续功能，不是本次单机首版已完成内容。

### 平台验收表

每次记录：`日期 / 代码提交 / 设备与系统 / 宿主及基础库版本 / 结果或问题 / 修复提交`。

| 项目 | 验收内容 | 当前状态 |
| --- | --- | --- |
| 导入与启动 | 从 `.build/douyin/` 编译，配置有效；冷启动、图片、音频和加载失败重试正常 | 待平台验证 |
| 玩法与难度 | 首层、普通落楼、连续完美、倾倒、失误扣命、三次失误结算及重开；0.75 倍速度体验 | 待真机验证 |
| 计分 | 普通 25 分，完美连击 50/75/100……；普通落楼或失误打断连击 | 待真机验证 |
| 生命周期 | 投放途中切后台/锁屏后停止，回前台停留暂停，手动继续，无瞬间掉楼 | 待真机验证 |
| 音频 | 背景音乐、音效、声音开关、静音、耳机及中断恢复，无叠音；失败不阻断玩法 | 待真机验证 |
| 安全区与输入 | 小屏、刘海屏、长屏、胶囊和底部区域；画面与触摸命中一致，多指/快速点击不重复投放 | 待真机验证 |
| 本地记录 | 重进保留最高分、最高层数、声音设置；缓存读写失败可继续玩 | 待真机验证 |
| 分享 | 主动及菜单分享可打开实际面板，取消/失败提示合理；不发奖励或虚报成功 | 待真机验证 |
| 侧边栏 | 支持时显示入口；只在点击后跳转；正常入口不误认；冷/热侧边栏来源均识别；不支持/失败可继续玩 | 待真机验证 |
| 宿主差异 | 在后台要求覆盖的宿主重复检查安全区、分享、侧边栏和前后台，不硬编码仅允许抖音 | 待多宿主验证 |
| 性能 | 连续长局、频繁重开、前后台切换，无明显卡顿、残留音频或持续内存增长 | 待真机验证 |

## 4. 接续开发入口

先读 `README.douyin.md`、本文件和 `DESIGN.md`。修改玩法看 `minigame/core/game.js`，修改平台能力看 `minigame/platform/douyin.js`；UI 与场景在共享的 `renderer.js` 和 `app.js`。共用代码改变时应跑两平台回归。

构建与检查由 `scripts/build-douyin.js` / `scripts/check-douyin.js` 管理。正式配置改在 `configs/douyin.project.json`。输出目录和源文件之间的关系应始终清楚，避免换电脑后只拿到一份无法重建的运行包。

素材替换时同步更新授权记录，并核对资源检查策略：当前素材来自根目录原版 `assets/`，微信检查会进行副本比对。不能只换输出文件而不修改源素材和验证规则。

可复制给下一次会话：

> 继续盖楼小游戏的抖音版。请先阅读 README.douyin.md、docs/DOUYIN_HANDOFF.md 和 DESIGN.md，检查 feature/douyin-minigame 分支与工作区。抖音版基于微信版 4783a27，保持 0.75 倍吊钩速度，使用共享 Canvas 核心和独立 tt 适配；build:douyin 输出 .build/douyin，正式 AppID 填 configs/douyin.project.json。当前 AppID 仍为空，开发者工具、真机、多宿主及上线审核待完成。根据文档继续补充，并更新实际验证记录。

## 5. 验证与后续记录

本地自动化与浏览器模拟只能验证代码行为和布局，不证明抖音平台能力可用，也不能替代 IDE 必接检查或真机验收。精确测试数、包体大小和截图结果以本轮执行输出及后续记录为准。

| 日期 | 范围 | 状态与下一步 |
| --- | --- | --- |
| 2026-09-30 | 基线继承 | 从微信版 `4783a27` 创建抖音分支，继承 0.75 倍速度；微信独立分支保留 |
| 2026-09-30 | 抖音首版 | 58 项自动测试通过（核心 11、微信适配 13、抖音适配 19、共享应用 15）；修复跨局分享失败回调；独立包 37 文件、27 资源，约 562.7 KiB；微信包检查及界面静态审查通过 |
| 2026-09-30 | 浏览器模拟 | Edge 中微信/抖音各 320×568、375×667、390×844 流程通过，无运行错误；抖音另测侧边栏点击/返回及分享失败；已查看小屏/长屏首页与结算截图。音频、真实分享与侧边栏仍待平台验证 |
| 2026-09-30 | 平台发布状态 | 无正式 AppID，IDE 编译、真机、多宿主、上传与审核均待完成 |

后续记录模板：`日期 / 提交号 / 修改内容 / 执行命令或设备 / 结果及未解决问题 / 下一步`。账号材料和规则变化时更新核实日期；任何未执行的项目保持“待验证”。

## 6. 官方资料

- [小游戏开发说明](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/develop/)
- [小游戏项目配置](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/code-edit/project-config)
- [开发者工具与测试号](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/mini-app-developer-instrument)
- [必接能力](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)
- [侧边栏复访接入说明](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/Introduction-for-tech)
- [版本提审指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/examineguide)

本次文档查阅日期为 2026-09-30；账号资质和实际上线要求以后台及当时的官方规则为准。
