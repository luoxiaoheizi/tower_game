'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWechatPlatform } = require('../minigame/platform/wechat');

function mockWx(overrides) {
  const listeners = {};
  const removals = [];
  const api = {
    createCanvas: function () { return {}; },
    createImage: function () { return { image: true }; },
    getWindowInfo: function () {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 3, statusBarHeight: 47, safeArea: { top: 47, bottom: 810 } };
    },
    getMenuButtonBoundingClientRect: function () { return { top: 51, bottom: 83 }; }
  };
  ['TouchStart', 'Hide', 'Show', 'WindowResize', 'ShareAppMessage'].forEach(function (name) {
    api['on' + name] = function (callback) { listeners[name] = callback; };
    api['off' + name] = function (callback) {
      removals.push(name);
      if (listeners[name] === callback) delete listeners[name];
    };
  });
  Object.assign(api, overrides);
  return { api: api, listeners: listeners, removals: removals };
}

test('窗口安全区和胶囊使用逻辑像素，现代 API 优先', function () {
  let legacyCalls = 0;
  const wx = mockWx({ getSystemInfoSync: function () { legacyCalls += 1; return {}; } });
  const platform = createWechatPlatform(wx.api);
  assert.deepEqual(platform.getWindowInfo(), {
    width: 390, height: 844, pixelRatio: 3, safeTop: 47, safeBottom: 34, menuBottom: 83
  });
  assert.equal(legacyCalls, 0);
  assert.deepEqual(platform.createImage(), { image: true });
  platform.destroy();
});

test('安全区与胶囊扣除窗口在屏幕中的 screenTop 偏移', function () {
  const wx = mockWx({
    getWindowInfo: function () {
      return { windowWidth: 375, windowHeight: 700, pixelRatio: 2, screenTop: 44, safeArea: { top: 44, bottom: 710 } };
    },
    getMenuButtonBoundingClientRect: function () { return { bottom: 80 }; }
  });
  assert.deepEqual(createWechatPlatform(wx.api).getWindowInfo(), {
    width: 375, height: 700, pixelRatio: 2, safeTop: 0, safeBottom: 34, menuBottom: 36
  });
});

test('窗口 API 失败时回退旧 API，缺少胶囊和安全区时保留顶部操作空间', function () {
  const wx = mockWx({
    getWindowInfo: function () { throw new Error('unsupported'); },
    getSystemInfoSync: function () { return { windowWidth: 320, windowHeight: 568, pixelRatio: 2, statusBarHeight: 20 }; },
    getMenuButtonBoundingClientRect: function () { throw new Error('unavailable'); }
  });
  const platform = createWechatPlatform(wx.api);
  assert.deepEqual(platform.getWindowInfo(), {
    width: 320, height: 568, pixelRatio: 2, safeTop: 20, safeBottom: 0, menuBottom: 60
  });
  wx.api.getSystemInfoSync = undefined;
  assert.deepEqual(platform.getWindowInfo(), {
    width: 375, height: 667, pixelRatio: 1, safeTop: 0, safeBottom: 0, menuBottom: 40
  });
});

test('单指触摸保留零坐标并忽略多指和无效触点', function () {
  const wx = mockWx();
  const platform = createWechatPlatform(wx.api);
  const points = [];
  const unsubscribe = platform.onTouchStart(function (point) { points.push(point); });
  const callback = wx.listeners.TouchStart;
  callback({ touches: [{ clientX: 0, clientY: 10, pageX: 100, pageY: 100 }] });
  callback({ changedTouches: [{ pageX: 20, pageY: 30 }] });
  callback({ touches: [{ clientX: 1, clientY: 2 }, { clientX: 3, clientY: 4 }] });
  callback({ touches: [{ clientX: 1, clientY: 2 }], changedTouches: [{}, {}] });
  callback({ touches: [] });
  callback({ touches: [{ clientX: NaN, clientY: undefined }] });
  assert.deepEqual(points, [{ x: 0, y: 10 }, { x: 20, y: 30 }]);
  unsubscribe();
  unsubscribe();
  callback({ touches: [{ clientX: 50, clientY: 50 }] });
  assert.equal(points.length, 2);
  assert.deepEqual(wx.removals, ['TouchStart']);
});

test('缓存写入失败返回 false，读取失败/不存在回退，0 和 false 可读', function () {
  const values = { score: 0, sound: false, empty: '', missing: undefined };
  const wx = mockWx({
    getStorageSync: function (key) { if (key === 'error') throw new Error('denied'); return values[key]; },
    setStorageSync: function (key, value) { if (key === 'error') throw new Error('quota'); values[key] = value; }
  });
  const platform = createWechatPlatform(wx.api);
  assert.equal(platform.readStorage('score', 99), 0);
  assert.equal(platform.readStorage('sound', true), false);
  ['empty', 'missing', 'error'].forEach(function (key) { assert.equal(platform.readStorage(key, 'fallback'), 'fallback'); });
  assert.equal(platform.writeStorage('best', 123), true);
  assert.equal(platform.readStorage('best', 0), 123);
  assert.equal(platform.writeStorage('error', 123), false);
  wx.api.getStorageSync = undefined;
  wx.api.setStorageSync = undefined;
  assert.equal(platform.readStorage('best', 0), 0);
  assert.equal(platform.writeStorage('best', 1), false);
});

test('Canvas RAF 优先，取消和销毁阻止已经排队的回调', function () {
  const callbacks = [];
  const cancelled = [];
  const wx = mockWx({
    createCanvas: function () {
      return {
        requestAnimationFrame: function (callback) { callbacks.push(callback); return callbacks.length * 10; },
        cancelAnimationFrame: function (id) { cancelled.push(id); }
      };
    },
    requestAnimationFrame: function () { throw new Error('Canvas 应优先'); }
  });
  const platform = createWechatPlatform(wx.api);
  const timestamps = [];
  const first = platform.requestFrame(function (time) { timestamps.push(time); });
  platform.cancelFrame(first);
  callbacks[0](16);
  platform.requestFrame(function (time) { timestamps.push(time); });
  callbacks[1](32);
  platform.requestFrame(function (time) { timestamps.push(time); });
  platform.destroy();
  callbacks[2](48);
  assert.deepEqual(cancelled, [10, 30]);
  assert.deepEqual(timestamps, [32]);
  assert.equal(platform.requestFrame(function () {}), null);
});

test('Canvas RAF 不可用时回退 wx RAF', function () {
  let frame;
  let cancelled;
  const wx = mockWx({
    createCanvas: function () { return { requestAnimationFrame: function () { throw new Error('unsupported'); } }; },
    requestAnimationFrame: function (callback) { frame = callback; return 42; },
    cancelAnimationFrame: function (id) { cancelled = id; }
  });
  const platform = createWechatPlatform(wx.api);
  let calls = 0;
  const id = platform.requestFrame(function () { calls += 1; });
  platform.cancelFrame(id);
  frame(16);
  assert.equal(cancelled, 42);
  assert.equal(calls, 0);
});

test('微信全局 RAF 可用，帧时间戳原样传入', function (t) {
  let callback;
  let cancelled;
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  t.after(function () {
    if (oldRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRequest;
    if (oldCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = oldCancel;
  });
  globalThis.requestAnimationFrame = function (listener) { callback = listener; return 7; };
  globalThis.cancelAnimationFrame = function (id) { cancelled = id; };
  const platform = createWechatPlatform(mockWx().api);
  let timestamp;
  platform.requestFrame(function (value) { timestamp = value; });
  callback(12.5);
  assert.equal(timestamp, 12.5);
  const next = platform.requestFrame(function () {});
  platform.cancelFrame(next);
  assert.equal(cancelled, 7);
});

test('缺少 RAF 时定时器仍推进帧', async function () {
  const platform = createWechatPlatform(mockWx().api);
  const timestamp = await new Promise(function (resolve) { platform.requestFrame(resolve); });
  assert.ok(Number.isFinite(timestamp));
  platform.destroy();
});

test('音频不自动播放，尊重静音开关，重播停止旧声道并释放资源', function () {
  const calls = [];
  let errorListener;
  const context = {
    onError: function (callback) { errorListener = callback; },
    offError: function (callback) { assert.equal(callback, errorListener); calls.push('offError'); },
    play: function () { calls.push('play'); },
    stop: function () { calls.push('stop'); },
    pause: function () { calls.push('pause'); },
    destroy: function () { calls.push('destroy'); }
  };
  const platform = createWechatPlatform(mockWx({ createInnerAudioContext: function () { return context; } }).api);
  const audio = platform.createAudio('assets/place.mp3', { loop: true, volume: 0.4 });
  assert.equal(context.src, 'assets/place.mp3');
  assert.equal(context.autoplay, false);
  assert.equal(context.obeyMuteSwitch, true);
  assert.equal(context.loop, true);
  assert.equal(context.volume, 0.4);
  assert.deepEqual(calls, []);
  assert.equal(audio.play(), true);
  assert.equal(audio.restart(), true);
  audio.pause();
  errorListener({ errMsg: 'file missing' });
  assert.equal(audio.play(), false);
  assert.equal(audio.restart(), false);
  platform.destroy();
  audio.destroy();
  assert.equal(audio.play(), false);
  assert.deepEqual(calls, ['play', 'stop', 'play', 'pause', 'offError', 'destroy']);
});

test('音频缺失、初始化或播放失败不会打断游戏', function () {
  [
    {},
    { createInnerAudioContext: function () { throw new Error('unsupported'); } },
    { createInnerAudioContext: function () { return { play: function () { throw new Error('unavailable'); } }; } }
  ].forEach(function (overrides) {
    const platform = createWechatPlatform(mockWx(overrides).api);
    const audio = platform.createAudio('assets/place.mp3');
    assert.equal(audio.play(), false);
    assert.equal(audio.restart(), false);
    assert.doesNotThrow(function () { audio.pause(); audio.stop(); audio.destroy(); platform.destroy(); });
  });
});

test('注册菜单只提供实时分享文案，主动分享不设置成功回调或奖励', function () {
  const shares = [];
  const menus = [];
  const wx = mockWx({
    shareAppMessage: function (payload) { shares.push(payload); },
    showShareMenu: function (payload) { menus.push(payload); }
  });
  const platform = createWechatPlatform(wx.api);
  const stats = { score: 100, floors: 10 };
  platform.enableShare(function () { return stats; });
  assert.equal(shares.length, 0);
  assert.equal(menus.length, 1);
  stats.score = 150;
  const payload = wx.listeners.ShareAppMessage();
  assert.match(payload.title, /10 层/);
  assert.match(payload.title, /150 分/);
  assert.equal(payload.success, undefined);
  assert.equal(platform.share(50, 5), true);
  assert.match(shares[0].title, /5 层/);
  assert.equal(shares[0].success, undefined);
  platform.enableShare(function () { return { score: 0, floors: 0 }; });
  assert.deepEqual(wx.removals, ['ShareAppMessage']);
  platform.destroy();
  assert.equal(platform.share(50, 5), false);
  assert.equal(shares.length, 1);
});

test('生命周期与窗口监听可清理，老版本缺少 off 方法也不执行已注销回调', function () {
  const wx = mockWx({ offHide: undefined });
  const platform = createWechatPlatform(wx.api);
  let hidden = 0;
  let shown = 0;
  let resized;
  platform.onHide(function () { hidden += 1; });
  platform.onShow(function () { shown += 1; });
  platform.onResize(function (info) { resized = info; });
  const hideListener = wx.listeners.Hide;
  hideListener();
  wx.listeners.Show();
  wx.api.getWindowInfo = function () { return { windowWidth: 320, windowHeight: 640, pixelRatio: 2 }; };
  wx.listeners.WindowResize();
  assert.equal(resized.width, 320);
  assert.equal(resized.height, 640);
  platform.destroy();
  platform.destroy();
  hideListener();
  assert.equal(hidden, 1);
  assert.equal(shown, 1);
  assert.deepEqual(wx.removals.sort(), ['Show', 'WindowResize']);
  assert.equal(platform.writeStorage('score', 10), false);
});
