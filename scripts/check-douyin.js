// 检查实际导入产物；不能替代抖音开发者工具、真机及平台审核。
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { root, outputRoot, manifest, assetNames, listOutputFiles } = require('./build-douyin')

function checkDouyin() {
  assert(fs.existsSync(outputRoot), '请先执行 node scripts/build-douyin.js 生成抖音产物。')
  const files = listOutputFiles()
  const expected = manifest.map(([, target]) => target).sort()
  assert.deepEqual(files, expected, '产物存在缺失或清单外文件；请检查并移出多余文件后重新构建。')
  for (const [source, target] of manifest) {
    assert(fs.readFileSync(path.join(outputRoot, target)).equals(fs.readFileSync(path.join(root, source))),
      `产物与源文件不同，请重新构建：${target}`)
  }

  const readJson = name => JSON.parse(fs.readFileSync(path.join(outputRoot, name), 'utf8'))
  const project = readJson('project.config.json')
  assert.equal(typeof project.appid, 'string', 'AppID 必须是字符串；空字符串仅作为仓库占位。')
  assert(project.appid === '' || /^tt[0-9a-z]+$/i.test(project.appid), '请填写抖音 AppID，不能沿用微信游客 AppID。')
  assert(typeof project.projectname === 'string' && project.projectname.trim(), '请填写项目名称。')
  assert.equal(project.setting.es6, true)
  assert.equal(project.setting.autoCompile, true)
  assert(!('compileType' in project) && !('miniprogramRoot' in project), '抖音应直接导入产物根目录。')
  assert.equal(readJson('game.json').deviceOrientation, 'portrait')
  assert.equal(readJson('game.json').showStatusBar, false)

  const entry = fs.readFileSync(path.join(outputRoot, 'game.js'), 'utf8')
  assert(/new\s+GameApp\s*\(\s*createDouyinPlatform\s*\(\s*tt\s*\)\s*\)/.test(entry), '入口必须同步使用 tt 创建抖音平台。')
  const platform = fs.readFileSync(path.join(outputRoot, 'platform', 'douyin.js'), 'utf8')
  assert(/\btt\.navigateToScene\s*\(/.test(platform), '侧边栏需有显式 tt.navigateToScene 调用。')

  const dependencies = new Map()
  for (const relative of files.filter(name => name.endsWith('.js'))) {
    const file = path.join(outputRoot, relative)
    const source = fs.readFileSync(file, 'utf8')
    assert(!/\b(?:wx|wxApi)\b/.test(source), `抖音产物存在微信依赖：${relative}`)
    assert(!/\b(?:document|window|localStorage|navigator)\s*[.[]/.test(source), `产物存在浏览器依赖：${relative}`)
    assert(!/https?:\/\//.test(source), `运行代码存在远端依赖：${relative}`)
    const imports = Array.from(source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g))
    assert.equal(imports.length, Array.from(source.matchAll(/\brequire\s*\(/g)).length, `不支持动态 require：${relative}`)
    const targets = []
    for (const match of imports) {
      const request = match[2]
      assert(request.startsWith('.'), `产物存在外部模块：${request}`)
      const target = path.resolve(path.dirname(file), path.extname(request) ? request : `${request}.js`)
      const targetRelative = path.relative(outputRoot, target).split(path.sep).join('/')
      assert(expected.includes(targetRelative), `依赖不存在或越界：${relative} -> ${request}`)
      targets.push(targetRelative)
    }
    dependencies.set(relative, targets)
    const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
    assert.equal(syntax.status, 0, syntax.error ? syntax.error.message : syntax.stderr)
  }

  const reachable = new Set()
  function visit(relative) {
    if (reachable.has(relative)) return
    reachable.add(relative)
    for (const target of dependencies.get(relative) || []) visit(target)
  }
  visit('game.js')
  for (const relative of dependencies.keys()) assert(reachable.has(relative), `打包了入口未引用的模块：${relative}`)
  for (const name of assetNames) {
    assert(fs.readFileSync(path.join(outputRoot, 'assets', name)).equals(fs.readFileSync(path.join(root, 'assets', name))),
      `素材与原版不同：${name}`)
  }
  assert(fs.readFileSync(path.join(outputRoot, 'LICENSE')).equals(fs.readFileSync(path.join(root, 'LICENSE'))), '原版素材许可必须保留。')
  const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(outputRoot, file)).size, 0)
  // 这是项目内部预算，并非抖音平台公布的包体上限。
  assert(bytes < 4 * 1024 * 1024, '抖音小游戏包超出项目 4 MiB 预算。')
  console.log(`抖音产物检查通过：${files.length} 个文件，${assetNames.length} 个资源，${(bytes / 1024).toFixed(1)} KiB；依赖闭合且无微信、浏览器或外部模块依赖。`)
  return { files: files.length, assets: assetNames.length, bytes }
}

module.exports = { checkDouyin }
if (require.main === module) checkDouyin()
