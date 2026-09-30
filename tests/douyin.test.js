'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDouyinPlatform } = require('../minigame/platform/douyin');

function mockTt(overrides) {
  const listeners = {};
  const removals = [];
  const api = {
    createCanvas: function () { return {}; },
    createImage: function () { return { image: true }; },
    getSystemInfoSync: function () {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 47, bottom: 810 } };
    },
    getMenuButtonLayout: function () { return { top: 51, bottom: 83 }; },
    getLaunchOptionsSync: function () { return {}; }
  };
  ['TouchStart', 'Hide', 'Show', 'WindowResize', 'ShareAppMessage'].forEach(function (name) {
    listeners[name] = new Set();
    api['on' + name] = function (callback) { listeners[name].add(callback); };
    api['off' + name] = function (callback) { removals.push(name); listeners[name].delete(callback); };
  });
  Object.assign(api, overrides);
  return {
    api: api, listeners: listeners, removals: removals,
    emit: function (name, value) { return Array.from(listeners[name]).map(function (callback) { return callback(value); }); }
  };
}

test('抖音仅创建一个上屏 Canvas，缺少小游戏环境时给出明确错误', function () {
  assert.throws(function () { createDouyinPlatform({}); }, /tt.createCanvas/);
  let created = 0;
  const canvas = {};
  const tt = mockTt({ createCanvas: function () { created += 1; return canvas; } });
  const platform = createDouyinPlatform(tt.api);
  assert.equal(platform.canvas, canvas);
  assert.equal(created, 1);
  assert.deepEqual(platform.createImage(), { image: true });
  platform.destroy();
});

test('抖音使用 getSystemInfoSync 和 getMenuButtonLayout 的逻辑像素', function () {
  const tt = mockTt({
    getWindowInfo: function () { throw new Error('不能依赖微信窗口 API'); },
    getMenuButtonBoundingClientRect: function () { throw new Error('不能依赖微信胶囊 API'); }
  });
  const platform = createDouyinPlatform(tt.api);
  assert.deepEqual(platform.getWindowInfo(), {
    width: 390, height: 844, pixelRatio: 3, safeTop: 47, safeBottom: 34, menuBottom: 83
  });
  platform.destroy();
});

test('抖音系统信息、胶囊、安全区缺失或异常时仍有可用布局', function () {
  const tt = mockTt({
    getSystemInfoSync: function () { return { screenWidth: 320, screenHeight: 568, pixelRatio: 0, statusBarHeight: 20 }; },
    getMenuButtonLayout: function () { throw new Error('unsupported'); }
  });
  const platform = createDouyinPlatform(tt.api);
  assert.deepEqual(platform.getWindowInfo(), {
    width: 320, height: 568, pixelRatio: 1, safeTop: 20, safeBottom: 0, menuBottom: 60
  });
  tt.api.getSystemInfoSync = function () { throw new Error('unavailable'); };
  assert.deepEqual(platform.getWindowInfo(), {
    width: 375, height: 667, pixelRatio: 1, safeTop: 0, safeBottom: 0, menuBottom: 40
  });
  tt.api.getSystemInfoSync = function () { return { safeArea: { top: -50, bottom: 9999 } }; };
  assert.equal(platform.getWindowInfo().safeTop, 0);
  assert.equal(platform.getWindowInfo().safeBottom, 0);
  platform.destroy();
});

test('抖音单指触摸保留零坐标并拒绝多指、无效和已注销触点', function () {
  const tt = mockTt({ offTouchStart: undefined });
  const platform = createDouyinPlatform(tt.api);
  const points = [];
  const off = platform.onTouchStart(function (point) { points.push(point); });
  tt.emit('TouchStart', { touches: [{ clientX: 0, clientY: 0, pageX: 30, pageY: 30 }] });
  tt.emit('TouchStart', { changedTouches: [{ pageX: 20, pageY: 30 }] });
  tt.emit('TouchStart', { touches: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
  tt.emit('TouchStart', { touches: [{ x: NaN, y: 2 }] });
  off();
  off();
  tt.emit('TouchStart', { touches: [{ x: 50, y: 60 }] });
  assert.deepEqual(points, [{ x: 0, y: 0 }, { x: 20, y: 30 }]);
  platform.destroy();
});

test('抖音本地缓存保留 0 和 false，拒绝或超额时回退且销毁后不写入', function () {
  const values = { score: 0, sound: false, empty: '' };
  const platform = createDouyinPlatform(mockTt({
    getStorageSync: function (key) { if (key === 'error') throw new Error('denied'); return values[key]; },
    setStorageSync: function (key, value) { if (key === 'error') throw new Error('quota'); values[key] = value; }
  }).api);
  assert.equal(platform.readStorage('score', 99), 0);
  assert.equal(platform.readStorage('sound', true), false);
  ['empty', 'error', 'missing'].forEach(function (key) { assert.equal(platform.readStorage(key, 'fallback'), 'fallback'); });
  assert.equal(platform.writeStorage('best', 100), true);
  assert.equal(platform.readStorage('best', 0), 100);
  assert.equal(platform.writeStorage('error', 100), false);
  platform.destroy();
  assert.equal(platform.writeStorage('best', 200), false);
  assert.equal(values.best, 100);
});

test('抖音优先全局 RAF，取消及销毁均阻止过期帧回调', function (t) {
  const callbacks = [];
  const cancelled = [];
  t.mock.method(globalThis, 'setTimeout', function () { throw new Error('不应使用定时器'); });
  const oldRequest = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  t.after(function () {
    if (oldRequest === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = oldRequest;
    if (oldCancel === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = oldCancel;
  });
  globalThis.requestAnimationFrame = function (callback) { callbacks.push(callback); return callbacks.length; };
  globalThis.cancelAnimationFrame = function (id) { cancelled.push(id); };
  const platform = createDouyinPlatform(mockTt({
    createCanvas: function () { return { requestAnimationFrame: function () { throw new Error('全局优先'); } }; }
  }).api);
  const times = [];
  platform.cancelFrame(platform.requestFrame(function (time) { times.push(time); }));
  callbacks[0](16);
  platform.requestFrame(function (time) { times.push(time); });
  callbacks[1](32.5);
  platform.requestFrame(function (time) { times.push(time); });
  platform.destroy();
  callbacks[2](48);
  assert.deepEqual(times, [32.5]);
  assert.deepEqual(cancelled, [1, 3]);
  assert.equal(platform.requestFrame(function () {}), null);
});

test('抖音工具 Canvas RAF 抛错时可回退到宿主 RAF', function () {
  let frame;
  let cancelled;
  const platform = createDouyinPlatform(mockTt({
    createCanvas: function () { return { requestAnimationFrame: function () { throw new Error('stub'); } }; },
    requestAnimationFrame: function (callback) { frame = callback; return 42; },
    cancelAnimationFrame: function (id) { cancelled = id; }
  }).api);
  let calls = 0;
  platform.cancelFrame(platform.requestFrame(function () { calls += 1; }));
  frame(16);
  assert.equal(cancelled, 42);
  assert.equal(calls, 0);
  platform.destroy();
});

test('抖音缺少全部 RAF 时定时器仍推进游戏', async function () {
  const platform = createDouyinPlatform(mockTt().api);
  const timestamp = await new Promise(function (resolve) { platform.requestFrame(resolve); });
  assert.ok(Number.isFinite(timestamp));
  platform.destroy();
});

test('抖音音频不自动播放，重播重新设置 src，异步出错后静默且可释放', function () {
  const calls = [];
  let errorListener;
  let source;
  const context = {
    obeyMuteSwitch: false,
    set src(value) { source = value; calls.push('src'); },
    get src() { return source; },
    onError: function (callback) { errorListener = callback; },
    offError: function (callback) { assert.equal(callback, errorListener); calls.push('offError'); },
    play: function () { calls.push('play'); },
    stop: function () { calls.push('stop'); },
    pause: function () { calls.push('pause'); },
    destroy: function () { calls.push('destroy'); }
  };
  const platform = createDouyinPlatform(mockTt({ createInnerAudioContext: function () { return context; } }).api);
  const audio = platform.createAudio('assets/drop.mp3', { loop: true, volume: 0.4 });
  assert.equal(context.autoplay, false);
  assert.equal(context.obeyMuteSwitch, true);
  assert.equal(context.loop, true);
  assert.equal(context.volume, 0.4);
  assert.equal(context.src, 'assets/drop.mp3');
  assert.deepEqual(calls, ['src']);
  assert.equal(audio.restart(), true);
  audio.pause();
  errorListener({ errMsg: 'bad audio' });
  assert.equal(audio.play(), false);
  platform.destroy();
  audio.destroy();
  assert.deepEqual(calls, ['src', 'stop', 'src', 'play', 'pause', 'offError', 'destroy']);
});

test('抖音可选静音属性不可写时仍可播放，缺少音频能力也不会打断游戏', function () {
  const context = { play: function () {} };
  Object.defineProperty(context, 'obeyMuteSwitch', { get: function () { return true; }, set: function () { throw new Error('readonly'); } });
  const platform = createDouyinPlatform(mockTt({ createInnerAudioContext: function () { return context; } }).api);
  assert.equal(platform.createAudio('assets/bgm.mp3').play(), true);
  platform.destroy();
  [{}, { createInnerAudioContext: function () { throw new Error('unsupported'); } }, {
    createInnerAudioContext: function () { return { play: function () { throw new Error('unavailable'); } }; }
  }].forEach(function (overrides) {
    const fallback = createDouyinPlatform(mockTt(overrides).api);
    const audio = fallback.createAudio('assets/drop.mp3');
    assert.equal(audio.play(), false);
    assert.equal(audio.restart(), false);
    assert.doesNotThrow(function () { audio.pause(); audio.stop(); audio.destroy(); fallback.destroy(); });
  });
});

test('抖音分享返回受理状态，取消或异步失败通知一次，销毁后不再通知', function () {
  const shares = [];
  const tt = mockTt({ shareAppMessage: function (payload) { shares.push(payload); } });
  const platform = createDouyinPlatform(tt.api);
  let failures = 0;
  assert.equal(platform.share(50, 5, function () { failures += 1; }), true);
  assert.equal(shares[0].title, '一起盖高楼');
  assert.match(shares[0].desc, /5层.*50分/);
  assert.equal(shares[0].query, 'from=share');
  assert.equal(shares[0].success, undefined);
  assert.equal(shares[0].channel, undefined);
  shares[0].fail({ errMsg: 'cancel' });
  shares[0].fail({ errMsg: 'cancel' });
  assert.equal(failures, 1);
  platform.share(10, 1, function () { failures += 1; });
  platform.destroy();
  shares[1].fail({ errMsg: 'network' });
  assert.equal(failures, 1);
  assert.equal(platform.share(1, 1), false);
});

test('抖音分享不可用或同步抛错返回 false，菜单采用抖音参数并读取实时成绩', function () {
  const menus = [];
  const tt = mockTt({ showShareMenu: function (payload) { menus.push(payload); } });
  const platform = createDouyinPlatform(tt.api);
  assert.equal(platform.share(0, 0), false);
  tt.api.shareAppMessage = function () { throw new Error('no permission'); };
  assert.equal(platform.share(0, 0), false);
  const stats = { score: 10, floors: 1 };
  platform.enableShare(function () { return stats; });
  assert.equal(menus.length, 1);
  assert.equal(menus[0].menus, undefined);
  stats.score = 200;
  const payload = tt.emit('ShareAppMessage', { channel: 'invite' })[0];
  assert.match(payload.desc, /200分/);
  assert.equal(payload.success, undefined);
  platform.enableShare(function () { return { score: 0, floors: 0 }; });
  assert.equal(tt.listeners.ShareAppMessage.size, 1);
  assert.deepEqual(tt.removals, ['ShareAppMessage']);
  platform.destroy();
});

test('抖音创建适配器时同步监听 onShow，冷启动用完整入口字段判断侧边栏', function () {
  const tt = mockTt({
    getLaunchOptionsSync: function () { return { launch_from: 'homepage', location: 'sidebar_card' }; },
    checkScene: function (options) { assert.equal(tt.listeners.Show.size, 1); options.success({ isExist: true }); },
    navigateToScene: function () { throw new Error('初始化不能导航'); }
  });
  const platform = createDouyinPlatform(tt.api);
  assert.deepEqual(platform.getSidebarState(), { supported: true, fromSidebar: true });
  const snapshot = platform.getSidebarState();
  snapshot.supported = false;
  assert.equal(platform.getSidebarState().supported, true);
  platform.destroy();
});

test('抖音侧边栏检测异步通知，热启动使用最新 onShow 且先于应用恢复更新', function () {
  let check;
  let navigations = 0;
  const tt = mockTt({ checkScene: function (options) { check = options; }, navigateToScene: function () { navigations += 1; } });
  const platform = createDouyinPlatform(tt.api);
  const states = [];
  const off = platform.onSidebarChange(function (state) { states.push(state); });
  assert.deepEqual(platform.getSidebarState(), { supported: false, fromSidebar: false });
  assert.equal(check.scene, 'sidebar');
  check.success({ isExist: true });
  let stateAtShow;
  platform.onShow(function () { stateAtShow = platform.getSidebarState(); });
  tt.emit('Show', { launch_from: 'homepage', location: 'sidebar_card' });
  assert.deepEqual(stateAtShow, { supported: true, fromSidebar: true });
  tt.emit('Show', { scene: '021036', launch_from: 'homepage', location: 'other' });
  assert.equal(platform.getSidebarState().fromSidebar, false);
  tt.emit('Show', undefined);
  assert.deepEqual(states, [
    { supported: true, fromSidebar: false }, { supported: true, fromSidebar: true }, { supported: true, fromSidebar: false }
  ]);
  assert.equal(navigations, 0);
  off();
  tt.emit('Show', { launch_from: 'homepage', location: 'sidebar_card' });
  assert.equal(states.length, 3);
  platform.destroy();
});

test('抖音侧边栏在能力缺失、检测失败和其他宿主不支持时保持隐藏', function () {
  [
    {},
    { navigateToScene: function () {}, checkScene: function () { throw new Error('unsupported'); } },
    { navigateToScene: function () {}, checkScene: function (options) { options.fail({}); } },
    { navigateToScene: function () {}, checkScene: function (options) { options.success({ isExist: false }); } },
    { checkScene: function (options) { options.success({ isExist: true }); } }
  ].forEach(function (overrides) {
    const platform = createDouyinPlatform(mockTt(overrides).api);
    assert.equal(platform.getSidebarState().supported, false);
    assert.equal(platform.navigateToSidebar(), false);
    platform.destroy();
  });
});

test('抖音侧边栏导航只在主动调用时受理并反馈异步失败，不把跳转当复访', function () {
  const navigations = [];
  const tt = mockTt({
    checkScene: function (options) { options.success({ isExist: true }); },
    navigateToScene: function (options) { navigations.push(options); }
  });
  const platform = createDouyinPlatform(tt.api);
  let failures = 0;
  assert.equal(navigations.length, 0);
  assert.equal(platform.navigateToSidebar(function () { failures += 1; }), true);
  assert.equal(navigations[0].scene, 'sidebar');
  assert.equal(navigations[0].success, undefined);
  assert.equal(platform.getSidebarState().fromSidebar, false);
  navigations[0].fail({ errMsg: 'not accessible' });
  assert.equal(failures, 1);
  tt.api.navigateToScene = function () { throw new Error('unsupported'); };
  assert.equal(platform.navigateToSidebar(), false);
  platform.destroy();
  assert.equal(platform.navigateToSidebar(), false);
});

test('抖音生命周期与侧边栏待返回检测在销毁后全部失效', function () {
  let check;
  const tt = mockTt({
    offShow: undefined, offHide: undefined,
    checkScene: function (options) { check = options; }, navigateToScene: function () {}
  });
  const platform = createDouyinPlatform(tt.api);
  let calls = 0;
  platform.onShow(function () { calls += 1; });
  platform.onHide(function () { calls += 1; });
  platform.onSidebarChange(function () { calls += 1; });
  platform.destroy();
  platform.destroy();
  check.success({ isExist: true });
  tt.emit('Show', { launch_from: 'homepage', location: 'sidebar_card' });
  tt.emit('Hide');
  assert.equal(calls, 0);
  assert.deepEqual(platform.getSidebarState(), { supported: false, fromSidebar: false });
});

test('抖音窗口变化或回到前台都会刷新安全区，取消订阅后停止刷新', function () {
  const tt = mockTt();
  const platform = createDouyinPlatform(tt.api);
  const widths = [];
  const off = platform.onResize(function (info) { widths.push(info.width); });
  tt.emit('WindowResize');
  tt.api.getSystemInfoSync = function () { return { windowWidth: 320, windowHeight: 640 }; };
  tt.emit('Show', {});
  off();
  tt.emit('WindowResize');
  tt.emit('Show', {});
  assert.deepEqual(widths, [390, 320]);
  platform.destroy();
});

test('抖音震动不传微信专属 type 参数，缺失能力时可继续游戏', function () {
  let payload;
  const tt = mockTt({ vibrateShort: function (options) { payload = options; } });
  const platform = createDouyinPlatform(tt.api);
  assert.equal(platform.vibrate(), true);
  assert.equal(payload.type, undefined);
  tt.api.vibrateShort = undefined;
  assert.equal(platform.vibrate(), false);
  platform.destroy();
});
