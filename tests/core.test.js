'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TowerGame, RULES } = require('../minigame/core/game');

const createGame = () => new TowerGame({ random: () => 0.5 });

function advanceUntil(game, predicate, maxSeconds = 5) {
  for (let i = 0; i < maxSeconds * 120; i += 1) {
    if (predicate()) return;
    game.update(1 / 120);
  }
  assert.ok(predicate(), '预期状态应在有限时间内到达');
}

function place(game, offset = 0) {
  advanceUntil(game, () => game.active && game.active.status === 'swing');
  assert.equal(game.drop(), true);
  game.active.x = game.topX + offset;
  game.active.y = game.topY - game.floorHeight - 0.1;
  advanceUntil(game, () => !game.active);
  return game.drainEvents();
}

test('首层静止、点击松手、首层普通落地 25 分', () => {
  const game = createGame();
  const x = game.active.x;
  game.update(0.1);
  game.update(0.1);
  assert.equal(game.active.x, x);
  assert.equal(game.active.angle, 0);
  assert.equal(game.drop(), true);
  assert.equal(game.drop(), false);
  advanceUntil(game, () => game.floors === 1);
  assert.equal(game.score, 25);
  assert.equal(game.lives, 3);
  assert.equal(game.blocks.length, 1);
  assert.deepEqual(game.drainEvents().map(event => event.type), ['land']);
});

test('完美加分为 50、75、100，普通落地打断连击', () => {
  const game = createGame();
  place(game);
  assert.equal(place(game)[0].points, 50);
  assert.equal(place(game)[0].points, 75);
  assert.equal(place(game)[0].points, 100);
  assert.equal(game.score, 250);
  const ordinary = place(game, game.floorWidth * 0.2)[0];
  assert.equal(ordinary.perfect, false);
  assert.equal(ordinary.points, 25);
  assert.equal(ordinary.combo, 0);
  assert.equal(place(game)[0].points, 50);
});

test('完美判定容差为楼宽 10%，刚超过容差为普通落地', () => {
  for (const direction of [-1, 1]) {
    const game = createGame();
    place(game);
    assert.equal(place(game, direction * game.floorWidth * 0.1)[0].perfect, true);
    assert.equal(place(game, direction * game.floorWidth * 0.1001)[0].perfect, false);
  }
});

test('中心仍在支撑面上时整块落稳，边缘接触会倾倒', () => {
  const stable = createGame();
  place(stable);
  assert.equal(place(stable, stable.floorWidth * 0.49)[0].type, 'land');
  assert.equal(stable.blocks.at(-1).width, stable.floorWidth);

  for (const direction of [-1, 1]) {
    const game = createGame();
    place(game);
    advanceUntil(game, () => !!game.active);
    game.drop();
    game.active.x = game.topX + direction * game.floorWidth * 0.7;
    game.active.y = game.topY - game.floorHeight - 0.1;
    advanceUntil(game, () => game.active.status === 'tipping');
    assert.equal(Math.sign(game.active.direction), direction);
    advanceUntil(game, () => !game.active);
    assert.equal(game.lives, 2);
    assert.equal(game.floors, 1);
    assert.deepEqual(game.drainEvents().map(event => event.type), ['miss']);
  }
});

test('无重叠掉落扣命，第三次失败结束并且不再生成楼块', () => {
  const game = createGame();
  place(game);
  place(game);
  assert.equal(game.combo, 1);
  for (let failure = 1; failure <= 3; failure += 1) {
    const events = place(game, game.width * 2);
    assert.equal(game.lives, 3 - failure);
    assert.equal(game.combo, 0);
    assert.equal(game.score, 75);
    assert.equal(game.floors, 2);
    assert.deepEqual(events.map(event => event.type), failure === 3 ? ['miss', 'gameover'] : ['miss']);
  }
  assert.equal(game.state, 'gameover');
  assert.equal(game.drop(), false);
  const time = game.time;
  game.resume();
  game.update(1);
  assert.equal(game.time, time);
  assert.equal(game.active, null);
  assert.deepEqual(game.drainEvents(), []);
});

test('暂停冻结时间、物理与输入，重置清空整局和待消费事件', () => {
  const game = createGame();
  place(game);
  advanceUntil(game, () => !!game.active);
  const snapshot = JSON.stringify({ active: game.active, time: game.time, cameraY: game.cameraY });
  game.pause();
  game.update(0.1);
  assert.equal(game.drop(), false);
  assert.equal(JSON.stringify({ active: game.active, time: game.time, cameraY: game.cameraY }), snapshot);
  game.resume();
  game.update(1 / 60);
  assert.equal(game.state, 'playing');
  game.reset();
  assert.equal(game.score, 0);
  assert.equal(game.floors, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.combo, 0);
  assert.equal(game.cameraY, 0);
  assert.equal(game.time, 0);
  assert.equal(game.blocks.length, 0);
  assert.equal(game.active.status, 'swing');
  assert.deepEqual(game.drainEvents(), []);
});

test('固定步长对 30/60/120 FPS 给出一致结果，异常时间输入不改变状态', () => {
  const games = [30, 60, 120].map(fps => {
    const game = createGame();
    game.drop();
    for (let i = 0; i < fps; i += 1) game.update(1 / fps);
    return game;
  });
  for (const game of games) {
    assert.equal(game.floors, games[0].floors);
    assert.equal(game.score, games[0].score);
    assert.ok(Math.abs(game.time - games[0].time) < 1e-8);
    assert.ok(Math.abs(game.topY - games[0].topY) < 1e-8);
    const time = game.time;
    game.update(NaN);
    game.update(Infinity);
    game.update(-1);
    assert.equal(game.time, time);
  }
});

test('长帧最多推进 0.1 秒，快速落体通过跨越检测落在楼顶', () => {
  const game = createGame();
  game.update(60);
  assert.ok(Math.abs(game.time - RULES.maxFrameDelta) < 1e-8);
  game.drop();
  game.active.vy = game.height * 100;
  game.update(0.1);
  assert.equal(game.floors, 1);
  assert.equal(game.blocks[0].y + game.floorHeight, game.baseY);
});

test('后续楼层摆动、楼体整体摇晃，相机跟随且长期游戏只保留可见楼层', () => {
  const game = createGame();
  place(game);
  advanceUntil(game, () => !!game.active);
  const firstX = game.active.x;
  for (let i = 0; i < 10; i += 1) game.update(1 / 60);
  assert.notEqual(game.active.x, firstX);
  for (let floor = 1; floor < 500; floor += 1) place(game);
  assert.equal(game.floors, 500);
  assert.equal(game.lives, 3);
  assert.ok(game.cameraY > game.height);
  assert.ok(game.blocks.length < 20);
  advanceUntil(game, () => !!game.active);
  for (let i = 0; i < 60; i += 1) game.update(1 / 60);
  assert.ok(Math.abs(game.topY + game.cameraY - game.height * 0.66) < 1);
  const before = game.blocks.map(block => block.x);
  game.update(0.1);
  const shifts = game.blocks.map((block, index) => block.x - before[index]);
  assert.ok(Math.abs(shifts[0]) > 0);
  assert.ok(shifts.every(shift => Math.abs(shift - shifts[0]) < 1e-8));
  assert.equal(game.blocks.at(-1).x, game.topX);
});

test('不同尺寸都使用相同尺寸比例，非法画布尺寸拒绝初始化', () => {
  for (const [width, height] of [[320, 568], [393, 852], [768, 1024]]) {
    const game = new TowerGame({ width, height });
    assert.equal(game.floorWidth, width * 0.25);
    assert.equal(game.floorHeight, width * 0.25 * 0.71);
    game.drop();
    advanceUntil(game, () => game.floors === 1);
    assert.equal(game.score, 25);
  }
  assert.throws(() => new TowerGame({ width: 0 }), RangeError);
  assert.throws(() => new TowerGame({ height: Infinity }), RangeError);
});


test('580 至 850 高度在各难度完整摆动周期内，吊块主体始终完整可见', () => {
  for (const height of [580, 667, 740, 850]) {
    for (const floors of [1, 9, 10, 19, 20, 29, 30, 500]) {
      const game = new TowerGame({ width: 375, height, random: () => 0.999 });
      for (let floor = 0; floor < floors; floor += 1) place(game);
      advanceUntil(game, () => !!game.active);
      const startX = game.active.x;
      let moved = false;
      // 最慢阶段为 3.5 rad/s，4 秒覆盖所有难度的两个完整周期。
      for (let frame = 0; frame < 480; frame += 1) {
        game.update(1 / 120);
        const block = game.active;
        const screenY = block.y + game.cameraY;
        assert.ok(block.x >= 8, '左边界越界');
        assert.ok(block.x + block.width <= game.width - 8, '右边界越界');
        assert.ok(screenY >= 0, '上边界越界');
        assert.ok(screenY + block.height <= game.height, '下边界越界');
        assert.ok(Number.isFinite(block.angle));
        if (Math.abs(block.x - startX) > 1) moved = true;
      }
      assert.ok(moved, '可视约束不应消除摆动');
    }
  }
});
