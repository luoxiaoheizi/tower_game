'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GameApp, RECORD_KEY, SETTINGS_KEY } = require('../minigame/app');

function createHarness(t, options = {}) {
  const images = [];
  const listeners = {};
  const frames = new Map();
  const audio = {};
  const writes = [];
  const shares = [];
  const drawing = { text: [], count: 0 };
  let info = options.info || { width: 375, height: 667, pixelRatio: 2, safeTop: 20, safeBottom: 0, menuBottom: 60 };
  let nextFrame = 1;
  let time = 0;
  let platformDestroyCount = 0;
  const context = {
    createLinearGradient: () => ({ addColorStop() {} }),
    fillText: value => drawing.text.push(String(value)),
    fillRect: () => { drawing.count += 1; }
  };
  ['setTransform', 'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'rect', 'clip', 'fill', 'stroke', 'drawImage', 'translate', 'rotate'].forEach(name => { context[name] = () => {}; });
  const canvas = { getContext: name => { assert.equal(name, '2d'); return context; } };
  const storage = Object.assign({}, options.storage);
  const platform = {
    canvas,
    getWindowInfo: () => info,
    createImage() {
      const image = { width: 200, height: 140, settled: false };
      images.push(image);
      return image;
    },
    requestFrame(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelFrame: id => frames.delete(id),
    readStorage: (key, fallback) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : fallback,
    writeStorage(key, value) {
      writes.push({ key, value: { ...value } });
      if (options.writeFails) return false;
      storage[key] = { ...value };
      return true;
    },
    createAudio(src) {
      const name = src.split('/').pop().replace('.mp3', '');
      const player = {
        playing: false, plays: 0, restarts: 0, destroys: 0,
        play() { this.playing = true; this.plays += 1; return true; },
        restart() { this.playing = true; this.restarts += 1; return true; },
        pause() { this.playing = false; },
        stop() { this.playing = false; },
        destroy() { this.playing = false; this.destroys += 1; }
      };
      audio[name] = player;
      return player;
    },
    enableShare(getStats) { listeners.shareMenu = getStats; },
    share(score, floors) { shares.push({ score, floors }); return !options.shareFails; },
    vibrate() {},
    destroy() { platformDestroyCount += 1; Object.keys(listeners).forEach(key => delete listeners[key]); frames.clear(); }
  };
  ['TouchStart', 'Hide', 'Show', 'Resize'].forEach(name => {
    platform['on' + name] = callback => {
      listeners[name] = callback;
      return () => { delete listeners[name]; };
    };
  });
  const app = new GameApp(platform);
  app.game.random = () => 0.5;

  function settleImages(failName) {
    images.filter(image => !image.settled).forEach(image => {
      image.settled = true;
      const fail = image.src === `assets/${failName}.png`;
      const callback = fail ? image.onerror : image.onload;
      if (callback) callback();
    });
  }
  t.after(() => { settleImages(); if (!app.destroyed) app.destroy(); });

  function step(milliseconds = 1000 / 60) {
    time += milliseconds;
    const pending = frames.entries().next().value;
    if (!pending) return false;
    frames.delete(pending[0]);
    drawing.text = [];
    pending[1](time);
    return true;
  }

  function point(x, y) {
    const scale = Math.min(info.width / app.game.width, info.height / app.game.height);
    return {
      x: (info.width - app.game.width * scale) / 2 + x * scale,
      y: (info.height - app.game.height * scale) / 2 + y * scale
    };
  }

  function tapButton(id) {
    app.render();
    const button = app.renderer.buttons.find(item => item.id === id);
    assert.ok(button, `当前 ${app.scene} 场景应显示 ${id} 按钮`);
    listeners.TouchStart(point(button.x + button.width / 2, button.y + button.height / 2));
  }

  function until(predicate, maxSteps = 1200) {
    for (let index = 0; index < maxSteps && !predicate(); index += 1) step();
    assert.ok(predicate(), '游戏应在有限帧内达到预期状态：' + JSON.stringify({ scene: app.scene, state: app.game.state, floors: app.game.floors, lives: app.game.lives, time: app.game.time, topX: app.game.topX, active: app.game.active }));
  }

  return {
    app, audio, canvas, drawing, images, listeners, frames, shares, writes, storage, point,
    platformDestroyCount: () => platformDestroyCount,
    async ready(failName) { settleImages(failName); await app.ready; },
    tapButton,
    tapPlayfield() { listeners.TouchStart(point(app.game.width / 2, app.game.height * 0.6)); },
    resize(nextInfo) { info = nextInfo; listeners.Resize(info); },
    step,
    until,
    settleImages
  };
}

async function startGame(h) {
  await h.ready();
  h.tapButton('start');
  h.step();
}

function landFirstFloor(h) {
  h.tapPlayfield();
  h.until(() => h.app.game.floors === 1);
}

function missNextFloor(h) {
  const game = h.app.game;
  const lives = game.lives;
  h.until(() => game.active && game.active.status === 'swing' &&
    (game.active.x + game.active.width / 2 > game.topX + game.floorWidth + 2 || game.active.x + game.active.width / 2 < game.topX - 2));
  h.tapPlayfield();
  h.until(() => game.lives < lives);
}

test('首次资源加载显示进度，首页不推进游戏或自动播放音频', async t => {
  const h = createHarness(t);
  assert.equal(h.app.scene, 'loading');
  assert.ok(h.drawing.text.includes('正在准备楼层'));
  assert.ok(h.images.every(image => image.src.startsWith('assets/')));
  await h.ready();
  assert.equal(h.app.scene, 'home');
  assert.equal(h.app.loadingPercent, 1);
  assert.ok(h.drawing.text.includes('开始盖楼'));
  h.step();
  h.step(2000);
  assert.equal(h.app.game.time, 0);
  assert.ok(Object.values(h.audio).every(player => !player.playing && player.plays === 0));
});

test('资源失败进入可重试页面，成功重试后回首页', async t => {
  const h = createHarness(t);
  await h.ready('block');
  assert.equal(h.app.scene, 'error');
  assert.ok(h.drawing.text.includes('素材加载遇到问题'));
  const oldImageCount = h.images.length;
  h.tapButton('retry');
  assert.equal(h.app.scene, 'loading');
  assert.ok(h.images.length > oldImageCount);
  await h.ready();
  assert.equal(h.app.scene, 'home');
  assert.equal(h.app.loadingPercent, 1);
  assert.equal(h.app.images.block.src, 'assets/block.png');
});

test('开始按钮只进入游戏，不把同一次触摸当作投楼；顶部 HUD 不投楼', async t => {
  const h = createHarness(t);
  await startGame(h);
  assert.equal(h.app.scene, 'playing');
  assert.equal(h.app.game.active.status, 'swing');
  assert.equal(h.audio.bgm.plays, 1);
  h.listeners.TouchStart(h.point(45, h.app.renderer.safeTop + 24));
  assert.equal(h.app.game.active.status, 'swing');
  h.tapPlayfield();
  assert.equal(h.app.game.active.status, 'falling');
  h.tapPlayfield();
  assert.equal(h.app.game.active.status, 'falling');
  h.until(() => h.app.game.floors === 1);
  assert.equal(h.app.game.score, 25);
  assert.equal(h.audio.drop.restarts, 1);
});

test('手动暂停冻结落楼，继续的首帧不补算暂停时间', async t => {
  const h = createHarness(t);
  await startGame(h);
  h.tapPlayfield();
  h.step(32);
  h.tapButton('pause');
  const y = h.app.game.active.y;
  const gameTime = h.app.game.time;
  assert.equal(h.app.scene, 'paused');
  assert.equal(h.app.game.state, 'paused');
  assert.ok(Object.values(h.audio).every(player => !player.playing));
  h.step(90000);
  assert.equal(h.app.game.active.y, y);
  assert.equal(h.app.game.time, gameTime);
  h.tapButton('resume');
  assert.equal(h.app.scene, 'playing');
  assert.equal(h.app.game.state, 'playing');
  h.step(90000);
  assert.equal(h.app.game.active.y, y);
  h.step();
  assert.ok(h.app.game.active.y > y);
});

test('切后台取消帧并暂停，回前台保持暂停且无自动声音，用户继续才恢复', async t => {
  const h = createHarness(t);
  await startGame(h);
  h.tapPlayfield();
  h.step();
  const y = h.app.game.active.y;
  h.listeners.Hide();
  assert.equal(h.app.scene, 'paused');
  assert.equal(h.frames.size, 0);
  assert.ok(Object.values(h.audio).every(player => !player.playing));
  assert.equal(h.step(3600000), false);
  h.listeners.Show();
  assert.equal(h.app.scene, 'paused');
  assert.equal(h.frames.size, 1);
  assert.equal(h.audio.bgm.plays, 1);
  h.step();
  assert.equal(h.app.game.active.y, y);
  h.tapButton('resume');
  assert.equal(h.audio.bgm.plays, 2);
  h.step(3600000);
  assert.equal(h.app.game.active.y, y);
  h.step();
  assert.ok(h.app.game.active.y > y);
});

test('关闭声音记入设置，暂停页面重新开启后等待用户继续才播放', async t => {
  const h = createHarness(t, { storage: { [SETTINGS_KEY]: { sound: false } } });
  await startGame(h);
  assert.equal(h.audio.bgm.plays, 0);
  landFirstFloor(h);
  assert.equal(h.audio.drop.restarts, 0);
  h.tapButton('pause');
  h.tapButton('sound');
  assert.equal(h.app.settings.sound, true);
  assert.deepEqual(h.storage[SETTINGS_KEY], { sound: true });
  assert.equal(h.audio.bgm.plays, 0);
  h.tapButton('resume');
  assert.equal(h.audio.bgm.plays, 1);
});

test('三次真实掉落进入结算，分享当前成绩，重开恢复完整新一局', async t => {
  const h = createHarness(t);
  await startGame(h);
  landFirstFloor(h);
  for (let count = 0; count < 3; count += 1) missNextFloor(h);
  assert.equal(h.app.scene, 'gameover');
  assert.equal(h.app.game.state, 'gameover');
  assert.equal(h.app.game.lives, 0);
  assert.equal(h.app.game.score, 25);
  assert.equal(h.app.game.floors, 1);
  assert.deepEqual(h.app.record, { score: 25, floors: 1 });
  assert.deepEqual(h.storage[RECORD_KEY], { score: 25, floors: 1 });
  assert.equal(h.audio.bgm.playing, false);
  assert.equal(h.audio['game-over'].restarts, 1);
  h.tapButton('share');
  assert.deepEqual(h.shares, [{ score: 25, floors: 1 }]);
  h.tapButton('restart');
  assert.equal(h.app.scene, 'playing');
  assert.equal(h.app.game.score, 0);
  assert.equal(h.app.game.floors, 0);
  assert.equal(h.app.game.lives, 3);
  assert.equal(h.app.game.combo, 0);
  assert.equal(h.app.game.cameraY, 0);
  assert.equal(h.app.game.blocks.length, 0);
  assert.equal(h.app.game.active.status, 'swing');
  assert.equal(h.app.newRecord, false);
  assert.equal(h.app.feedback, null);
  assert.deepEqual(h.app.record, { score: 25, floors: 1 });
});

test('损坏的历史纪录不会进入计分，合法纪录保留', async t => {
  const invalidRecords = [
    { score: -5, floors: -1 }, { score: '100', floors: '2' },
    { score: NaN, floors: Infinity }, { score: Number.MAX_SAFE_INTEGER + 1, floors: 1.5 }
  ];
  for (const record of invalidRecords) {
    const h = createHarness(t, { storage: { [RECORD_KEY]: record } });
    await h.ready();
    assert.deepEqual(h.app.record, { score: 0, floors: 0 });
    h.app.destroy();
  }
  const h = createHarness(t, { storage: { [RECORD_KEY]: { score: 900, floors: 18 } } });
  await startGame(h);
  landFirstFloor(h);
  assert.deepEqual(h.app.record, { score: 900, floors: 18 });
  assert.equal(h.writes.filter(write => write.key === RECORD_KEY).length, 0);
});

test('纪录与声音设置写入失败提供提示，本局仍能继续操作', async t => {
  const h = createHarness(t, { writeFails: true });
  await startGame(h);
  landFirstFloor(h);
  assert.equal(h.app.scene, 'playing');
  assert.deepEqual(h.app.record, { score: 25, floors: 1 });
  assert.match(h.app.notice, /纪录暂未保存/);
  h.tapButton('pause');
  h.tapButton('sound');
  assert.equal(h.app.settings.sound, false);
  assert.match(h.app.notice, /声音设置暂未保存/);
  h.tapButton('resume');
  assert.equal(h.app.scene, 'playing');
  assert.equal(h.audio.bgm.playing, false);
});

test('高 DPR 与窗口变化保持触摸映射，画布外侧与安全区不触发投楼', async t => {
  const h = createHarness(t, { info: { width: 750, height: 1334, pixelRatio: 3, safeTop: 40, menuBottom: 120, safeBottom: 40 } });
  await startGame(h);
  assert.equal(h.canvas.width, 2250);
  assert.equal(h.canvas.height, 4002);
  h.resize({ width: 900, height: 600, pixelRatio: 2, safeTop: 0, menuBottom: 40, safeBottom: 20 });
  assert.equal(h.canvas.width, 1800);
  assert.equal(h.canvas.height, 1200);
  h.listeners.TouchStart({ x: 10, y: 300 });
  assert.equal(h.app.game.active.status, 'swing');
  h.listeners.TouchStart({ x: 450, y: 599 });
  assert.equal(h.app.game.active.status, 'swing');
  h.tapButton('pause');
  assert.equal(h.app.scene, 'paused');
  h.tapButton('resume');
  h.tapPlayfield();
  assert.equal(h.app.game.active.status, 'falling');
});

test('销毁清理帧、声音和监听，加载晚到不会重新打开页面', async t => {
  const h = createHarness(t);
  const drawCount = h.drawing.count;
  h.app.destroy();
  assert.equal(h.frames.size, 0);
  assert.equal(Object.keys(h.listeners).length, 0);
  assert.equal(h.platformDestroyCount(), 1);
  assert.ok(Object.values(h.audio).every(player => player.destroys === 1 && !player.playing));
  h.settleImages();
  await h.app.ready;
  assert.equal(h.app.scene, 'loading');
  assert.equal(h.drawing.count, drawCount);
  assert.equal(h.step(), false);
});

test('重开清除上局分享失败提示', async t => {
  const h = createHarness(t, { shareFails: true });
  await startGame(h);
  landFirstFloor(h);
  for (let count = 0; count < 3; count += 1) missNextFloor(h);
  h.tapButton('share');
  assert.match(h.app.notice, /分享暂不可用/);
  h.tapButton('restart');
  assert.equal(h.app.scene, 'playing');
  assert.equal(h.app.notice, '');
  assert.equal(h.app.noticeTime, 0);
});
