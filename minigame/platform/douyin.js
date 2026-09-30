'use strict';

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return finite(value, 0) > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function noop() {}

function createDouyinPlatform(tt) {
  if (!tt || typeof tt.createCanvas !== 'function') {
    throw new Error('请在抖音小游戏环境中运行，当前缺少 tt.createCanvas。');
  }
  // 抖音首次 createCanvas 返回上屏 Canvas，整个适配层只创建一次。
  const canvas = tt.createCanvas();
  const subscriptions = new Set();
  const showListeners = new Set();
  const sidebarListeners = new Set();
  const audioPlayers = new Set();
  const frames = new Map();
  let nextFrameId = 0;
  let destroyed = false;
  let shareUnsubscribe = noop;
  let sidebarSupported = false;
  let fromSidebar = false;

  function invoke(target, method, args) {
    if (!target || typeof target[method] !== 'function') return false;
    try {
      target[method].apply(target, args || []);
      return true;
    } catch (error) {
      return false;
    }
  }

  function readInfo(method) {
    if (typeof tt[method] !== 'function') return null;
    try { return tt[method]() || null; } catch (error) { return null; }
  }

  function getWindowInfo() {
    // 抖音小游戏使用 getSystemInfoSync 和 getMenuButtonLayout，均为逻辑像素。
    const info = readInfo('getSystemInfoSync') || {};
    const width = positive(info.windowWidth, positive(info.screenWidth, 375));
    const height = positive(info.windowHeight, positive(info.screenHeight, 667));
    const safeArea = info.safeArea || {};
    const safeTop = clamp(finite(safeArea.top, finite(info.statusBarHeight, 0)), 0, height);
    const safeBottom = clamp(height - finite(safeArea.bottom, height), 0, height);
    const menu = readInfo('getMenuButtonLayout');
    const menuBottom = clamp(menu && positive(menu.bottom, 0)
      ? Math.max(safeTop, menu.bottom) : safeTop + 40, safeTop, height);
    return { width: width, height: height, pixelRatio: positive(info.pixelRatio, 1), safeTop: safeTop, safeBottom: safeBottom, menuBottom: menuBottom };
  }

  function subscribe(onName, offName, callback) {
    if (destroyed || typeof tt[onName] !== 'function') return noop;
    let active = true;
    const listener = function (event) {
      if (active && !destroyed) return callback(event);
      return undefined;
    };
    if (!invoke(tt, onName, [listener])) return noop;
    const unsubscribe = function () {
      if (!active) return;
      active = false;
      subscriptions.delete(unsubscribe);
      invoke(tt, offName, [listener]);
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  function subscribeLocal(listeners, callback) {
    if (destroyed || typeof callback !== 'function') return noop;
    listeners.add(callback);
    return function () { listeners.delete(callback); };
  }

  function getSidebarState() {
    return { supported: sidebarSupported, fromSidebar: fromSidebar };
  }

  function updateSidebar(supported, entry) {
    if (destroyed || (sidebarSupported === supported && fromSidebar === entry)) return;
    sidebarSupported = supported;
    fromSidebar = entry;
    sidebarListeners.forEach(function (callback) { callback(getSidebarState()); });
  }

  function isSidebarEntry(options) {
    return Boolean(options && options.launch_from === 'homepage' && options.location === 'sidebar_card');
  }

  fromSidebar = isSidebarEntry(readInfo('getLaunchOptionsSync'));
  // 必须在 game.js 同步创建平台时注册，热启动以最新 onShow 参数为准。
  subscribe('onShow', 'offShow', function (options) {
    updateSidebar(sidebarSupported, isSidebarEntry(options));
    showListeners.forEach(function (callback) { callback(options); });
  });
  if (typeof tt.checkScene === 'function' && typeof tt.navigateToScene === 'function') {
    try {
      tt.checkScene({
        scene: 'sidebar',
        success: function (result) { updateSidebar(Boolean(result && result.isExist === true), fromSidebar); },
        fail: function () { updateSidebar(false, fromSidebar); }
      });
    } catch (error) { /* 不支持侧边栏的宿主仍可正常游戏。 */ }
  }

  const frameSources = [];
  // 抖音官方帧时钟位于全局对象，不能假设 tt 或 Canvas 自带 RAF。
  if (typeof requestAnimationFrame === 'function') {
    frameSources.push({
      request: requestAnimationFrame,
      cancel: typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : noop
    });
  }
  [canvas, tt].forEach(function (source) {
    if (source && typeof source.requestAnimationFrame === 'function') {
      frameSources.push({
        request: source.requestAnimationFrame.bind(source),
        cancel: typeof source.cancelAnimationFrame === 'function' ? source.cancelAnimationFrame.bind(source) : noop
      });
    }
  });
  frameSources.push({
    request: function (callback) { return setTimeout(function () { callback(Date.now()); }, 1000 / 60); },
    cancel: clearTimeout
  });

  function requestFrame(callback) {
    if (destroyed) return null;
    const id = ++nextFrameId;
    const frame = { nativeId: null, cancel: noop };
    frames.set(id, frame);
    const listener = function (timestamp) {
      if (destroyed || !frames.has(id)) return;
      frames.delete(id);
      callback(finite(timestamp, Date.now()));
    };
    for (let index = 0; index < frameSources.length; index += 1) {
      try {
        const source = frameSources[index];
        frame.cancel = source.cancel;
        frame.nativeId = source.request(listener);
        return id;
      } catch (error) { /* 未实现的工具 API 回退到下一种帧时钟。 */ }
    }
    frames.delete(id);
    return null;
  }

  function cancelFrame(id) {
    const frame = frames.get(id);
    if (!frame) return;
    frames.delete(id);
    try { frame.cancel(frame.nativeId); } catch (error) { /* 仍会拦截过期回调。 */ }
  }

  function createAudio(src, options) {
    const settings = options || {};
    let context = null;
    let disposed = destroyed;
    let failed = false;
    const onError = function () { failed = true; };
    if (!disposed && typeof tt.createInnerAudioContext === 'function') {
      try {
        context = tt.createInnerAudioContext();
        context.autoplay = false;
        context.loop = Boolean(settings.loop);
        context.volume = clamp(finite(settings.volume, 1), 0, 1);
        // 宿主音频实现不同，不因可选静音属性不可写而禁用整个声道。
        if ('obeyMuteSwitch' in context) {
          try { context.obeyMuteSwitch = true; } catch (error) { /* 保持宿主默认静音策略。 */ }
        }
        invoke(context, 'onError', [onError]);
        context.src = src;
      } catch (error) { failed = true; }
    }
    function play() { return !disposed && !failed && invoke(context, 'play'); }
    const player = {
      play: play,
      restart: function () {
        if (disposed || failed || !context) return false;
        invoke(context, 'stop');
        try { context.src = src; } catch (error) { return false; }
        return play();
      },
      pause: function () { return !disposed && invoke(context, 'pause'); },
      stop: function () { return !disposed && invoke(context, 'stop'); },
      destroy: function () {
        if (disposed) return;
        disposed = true;
        audioPlayers.delete(player);
        invoke(context, 'offError', [onError]);
        invoke(context, 'destroy');
        context = null;
      }
    };
    if (!disposed) audioPlayers.add(player);
    return player;
  }

  function sharePayload(score, floors) {
    const points = Math.max(0, Math.floor(finite(score, 0)));
    const count = Math.max(0, Math.floor(finite(floors, 0)));
    // 无 templateId 时使用后台配置或平台兜底分享素材，正式上线前配置审核素材。
    return { title: '一起盖高楼', desc: '我盖到' + count + '层，拿下' + points + '分！你能盖多高？', query: 'from=share' };
  }

  function failureCallback(callback) {
    let notified = false;
    return function (error) {
      if (destroyed || notified) return;
      notified = true;
      if (typeof callback === 'function') callback(error);
    };
  }

  return {
    canvas: canvas,
    getWindowInfo: getWindowInfo,
    createImage: function () { return tt.createImage(); },
    requestFrame: requestFrame,
    cancelFrame: cancelFrame,
    onTouchStart: function (callback) {
      return subscribe('onTouchStart', 'offTouchStart', function (event) {
        const touchEvent = event || {};
        const touches = touchEvent.touches || touchEvent.changedTouches || [];
        if (touches.length !== 1 || (touchEvent.changedTouches && touchEvent.changedTouches.length > 1)) return;
        const touch = touches[0];
        const x = finite(touch.clientX, finite(touch.pageX, touch.x));
        const y = finite(touch.clientY, finite(touch.pageY, touch.y));
        if (Number.isFinite(x) && Number.isFinite(y)) callback({ x: x, y: y });
      });
    },
    onHide: function (callback) { return subscribe('onHide', 'offHide', callback); },
    onShow: function (callback) { return subscribeLocal(showListeners, callback); },
    onResize: function (callback) {
      const resize = function () { callback(getWindowInfo()); };
      const offResize = subscribe('onWindowResize', 'offWindowResize', resize);
      // 老宿主没有窗口事件，回到前台也重新读取尺寸和安全区。
      const offShow = subscribeLocal(showListeners, resize);
      return function () { offResize(); offShow(); };
    },
    readStorage: function (key, fallback) {
      if (typeof tt.getStorageSync !== 'function') return fallback;
      try {
        const value = tt.getStorageSync(key);
        return value === '' || value === undefined || value === null ? fallback : value;
      } catch (error) { return fallback; }
    },
    writeStorage: function (key, value) { return !destroyed && invoke(tt, 'setStorageSync', [key, value]); },
    createAudio: createAudio,
    // true 仅代表受理调用；失败或取消由 onFailure 通知，不据此发放任何奖励。
    share: function (score, floors, onFailure) {
      if (destroyed || typeof tt.shareAppMessage !== 'function') return false;
      const payload = sharePayload(score, floors);
      payload.fail = failureCallback(onFailure);
      try { tt.shareAppMessage(payload); return true; } catch (error) { return false; }
    },
    enableShare: function (getStats) {
      shareUnsubscribe();
      if (destroyed) return noop;
      if (typeof tt.showShareMenu === 'function') {
        try { tt.showShareMenu({ fail: noop }); } catch (error) { /* 菜单失败不影响单机游戏。 */ }
      }
      shareUnsubscribe = subscribe('onShareAppMessage', 'offShareAppMessage', function () {
        const stats = typeof getStats === 'function' ? getStats() || {} : {};
        return sharePayload(stats.score, stats.floors);
      });
      return shareUnsubscribe;
    },
    getSidebarState: getSidebarState,
    onSidebarChange: function (callback) { return subscribeLocal(sidebarListeners, callback); },
    // 只能由玩家点击入口调用；初始化、onShow 和 checkScene 绝不导航。
    navigateToSidebar: function (onFailure) {
      if (destroyed || !sidebarSupported || typeof tt.navigateToScene !== 'function') return false;
      try {
        tt.navigateToScene({ scene: 'sidebar', fail: failureCallback(onFailure) });
        return true;
      } catch (error) { return false; }
    },
    vibrate: function () { return !destroyed && invoke(tt, 'vibrateShort', [{ fail: noop }]); },
    destroy: function () {
      if (destroyed) return;
      destroyed = true;
      Array.from(subscriptions).forEach(function (unsubscribe) { unsubscribe(); });
      showListeners.clear();
      sidebarListeners.clear();
      Array.from(frames.keys()).forEach(cancelFrame);
      Array.from(audioPlayers).forEach(function (player) { player.destroy(); });
    }
  };
}

module.exports = { createDouyinPlatform: createDouyinPlatform };
