(() => {
  const attackNames = [
    "sans_intro", "sans_bluebone", "sans_bonegap1", "sans_bonegap1fast",
    "sans_bonegap2", "sans_boneslideh", "sans_boneslidev", "sans_bonestab1",
    "sans_bonestab2", "sans_bonestab3", "sans_platformblaster",
    "sans_platformblasterfast", "sans_platforms1", "sans_platforms2",
    "sans_platforms3", "sans_platforms4", "sans_platforms4hard",
    "sans_randomblaster1", "sans_randomblaster2", "sans_multi1",
    "sans_multi2", "sans_multi3", "sans_final", "sans_spare"
  ];
  const menuItems = ["FIGHT", "ACT", "ITEM", "MERCY"];
  const menuKeys = ["fight", "act", "item", "mercy"];
  const attackSequence = [
    "sans_intro", "sans_bonegap1", "sans_bluebone", "sans_bonegap2",
    "sans_platforms1", "sans_boneslideh", "sans_boneslidev",
    "sans_bonestab1", "sans_platformblaster", "sans_multi1",
    "sans_platforms4hard", "sans_multi2", "sans_multi3", "sans_final"
  ];

  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const attackSelect = document.getElementById("attackSelect");
  const restartBtn = document.getElementById("restartBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const eventList = document.getElementById("eventList");
  const scriptInfo = document.getElementById("scriptInfo");
  const debugToggle = document.getElementById("debugToggle");
  const hpText = document.getElementById("hpText");
  const krText = document.getElementById("krText");
  const timeText = document.getElementById("timeText");
  const modeText = document.getElementById("modeText");

  const keys = new Set();
  const sprites = {};
  const state = {
    rows: [],
    pc: 0,
    wait: 0,
    time: 0,
    paused: false,
    labels: new Map(),
    vars: { pi: Math.PI },
    hp: 92,
    maxHp: 92,
    kr: 0,
    mode: 0,
    heart: { x: 320, y: 304, vx: 0, vy: 0, angle: 0, maxFall: 330, slamDamage: false },
    box: { l: 239, t: 226, r: 404, b: 391 },
    targetBox: null,
    boxSpeed: 900,
    attacks: [],
    blasters: [],
    stabs: [],
    platforms: [],
    sans: { head: "Default", body: "HandDown", sweat: 0, x: 320, repeat: false },
    ended: false,
    phase: "menu",
    selectedMenu: 0,
    sequenceIndex: 0,
    currentAttack: "sans_intro",
    message: "* sans is sparing you.",
    messageTimer: 0,
    target: { x: 318, dir: 1, active: false, result: "" },
  };

  for (const name of attackNames) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    attackSelect.append(option);
  }
  attackSelect.value = "sans_intro";

  function image(path) {
    const img = new Image();
    img.src = path;
    return img;
  }

  sprites.heart = image("Animations/PlayerHeart/Default/000.png");
  sprites.hitbox = image("Animations/PlayerHitbox/Default/000.png");
  sprites.sansHead = image("Animations/SansHead/Default/000.png");
  sprites.sansBody = image("Animations/SansBody/HandDown/000.png");
  sprites.sansLegs = image("Animations/SansLegs/Standing/000.png");
  sprites.gb = image("Animations/GasterBlaster/Default/000.png");

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell.trim());
        cell = "";
      } else if (ch === "\n") {
        row.push(cell.trim());
        cell = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows.map((r, i) => ({ line: i + 1, delay: num(r[0]), fn: r[1] || "", args: r.slice(2) }));
  }

  function resetRuntime(rows, options = {}) {
    const preserveVitals = !!options.preserveVitals;
    const hp = preserveVitals ? state.hp : 92;
    const kr = preserveVitals ? state.kr : 0;
    Object.assign(state, {
      rows,
      pc: 0,
      wait: 0,
      time: 0,
      paused: false,
      labels: new Map(),
      vars: { pi: Math.PI },
      hp,
      maxHp: 92,
      kr,
      mode: 0,
      heart: { x: 320, y: 304, vx: 0, vy: 0, angle: 0, maxFall: 330, slamDamage: false },
      box: { l: 239, t: 226, r: 404, b: 391 },
      targetBox: null,
      boxSpeed: 900,
      attacks: [],
      blasters: [],
      stabs: [],
      platforms: [],
      sans: { head: "Default", body: "HandDown", sweat: 0, x: 320, repeat: false },
      ended: false,
      phase: options.phase || "attack",
      message: options.message || "",
      messageTimer: 0,
    });
    state.wait = rows[0]?.delay || 0;
    rows.forEach((row, index) => {
      if (row.fn.startsWith(":")) state.labels.set(row.fn.slice(1), index);
    });
    pauseBtn.textContent = "Pause";
    renderEventList();
  }

  async function loadAttack(name, options = {}) {
    const res = await fetch(`Files/${name}.csv`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load ${name}.csv`);
    const text = await res.text();
    const rows = parseCsv(text);
    state.currentAttack = name;
    resetRuntime(rows, options);
    const counts = rows.reduce((m, r) => {
      if (r.fn && !r.fn.startsWith(":")) m.set(r.fn, (m.get(r.fn) || 0) + 1);
      return m;
    }, new Map());
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`).join("\n");
    scriptInfo.textContent = `${name}.csv\nrows: ${rows.length}\n\n${top}`;
  }

  function enterMenu(message = "* sans is sparing you.") {
    state.phase = "menu";
    state.ended = false;
    state.attacks = [];
    state.blasters = [];
    state.stabs = [];
    state.platforms = [];
    state.mode = 0;
    state.box = { l: 32, t: 250, r: 608, b: 392 };
    state.heart.x = 49 + state.selectedMenu * 160;
    state.heart.y = 432;
    state.heart.vx = 0;
    state.heart.vy = 0;
    state.message = message;
  }

  function startTarget() {
    state.phase = "target";
    state.target = { x: 112, dir: 1, active: true, result: "" };
    state.message = "";
    state.box = { l: 32, t: 250, r: 608, b: 392 };
  }

  function finishTarget() {
    if (state.phase !== "target") return;
    state.phase = "message";
    state.messageTimer = 0.65;
    state.target.active = false;
    state.target.result = "MISS";
    state.message = "MISS";
  }

  function nextSequenceAttack() {
    const name = attackSequence[state.sequenceIndex % attackSequence.length];
    state.sequenceIndex++;
    attackSelect.value = name;
    loadAttack(name, { phase: "attack", preserveVitals: true }).catch(err => {
      scriptInfo.textContent = err.message;
      enterMenu("* attack failed to load.");
    });
  }

  function renderEventList() {
    eventList.textContent = "";
    state.rows.slice(0, 260).forEach((row, i) => {
      const li = document.createElement("li");
      li.textContent = `${row.delay || 0}s  ${row.fn} ${row.args.filter(Boolean).join(", ")}`;
      if (i === state.pc) li.className = "active";
      eventList.append(li);
    });
  }

  function num(v, fallback = 0) {
    if (v === undefined || v === null || v === "") return fallback;
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    const t = String(v).trim();
    if (!t) return fallback;
    const n = Number(t);
    return Number.isFinite(n) ? n : fallback;
  }

  function value(raw) {
    if (raw === undefined || raw === "") return 0;
    const s = String(raw).trim();
    if (s.startsWith("$")) return state.vars[s.slice(1)] ?? 0;
    return num(s);
  }

  function varName(raw) {
    return String(raw || "").replace(/^\$/, "");
  }

  function jumpTo(target) {
    if (target === undefined || target === "") return;
    if (state.labels.has(target)) {
      state.pc = state.labels.get(target);
      return;
    }
    const n = Math.trunc(value(target));
    if (Number.isFinite(n)) state.pc = Math.max(0, Math.min(state.rows.length - 1, n - 1));
  }

  function jumpRel(offset) {
    state.pc = Math.max(0, Math.min(state.rows.length - 1, state.pc + Math.trunc(value(offset))));
  }

  function addBone(kind, x, y, len, dir, speed, color, count = 1, spacing = 0) {
    for (let i = 0; i < count; i++) {
      const ox = kind === "v" ? (dir === 0 ? -spacing * i : dir === 2 ? spacing * i : 0) : 0;
      const oy = kind === "h" ? (dir === 1 ? -spacing * i : dir === 3 ? spacing * i : 0) : 0;
      state.attacks.push({
        type: kind,
        x: x + ox,
        y: y + oy,
        len,
        dir,
        speed,
        color,
        damage: 1,
        karma: 6,
        life: 12,
      });
    }
  }

  function exec(row) {
    const a = row.args;
    switch (row.fn) {
      case "":
      case "TLPause":
      case "TLResume":
      case "Sound":
      case "Music":
      case "SansAnimation":
        break;
      case "EndAttack":
        state.ended = true;
        break;
      case "BlackScreen":
        if (value(a[0])) {
          state.attacks = [];
          state.blasters = [];
          state.stabs = [];
        }
        break;
      case "SET":
        state.vars[varName(a[0])] = value(a[1]);
        break;
      case "ADD":
        state.vars[varName(a[0])] = value(a[1]) + value(a[2]);
        break;
      case "SUB":
        state.vars[varName(a[0])] = value(a[1]) - value(a[2]);
        break;
      case "MUL":
        state.vars[varName(a[0])] = value(a[1]) * value(a[2]);
        break;
      case "DIV":
        state.vars[varName(a[0])] = value(a[2]) === 0 ? 0 : value(a[1]) / value(a[2]);
        break;
      case "MOD":
        state.vars[varName(a[0])] = value(a[1]) % value(a[2]);
        break;
      case "FLOOR":
        state.vars[varName(a[0])] = Math.floor(value(a[1]));
        break;
      case "SIN":
        state.vars[varName(a[0])] = Math.sin(value(a[1]));
        break;
      case "COS":
        state.vars[varName(a[0])] = Math.cos(value(a[1]));
        break;
      case "RND":
        state.vars[varName(a[0])] = Math.floor(Math.random() * Math.max(1, value(a[1])));
        break;
      case "JMPABS":
        jumpTo(a[0]);
        break;
      case "JMPREL":
        jumpRel(a[0]);
        break;
      case "JMPZ":
        if (value(a[1]) === 0) jumpTo(a[0]);
        break;
      case "JMPE":
        if (value(a[1]) === value(a[2])) jumpTo(a[0]);
        break;
      case "JMPNE":
        if (value(a[1]) !== value(a[2])) jumpTo(a[0]);
        break;
      case "JMPL":
        if (value(a[1]) < value(a[2])) jumpTo(a[0]);
        break;
      case "JMPNL":
        if (value(a[1]) >= value(a[2])) jumpTo(a[0]);
        break;
      case "JMPNG":
        if (value(a[1]) <= value(a[2])) jumpTo(a[0]);
        break;
      case "CombatZoneResize":
      case "CombatZoneResizeInstant":
      case "CombatZoneResizeAuto":
        state.box = { l: value(a[0]), t: value(a[1]), r: value(a[2]), b: value(a[3]) };
        break;
      case "CombatZoneSpeed":
        state.boxSpeed = value(a[0]);
        break;
      case "GetHeartPos":
        state.vars[varName(a[0])] = state.heart.x;
        state.vars[varName(a[1])] = state.heart.y;
        break;
      case "HeartTeleport":
        state.heart.x = value(a[0]);
        state.heart.y = value(a[1]);
        state.heart.vx = 0;
        state.heart.vy = 0;
        break;
      case "HeartMode":
        state.mode = value(a[0]);
        break;
      case "HeartMaxFallSpeed":
        state.heart.maxFall = value(a[0]);
        break;
      case "SansSlam":
        slam(value(a[0]));
        break;
      case "SansSlamDamage":
        state.heart.slamDamage = !!value(a[0]);
        break;
      case "SansHead":
        state.sans.head = a[0] || "Default";
        break;
      case "SansBody":
        state.sans.body = a[0] || "HandDown";
        break;
      case "SansSweat":
        state.sans.sweat = value(a[0]);
        break;
      case "SansX":
        state.sans.x = value(a[0]);
        break;
      case "SansRepeat":
        state.sans.repeat = true;
        break;
      case "SansEndRepeat":
        state.sans.repeat = false;
        break;
      case "BoneV":
        addBone("v", value(a[0]), value(a[1]), value(a[2]), value(a[3]), value(a[4]), value(a[5]));
        break;
      case "BoneH":
        addBone("h", value(a[0]), value(a[1]), value(a[2]), value(a[3]), value(a[4]), value(a[5]));
        break;
      case "BoneVRepeat":
        addBone("v", value(a[0]), value(a[1]), value(a[2]), value(a[3]), value(a[4]), value(a[5]), value(a[6]), value(a[7]));
        break;
      case "BoneHRepeat":
        addBone("h", value(a[0]), value(a[1]), value(a[2]), value(a[3]), value(a[4]), value(a[5]), value(a[6]), value(a[7]));
        break;
      case "SineBones":
        sineBones(value(a[0]), value(a[1]), value(a[2]), value(a[3]));
        break;
      case "BoneStab":
        state.stabs.push({ dir: value(a[0]), dist: value(a[1]), warn: value(a[2]), stay: value(a[3]), age: 0, damage: 1, karma: 6 });
        break;
      case "GasterBlaster":
        state.blasters.push({
          size: value(a[0]), sx: value(a[1]), sy: value(a[2]), x: value(a[3]), y: value(a[4]),
          angle: value(a[5]), spin: value(a[6]), blast: value(a[7]), age: 0, damage: 1, karma: 10
        });
        break;
      case "Platform":
        state.platforms.push({ x: value(a[0]), y: value(a[1]), w: value(a[2]), dir: value(a[3]), speed: value(a[4]), life: 10 });
        break;
      case "PlatformRepeat": {
        const count = value(a[5]);
        const spacing = value(a[6]);
        for (let i = 0; i < count; i++) {
          state.platforms.push({ x: value(a[0]) + i * spacing, y: value(a[1]), w: value(a[2]), dir: value(a[3]), speed: value(a[4]), life: 10 });
        }
        break;
      }
    }
  }

  function slam(dir) {
    const speed = 900;
    if (dir === 0) state.heart.vx = speed;
    if (dir === 1) state.heart.vy = speed;
    if (dir === 2) state.heart.vx = -speed;
    if (dir === 3) state.heart.vy = -speed;
  }

  function sineBones(count, spacing, speed, height) {
    for (let i = 0; i < count; i++) {
      const x = spacing > 0 ? -20 + i * spacing : 660 + i * spacing;
      const gap = 304 + Math.sin(i * 0.8) * height;
      addBone("v", x, 226, Math.max(10, gap - 226 - 18), spacing > 0 ? 0 : 2, speed, 0);
      addBone("v", x, gap + 18, Math.max(10, 391 - gap - 18), spacing > 0 ? 0 : 2, speed, 0);
    }
  }

  function stepTimeline(dt) {
    if (state.ended) return;
    state.wait -= dt;
    let guard = 0;
    while (state.pc < state.rows.length && guard++ < 800) {
      if (state.wait > 0) break;
      const row = state.rows[state.pc];
      state.pc++;
      exec(row);
      if (state.rows[state.pc]) state.wait += Math.max(0, state.rows[state.pc].delay || 0);
      if (row.fn.startsWith(":")) state.wait = 0;
    }
  }

  function updateHeart(dt) {
    const h = state.heart;
    const speed = 210;
    let ax = 0;
    let ay = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) ax -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) ax += 1;
    if (keys.has("ArrowUp") || keys.has("w")) ay -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) ay += 1;

    if (state.mode === 0) {
      const len = Math.hypot(ax, ay) || 1;
      h.vx = ax / len * speed;
      h.vy = ay / len * speed;
    } else {
      h.vx = ax * speed;
      if ((keys.has("ArrowUp") || keys.has("w")) && h.y >= state.box.b - 10) h.vy = -360;
      h.vy = Math.min(h.maxFall || 330, h.vy + 980 * dt);
    }

    h.x += h.vx * dt;
    h.y += h.vy * dt;
    const half = 2;
    if (h.x < state.box.l + half) { h.x = state.box.l + half; h.vx = 0; }
    if (h.x > state.box.r - half) { h.x = state.box.r - half; h.vx = 0; }
    if (h.y < state.box.t + half) { h.y = state.box.t + half; h.vy = 0; }
    if (h.y > state.box.b - half) { h.y = state.box.b - half; h.vy = 0; }
  }

  function updateObjects(dt) {
    for (const b of state.attacks) {
      const s = b.speed * dt;
      if (b.dir === 0) b.x += s;
      if (b.dir === 1) b.y += s;
      if (b.dir === 2) b.x -= s;
      if (b.dir === 3) b.y -= s;
      b.life -= dt;
    }
    state.attacks = state.attacks.filter(b => b.life > 0 && b.x > -900 && b.x < 1540 && b.y > -900 && b.y < 1380);
    for (const g of state.blasters) g.age += dt;
    state.blasters = state.blasters.filter(g => g.age < g.spin + g.blast + 0.45);
    for (const s of state.stabs) s.age += dt;
    state.stabs = state.stabs.filter(s => s.age < s.warn + s.stay + 0.2);
    for (const p of state.platforms) {
      const s = p.speed * dt;
      if (p.dir === 0) p.x += s;
      if (p.dir === 1) p.y += s;
      if (p.dir === 2) p.x -= s;
      if (p.dir === 3) p.y -= s;
      p.life -= dt;
    }
    state.platforms = state.platforms.filter(p => p.life > 0);
  }

  function rectHit(x, y, r) {
    return x + 2 >= r.x && x - 2 <= r.x + r.w && y + 2 >= r.y && y - 2 <= r.y + r.h;
  }

  function damage(dmg, kr) {
    if (state.hp <= 1) return;
    state.hp = Math.max(1, state.hp - dmg);
    state.kr = Math.min(state.hp - 1, state.kr + kr);
  }

  function collide() {
    const { x, y } = state.heart;
    for (const b of state.attacks) {
      const rect = b.type === "v" ? { x: b.x - 5, y: b.y, w: 10, h: b.len } : { x: b.x, y: b.y - 5, w: b.len, h: 10 };
      if (rectHit(x, y, rect)) {
        if (b.color === 1 && Math.hypot(state.heart.vx, state.heart.vy) < 8) continue;
        if (b.color === 2 && Math.hypot(state.heart.vx, state.heart.vy) > 8) continue;
        damage(b.damage, b.karma);
      }
    }
    for (const s of state.stabs) {
      if (s.age < s.warn) continue;
      let rect;
      if (s.dir === 0) rect = { x: state.box.l, y: state.box.t, w: s.dist, h: state.box.b - state.box.t };
      if (s.dir === 1) rect = { x: state.box.l, y: state.box.t, w: state.box.r - state.box.l, h: s.dist };
      if (s.dir === 2) rect = { x: state.box.r - s.dist, y: state.box.t, w: s.dist, h: state.box.b - state.box.t };
      if (s.dir === 3) rect = { x: state.box.l, y: state.box.b - s.dist, w: state.box.r - state.box.l, h: s.dist };
      if (rectHit(x, y, rect)) damage(s.damage, s.karma);
    }
    for (const g of state.blasters) {
      if (g.age < g.spin || g.age > g.spin + g.blast) continue;
      const rad = g.angle * Math.PI / 180;
      const dx = Math.cos(rad), dy = Math.sin(rad);
      const px = x - g.x, py = y - g.y;
      const along = px * dx + py * dy;
      const off = Math.abs(px * dy - py * dx);
      if (along > -10 && along < 900 && off < (g.size ? 18 : 10)) damage(g.damage, g.karma);
    }
    state.kr = Math.max(0, state.kr - 10 / 30);
  }

  function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function draw() {
    ctx.clearRect(0, 0, 640, 480);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 640, 480);

    drawSans();
    if (state.phase === "attack") {
      drawBox();
      drawPlatforms();
      drawAttacks();
      drawStabs();
      drawBlasters();
      drawHeart();
    } else if (state.phase === "target") {
      drawTarget();
    } else {
      drawTextBox(state.message);
      if (state.phase === "message") drawMiss();
    }
    drawHud();
    if (state.phase === "menu") drawMenuButtons();
  }

  function drawSans() {
    const x = state.sans.x;
    if (sprites.sansLegs.complete) ctx.drawImage(sprites.sansLegs, x - 22, 107);
    const bodyPath = `Animations/SansBody/${state.sans.body || "HandDown"}/000.png`;
    if (!sprites[bodyPath]) sprites[bodyPath] = image(bodyPath);
    if (sprites[bodyPath].complete) ctx.drawImage(sprites[bodyPath], x - 38, 76);
    const headPath = `Animations/SansHead/${state.sans.head || "Default"}/000.png`;
    if (!sprites[headPath]) sprites[headPath] = image(headPath);
    if (sprites[headPath].complete) ctx.drawImage(sprites[headPath], x - 26, 46);
  }

  function drawBox() {
    const b = state.box;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(Math.round(b.l), Math.round(b.t), Math.round(b.r - b.l), Math.round(b.b - b.t));
  }

  function drawPlatforms() {
    for (const p of state.platforms) {
      drawRect(p.x - p.w / 2, p.y - 4, p.w, 8, "#21d421");
    }
  }

  function boneColor(color) {
    if (color === 1) return "#2a55ff";
    if (color === 2) return "#ff9b00";
    return "#fff";
  }

  function drawAttacks() {
    for (const b of state.attacks) {
      ctx.fillStyle = boneColor(b.color);
      if (b.type === "v") {
        ctx.fillRect(Math.round(b.x - 5), Math.round(b.y), 10, Math.round(b.len));
      } else {
        ctx.fillRect(Math.round(b.x), Math.round(b.y - 5), Math.round(b.len), 10);
      }
    }
  }

  function drawStabs() {
    const b = state.box;
    for (const s of state.stabs) {
      const active = s.age >= s.warn;
      let rect;
      if (s.dir === 0) rect = { x: b.l, y: b.t, w: s.dist, h: b.b - b.t };
      if (s.dir === 1) rect = { x: b.l, y: b.t, w: b.r - b.l, h: s.dist };
      if (s.dir === 2) rect = { x: b.r - s.dist, y: b.t, w: s.dist, h: b.b - b.t };
      if (s.dir === 3) rect = { x: b.l, y: b.b - s.dist, w: b.r - b.l, h: s.dist };
      if (!active) {
        ctx.strokeStyle = "#ff2020";
        ctx.lineWidth = 4;
        ctx.strokeRect(rect.x + 2, rect.y + 2, Math.max(1, rect.w - 4), Math.max(1, rect.h - 4));
      } else {
        ctx.fillStyle = "#fff";
        if (s.dir === 0 || s.dir === 2) {
          for (let y = rect.y; y < rect.y + rect.h; y += 18) ctx.fillRect(rect.x, y, rect.w, 9);
        } else {
          for (let x = rect.x; x < rect.x + rect.w; x += 18) ctx.fillRect(x, rect.y, 9, rect.h);
        }
      }
    }
  }

  function drawBlasters() {
    for (const g of state.blasters) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.angle * Math.PI / 180);
      const scale = g.size ? 1.4 : 1;
      if (sprites.gb.complete) ctx.drawImage(sprites.gb, -16 * scale, -14 * scale, 32 * scale, 28 * scale);
      if (g.age >= g.spin && g.age <= g.spin + g.blast) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(12, -8 * scale, 850, 16 * scale);
      }
      ctx.restore();
    }
  }

  function drawHeart() {
    const x = state.heart.x;
    const y = state.heart.y;
    const color = state.mode === 1 ? "#003cff" : "#ff0000";
    const pixels = [
      "01100110",
      "11111111",
      "11111111",
      "11111111",
      "01111110",
      "00111100",
      "00011000",
      "00000000",
    ];
    ctx.fillStyle = color;
    for (let row = 0; row < pixels.length; row++) {
      for (let col = 0; col < pixels[row].length; col++) {
        if (pixels[row][col] === "1") {
          ctx.fillRect(Math.round(x - 8 + col * 2), Math.round(y - 8 + row * 2), 2, 2);
        }
      }
    }
    drawRect(x - 2, y - 2, 4, 4, "rgba(255,255,255,0.65)");
  }

  function drawTextBox(text) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 250, 576, 122);
    ctx.fillStyle = "#fff";
    ctx.font = "24px Consolas, monospace";
    const lines = String(text || "").split("\n");
    lines.forEach((line, i) => ctx.fillText(line, 58, 295 + i * 30));
  }

  function drawMenuButtons() {
    const y = 432;
    for (let i = 0; i < menuItems.length; i++) {
      const x = 32 + i * 152;
      const selected = state.phase === "menu" && state.selectedMenu === i;
      ctx.strokeStyle = selected ? "#ffff00" : "#ff7f27";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, 405, 118, 42);
      ctx.fillStyle = selected ? "#ffff00" : "#ff7f27";
      ctx.font = "28px Consolas, monospace";
      const icon = menuItems[i] === "FIGHT" ? "/" : menuItems[i] === "ACT" ? "»" : menuItems[i] === "ITEM" ? "☉" : "×";
      ctx.fillText(`${icon}${menuItems[i]}`, x + 11, y + 7);
      if (selected) {
        state.heart.x = x + 17;
        state.heart.y = y;
      }
    }
    if (state.phase === "menu") drawHeart();
  }

  function drawTarget() {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.strokeRect(72, 262, 496, 76);
    ctx.fillStyle = "#b6ff00";
    ctx.fillRect(92, 296, 456, 8);
    ctx.fillStyle = "#ff2020";
    ctx.fillRect(118, 288, 56, 24);
    ctx.fillRect(466, 288, 56, 24);
    ctx.fillStyle = "#00c85f";
    ctx.fillRect(292, 280, 56, 40);
    ctx.fillStyle = "#ffff00";
    ctx.fillRect(Math.round(state.target.x) - 3, 274, 6, 52);
  }

  function drawMiss() {
    ctx.fillStyle = "#fff";
    ctx.font = "34px Consolas, monospace";
    ctx.fillText("MISS", 286, 310);
  }

  function drawHud() {
    const y = state.phase === "attack" ? 424 : 390;
    const barY = y - 17;
    ctx.fillStyle = "#fff";
    ctx.font = "24px Consolas, monospace";
    ctx.fillText("CHARA  LV 19", 32, y);
    ctx.fillText("HP", 250, y);
    drawRect(294, barY, 120, 22, "#7c0000");
    drawRect(294, barY, 120 * state.hp / state.maxHp, 22, "#ffff00");
    if (state.kr > 0) drawRect(294 + 120 * (state.hp - state.kr) / state.maxHp, barY, 120 * state.kr / state.maxHp, 22, "#ff5fff");
    ctx.fillStyle = "#fff";
    ctx.fillText(`${Math.ceil(state.hp)} / ${state.maxHp}`, 438, y);
  }

  function tick(now) {
    const dt = Math.min(1 / 20, ((now - (tick.last || now)) / 1000) || 0);
    tick.last = now;
    if (!state.paused) {
      state.time += dt;
      if (state.phase === "attack") {
        stepTimeline(dt);
        updateHeart(dt);
        updateObjects(dt);
        collide();
        if (state.ended) enterMenu("* sans is sparing you.");
      } else if (state.phase === "target") {
        state.target.x += state.target.dir * 430 * dt;
        if (state.target.x > 548) { state.target.x = 548; state.target.dir = -1; }
        if (state.target.x < 92) { state.target.x = 92; state.target.dir = 1; }
      } else if (state.phase === "message") {
        state.messageTimer -= dt;
        if (state.messageTimer <= 0) nextSequenceAttack();
      }
      if (state.kr > 0 && state.phase !== "attack") state.kr = Math.max(0, state.kr - 10 * dt);
    }
    draw();
    hpText.textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
    krText.textContent = `${Math.ceil(state.kr)}`;
    timeText.textContent = state.time.toFixed(2);
    modeText.textContent = state.mode === 0 ? "RED" : "BLUE";
    requestAnimationFrame(tick);
  }

  window.addEventListener("keydown", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(key);
    if (!e.repeat) handleActionKey(key);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.delete(key);
  });

  function handleActionKey(key) {
    const confirm = key === "z" || key === "Enter" || key === " ";
    const cancel = key === "x" || key === "Escape";
    if (state.phase === "menu") {
      if (key === "ArrowLeft" || key === "a") state.selectedMenu = (state.selectedMenu + 3) % 4;
      if (key === "ArrowRight" || key === "d") state.selectedMenu = (state.selectedMenu + 1) % 4;
      if (confirm) {
        if (state.selectedMenu === 0) startTarget();
        if (state.selectedMenu === 1) enterMenu("* CHECK\n* SANS 1 ATK 1 DEF\n* The easiest enemy.");
        if (state.selectedMenu === 2) enterMenu("* You have no items in this quick build.");
        if (state.selectedMenu === 3) enterMenu("* Spare is disabled here.");
      }
    } else if (state.phase === "target") {
      if (confirm) finishTarget();
      if (cancel) enterMenu("* sans is sparing you.");
    }
  }

  restartBtn.addEventListener("click", () => loadAttack(attackSelect.value, { phase: "attack" }));
  attackSelect.addEventListener("change", () => loadAttack(attackSelect.value, { phase: "attack" }));
  pauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
  });
  debugToggle.addEventListener("change", () => {
    document.getElementById("sans-app").classList.toggle("show-debug", debugToggle.checked);
  });

  loadAttack(attackSelect.value, { phase: "menu" }).then(() => enterMenu()).catch(err => {
    scriptInfo.textContent = err.message;
  });
  requestAnimationFrame(tick);
})();
