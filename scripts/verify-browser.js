// 可选视觉回归：传入已安装的 Playwright 路径，无需修改项目依赖。
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.argv[2] || 'playwright')
const output = path.resolve(__dirname, '../.preview')
const target = process.argv[4] || 'wechat'
assert(['wechat', 'douyin'].includes(target), '预览平台应为 wechat 或 douyin')
const prefix = target === 'wechat' ? '' : 'douyin-'

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.argv[3] || undefined })
  const errors = []
  const reports = []
  try {
    for (const viewport of [{ width: 375, height: 667 }, { width: 320, height: 568 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
      page.on('pageerror', error => errors.push(error.message))
      const size = `${viewport.width}x${viewport.height}`
      await page.goto(pathToFileURL(path.join(output, `${target}.html`)).href)
      await page.waitForFunction(() => app.scene === 'home')
      if (target === 'douyin') await page.waitForFunction(() => app.sidebar.supported)
      await page.screenshot({ path: path.join(output, `${prefix}home-${size}.png`) })
      const clickButton = async id => {
        const point = await page.evaluate(id => {
          const b = app.renderer.buttons.find(button => button.id === id)
          if (!b) throw new Error(`找不到按钮：${id}`)
          const r = app.renderer
          return { x: (b.x + b.width / 2) * r.scale + r.offsetX, y: (b.y + b.height / 2) * r.scale + r.offsetY }
        }, id)
        await page.mouse.click(point.x, point.y)
      }
      if (target === 'douyin') {
        assert.equal(await page.evaluate(() => previewStats.sidebarNavigations), 0)
        await clickButton('sidebar')
        assert.deepEqual(await page.evaluate(() => [app.scene, app.sidebar.fromSidebar, previewStats.sidebarNavigations]), ['home', true, 1])
      }
      await clickButton('help')
      assert.equal(await page.evaluate(() => app.scene), 'help')
      await clickButton('home')
      await clickButton('start')
      assert.equal(await page.evaluate(() => app.game.active.status), 'swing')
      await page.mouse.click(viewport.width / 2, viewport.height * 0.6)
      await page.waitForFunction(() => app.game.floors === 1)
      assert.equal(await page.evaluate(() => app.game.score), 25)
      await page.screenshot({ path: path.join(output, `${prefix}playing-${size}.png`) })
      await clickButton('pause')
      assert.equal(await page.evaluate(() => app.scene), 'paused')
      await page.screenshot({ path: path.join(output, `${prefix}paused-${size}.png`) })
      const before = await page.evaluate(() => app.game.time)
      // 离线预览的后台按钮与小游戏 onHide 使用同一 app 生命周期。
      await page.evaluate(() => { handlers.hide(); handlers.show() })
      assert.equal(await page.evaluate(() => app.scene), 'paused')
      assert.equal(await page.evaluate(() => app.game.time), before)
      await clickButton('resume')
      // 注入确定的失误场景，驱动真实物理与结算，而非直接切到结果页面。
      await page.evaluate(() => {
        for (let life = 0; life < 3; life += 1) {
          for (let n = 0; !app.game.active && n < 100; n += 1) app.tick(1 / 60)
          app.game.drop()
          app.game.active.x = -app.game.floorWidth * 3
          const previousLives = app.game.lives
          for (let n = 0; app.game.lives === previousLives && n < 600; n += 1) app.tick(1 / 60)
        }
        app.render()
      })
      assert.equal(await page.evaluate(() => app.scene), 'gameover')
      await page.screenshot({ path: path.join(output, `${prefix}gameover-${size}.png`) })
      if (target === 'douyin') {
        await clickButton('share')
        await page.waitForFunction(() => app.notice.includes('分享未完成'))
        assert.equal(await page.evaluate(() => app.scene), 'gameover')
      }
      await clickButton('restart')
      assert.deepEqual(await page.evaluate(() => [app.game.score, app.game.floors, app.game.lives, app.game.combo]), [0, 0, 3, 0])
      reports.push({ platform: target, sidebarAndShareSimulation: target === 'douyin', viewport, workflow: '首页→说明→投放计分→暂停→后台恢复→三次失误→结算→重开', passed: true })
      await page.close()
    }
    assert.deepEqual(errors, [], '浏览器运行报错')
    fs.writeFileSync(path.join(output, `${prefix}browser-report.json`), JSON.stringify({ reports, errors }, null, 2))
    console.log(JSON.stringify({ reports, errors }, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
