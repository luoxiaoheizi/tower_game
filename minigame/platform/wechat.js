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

function createWechatPlatform(wxApi) {
  if (!wxApi || typeof wxApi.createCanvas !== 'function') {
    throw new Error('请在微信小游戏环境中运行，当前缺少 wx.createCanvas。');
  }
  const canvas = wxApi.createCanvas();
  const subscriptions = new Set();
  const audioPlayers = new Set();
  const frames = new Map();
  let nextFrameId = 0;
  let destroyed = false;
  let shareUnsubscribe = noop;

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
    if (typeof wxApi[method] !== 'function') return null;
    try {
      return wxApi[method]() || null;
    } catch (error) {
      return null;
    }
  }

  function getWindowInfo() {
    let info = readInfo('getWindowInfo');
    if (!info || !positive(info.windowWidth, 0) || !positive(info.windowHeight, 0)) {
      info = readInfo('getSystemInfoSync') || info || {};
    }
    const width = positive(info.windowWidth, positive(info.screenWidth, 375));
    const height = positive(info.windowHeight, positive(info.screenHeight, 667));
    const pixelRatio = positive(info.pixelRatio, 1);
    const screenTop = Math.max(0, finite(info.screenTop, 0));
    const safeArea = info.safeArea || {};
    // 微信安全区、胶囊坐标以屏幕为原点；渲染与触摸都使用窗口逻辑像素。
    const safeTop = clamp(finite(safeArea.top, finite(info.statusBarHeight, 0)) - screenTop, 0, height);
    const safeBottom = clamp(screenTop + height - finite(safeArea.bottom, screenTop + height), 0, height);
    const menu = readInfo('getMenuButtonBoundingClientRect');
    const fallbackMenuBottom = safeTop + 40;
    const menuBottom = clamp(menu && positive(menu.bottom, 0)
      ? Math.max(safeTop, menu.bottom - screenTop)
      : fallbackMenuBottom, safeTop, height);
    return { width, height, pixelRatio, safeTop, safeBottom, menuBottom };
  }

  function subscribe(onName, offName, callback) {
    if (destroyed || typeof wxApi[onName] !== 'function') return noop;
    let active = true;
    const listener = function (event) {
      if (active && !destroyed) return callback(event);
      return undefined;
    };
    if (!invoke(wxApi, onName, [listener])) return noop;
    const unsubscribe = function () {
      if (!active) return;
      active = false;
      subscriptions.delete(unsubscribe);
      invoke(wxApi, offName, [listener]);
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  const frameSources = [];
  [canvas, wxApi].forEach(function (source) {
    if (source && typeof source.requestAnimationFrame === 'function') {
      frameSources.push({
        request: source.requestAnimationFrame.bind(source),
        cancel: typeof source.cancelAnimationFrame === 'function'
          ? source.cancelAnimationFrame.bind(source) : noop
      });
    }
  });
  if (typeof requestAnimationFrame === 'function') {
    frameSources.push({
      request: requestAnimationFrame,
      cancel: typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : noop
    });
  }
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
      } catch (error) {
        // 某些开发者工具提供未实现的 RAF，继续使用下一种帧时钟。
      }
    }
    frames.delete(id);
    return null;
  }

  function cancelFrame(id) {
    const frame = frames.get(id);
    if (!frame) return;
    frames.delete(id);
    try { frame.cancel(frame.nativeId); } catch (error) { /* 回调仍受 frames 校验。 */ }
  }

  function createAudio(src, options) {
    const settings = options || {};
    let context = null;
    let disposed = destroyed;
    let failed = false;
    const onError = function () { failed = true; };
    if (!disposed && typeof wxApi.createInnerAudioContext === 'function') {
      try {
        context = wxApi.createInnerAudioContext();
        context.autoplay = false;
        context.loop = Boolean(settings.loop);
        context.volume = clamp(finite(settings.volume, 1), 0, 1);
        context.obeyMuteSwitch = true;
        invoke(context, 'onError', [onError]);
        context.src = src;
      } catch (error) {
        failed = true;
      }
    }
    function play() {
      return !disposed && !failed && invoke(context, 'play');
    }
    const player = {
      play: play,
      restart: function () {
        if (disposed || failed || !context) return false;
        invoke(context, 'stop');
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
    return { title: '我盖到了 ' + count + ' 层，拿下 ' + points + ' 分！来一起盖高楼', query: 'from=share' };
  }

  return {
    canvas: canvas,
    getWindowInfo: getWindowInfo,
    createImage: function () { return wxApi.createImage(); },
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
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        callback({ x: x, y: y });
      });
    },
    onHide: function (callback) { return subscribe('onHide', 'offHide', callback); },
    onShow: function (callback) { return subscribe('onShow', 'offShow', callback); },
    onResize: function (callback) {
      return subscribe('onWindowResize', 'offWindowResize', function () { callback(getWindowInfo()); });
    },
    readStorage: function (key, fallback) {
      if (typeof wxApi.getStorageSync !== 'function') return fallback;
      try {
        const value = wxApi.getStorageSync(key);
        return value === '' || value === undefined || value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    writeStorage: function (key, value) { return !destroyed && invoke(wxApi, 'setStorageSync', [key, value]); },
    createAudio: createAudio,
    // 返回值仅表示分享面板调用已受理，不代表用户完成分享。
    share: function (score, floors) { return !destroyed && invoke(wxApi, 'shareAppMessage', [sharePayload(score, floors)]); },
    enableShare: function (getStats) {
      shareUnsubscribe();
      if (destroyed) return noop;
      invoke(wxApi, 'showShareMenu', [{ menus: ['shareAppMessage'], fail: noop }]);
      shareUnsubscribe = subscribe('onShareAppMessage', 'offShareAppMessage', function () {
        const stats = typeof getStats === 'function' ? getStats() || {} : {};
        return sharePayload(stats.score, stats.floors);
      });
      return shareUnsubscribe;
    },
    vibrate: function () { return !destroyed && invoke(wxApi, 'vibrateShort', [{ type: 'light', fail: noop }]); },
    destroy: function () {
      if (destroyed) return;
      destroyed = true;
      Array.from(subscriptions).forEach(function (unsubscribe) { unsubscribe(); });
      Array.from(frames.keys()).forEach(cancelFrame);
      Array.from(audioPlayers).forEach(function (player) { player.destroy(); });
    }
  };
}

module.exports = { createWechatPlatform: createWechatPlatform };
