// 不依赖 npm 安装：验证小游戏配置、模块边界、资源完整性和包体。
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { IMAGES } = require('../minigame/assets')
const root = path.resolve(__dirname, '..')
const gameRoot = path.join(root, 'minigame')
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
assert.equal(project.compileType, 'game')
assert.equal(project.miniprogramRoot, 'minigame/')
assert.equal(JSON.parse(fs.readFileSync(path.join(gameRoot, 'game.json'), 'utf8')).deviceOrientation, 'portrait')
const files = []
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(absolute)
    else files.push(absolute)
  }
}
visit(gameRoot)
for (const file of files.filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8')
  assert(!/\b(?:document|window|localStorage|navigator)\s*[.[]/.test(source), `存在浏览器依赖：${file}`)
  assert(!/https?:\/\//.test(source), `小游戏运行代码出现远端依赖：${file}`)
  for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
    assert(match[1].startsWith('.'), `小游戏出现外部依赖：${match[1]}`)
    const target = path.resolve(path.dirname(file), `${match[1]}.js`)
    assert(target.startsWith(gameRoot + path.sep) && fs.existsSync(target), `模块不存在或越界：${match[1]}`)
  }
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
const assets = IMAGES.map(name => `${name}.png`).concat(['bgm', 'drop', 'drop-perfect', 'rotate', 'game-over'].map(name => `${name}.mp3`))
assets.forEach(name => {
  const copy = fs.readFileSync(path.join(gameRoot, 'assets', name))
  assert(copy.equals(fs.readFileSync(path.join(root, 'assets', name))), `素材拷贝发生变化：${name}`)
})
assert(fs.readFileSync(path.join(gameRoot, 'LICENSE')).equals(fs.readFileSync(path.join(root, 'LICENSE'))))
const bytes = files.reduce((total, file) => total + fs.statSync(file).size, 0)
// 项目自己的 4 MiB 包体预算，不代替发布时开发者工具的平台限制检查。
assert(bytes < 4 * 1024 * 1024, '小游戏包超出项目 4 MiB 预算')
console.log(`微信项目检查通过：${files.length} 个文件，${assets.length} 个资源，${(bytes / 1024).toFixed(1)} KiB；无外部依赖。`)
