const { TowerGame } = require('./core/game')
const { Renderer } = require('./renderer')
const { loadImages } = require('./assets')

const RECORD_KEY = 'tower.record.v1'
const SETTINGS_KEY = 'tower.settings.v1'

function nonnegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0
}

class GameApp {
  constructor(platform) {
    this.platform = platform
    this.scene = 'loading'
    this.images = {}
    this.loadingPercent = 0
    this.hidden = false
    this.destroyed = false
    this.frame = null
    this.lastTime = null
    this.loadVersion = 0
    this.feedback = null
    this.notice = ''
    this.noticeTime = 0
    this.newRecord = false
    const record = platform.readStorage(RECORD_KEY, {}) || {}
    this.record = { score: nonnegativeInteger(record.score), floors: nonnegativeInteger(record.floors) }
    const settings = platform.readStorage(SETTINGS_KEY, {}) || {}
    this.settings = { sound: settings.sound !== false }
    const info = platform.getWindowInfo()
    const width = 375
    const height = Math.max(560, Math.min(850, Math.round(info.height / info.width * width)))
    this.game = new TowerGame({ width, height })
    this.renderer = new Renderer(platform.canvas, width, height)
    this.renderer.resize(info)
    this.audio = {}
    const effects = ['bgm', 'drop', 'drop-perfect', 'rotate', 'game-over']
    effects.forEach(name => {
      this.audio[name] = platform.createAudio(`assets/${name}.mp3`, { loop: name === 'bgm', volume: name === 'bgm' ? 0.35 : 0.8 })
    })
    this.unsubscribers = [
      platform.onTouchStart(point => this.touch(point)),
      platform.onHide(() => this.hide()),
      platform.onShow(() => this.show()),
      platform.onResize(info => { this.renderer.resize(info); this.render() })
    ]
    platform.enableShare(() => ({ score: this.game.score, floors: this.game.floors }))
    this.ready = this.load()
    this.schedule()
  }

  load() {
    const version = ++this.loadVersion
    this.scene = 'loading'
    this.loadingPercent = 0
    this.render()
    return loadImages(this.platform, percent => {
      if (version === this.loadVersion && this.scene === 'loading') this.loadingPercent = percent
    }).then(images => {
      if (this.destroyed || version !== this.loadVersion) return
      this.images = images
      this.scene = 'home'
      this.render()
    }).catch(() => {
      if (this.destroyed || version !== this.loadVersion) return
      this.scene = 'error'
      this.render()
    })
  }

  schedule() {
    if (this.hidden || this.destroyed || this.frame !== null) return
    this.frame = this.platform.requestFrame(time => {
      this.frame = null
      if (this.hidden || this.destroyed) return
      const now = Number.isFinite(time) ? time : Date.now()
      const delta = this.lastTime === null ? 0 : Math.max(0, Math.min((now - this.lastTime) / 1000, 0.1))
      this.lastTime = now
      this.tick(delta)
      this.render()
      this.schedule()
    })
  }

  tick(delta) {
    if (this.scene === 'playing') {
      this.game.update(delta)
      this.game.drainEvents().forEach(event => this.handleEvent(event))
      if (this.feedback) this.feedback.ttl -= delta
    }
    if (this.noticeTime > 0) {
      this.noticeTime -= delta
      if (this.noticeTime <= 0) this.notice = ''
    }
  }

  handleEvent(event) {
    if (event.type === 'land') {
      this.play(event.perfect ? 'drop-perfect' : 'drop')
      this.feedback = {
        text: event.perfect ? `${event.combo > 1 ? `${event.combo} 连完美` : '完美落楼'} +${event.points}` : `稳稳接住 +${event.points}`,
        ttl: 1.05
      }
      if (event.perfect) this.platform.vibrate()
      this.saveRecord()
    } else if (event.type === 'miss') {
      this.play('rotate')
      this.feedback = { text: `还剩 ${this.game.lives} 次机会`, ttl: 1.2 }
    } else if (event.type === 'gameover') {
      this.scene = 'gameover'
      this.audio.bgm.pause()
      this.play('game-over')
      this.saveRecord()
    }
  }

  saveRecord() {
    const next = { score: Math.max(this.record.score, this.game.score), floors: Math.max(this.record.floors, this.game.floors) }
    if (next.score === this.record.score && next.floors === this.record.floors) return
    this.record = next
    this.newRecord = true
    if (!this.platform.writeStorage(RECORD_KEY, next)) this.notify('纪录暂未保存，仍可继续游戏')
  }

  start() {
    this.game.reset()
    this.scene = 'playing'
    this.lastTime = null
    this.newRecord = false
    this.feedback = null
    this.notice = ''
    this.noticeTime = 0
    this.stopAudio()
    if (this.settings.sound && !this.hidden) this.audio.bgm.play()
  }

  pause() {
    if (this.scene !== 'playing') return
    this.game.pause()
    this.scene = 'paused'
    this.stopAudio()
  }

  resume() {
    if (this.scene !== 'paused' || this.hidden) return
    this.game.resume()
    this.scene = 'playing'
    this.lastTime = null
    if (this.settings.sound) this.audio.bgm.play()
  }

  hide() {
    this.hidden = true
    this.pause()
    this.stopAudio()
    if (this.frame !== null) this.platform.cancelFrame(this.frame)
    this.frame = null
    this.lastTime = null
  }

  show() {
    if (this.destroyed) return
    this.hidden = false
    this.lastTime = null
    this.render()
    this.schedule()
  }

  play(name) {
    if (this.settings.sound && !this.hidden && this.audio[name]) this.audio[name].restart()
  }

  stopAudio() {
    Object.keys(this.audio).forEach(name => this.audio[name].pause())
  }

  notify(message) { this.notice = message; this.noticeTime = 3 }

  touch(point) {
    if (this.hidden || this.destroyed) return
    // 先更新命中区域，避免界面切换后残留按钮触发另一种操作。
    this.render()
    const button = this.renderer.hit(point)
    if (button) {
      this.action(button.id)
    } else if (this.scene === 'playing') {
      const p = this.renderer.point(point)
      if (p.x >= 0 && p.x <= this.game.width && p.y >= this.renderer.safeTop + 64 && p.y <= this.game.height - this.renderer.safeBottom) this.game.drop()
    }
    this.render()
  }

  action(id) {
    if (id === 'start' || id === 'restart') this.start()
    else if (id === 'pause') this.pause()
    else if (id === 'resume') this.resume()
    else if (id === 'retry' && this.scene === 'error') this.ready = this.load()
    else if (id === 'help') this.scene = 'help'
    else if (id === 'home') { this.scene = 'home'; this.stopAudio() }
    else if (id === 'sound') {
      this.settings.sound = !this.settings.sound
      if (!this.platform.writeStorage(SETTINGS_KEY, this.settings)) this.notify('声音设置暂未保存，本次仍生效')
      if (!this.settings.sound) this.stopAudio()
      else if (this.scene === 'playing') this.audio.bgm.play()
    } else if (id === 'share' && this.scene === 'gameover') {
      if (!this.platform.share(this.game.score, this.game.floors)) this.notify('分享暂不可用，请稍后再试')
    }
  }

  render() { if (!this.destroyed && !this.hidden) this.renderer.render(this) }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.loadVersion += 1
    if (this.frame !== null) this.platform.cancelFrame(this.frame)
    this.unsubscribers.forEach(unsubscribe => { if (typeof unsubscribe === 'function') unsubscribe() })
    Object.keys(this.audio).forEach(name => this.audio[name].destroy())
    this.platform.destroy()
  }
}

module.exports = { GameApp, RECORD_KEY, SETTINGS_KEY }
