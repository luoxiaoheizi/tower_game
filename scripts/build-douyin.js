// 无需安装依赖；只覆盖明确列出的产物，不删除已有文件或目录。
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { IMAGES } = require('../minigame/assets')

const root = path.resolve(__dirname, '..')
const gameRoot = path.join(root, 'minigame')
const outputRoot = path.join(root, '.build', 'douyin')
const audioNames = ['bgm', 'drop', 'drop-perfect', 'rotate', 'game-over']
const assetNames = IMAGES.map(name => `${name}.png`).concat(audioNames.map(name => `${name}.mp3`))
const manifest = [
  ['minigame/game.douyin.js', 'game.js'],
  ['minigame/game.json', 'game.json'],
  ['configs/douyin.project.json', 'project.config.json'],
  ...['app.js', 'theme.js', 'renderer.js', 'assets.js', 'core/game.js', 'platform/douyin.js', 'LICENSE']
    .map(name => [`minigame/${name}`, name]),
  ...assetNames.map(name => [`minigame/assets/${name}`, `assets/${name}`])
]

function assertLocalPath(absolute) {
  const relative = path.relative(root, absolute)
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `路径超出项目：${absolute}`)
  let current = root
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    const entry = fs.lstatSync(current, { throwIfNoEntry: false })
    if (entry) assert(!entry.isSymbolicLink(), `打包路径不可使用符号链接或目录联接：${current}`)
  }
}

function listOutputFiles() {
  assertLocalPath(outputRoot)
  const files = []
  const allowedDirectories = new Set(['assets', 'core', 'platform'])
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(outputRoot, absolute).split(path.sep).join('/')
      assert(!entry.isSymbolicLink(), `产物包含符号链接：${relative}`)
      if (entry.isDirectory()) {
        assert(allowedDirectories.has(relative), `产物包含清单外目录，请先检查并移出：${relative}`)
        visit(absolute)
      } else {
        assert(entry.isFile(), `产物不是普通文件：${relative}`)
        files.push(relative)
      }
    }
  }
  if (fs.existsSync(outputRoot)) visit(outputRoot)
  return files.sort()
}

function buildDouyin() {
  const expected = new Set(manifest.map(([, target]) => target))
  for (const existing of listOutputFiles()) {
    assert(expected.has(existing), `产物包含清单外文件，请先检查并移出：${existing}`)
  }
  for (const [source, target] of manifest) {
    const sourcePath = path.join(root, source)
    assertLocalPath(sourcePath)
    assert(fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile(), `缺少打包源文件：${source}`)
    assertLocalPath(path.join(outputRoot, target))
  }
  for (const [source, target] of manifest) {
    const targetPath = path.join(outputRoot, target)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.copyFileSync(path.join(root, source), targetPath)
  }
  return outputRoot
}

module.exports = { root, gameRoot, outputRoot, manifest, assetNames, listOutputFiles, buildDouyin }

if (require.main === module) {
  buildDouyin()
  require('./check-douyin').checkDouyin()
  console.log(`抖音导入目录：${outputRoot}`)
}
