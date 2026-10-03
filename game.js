(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!window.Matter || !window.DabiguaCore) {
    $('loading-progress').textContent = '物理引擎加载失败，请确认 vendor 文件夹完整。';
    $('reload-button').hidden = false;
    $('reload-button').onclick = () => location.reload();
    return;
  }
  const { Game, LEVELS, WIDTH, HEIGHT, FLOOR, DANGER_Y, STEP } = DabiguaCore;
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const images = [], effects = [], particles = [], keys = new Set();
  let game, best = 0, oldBest = 0, soundEnabled = false, audio, loaded = false;
  let lastFrame = 0, accumulator = 0, toastTimer, pointerId = null, helpPausedGame = false, showOutline = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { best = Number(localStorage.getItem('dabigua-best')) || 0; soundEnabled = localStorage.getItem('dabigua-sound') === 'on'; } catch {}
  $('best-score').textContent = best;
  function sound(frequency = 280, duration = .08) {
    if (!soundEnabled) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.6, audio.currentTime + duration);
      gain.gain.setValueAtTime(.06, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + duration);
    } catch {}
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2300); }
  function updateSoundButton() { $('sound-button').querySelector('span').textContent = soundEnabled ? '音效开' : '音效关'; $('sound-button').setAttribute('aria-pressed', String(soundEnabled)); $('sound-button').setAttribute('aria-label', soundEnabled ? '关闭音效' : '开启音效'); }
  updateSoundButton();
  $('outline-button').onclick = () => { showOutline = !showOutline; $('outline-button').querySelector('span').textContent = showOutline ? '轮廓开' : '轮廓关'; $('outline-button').setAttribute('aria-pressed', String(showOutline)); $('outline-button').setAttribute('aria-label', showOutline ? '隐藏碰撞轮廓' : '显示碰撞轮廓'); };
  $('sound-button').onclick = () => { soundEnabled = !soundEnabled; updateSoundButton(); try { localStorage.setItem('dabigua-sound', soundEnabled ? 'on' : 'off'); } catch {} sound(440); };
  function portrait(level) { const image = document.createElement('img'); image.src = LEVELS[level].image; image.alt = LEVELS[level].name; return image; }
  function updateUI() {
    $('score').textContent = game.score;
    if (game.score > best) { best = game.score; $('best-score').textContent = best; try { localStorage.setItem('dabigua-best', String(best)); } catch {} }
    const queue = $('next-queue'); queue.replaceChildren();
    game.queue.slice(1).forEach((level, index) => {
      const item = document.createElement('div'); item.className = 'queue-item'; item.title = `${index + 1}：${LEVELS[level].name}`;
      item.append(portrait(level)); const badge = document.createElement('small'); badge.textContent = `LV.${level + 1}`; item.append(badge); queue.append(item);
    });
    $('highest-level').textContent = `LV. ${game.highest + 1}`;
    $('highest-portrait').replaceChildren(portrait(game.highest));
    $('highest-name').textContent = LEVELS[game.highest].name;
    $('level-progress').style.width = `${(game.highest + 1) * 10}%`;
    $('progress-text').textContent = game.highest === 9 ? '终极大逼瓜到手！继续冲分' : `再合 ${9 - game.highest} 级，见到终极大逼瓜`;
    for (const [index, item] of [...$('level-list').children].entries()) { item.classList.toggle('locked', index > game.highest); item.classList.toggle('reached', index <= game.highest); item.classList.toggle('active', index === game.highest); }
  }
  function onEvent(event) {
    if (!game) return;
    if (event.type === 'merge') {
      if (!reducedMotion) {
        effects.push({ ...event, age: 0 });
        for (let i = 0; i < 12; i++) { const angle = Math.random() * Math.PI * 2; const speed = 45 + Math.random() * 90; particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0, color: ['#7a9a60','#e89a5c','#e3ca72'][i % 3] }); }
      }
      $('score-pop').textContent = `+${event.points}`; $('score-pop').classList.remove('pop'); void $('score-pop').offsetWidth; $('score-pop').classList.add('pop');
      sound(220 + event.level * 65, .13);
      if (event.newHighest && event.level >= 5) toast(event.level === 9 ? '终极大逼瓜诞生！你也太会合了' : `解锁 ${LEVELS[event.level].name}！`);
    }
    if (event.type === 'drop') sound(160, .05);
    if (['merge', 'drop', 'reset'].includes(event.type)) updateUI();
    if (event.type === 'gameover') {
      $('final-score').textContent = game.score;
      $('result-record').textContent = game.score > oldBest ? '✦ 新纪录！这局很有含瓜量' : `最高纪录 ${best}`;
      const highest = $('result-highest'); highest.replaceChildren(portrait(game.highest));
      highest.append(document.createTextNode(`本局合到 ${LEVELS[game.highest].name}`));
      $('gameover-overlay').hidden = false;
      $('pause-button').disabled = true;
      $('play-hint').textContent = '瓜装满了！再来一局，试试新的落点。';
      pointerId = null; keys.clear(); sound(130, .3);
      $('again-button').focus({ preventScroll: true });
    }
  }
  function reset(startImmediately = false) {
    if (!loaded) return;
    oldBest = best;
    game.reset(); effects.length = particles.length = 0; keys.clear(); accumulator = 0;
    $('gameover-overlay').hidden = true; $('pause-overlay').hidden = true;
    $('start-overlay').hidden = startImmediately;
    $('pause-button').disabled = !startImmediately;
    $('play-hint').textContent = '移动瞄准，点击投放。手机拖动后松手。';
    $('pause-button').textContent = 'Ⅱ'; $('pause-button').setAttribute('aria-label', '暂停游戏');
    updateUI(); if (startImmediately) { game.start(); canvas.focus({ preventScroll: true }); sound(350); }
  }
  function begin() { oldBest = best; game.start(); $('start-overlay').hidden = true; $('pause-button').disabled = false; canvas.focus({ preventScroll: true }); sound(350); }
  $('start-button').onclick = begin;
  $('again-button').onclick = () => reset(true);
  $('restart-button').onclick = () => reset(true);
  function togglePause() {
    if (!game || !['playing', 'paused'].includes(game.state)) return;
    keys.clear(); pointerId = null;
    if (game.state === 'playing') { game.pause(); $('pause-overlay').hidden = false; $('pause-button').textContent = '▶'; $('pause-button').setAttribute('aria-label', '继续游戏'); }
    else { game.resume(); $('pause-overlay').hidden = true; $('pause-button').textContent = 'Ⅱ'; $('pause-button').setAttribute('aria-label', '暂停游戏'); canvas.focus({ preventScroll: true }); }
    accumulator = 0;
  }
  $('pause-button').onclick = togglePause; $('resume-button').onclick = togglePause;
  $('help-button').onclick = () => { helpPausedGame = game?.state === 'playing'; if (helpPausedGame) togglePause(); $('help-dialog').showModal(); };
  $('help-dialog').addEventListener('close', () => { if (helpPausedGame && game?.state === 'paused') togglePause(); helpPausedGame = false; });
  for (const button of document.querySelectorAll('.dialog-close')) button.onclick = () => $('help-dialog').close();
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  function aimFromPointer(event) { const bounds = canvas.getBoundingClientRect(); game.setAim((event.clientX - bounds.left) / bounds.width * WIDTH); }
  canvas.addEventListener('pointermove', event => { if (!loaded || game.state !== 'playing') return; if (event.pointerType === 'mouse' || pointerId === event.pointerId) aimFromPointer(event); });
  canvas.addEventListener('pointerdown', event => { if (!loaded || game.state !== 'playing' || event.button !== 0) return; event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId); aimFromPointer(event); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener('pointerup', event => { if (pointerId !== event.pointerId) return; aimFromPointer(event); pointerId = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); game.drop(); });
  canvas.addEventListener('pointercancel', () => { pointerId = null; });
  canvas.addEventListener('lostpointercapture', () => { pointerId = null; });
  document.addEventListener('keydown', event => {
    if (!loaded || $('help-dialog').open || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      if (game.state !== 'playing') return;
      event.preventDefault(); keys.add(event.key); if (event.key === ' ' && !event.repeat) game.drop();
    } else if (event.key.toLowerCase() === 'p' && !event.repeat) togglePause();
    else if (event.key.toLowerCase() === 'r' && !event.repeat) reset(true);
  });
  document.addEventListener('keyup', event => keys.delete(event.key));
  window.addEventListener('blur', () => { keys.clear(); pointerId = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game?.state === 'playing') togglePause(); lastFrame = 0; accumulator = 0; });
  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(width / WIDTH * HEIGHT * ratio);
    ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  function drawCharacter(level, x, y, angle = 0, opacity = 1) {
    const info = LEVELS[level], image = images[level];
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = opacity;
    const { shape, size } = info;
    // Image and polygons share the alpha silhouette's centre of mass. Rotation
    // must use this same origin so clothing and hair remain on their collider.
    ctx.drawImage(image, -shape.center.x * size, -shape.center.y * size, shape.imageWidth * size, shape.imageHeight * size);
    if (showOutline) {
      ctx.beginPath();
      for (const loop of shape.loops) { ctx.moveTo(loop[0].x * size, loop[0].y * size); for (const point of loop.slice(1)) ctx.lineTo(point.x * size, point.y * size); ctx.closePath(); }
      ctx.strokeStyle = '#3f8065'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  function render(delta) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#fffdf5'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#dce1ca66';
    for (let x = 22; x < WIDTH; x += 24) for (let y = DANGER_Y + 20; y < FLOOR; y += 24) { ctx.beginPath(); ctx.arc(x, y, .9, 0, 2 * Math.PI); ctx.fill(); }
    ctx.fillStyle = '#f0f2e4'; ctx.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
    ctx.strokeStyle = '#b8c6a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(WIDTH, FLOOR); ctx.stroke();
    const danger = game ? Math.min(game.dangerElapsed / 2000, 1) : 0;
    ctx.strokeStyle = danger ? '#dc845a' : '#b5bfa2'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(16, DANGER_Y); ctx.lineTo(WIDTH - 16, DANGER_Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '10px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = danger ? '#d57a50' : '#96a085';
    ctx.fillText(danger ? `小心！${Math.max(0, 2 - game.dangerElapsed / 1000).toFixed(1)} 秒` : '警戒线 · 不要堆过这里', WIDTH - 17, DANGER_Y - 10);
    if (!loaded || !game) return;
    if (game.state !== 'over') {
      const level = game.current, info = LEVELS[level];
      ctx.save(); ctx.strokeStyle = '#809e6260'; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(game.aim, 54 + info.shape.bounds.maxY * info.size + 8); ctx.lineTo(game.aim, FLOOR - 6); ctx.stroke(); ctx.restore();
      drawCharacter(level, game.aim, 54, 0, game.canDrop || game.state === 'ready' ? 1 : .5);
      ctx.font = '10px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#7f926b'; ctx.fillText('当前 · ' + LEVELS[level].name, game.aim, 17);
      ctx.fillStyle = '#8faa73'; ctx.beginPath(); ctx.moveTo(game.aim - 5, FLOOR - 7); ctx.lineTo(game.aim + 5, FLOOR - 7); ctx.lineTo(game.aim, FLOOR - 2); ctx.fill();
    }
    for (const piece of game.pieces) drawCharacter(piece.plugin.level, piece.position.x, piece.position.y, piece.angle);
    if (game.state === 'playing') {
      for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.age += delta; p.x += p.vx * delta; p.y += p.vy * delta; p.vy += 180 * delta; if (p.age > .65) { particles.splice(i, 1); continue; } ctx.save(); ctx.globalAlpha = 1 - p.age / .65; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
      for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i]; e.age += delta; if (e.age > .7) { effects.splice(i, 1); continue; } ctx.save(); ctx.globalAlpha = 1 - e.age / .7; ctx.strokeStyle = '#a9bd7a'; ctx.lineWidth = 3 * (1 - e.age / .7); ctx.beginPath(); ctx.arc(e.x, e.y, LEVELS[e.level].radius + e.age * 40, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#547144'; ctx.textAlign = 'center'; ctx.font = 'bold 19px system-ui'; ctx.fillText(`+${e.points}`, e.x, e.y - LEVELS[e.level].radius - e.age * 35); ctx.restore(); }
    }
    if (danger && !reducedMotion) { ctx.fillStyle = `rgba(225,121,73,${danger * .08})`; ctx.fillRect(0, 0, WIDTH, DANGER_Y); }
  }
  function frame(timestamp) {
    const elapsed = lastFrame ? Math.min(timestamp - lastFrame, 80) : STEP; lastFrame = timestamp;
    if (loaded && game.state === 'playing') {
      accumulator += elapsed;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        if (keys.has('ArrowLeft')) game.setAim(game.aim - 4);
        if (keys.has('ArrowRight')) game.setAim(game.aim + 4);
        game.update(STEP); accumulator -= STEP; steps++;
      }
    } else accumulator = 0;
    render(elapsed / 1000); requestAnimationFrame(frame);
  }
  async function init() {
    let completed = 0;
    try {
      await Promise.all(LEVELS.map((level, index) => new Promise((resolve, reject) => {
        const image = new Image(); images[index] = image;
        image.onload = () => { completed++; $('loading-progress').textContent = `${completed} / ${LEVELS.length} 个形象准备完毕`; resolve(); };
        image.onerror = () => reject(new Error(`无法读取 ${level.image}`)); image.src = level.image;
      })));
      game = new Game({ onEvent }); loaded = true;
      $('level-list').replaceChildren(...LEVELS.map((level, index) => {
        const item = document.createElement('li'); item.className = 'level-item'; item.title = `${level.name} · 合成奖励 ${level.points} 分`;
        const circle = document.createElement('div'); circle.className = 'level-image'; circle.append(portrait(index));
        const number = document.createElement('small'); number.textContent = `LV. ${index + 1}`;
        const name = document.createElement('strong'); name.textContent = level.name;
        item.append(circle, number, name); return item;
      }));
      reset(); $('loading-overlay').hidden = true;
      resize(); requestAnimationFrame(frame);
    } catch (error) {
      $('loading-progress').textContent = `${error.message}，请确认人物素材文件完整。`;
      $('loading-overlay').querySelector('strong').textContent = '有个瓜迷路了';
      $('loading-overlay').querySelector('.loading-spinner').hidden = true;
      $('reload-button').hidden = false; $('reload-button').onclick = () => location.reload();
    }
  }
  init();
})();
