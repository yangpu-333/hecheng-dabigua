(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./matter.min.js'), require('./collision-shapes.js'));
  else root.DabiguaCore = factory(root.Matter, root.DabiguaShapes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Matter, shapes) {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const WIDTH = 420, HEIGHT = 640, FLOOR = 620, DANGER_Y = 126, STEP = 1000 / 60;
  const LEVELS = [
    { file: '10', name: '闭眼小瓜', radius: 19, color: '#dae8c6' },
    { file: '05', name: '微笑小瓜', radius: 25, color: '#e9e8bf' },
    { file: '04', name: '侧目小瓜', radius: 32, color: '#d8e5d9' },
    { file: '06', name: '歪头瓜', radius: 39, color: '#e1dfee' },
    { file: '03', name: '鼓腮瓜', radius: 47, color: '#efd5c1' },
    { file: '02', name: '嘟嘴瓜', radius: 55, color: '#e6eeba' },
    { file: '07', name: '快乐瓜', radius: 64, color: '#edccbd' },
    { file: '08', name: '大厨瓜', radius: 74, color: '#d8e6c4' },
    { file: '09', name: '太阳瓜', radius: 87, color: '#f5dda0' },
    { file: '01', name: '终极大逼瓜', radius: 103, color: '#c8dfaf' }
  ].map((level, index) => ({ ...level, size: level.radius * 2, shape: shapes[`character-${level.file}.png`], level: index, points: 2 ** (index + 1), image: `character-${level.file}.png` }));

  function createSilhouette(level, x, y, plugin) {
    const info = LEVELS[level], scale = info.size;
    const material = { label: 'character', restitution: .12, friction: .35, frictionStatic: .7, frictionAir: .009, density: .0018, sleepThreshold: 80, slop: .08 };
    const parts = info.shape.parts.map(polygon => {
      const vertices = polygon.map(point => ({ x: point.x * scale, y: point.y * scale }));
      const center = Matter.Vertices.centre(vertices);
      return Body.create({ ...material, position: { x: x + center.x, y: y + center.y }, vertices });
    });
    // Shared polygon edges are internal; only the silhouette is an exposed edge.
    const edges = new Map(), key = point => `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
    for (const part of parts) for (let i = 0; i < part.vertices.length; i++) {
      const a = part.vertices[i], b = part.vertices[(i + 1) % part.vertices.length];
      const opposite = edges.get(`${key(b)}:${key(a)}`);
      if (opposite) { a.isInternal = true; opposite.isInternal = true; }
      else edges.set(`${key(a)}:${key(b)}`, a);
    }
    const body = Body.create({ ...material, parts, plugin });
    Body.setPosition(body, { x, y });
    return body;
  }

  class Game {
    constructor({ random = Math.random, onEvent = () => {} } = {}) {
      this.random = random;
      this.onEvent = onEvent;
      this.engine = Engine.create({ positionIterations: 8, velocityIterations: 8, enableSleeping: true });
      this.engine.gravity.y = 1.15;
      Events.on(this.engine, 'collisionStart', event => this.collisions(event.pairs));
      Events.on(this.engine, 'collisionActive', event => this.collisions(event.pairs));
      this.reset();
    }
    emit(type, detail = {}) { this.onEvent({ type, ...detail }); }
    reset() {
      Composite.clear(this.engine.world, false);
      Engine.clear(this.engine);
      this.engine.timing.timestamp = 0;
      this.time = 0;
      this.score = 0;
      this.highest = 0;
      this.state = 'ready';
      this.aim = WIDTH / 2;
      this.lastDrop = -Infinity;
      this.dangerElapsed = 0;
      this.mergeQueue = [];
      this.queue = Array.from({ length: 4 }, () => this.randomLevel());
      Composite.add(this.engine.world, [
        Bodies.rectangle(-22, HEIGHT / 2 - 200, 60, HEIGHT + 800, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(WIDTH + 22, HEIGHT / 2 - 200, 60, HEIGHT + 800, { isStatic: true, label: 'wall' }),
        Bodies.rectangle(WIDTH / 2, FLOOR + 24, WIDTH + 100, 48, { isStatic: true, label: 'floor', friction: .4 })
      ]);
      this.emit('reset');
    }
    randomLevel() {
      const value = this.random();
      return value < .52 ? 0 : value < .8 ? 1 : value < .95 ? 2 : 3;
    }
    get pieces() { return Composite.allBodies(this.engine.world).filter(body => body.label === 'character'); }
    get current() { return this.queue[0]; }
    get canDrop() { return this.state === 'playing' && this.time - this.lastDrop >= 500; }
    start() { if (this.state === 'ready') { this.state = 'playing'; this.emit('start'); } }
    pause() { if (this.state === 'playing') { this.state = 'paused'; this.emit('pause'); } }
    resume() { if (this.state === 'paused') { this.state = 'playing'; this.emit('resume'); } }
    setAim(x) {
      this.aim = this.clampX(this.current, x);
      return this.aim;
    }
    clampX(level, x) {
      const { shape, size } = LEVELS[level];
      return Math.max(9 - shape.bounds.minX * size, Math.min(WIDTH - 9 - shape.bounds.maxX * size, x));
    }
    makePiece(level, x, y, { landed = false, born = this.time } = {}) {
      const piece = createSilhouette(level, x, y, { level, born, landed, merging: false, overTime: 0 });
      Composite.add(this.engine.world, piece);
      return piece;
    }
    drop() {
      if (!this.canDrop) return false;
      const level = this.queue.shift();
      this.queue.push(this.randomLevel());
      const x = this.clampX(level, this.aim);
      const piece = this.makePiece(level, x, 54);
      Body.setVelocity(piece, { x: 0, y: 1.5 });
      this.lastDrop = this.time;
      this.highest = Math.max(this.highest, level);
      this.setAim(this.aim);
      this.emit('drop', { level, x });
      return true;
    }
    collisions(pairs) {
      if (this.state !== 'playing') return;
      for (const { bodyA, bodyB } of pairs) {
        // Matter reports collisions between convex parts, so merge their parent
        // characters exactly once, even when several parts touch at once.
        const a = bodyA.parent || bodyA, b = bodyB.parent || bodyB;
        if (a === b) continue;
        if (a.label === 'character') a.plugin.landed = true;
        if (b.label === 'character') b.plugin.landed = true;
        if (a.label !== 'character' || b.label !== 'character') continue;
        if (a.plugin.merging || b.plugin.merging || a.plugin.level !== b.plugin.level) continue;
        if (a.plugin.level === LEVELS.length - 1) continue;
        a.plugin.merging = b.plugin.merging = true;
        this.mergeQueue.push([a, b]);
      }
    }
    mergePending() {
      for (const [a, b] of this.mergeQueue) {
        const level = a.plugin.level + 1, info = LEVELS[level];
        const x = this.clampX(level, (a.position.x + b.position.x) / 2);
        const y = Math.min(FLOOR - info.shape.bounds.maxY * info.size, (a.position.y + b.position.y) / 2);
        // A real upward launch releases the upgraded silhouette from the pile.
        // A slight sideways toss lets it find another matching character.
        const lift = 6.8 + Math.min(level, 8) * .2;
        const velocity = {
          x: Math.max(-2.1, Math.min(2.1, (a.velocity.x + b.velocity.x) / 2)) + (this.random() - .5) * 1.1,
          y: -lift + Math.min(0, (a.velocity.y + b.velocity.y) * .1)
        };
        Composite.remove(this.engine.world, [a, b]);
        const piece = this.makePiece(level, x, y, { landed: true });
        Body.setVelocity(piece, velocity);
        Body.setAngularVelocity(piece, Math.max(-.04, Math.min(.04, (a.angularVelocity + b.angularVelocity) / 2)));
        const newHighest = level > this.highest;
        this.highest = Math.max(this.highest, level);
        this.score += info.points;
        this.emit('merge', { level, x, y, points: info.points, score: this.score, newHighest });
      }
      this.mergeQueue.length = 0;
    }
    update(delta = STEP) {
      if (this.state !== 'playing') return;
      this.time += delta;
      Engine.update(this.engine, delta);
      this.mergePending();
      this.dangerElapsed = 0;
      for (const body of this.pieces) {
        const above = body.plugin.landed && this.time - body.plugin.born > 1000 && body.bounds.min.y < DANGER_Y;
        const resting = body.speed < .75 && Math.abs(body.angularVelocity) < .035;
        // Flying across the line is harmless. Count each resting character
        // separately, so several different airborne pieces cannot add up to a loss.
        body.plugin.overTime = above && resting ? body.plugin.overTime + delta : 0;
        this.dangerElapsed = Math.max(this.dangerElapsed, body.plugin.overTime);
      }
      if (this.dangerElapsed >= 2000) {
        this.state = 'over';
        this.emit('gameover', { score: this.score, highest: this.highest });
      }
    }
  }
  return { Game, LEVELS, WIDTH, HEIGHT, FLOOR, DANGER_Y, STEP, createSilhouette };
});
