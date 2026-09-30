// 生成单文件浏览器验证页，无需服务或构建工具。该适配仅用于本地检查。
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const target = process.argv[2] || 'wechat'
if (!['wechat', 'douyin'].includes(target)) throw new Error('预览平台应为 wechat 或 douyin')
const platformName = target === 'douyin' ? '抖音' : '微信'
const modules = ['core/game', 'theme', 'assets', 'renderer', 'app']
if (target === 'douyin') modules.push('platform/douyin')
const sources = Object.fromEntries(modules.map(name => [name, fs.readFileSync(path.join(root, 'minigame', `${name}.js`), 'utf8')]))
const images = Object.fromEntries(fs.readdirSync(path.join(root, 'minigame/assets')).filter(name => name.endsWith('.png')).map(name => [
  `assets/${name}`, `data:image/png;base64,${fs.readFileSync(path.join(root, 'minigame/assets', name)).toString('base64')}`
]))
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>盖楼 · 本地交互预览</title>
<style>*{box-sizing:border-box}body{margin:0;background:#254e64;color:#fff;font:15px sans-serif;display:flex;justify-content:center;gap:32px;align-items:center;min-height:100vh}aside{width:220px;line-height:1.8}canvas{width:375px;height:667px;max-height:100vh;touch-action:none;cursor:pointer}button{padding:10px;margin:6px 0;cursor:pointer}button:focus-visible,canvas:focus-visible{outline:3px solid #ffcc4d} @media(max-width:660px){body{display:block}aside{display:none}canvas{width:100vw;height:100vh;display:block}}</style>
<canvas tabindex="0" aria-label="盖楼游戏，空格投放，P 暂停，使用画面按钮开始和继续"></canvas><aside><h1>来啊，盖楼啊</h1><p>${platformName}版共用游戏代码的本地预览。</p><p>点击画面或空格放下楼层。按 P 暂停。</p><button id="hide">模拟切后台</button><br><button id="show">模拟回前台</button><p id="status" role="status"></p><p>此预览不代表${platformName}真机验证；音频、分享和侧边栏使用模拟接口，需要开发者工具及真机测试。</p></aside>
<script>
const sources = ${JSON.stringify(sources).replace(/</g, '\\u003c')};
const images = ${JSON.stringify(images)};
const cache = {};
function load(name){ if(cache[name])return cache[name].exports; const module={exports:{}};cache[name]=module;new Function('require','module','exports',sources[name])(id=>load(id.slice(2)),module,module.exports);return module.exports; }
const canvas=document.querySelector('canvas'), handlers={};
const info=()=>({width:canvas.clientWidth,height:canvas.clientHeight,pixelRatio:devicePixelRatio,safeTop:24,safeBottom:20,menuBottom:52});
const subscribe=(name,cb)=>{handlers[name]=cb;return ()=>{delete handlers[name]}};
const silent=()=>({play(){},restart(){},pause(){},stop(){},destroy(){}});
let platform={canvas,getWindowInfo:info,createImage(){const img=new Image();const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(img,'src',{set(value){descriptor.set.call(img,images[value])},get(){return descriptor.get.call(img)}});return img},requestFrame:requestAnimationFrame.bind(window),cancelFrame:cancelAnimationFrame.bind(window),onTouchStart:cb=>subscribe('touch',cb),onHide:cb=>subscribe('hide',cb),onShow:cb=>subscribe('show',cb),onResize:cb=>subscribe('resize',cb),readStorage(k,f){try{return JSON.parse(localStorage.getItem(k))||f}catch(e){return f}},writeStorage(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},createAudio:silent,share(){return false},enableShare(){},vibrate(){},destroy(){}};
const previewStats={sidebarNavigations:0,shares:0};
if ("${target}" === 'douyin') {
  const browserPlatform=platform, nativeHandlers={};
  const tt={
    createCanvas:()=>canvas, createImage:()=>browserPlatform.createImage(),
    getSystemInfoSync(){const i=info();return {windowWidth:i.width,windowHeight:i.height,pixelRatio:i.pixelRatio,safeArea:{top:i.safeTop,bottom:i.height-i.safeBottom}}},
    getMenuButtonLayout:()=>({bottom:info().menuBottom}),
    getStorageSync:key=>browserPlatform.readStorage('douyin.'+key,''),
    setStorageSync(key,value){if(!browserPlatform.writeStorage('douyin.'+key,value))throw new Error('预览存储失败')},
    getLaunchOptionsSync:()=>({}),
    checkScene(options){setTimeout(()=>options.success({isExist:true}),50)},
    navigateToScene(){previewStats.sidebarNavigations++;nativeHandlers.hide&&nativeHandlers.hide();nativeHandlers.show&&nativeHandlers.show({launch_from:'homepage',location:'sidebar_card'})},
    showShareMenu(){},
    shareAppMessage(options){previewStats.shares++;setTimeout(()=>options.fail({errMsg:'浏览器无法打开原生分享'}),0)}
  };
  const eventNames={TouchStart:'touch',Hide:'hide',Show:'show',WindowResize:'resize',ShareAppMessage:'share'};
  Object.keys(eventNames).forEach(name=>{const event=eventNames[name];tt['on'+name]=cb=>{nativeHandlers[event]=cb};tt['off'+name]=cb=>{if(nativeHandlers[event]===cb)delete nativeHandlers[event]}});
  handlers.touch=point=>nativeHandlers.touch&&nativeHandlers.touch({touches:[{clientX:point.x,clientY:point.y}]});
  handlers.hide=()=>nativeHandlers.hide&&nativeHandlers.hide();
  handlers.show=()=>nativeHandlers.show&&nativeHandlers.show({});
  handlers.resize=()=>nativeHandlers.resize&&nativeHandlers.resize();
  platform=load('platform/douyin').createDouyinPlatform(tt);
}
const app=new (load('app').GameApp)(platform);
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();handlers.touch&&handlers.touch({x:e.clientX-r.left,y:e.clientY-r.top})});
canvas.addEventListener('keydown',e=>{if(e.code==='Space'&&app.scene==='playing'){e.preventDefault();app.game.drop()}if(e.code==='KeyP'){app.scene==='paused'?app.resume():app.pause();app.render()}});
document.querySelector('#hide').onclick=()=>handlers.hide();document.querySelector('#show').onclick=()=>handlers.show();
document.addEventListener('visibilitychange',()=>document.hidden?handlers.hide():handlers.show());window.addEventListener('resize',()=>handlers.resize&&handlers.resize(info()));
setInterval(()=>{document.querySelector('#status').textContent='状态：'+app.scene+' / '+app.game.floors+' 层 / '+app.game.score+' 分 / 剩余 '+app.game.lives+' 次'},300);
</script></html>`
const directory = path.join(root, '.preview')
fs.mkdirSync(directory, { recursive: true })
const output = path.join(directory, `${target}.html`)
fs.writeFileSync(output, html, 'utf8')
console.log(output)
