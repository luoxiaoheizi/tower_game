const theme = require('./theme')
const C = theme.colors

class Renderer {
  constructor(canvas, width, height) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.width = width
    this.height = height
    this.buttons = []
  }

  resize(info) {
    const ratio = Math.min(3, Math.max(1, info.pixelRatio || 1))
    this.canvas.width = Math.round(info.width * ratio)
    this.canvas.height = Math.round(info.height * ratio)
    this.ratio = ratio
    this.scale = Math.min(info.width / this.width, info.height / this.height)
    this.offsetX = (info.width - this.width * this.scale) / 2
    this.offsetY = (info.height - this.height * this.scale) / 2
    this.safeTop = Math.max(12, (Math.max(info.safeTop || 0, info.menuBottom || 0) - this.offsetY) / this.scale + 8)
    this.safeBottom = Math.max(16, ((info.safeBottom || 0) - this.offsetY) / this.scale + 10)
  }

  point(point) {
    return { x: (point.x - this.offsetX) / this.scale, y: (point.y - this.offsetY) / this.scale }
  }

  hit(point) {
    const p = this.point(point)
    return this.buttons.find(b => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
  }

  box(x, y, width, height, radius, color) {
    const ctx = this.ctx
    const r = Math.min(radius, width / 2, height / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + width, y, x + width, y + height, r)
    ctx.arcTo(x + width, y + height, x, y + height, r)
    ctx.arcTo(x, y + height, x, y, r)
    ctx.arcTo(x, y, x + width, y, r)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  text(value, x, y, size = 16, color = C.ink, weight = 'normal', align = 'center') {
    const ctx = this.ctx
    ctx.fillStyle = color
    ctx.font = `${weight} ${size}px ${theme.fonts.body}`
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.fillText(String(value), x, y)
  }

  button(id, label, x, y, width, primary = false, height = theme.buttonHeight) {
    this.box(x, y + 4, width, height, theme.radius, primary ? C.shadow : '#decbaa')
    this.box(x, y, width, height, theme.radius, primary ? C.primary : C.paper)
    this.text(label, x + width / 2, y + height / 2, height < 48 ? 14 : 18, C.ink, 'bold')
    this.buttons.push({ id, x, y, width, height })
  }

  sprite(image, x, y, width, height) {
    if (image && image.width && image.height) this.ctx.drawImage(image, x, y, width, height)
  }

  render(app) {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    this.buttons = []
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = C.sky
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(this.scale * this.ratio, 0, 0, this.scale * this.ratio, this.offsetX * this.ratio, this.offsetY * this.ratio)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    this.scene(app)
    if (app.scene === 'loading' || app.scene === 'error') {
      this.box(30, h / 2 - 104, w - 60, 216, 24, C.paper)
      this.text(app.scene === 'error' ? '素材加载遇到问题' : '正在准备楼层', w / 2, h / 2 - 58, 22, C.ink, 'bold')
      if (app.scene === 'loading') {
        this.box(58, h / 2 - 10, w - 116, 12, 6, '#ead8b9')
        const progressWidth = (w - 116) * app.loadingPercent
        if (progressWidth > 0) this.box(58, h / 2 - 10, progressWidth, 12, 6, C.accent)
        this.text(`${Math.round(app.loadingPercent * 100)}%`, w / 2, h / 2 + 40, 18)
      } else {
        this.text('点击重试，重新准备游戏', w / 2, h / 2 - 18, 15, C.muted)
        this.button('retry', '重新加载', 68, h / 2 + 20, w - 136, true)
      }
    } else if (app.scene === 'home') {
      const title = app.images['main-index-title']
      // 预留侧边栏行，异步能力检查完成时不移动开始按钮。
      const startY = h - this.safeBottom - 128 - (app.hasSidebar ? 52 : 0)
      const titleY = app.hasSidebar ? this.safeTop + 5 : Math.min(this.safeTop + 5, h * 0.17)
      const titleRatio = title ? title.width / title.height : 0.75
      const titleWidth = Math.min(w * 0.65, h * 0.34 * titleRatio, app.hasSidebar ? Math.max(0, startY - 146 - titleY) * titleRatio : Infinity)
      const titleHeight = titleWidth / titleRatio
      this.sprite(title, (w - titleWidth) / 2, titleY, titleWidth, titleHeight)
      const cardY = app.hasSidebar ? startY - 134 : Math.max(titleY + titleHeight + 8, h * 0.51)
      this.box(44, cardY, w - 88, 80, 20, C.paper)
      this.text('抓准时机，点一下放下楼层', w / 2, cardY + 25, 17, C.ink, 'bold')
      this.text('3 次机会，看看你能盖多高', w / 2, cardY + 55, 14, C.muted)
      this.button('start', '开始盖楼', 58, startY, w - 116, true)
      this.box(72, startY - 40, w - 144, 30, 15, C.paper)
      this.text(`最高 ${app.record.score} 分 · ${app.record.floors} 层`, w / 2, startY - 25, 14, C.ink, 'bold')
      this.button('sound', app.settings.sound ? '声音：开' : '声音：关', 58, startY + 70, 124, false, 42)
      this.button('help', '玩法说明', w - 182, startY + 70, 124, false, 42)
      if (app.sidebar && app.sidebar.supported) this.button('sidebar', '从侧边栏再来玩', 58, startY + 124, w - 116, false, 42)
    } else if (app.scene === 'help') {
      this.overlay()
      const y = Math.max(this.safeTop + 12, (h - 338) / 2)
      this.box(28, y, w - 56, 338, 24, C.paper)
      this.text('一层一层，盖向天空', w / 2, y + 39, 22, C.ink, 'bold')
      const lines = ['点击画面，放下吊钩上的楼层', '对齐上一层，稳稳地接住它', '普通落楼 +25 分，完美落楼 +50 分', '连续完美，每次再多加 25 分', '偏得太多会倾倒，掉落 3 次结束']
      lines.forEach((line, index) => this.text(line, w / 2, y + 86 + index * 30, 14))
      this.button('home', '知道了', 66, y + 266, w - 132, true)
    } else {
      this.hud(app)
      if (app.scene === 'playing') {
        const ready = app.game.active && app.game.active.status === 'swing'
        this.box(58, h - this.safeBottom - 46, w - 116, 40, 20, C.paper)
        this.text(ready ? '点击画面 · 放下楼层' : '看准下一层的位置', w / 2, h - this.safeBottom - 26, 15, C.ink, 'bold')
        if (app.feedback && app.feedback.ttl > 0) {
          this.box(75, h * 0.44, w - 150, 48, 18, C.paper)
          this.text(app.feedback.text, w / 2, h * 0.44 + 24, 21, C.accent, 'bold')
        }
      } else if (app.scene === 'paused') {
        this.overlay()
        const y = Math.max(this.safeTop + 10, (h - 290) / 2)
        this.box(30, y, w - 60, 290, 24, C.paper)
        this.text('休息一下', w / 2, y + 40, 28, C.ink, 'bold')
        this.text('楼层已暂停，准备好再继续', w / 2, y + 78, 15, C.muted)
        this.button('resume', '继续盖楼', 62, y + 111, w - 124, true)
        this.button('sound', app.settings.sound ? '声音：开' : '声音：关', 62, y + 180, w - 124)
        this.text('本局进度保持不变', w / 2, y + 263, 13, C.muted)
      } else if (app.scene === 'gameover') {
        this.overlay()
        const y = Math.max(this.safeTop + 6, (h - 402) / 2)
        this.box(28, y, w - 56, 402, 24, C.paper)
        this.text(app.newRecord ? '刷新最高纪录！' : '这座楼，盖得不错', w / 2, y + 38, 23, C.ink, 'bold')
        this.text(app.game.score, w / 2, y + 100, 52, C.accent, 'bold')
        this.text(`本局盖了 ${app.game.floors} 层`, w / 2, y + 148, 18, C.ink, 'bold')
        this.text(`最高 ${app.record.score} 分 · ${app.record.floors} 层`, w / 2, y + 181, 14, C.muted)
        this.button('restart', '再盖一次', 60, y + 214, w - 120, true)
        this.button('share', '分享成绩', 60, y + 281, w - 120)
        this.button('home', '回到首页', 104, y + 345, w - 208, false, 40)
      }
    }
    if (app.notice) {
      this.box(20, h - this.safeBottom - 52, w - 40, 42, 12, C.ink)
      this.text(app.notice, w / 2, h - this.safeBottom - 31, 13, C.white)
    }
    ctx.restore()
  }

  overlay() {
    this.ctx.fillStyle = 'rgba(30, 40, 57, 0.50)'
    this.ctx.fillRect(0, 0, this.width, this.height)
  }

  scene(app) {
    const ctx = this.ctx
    const g = app.game
    const w = this.width
    const h = this.height
    const playing = ['playing', 'paused', 'gameover'].indexOf(app.scene) >= 0
    const floors = playing ? g.floors : 0
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, floors >= 20 ? C.night : C.sky)
    gradient.addColorStop(1, floors >= 10 ? C.sky : C.skyBottom)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
    for (let n = 0; n < 4; n += 1) {
      const img = app.images[`c${1 + (n + Math.floor(floors / 6)) % 8}`]
      const size = 70 + n * 8
      const x = ((n * 131 + g.time * (5 + n)) % (w + size)) - size
      this.sprite(img, x, h * (0.18 + n * 0.15), size, img ? size * img.height / img.width : 40)
    }
    const bg = app.images.background
    if (bg) {
      const bgHeight = w * bg.height / bg.width
      // 原画屋顶在图像高度 0.36 处；与首层承重点精确对齐。
      const bgY = playing ? g.baseY + g.cameraY - bgHeight * 0.36 : h - bgHeight
      this.sprite(bg, 0, bgY, w, bgHeight)
    }
    if (!playing) return
    g.blocks.forEach(block => this.drawBlock(app, block, false))
    const block = g.active
    if (block) {
      if (block.status === 'swing') {
        ctx.strokeStyle = C.ink
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(block.anchorX, block.anchorY + g.cameraY)
        ctx.lineTo(block.ropeX, block.ropeY + g.cameraY)
        ctx.stroke()
        this.box(block.ropeX - 6, block.ropeY + g.cameraY - 13, 12, 15, 3, C.primary)
        this.sprite(app.images['block-rope'], block.x, block.ropeY + g.cameraY, block.width, block.height * 1.3)
      } else this.drawBlock(app, block, true)
    }
    if (floors >= 2) {
      const flight = app.images[`f${1 + Math.floor(floors / 4) % 7}`]
      const x = ((g.time * 34) % (w + 180)) - 130
      this.sprite(flight, x, h * 0.36, 90, flight ? 90 * flight.height / flight.width : 50)
    }
  }

  drawBlock(app, block, rotate) {
    const ctx = this.ctx
    const y = block.y + app.game.cameraY
    if (y > this.height + block.height || y + block.height < -block.height) return
    ctx.save()
    ctx.translate(block.x, y)
    if (rotate) ctx.rotate(block.angle || 0)
    this.sprite(app.images[block.perfect ? 'block-perfect' : 'block'], 0, 0, block.width, block.height)
    ctx.restore()
  }

  hud(app) {
    const w = this.width
    const y = this.safeTop
    this.box(16, y, 154, 54, 18, C.paper)
    this.text(`${app.game.floors} 层`, 31, y + 13, 12, C.muted, 'normal', 'left')
    this.text(`${app.game.score} 分`, 31, y + 35, String(app.game.score).length > 6 ? 18 : 24, C.ink, 'bold', 'left')
    this.button('pause', app.scene === 'paused' ? '已暂停' : '暂停', w - 82, y, 66, false, 44)
    for (let i = 0; i < 3; i += 1) {
      this.ctx.save()
      this.ctx.globalAlpha = i < app.game.lives ? 1 : 0.23
      this.sprite(app.images.heart, 188 + i * 25, y + 14, 23, 21)
      this.ctx.restore()
    }
  }
}

module.exports = { Renderer }
