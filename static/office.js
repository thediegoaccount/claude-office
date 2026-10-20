/* Claude Office — cena isométrica ao vivo das sessões do Claude Code + painéis. */
(function () {
  "use strict";
  const doc = document;
  const TEST = !!window.__OFFICE_TEST__;
  const $ = (id) => doc.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = {
    get(k, d) { try { const v = window.localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } },
  };

  // ---------- 4.1 projeção ----------
  const TW = 64, TH = 32, MAIN_W = 20, W = 33, H = 14, WALL = 120;
  const WH = H + 8;  // profundidade total: prédio (0..H) + faixa de lazer na frente (H..WH)
  const OX = WH * TW / 2 + 40, OY = WALL + 40;
  function iso(x, y, z = 0) { return [OX + (x - y) * TW / 2, OY + (x + y) * TH / 2 - z]; }

  // ---------- 4.2 planta ----------
  const WINDOWS = [1.2, 5.0, 21.4];
  const BRAND = "CLAUDE OFFICE";
  const SPLIT_X = 13, SPLIT_Y = 7, PW = 0.16;
  const DOORS = { sala: [4.4, 6.0], cozinha: [10.4, 12.0], salaCozinha: [15.6, 17.2] };
  const LIVING = { x0: 9, y0: 0, x1: SPLIT_X, y1: 4 };
  const DESKS = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) DESKS.push({ x: 1.0 + c * 2.9, y: 2.0 + r * 3.0, room: "main" });
  const ANNEX_X = MAIN_W + 0.16, ANNEX_DOORS = [[4.4, 6.0], [9.6, 11.2]];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) DESKS.push({ x: 21.4 + c * 2.8, y: 2.0 + r * 3.1, room: "annex" });
  const seatFor = (d) => (d.room === "annex" ? { x: d.x + 0.6, y: d.y + 1.15 } : { x: d.x + 0.6, y: d.y - 0.45 });
  const seatTarget = (d) => ({ ...seatFor(d), pose: "sit", back: d.room === "annex" });
  const BEANBAGS = [[21.3, 11.9, "#e84393"], [22.6, 12.5, "#00cec9"], [23.9, 11.9, "#fdcb6e"]];
  const FOOSBALL = { x: 26.2, y: 11.6, w: 1.9, d: 0.9 };
  const BAR = { x: 29.8, y: 11.3, w: 2.8, d: 0.7 };
  const MANAGER = { x: 15.2, y: 1.6, w: 2.6, d: 1.0 };
  const SOFA = { x: 11.6, y: 0.45, len: 3.6 };
  const SOFA_SEATS = [0, 1, 2, 3].map((k) => ({ x: SOFA.x + 0.4, y: SOFA.y + 0.5 + k * 0.85 }));
  const COFFEE_TABLE = { x: 10.0, y: 1.4, w: 0.9, d: 1.25 };
  const TV = { x: 9.4, y: 0.1, w: 1.8, d: 0.45 };
  const STANDING = [0, 1, 2, 3, 4, 5].map((k) => ({ x: 15.0 + (k % 3) * 0.9, y: 3.4 + Math.floor(k / 3) * 1.0 }));
  const CAFE = { x: 14.0, y: 7.4 };
  const FRIDGE = { x: 18.6, y: 7.4, w: 0.9, d: 0.9 };
  const HIGH_TABLE = { x: 16.4, y: 10.6, w: 0.7, d: 0.7 };
  const COOLER = { x: 19.3, y: 13.3 };
  const CAFE_SPOTS = [[0.3, 1.6], [1.4, 1.5], [2.5, 1.6], [3.6, 1.5], [0.6, 3.0], [4.1, 3.0], [1.1, 4.5], [3.6, 4.8]].map(([dx, dy]) => ({ x: CAFE.x + dx, y: CAFE.y + dy }));
  const PLANTS = [[0.3, 0.3], [8.6, 0.3], [0.3, H - 0.8], [12.3, 13.2], [13.5, 0.3], [MAIN_W - 0.8, 6.2], [MAIN_W - 0.8, 13.2], [13.5, 13.2],
    [ANNEX_X + 0.3, 0.3], [W - 0.8, 0.3], [W - 0.8, 13.2], [ANNEX_X + 0.3, 13.2]];
  const DOOR_SPOT = { x: 0.6, y: H - 1.8 };
  const SUB_SPOTS = [[2.05, -0.35], [2.05, 0.45], [-0.45, 0.45], [-0.45, -0.35], [0.5, 1.35], [1.4, 1.35]];
  const CHAIR = { x: MANAGER.x + 1.1, y: MANAGER.y - 0.5, pose: "sit" };
  const COUNTER = { x: SPLIT_X + 0.25, y: CAFE.y, w: 0.65, d: 3.8 };
  // ---------- 4.2b ambientes de lazer (faixa da frente, estilo Habbo) ----------
  const FUN_X = [11, 22];
  const FRONT_GAPS = [[8.8, 10.6], [15.0, 17.0], [24.4, 26.0]];
  const FUN_DOOR = [17.4, 19.0];
  const CONF_TABLE = { x: 2.5, y: 17.0, w: 6.0, d: 1.6 };
  const PROJ_SCREEN = { x: 0.35, y: 16.6, w: 0.3, d: 2.4 };
  const TROPHY_SHELF = { x: 0.35, y: 20.5, w: 1.6, d: 0.5 };
  const FOUNTAIN = { x: 16.6, y: 18.2, r: 0.9 };
  const PARASOL = { x: 19.2, y: 15.7, w: 0.6, d: 0.6 };
  const BENCHES = [{ x: 12.0, y: 21.25, w: 1.6 }, { x: 19.4, y: 21.25, w: 1.6 }];
  const ARCADES = [22.6, 26.4, 27.8, 29.2, 30.6].map((x, i) => ({ x, y: 14.45, w: 0.8, d: 0.6, col: ["#e84393", "#00cec9", "#fdcb6e", "#6c5ce7", "#ff7675"][i] }));
  const POOL = { x: 23.4, y: 17.0, w: 2.4, d: 1.3 };
  const DANCE = { x: 27.0, y: 17.0, w: 4.0, d: 3.6 };
  const JUKEBOX = { x: 32.0, y: 15.6, w: 0.6, d: 0.5 };
  const FUN_PLANTS = [[11.35, 14.4], [21.25, 14.4], [11.35, WH - 0.8], [21.25, WH - 0.8], [W - 0.8, WH - 0.8], [W - 0.8, 14.4]];
  const FUN = {
    meeting: [3.1, 4.3, 5.5, 6.7, 7.9].flatMap((x) => [{ x, y: CONF_TABLE.y - 0.5, pose: "sit", back: false },
      { x, y: CONF_TABLE.y + CONF_TABLE.d + 0.5, pose: "sit", back: true }]),
    terrace: [
      ...BENCHES.flatMap((b) => [{ x: b.x + 0.4, y: b.y + 0.15, pose: "sit", back: false }, { x: b.x + 1.2, y: b.y + 0.15, pose: "sit", back: false }]),
      { x: PARASOL.x - 0.45, y: PARASOL.y + 0.3, pose: "sit", back: false }, { x: PARASOL.x + 1.05, y: PARASOL.y + 0.3, pose: "sit", back: false },
      { x: FOUNTAIN.x - 1.7, y: FOUNTAIN.y, pose: "stand", back: false }, { x: FOUNTAIN.x + 1.7, y: FOUNTAIN.y, pose: "stand", back: false },
      { x: FOUNTAIN.x, y: FOUNTAIN.y + 1.8, pose: "stand", back: true },
    ],
    arcade: [
      ...ARCADES.map((m) => ({ x: m.x + 0.4, y: m.y + m.d + 0.5, pose: "stand", back: true })),
      { x: POOL.x - 0.45, y: POOL.y + 0.65, pose: "stand", back: false }, { x: POOL.x + POOL.w + 0.45, y: POOL.y + 0.65, pose: "stand", back: false },
      ...[0, 1, 2].flatMap((i) => [0, 1].map((j) => ({ x: DANCE.x + 0.8 + i * 1.2, y: DANCE.y + 0.8 + j * 1.6, pose: "dance", back: false }))),
    ],
  };
  const VENUES = ["terrace", "arcade", "meeting"];
  const PRESENTER = { x: PROJ_SCREEN.x + PROJ_SCREEN.w + 0.45, y: PROJ_SCREEN.y + PROJ_SCREEN.d / 2, pose: "present", back: false };
  const STRINGS = [[[11.6, 14.6], [21.6, 14.6]], [[11.6, 21.6], [21.6, 21.6]], [[11.6, 14.6], [21.6, 21.6]]];
  const FLOORS = {
    office: ["#4b96b7", "#4f9dbf", "#7cc4e0", "#2f7391"], stage: ["#5f6f7f", "#66778a", "#8ea0b3", "#3f4c58"],
    sala: ["#9c6b45", "#a5744c", "#c9956a", "#6b4630"], cozinha: ["#e8e4dc", "#cfcac0", "#f7f4ee", "#9f988c"],
    annex: ["#6f7a80", "#77838a", "#98a4ab", "#4f595e"], lounge: ["#3d3f5c", "#44476a", "#6a6e96", "#2a2c40"],
    meeting: ["#5d6d7e", "#566573", "#85929e", "#34495e"], deck: ["#b07b4f", "#a8744a", "#c99868", "#7a5233"],
    grass: ["#5fb04a", "#58a744", "#7fcf68", "#3d7a2e"], arcade: ["#2a2340", "#2f2748", "#4a3f6b", "#1a1530"],
  };
  const LAB_CHAIRS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];

  // ---------- status, ferramentas, aparência ----------
  const STATUS_COLORS = { working: "#4cd964", thinking: "#5ac8fa", waiting: "#ffcc00", away: "#6b7c88", done: "#a29bfe" };
  const STATUS_LABEL = { working: "trabalhando", thinking: "pensando", waiting: "terminou, sua vez", away: "ausente", done: "subagente entregou" };
  const TOOL_COLORS = { EXEC: "#ff9f43", READ: "#74b9ff", EDIT: "#ffeaa7", WRITE: "#fdcb6e", GREP: "#a29bfe", FIND: "#a29bfe", WEB: "#55efc4",
    TODO: "#fab1a0", SKILL: "#e17055", SUBAGENTE: "#fd79a8", MCP: "#00cec9", FALA: "#ffffff", GERENTE: "#ffcc33", "CAFÉ": "#d7ccc8" };
  const LEVEL_COLORS = ["#7bed9f", "#ffeaa7", "#fdcb6e", "#ff7675"];
  const SHIRTS = ["#e74c3c", "#3498db", "#2ecc71", "#9b59b6", "#f39c12", "#1abc9c", "#e84393", "#34495e", "#d35400", "#16a085"];
  const HAIR = ["#2d1b0e", "#6b3e1f", "#f1c40f", "#c0392b", "#111", "#7f8c8d", "#e67e22", "#8e44ad"];
  const SKIN = ["#f5cba7", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
  const PANTS = ["#2c3e50", "#34495e", "#4b3621", "#1f3a60", "#555", "#7f8c8d", "#2d2d2d"];
  const ACCENTS = ["#c0392b", "#2980b9", "#8e44ad", "#27ae60", "#f1c40f", "#e67e22", "#1a1a1a"];
  const JACKETS = ["#2c3e50", "#1a1a1a", "#4a3b2a", "#5d6d7e", "#6c3483"];
  const HAIR_STYLES = ["short", "long", "parted", "bun", "curly", "cap", "bob", "bald", "long", "short"];
  const TORSOS = ["tie", "plain", "jacket", "cardigan", "dress", "tie", "jacket", "plain"];

  function toolLabel(name) {
    if (!name) return "";
    const map = { Bash: "EXEC", Read: "READ", Edit: "EDIT", MultiEdit: "EDIT", NotebookEdit: "EDIT", Write: "WRITE", Grep: "GREP", Glob: "FIND",
      WebSearch: "WEB", WebFetch: "WEB", TodoWrite: "TODO", Task: "SUBAGENTE", Agent: "SUBAGENTE", Skill: "SKILL", say: "FALA" };
    if (map[name]) return map[name];
    if (name.startsWith("mcp__")) return "MCP:" + (name.split("__")[1] || "").slice(0, 10).toUpperCase();
    return name.slice(0, 12).toUpperCase();
  }
  const toolColor = (label) => TOOL_COLORS[label] || (String(label).startsWith("MCP") ? TOOL_COLORS.MCP : "#dfe6e9");
  const hashStr = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  function lookFor(seed) {
    const h = hashStr(seed);
    const pick = (arr, n) => arr[n % arr.length];
    return { shirt: pick(SHIRTS, h >>> 0), hair: pick(HAIR, h >>> 3), skin: pick(SKIN, h >>> 6), pants: pick(PANTS, h >>> 9),
      accent: pick(ACCENTS, h >>> 12), jacket: pick(JACKETS, h >>> 15), hairStyle: pick(HAIR_STYLES, h >>> 18), torso: pick(TORSOS, h >>> 21),
      glasses: ((h >>> 24) & 3) === 0, bag: ((h >>> 26) & 3) === 0, blush: ((h >>> 28) & 3) === 0 };
  }
  const ARCHETYPES = [
    { key: "beet", nick: "o fazendeiro de beterraba", look: { shirt: "#c9a227", accent: "#6b3e1f", torso: "tie", hairStyle: "parted", hair: "#6b3e1f", glasses: true },
      lines: ["Fato: beterrabas compilam mais rápido.", "Sou o assistente DO gerente regional.", "Ameaça identificada. Bug neutralizado.", "Tenho um plano de evacuação pra esse bug."] },
    { key: "prank", nick: "o rei das pegadinhas", look: { shirt: "#9ecbe8", torso: "tie", accent: "#2c3e50", hairStyle: "short", hair: "#6b3e1f", glasses: false },
      lines: ["*olha para a câmera*", "Alguém viu o grampeador? Tá na gelatina.", "Essa vai pro livro de pegadinhas.", "Prometo: última pegadinha do dia."] },
    { key: "reception", nick: "a recepcionista artista", look: { torso: "cardigan", hairStyle: "long", hair: "#c0392b", shirt: "#f6e7d8", jacket: "#e17055" },
      lines: ["Desenhei esse diagrama no intervalo.", "Recepção, bom dia!", "Posso pintar o mural do deploy?", "Isso ficou fofo, na verdade."] },
    { key: "cats", nick: "a contadora dos gatos", look: { torso: "cardigan", hairStyle: "bun", hair: "#f1c40f", shirt: "#ecf0f1", jacket: "#7f8c8d", blush: false },
      lines: ["Meus gatos fariam um código mais limpo.", "Silêncio, por favor. Estou contando.", "Isso não está nas normas.", "Hmpf."] },
    { key: "crossword", nick: "o das palavras cruzadas", look: { torso: "plain", hairStyle: "bald", glasses: true, shirt: "#34495e" },
      lines: ["Palavra de 6 letras: 'deploy'.", "Não me chame antes do fim do expediente.", "Hoje é dia de pretzel?", "…"] },
    { key: "chili", nick: "o do chili", look: { torso: "plain", hairStyle: "bald", shirt: "#7f8c8d", pants: "#2c3e50" },
      lines: ["Fiz chili e um commit.", "Números. Eu gosto de números.", "Ops.", "Alguém quer confeito?"] },
    { key: "temp", nick: "o estagiário com startup", look: { torso: "jacket", hairStyle: "parted", hair: "#111", jacket: "#1a1a1a", shirt: "#f4f4f4" },
      lines: ["Tenho uma ideia de startup.", "Isso aqui é muito 2010.", "Mandei notificação em 6 canais.", "Sou praticamente sênior."] },
    { key: "acapella", nick: "o vendedor a cappella", look: { torso: "cardigan", hairStyle: "short", jacket: "#c0392b", shirt: "#f4f4f4" },
      lines: ["♪ Compilaaando em quatro vozes ♪", "Já falei que estudei numa Ivy League?", "Vamos fazer um jingle desse bug?", "Cachorrão na área!"] },
    { key: "knitter", nick: "a tricoteira", look: { torso: "dress", hairStyle: "curly", hair: "#7f8c8d", shirt: "#e84393" },
      lines: ["Tricotei um gorro enquanto o build rodava.", "Que gracinha esse teste.", "Meu marido vende geladeiras, sabia?"] },
    { key: "mystery", nick: "o misterioso do controle de qualidade", look: { torso: "plain", hairStyle: "long", hair: "#bdc3c7", shirt: "#5d6d7e" },
      lines: ["Ninguém sabe o que eu faço aqui.", "Já fui um processo zumbi.", "Esse bug existia antes de mim.", "Tenho três identidades no git."] },
    { key: "drama", nick: "a que sabe todas as fofocas", look: { torso: "dress", hairStyle: "long", hair: "#111", shirt: "#fd79a8", blush: true },
      lines: ["Ai meu Deus, viu esse diff?", "Isso é muito drama.", "Preciso contar pra alguém.", "Tô literalmente morrendo."] },
    { key: "actually", nick: "o 'na verdade…'", look: { torso: "jacket", hairStyle: "short", hair: "#2d1b0e", jacket: "#34495e", shirt: "#ecf0f1" },
      lines: ["Na verdade, tem um jeito mais eficiente.", "Corrigindo a gramática do commit.", "Isso é tecnicamente incorreto."] },
    { key: "hr", nick: "o do RH", look: { torso: "cardigan", hairStyle: "bald", jacket: "#95a5a6", shirt: "#ecf0f1" },
      lines: ["Lembrando: commits respeitosos, pessoal.", "Ninguém me chamou pro happy hour.", "Vou ter que registrar isso."] },
    { key: "warehouse", nick: "o do armazém", look: { torso: "plain", hairStyle: "cap", accent: "#e67e22", shirt: "#2980b9" },
      lines: ["Subi o container no braço.", "Calma, pessoal.", "No armazém isso já tava pronto."] },
  ];
  const archetypeFor = (seed) => ARCHETYPES[hashStr(`arch:${seed}`) % ARCHETYPES.length];
  const LINES = {
    working: ["bora!", "compilou de primeira 😎", "quem escreveu isso? ah, fui eu", "testes verdes, alma leve", "mais um café e eu termino"],
    thinking: ["deixa eu pensar…", "🤔", "e se…", "tem um jeito melhor"],
    waiting: ["terminei, sua vez", "esperando você 👀"],
    away: ["zZz…", "sonhando com o deploy"],
    cafe: ["esse café tá forte", "alguém viu minha caneca?", "pão de queijo saiu!"],
    terrace: ["que solzinho bom", "a fonte acalma", "pausa merecida"],
    arcade: ["recorde novo!", "só mais uma ficha", "olha esse combo!"],
    meeting: ["essa reunião podia ser um e-mail", "próximo slide…", "alguém trouxe os donuts?"],
    sofa: ["5 minutinhos…", "zZz"],
  };
  const BOSS_LINES = ["Melhor chefe do mundo. Tá escrito na caneca.", "Reunião em 5 min na sala de reunião!", "Não sou só o chefe, sou amigo primeiro.", "Hoje tem troféu pro melhor commit!"];
  const MANAGER_LOOK = { shirt: "#f4f4f4", hair: "#2d1b0e", skin: "#f5cba7", pants: "#1a1a1a", accent: "#c0392b", jacket: "#1a1a1a",
    hairStyle: "parted", torso: "jacket", glasses: true, bag: false, blush: false };
  function modelShort(m) {
    if (!m) return "padrão do CLI";
    const s = String(m).replace(/^claude-/, "").replace(/-\d{8}$/, "").replace(/\[.*\]$/, "");
    const mm = s.match(/^([a-z]+)-(\d+)(?:-(\d+))?/i);
    return mm ? mm[1][0].toUpperCase() + mm[1].slice(1) + " " + mm[2] + (mm[3] ? "." + mm[3] : "") : s;
  }
  function costLevel(model, effort) {
    const m = String(model || "").toLowerCase();
    let lv = /opus|fable/.test(m) ? 3 : /haiku|flash|mini|nano/.test(m) ? 1 : 2;
    lv += ({ low: -1, high: 1, xhigh: 1, max: 2 })[effort] || 0;
    const mc = (S.state && S.state.model_costs) || {};
    const vals = Object.values(mc).filter((v) => v > 0).sort((a, b) => a - b);
    if (mc[model] && vals.length >= 2) {
      const med = vals[Math.floor(vals.length / 2)];
      if (mc[model] > 2 * med) lv++;
      else if (mc[model] < med / 2) lv--;
    }
    return clamp(lv, 1, 4);
  }

  // ---------- 4.3 obstáculos e caminhos ----------
  const OBSTACLES = [];
  const ob = (x, y, w, d) => OBSTACLES.push([x, y, w, d]);
  DESKS.forEach((d) => ob(d.x, d.y, 1.6, 0.8));
  ob(MANAGER.x, MANAGER.y, MANAGER.w, MANAGER.d);
  ob(SOFA.x + 0.7, SOFA.y, 0.3, SOFA.len); ob(SOFA.x, SOFA.y, 1.0, 0.25); ob(SOFA.x, SOFA.y + SOFA.len - 0.25, 1.0, 0.25);
  ob(COFFEE_TABLE.x, COFFEE_TABLE.y, COFFEE_TABLE.w, COFFEE_TABLE.d);
  ob(TV.x, TV.y, TV.w, TV.d);
  ob(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.d);
  ob(FRIDGE.x, FRIDGE.y, FRIDGE.w, FRIDGE.d);
  ob(HIGH_TABLE.x, HIGH_TABLE.y, HIGH_TABLE.w, HIGH_TABLE.d);
  ob(COOLER.x, COOLER.y, 0.5, 0.5);
  PLANTS.forEach(([x, y]) => ob(x, y, 0.5, 0.5));
  BEANBAGS.forEach(([x, y]) => ob(x - 0.4, y - 0.35, 0.8, 0.7));
  ob(FOOSBALL.x, FOOSBALL.y, FOOSBALL.w, FOOSBALL.d);
  ob(BAR.x, BAR.y, BAR.w, BAR.d);
  ob(CONF_TABLE.x, CONF_TABLE.y, CONF_TABLE.w, CONF_TABLE.d);
  ob(PROJ_SCREEN.x, PROJ_SCREEN.y, PROJ_SCREEN.w, PROJ_SCREEN.d);
  ob(TROPHY_SHELF.x, TROPHY_SHELF.y, TROPHY_SHELF.w, TROPHY_SHELF.d);
  ob(FOUNTAIN.x - FOUNTAIN.r, FOUNTAIN.y - FOUNTAIN.r, FOUNTAIN.r * 2, FOUNTAIN.r * 2);
  ob(PARASOL.x, PARASOL.y, PARASOL.w, PARASOL.d);
  ARCADES.forEach((m) => ob(m.x, m.y, m.w, m.d));
  ob(POOL.x, POOL.y, POOL.w, POOL.d);
  ob(JUKEBOX.x, JUKEBOX.y, JUKEBOX.w, JUKEBOX.d);
  FUN_PLANTS.forEach(([x, y]) => ob(x, y, 0.5, 0.5));
  const WALLS = [];
  function wallRuns(from, to, gaps) {
    const runs = [];
    let a = from;
    for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > a) runs.push([a, g0]); a = g1; }
    if (to > a) runs.push([a, to]);
    return runs;
  }
  for (const [a, b] of wallRuns(0, H, [DOORS.sala, DOORS.cozinha])) { ob(SPLIT_X - PW / 2, a, PW, b - a); WALLS.push({ axis: "y", at: SPLIT_X - PW / 2, a, b, t: PW }); }
  for (const [a, b] of wallRuns(SPLIT_X, MAIN_W, [DOORS.salaCozinha])) { ob(a, SPLIT_Y - PW / 2, b - a, PW); WALLS.push({ axis: "x", at: SPLIT_Y - PW / 2, a, b, t: PW }); }
  for (const [a, b] of wallRuns(0, H, ANNEX_DOORS)) { ob(MAIN_W, a, ANNEX_X - MAIN_W, b - a); WALLS.push({ axis: "y", at: MAIN_W, a, b, t: ANNEX_X - MAIN_W }); }
  for (const [a, b] of wallRuns(0, W, FRONT_GAPS)) { ob(a, H, b - a, PW); WALLS.push({ axis: "x", at: H, a, b, t: PW, low: true }); }
  for (const fx of FUN_X) for (const [a, b] of wallRuns(H + PW, WH, [FUN_DOOR])) { ob(fx, a, PW, b - a); WALLS.push({ axis: "y", at: fx, a, b, t: PW, low: true }); }

  const GRID = 0.5, CLEAR = 0.16, EDGE = 0.25, NX = Math.round(W / GRID), NY = Math.round(WH / GRID);
  function freePoint(x, y, clear = CLEAR) {
    if (x < EDGE || y < EDGE || x > W - EDGE || y > WH - EDGE) return false;
    for (const [ox, oy, w, d] of OBSTACLES) if (x > ox - clear && x < ox + w + clear && y > oy - clear && y < oy + d + clear) return false;
    return true;
  }
  function segmentFree(a, b, clear = CLEAR) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.1));
    for (let i = 0; i <= n; i++) if (!freePoint(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, clear)) return false;
    return true;
  }
  const cellPt = (i, j) => ({ x: (i + 0.5) * GRID, y: (j + 0.5) * GRID });
  const FREE = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const p = cellPt(i, j); FREE.push(freePoint(p.x, p.y)); }
  const isFree = (i, j) => i >= 0 && j >= 0 && i < NX && j < NY && FREE[j * NX + i];
  const edgeCache = new Map();
  function edgeOk(i, j, di, dj) {
    const k = ((j * NX + i) * 9) + (di + 1) * 3 + (dj + 1);
    let v = edgeCache.get(k);
    if (v === undefined) {
      v = isFree(i + di, j + dj) && (di === 0 || dj === 0 || (isFree(i + di, j) && isFree(i, j + dj))) && segmentFree(cellPt(i, j), cellPt(i + di, j + dj));
      edgeCache.set(k, v);
    }
    return v;
  }
  function nearestFree(p, radius = 8) {
    const ci = Math.floor(p.x / GRID), cj = Math.floor(p.y / GRID);
    let best = null, bd = Infinity;
    for (let r = 0; r <= radius; r++) {
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || !isFree(i, j)) continue;
        const c = cellPt(i, j);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bd && segmentFree(p, c, 0.02)) { bd = d; best = { i, j }; }
      }
      if (best && r >= 1) break;
    }
    return best;
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  function route(from, to) {
    const s = nearestFree(from), g = nearestFree(to);
    if (!s || !g) return null;
    const start = s.j * NX + s.i, goal = g.j * NX + g.i;
    const prev = new Int32Array(NX * NY).fill(-1);
    prev[start] = start;
    const q = [start];
    for (let h = 0; h < q.length && prev[goal] < 0; h++) {
      const cur = q[h], i = cur % NX, j = (cur / NX) | 0;
      for (const [di, dj] of DIRS) {
        const n = (j + dj) * NX + (i + di);
        if (i + di < 0 || i + di >= NX || j + dj < 0 || j + dj >= NY || prev[n] >= 0 || !edgeOk(i, j, di, dj)) continue;
        prev[n] = cur;
        q.push(n);
      }
    }
    if (prev[goal] < 0) return null;
    const cells = [];
    for (let c = goal; c !== start; c = prev[c]) cells.push(cellPt(c % NX, (c / NX) | 0));
    cells.push(cellPt(s.i, s.j));
    cells.reverse();
    const pts = [{ x: from.x, y: from.y }, ...cells, { x: to.x, y: to.y }];
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) {
        const end = i === 0 || j === pts.length - 1;
        if (segmentFree(pts[i], pts[j], end ? 0.02 : 0.08)) break;
      }
      out.push(pts[j]);
      i = j;
    }
    return out;
  }
  function roomOf(x, y) {
    if (y >= H) return x < FUN_X[0] ? "meeting" : x < FUN_X[1] ? "terrace" : "arcade";
    if (x >= ANNEX_X) return "annex";
    if (x < SPLIT_X) return "office";
    return y < SPLIT_Y ? "manager" : "kitchen";
  }
  const SPEED = { manager: 3.2, subagent: 3.6, session: 2.8 };

  // ---------- estado ----------
  const S = { state: null, selected: null, room: "office", first: true, hours: +store.get("office.hours", "24") || 24, sound: store.get("office.sound", "1") === "1",
    token: null, cli: null, models: null, jobs: [], unseen: 0, lastPending: new Set(), prevStatus: new Map(), openRefs: new Set(), fullCache: new Map(),
    error: null, lab: { on: false, level: 0 } };
  const clock = { offset: 0, t: Date.now() / 1000 };
  const nowS = () => (TEST ? clock.t : Date.now() / 1000 + clock.offset);
  const avatars = new Map();
  const seats = new Map();
  const manager = { id: "__manager", kind: "manager", name: "Office (gerente)", look: MANAGER_LOOK, x: CHAIR.x, y: CHAIR.y, path: [], goal: { ...CHAIR },
    pose: "sit", back: false, frame: 0, ft: 0, sitT: 1, jump: 0, queue: [], task: null, phraseT: 0, phraseI: 0, say: null };
  const cam = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  const view = { cw: 1280, ch: 720, dpr: 1, scale: 1 };
  const chatQ = [];

  // ---------- 4.4 comportamento ----------
  const isActive = (a) => a.status === "working" || a.status === "thinking";
  function deskOf(av) { return av.desk == null ? null : DESKS[av.desk]; }

  function syncAvatars(agents) {
    const now = nowS();
    const ids = new Set();
    for (const a of agents) {
      ids.add(a.id);
      let av = avatars.get(a.id);
      if (!av) {
        const parent = a.parent && avatars.get(a.parent);
        const start = S.first ? null : a.kind === "subagent" && parent ? { x: parent.x, y: parent.y } : { ...DOOR_SPOT };
        av = { id: a.id, kind: a.kind, parent: a.parent, x: start ? start.x : DOOR_SPOT.x, y: start ? start.y : DOOR_SPOT.y, path: [], goal: null,
          pose: "stand", back: false, frame: 0, ft: 0, sitT: 0, jump: 0, desk: null, place: null, wake: false, leaving: false, placed: !!start, born: now,
          dollarT: 0, dollars: [] };
        avatars.set(a.id, av);
        if (!S.first && a.kind === "subagent" && parent) { burst(parent, "sparkle"); react(parent, "Reforço chegando!"); }
      }
      const was = av.status;
      Object.assign(av, { name: a.title || a.id, status: a.status, model: a.model, effort: a.effort, mode: a.mode, current: a.current, events: a.events || [],
        last: a.last_activity_at, created: a.created_at || 0, data: a, leaving: false });
      const seed = a.look_seed || a.id;
      av.arch = archetypeFor(seed);
      av.look = { ...lookFor(seed), ...av.arch.look };
      if (!S.first && was && isActive({ status: was }) && (a.status === "waiting" || a.status === "done")) {
        burst(av, "confetti");
        react(av, a.kind === "subagent" ? "Entregue! ✔" : "Feito! ✔");
      }
      if (av.kind === "session" && was && !isActive({ status: was }) && isActive(av) && !S.first && (av.place !== "desk" || av.pose === "sleep")) {
        av.wake = true;
        if (!manager.queue.includes(av.id) && !(manager.task && manager.task.id === av.id)) manager.queue.push(av.id);
      }
      if (!isActive(av)) av.wake = false;
    }
    for (const av of avatars.values()) {
      if (!ids.has(av.id) && !av.leaving) {
        av.leaving = true;
        av.desk = null;
        av.wake = false;
      }
    }
  }

  function assignSeats() {
    const all = [...avatars.values()].filter((a) => !a.leaving);
    const sessions = all.filter((a) => a.kind === "session").sort((a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1));
    const subs = all.filter((a) => a.kind === "subagent").sort((a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1));
    const occ = new Array(DESKS.length).fill(null);
    const take = (av, i) => { if (av.desk != null && occ[av.desk] === av) occ[av.desk] = null; if (occ[i] && occ[i] !== av) occ[i].desk = null; occ[i] = av; av.desk = i; };
    for (const s of sessions) { if (s.desk != null && !occ[s.desk]) occ[s.desk] = s; else s.desk = null; }
    const planning = (a) => { const p = avatars.get(a.parent); return !!p && inPlan(p); };
    for (const a of subs) { if (isActive(a) && !planning(a) && a.desk != null && !occ[a.desk]) occ[a.desk] = a; else a.desk = null; }
    const isMain = (i) => DESKS[i].room === "main";
    const find = (pred) => { for (let i = 0; i < DESKS.length; i++) if (pred(i)) return i; return -1; };
    for (const s of sessions) {
      if (s.desk != null && isMain(s.desk)) continue;
      let i = find((k) => isMain(k) && !occ[k]);
      if (i < 0) i = find((k) => isMain(k) && occ[k] && occ[k].kind === "subagent");
      if (i >= 0) { take(s, i); continue; }
      if (s.desk != null) continue;
      i = find((k) => !isMain(k) && !occ[k]);
      if (i < 0) i = find((k) => !isMain(k) && occ[k] && occ[k].kind === "subagent");
      if (i < 0) i = find((k) => occ[k] && occ[k].kind === "subagent");
      if (i >= 0) take(s, i);
    }
    for (const a of subs) {
      if (!isActive(a) || a.desk != null || planning(a)) continue;
      const p = avatars.get(a.parent);
      const base = p && p.desk != null ? DESKS[p.desk] : p ? { x: p.x, y: p.y } : DOOR_SPOT;
      let best = -1, bd = Infinity;
      for (let i = 0; i < DESKS.length; i++) {
        if (occ[i]) continue;
        const d = Math.hypot(DESKS[i].x - base.x, DESKS[i].y - base.y);
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) take(a, best);
    }
    seats.clear();
    occ.forEach((a, i) => { if (a) seats.set(i, a.id); });
  }

  function subSpot(av, k) {
    const p = avatars.get(av.parent);
    const d = p && deskOf(p);
    const base = d ? { x: d.x, y: d.y } : p ? { x: p.x - 0.6, y: p.y + 0.45 } : { x: DOOR_SPOT.x, y: DOOR_SPOT.y };
    for (let n = 0; n < SUB_SPOTS.length; n++) {
      const [dx, dy] = SUB_SPOTS[(k + n) % SUB_SPOTS.length];
      const pt = { x: base.x + dx, y: base.y + dy };
      if (freePoint(pt.x, pt.y, 0.05)) return pt;
    }
    const c = nearestFree(base);
    return c ? cellPt(c.i, c.j) : { ...DOOR_SPOT };
  }

  const IDLE_CYCLE = 1200;
  const venueOrder = (av, round) => { const k = hashStr(`${av.id}:${round}`) % VENUES.length; return [0, 1, 2].map((n) => VENUES[(k + n) % VENUES.length]); };
  function funSpot(av, venues, round, taken) {
    for (const v of venues) {
      const list = FUN[v];
      const start = hashStr(`${av.id}:${v}:${round}`) % list.length;
      for (let n = 0; n < list.length; n++) {
        const i = (start + n) % list.length;
        if (taken.has(`${v}:${i}`)) continue;
        taken.add(`${v}:${i}`);
        return { ...list[i], place: v, spot: i };
      }
    }
    return null;
  }

  const inPlan = (av) => av.kind === "session" && !av.leaving && !av.wake && av.mode === "plan" && (isActive(av) || av.status === "waiting");
  function planMeeting(list, taken) {
    const goals = new Map();
    const planners = list.filter(inPlan);
    S.meeting = planners.length ? { presenter: planners[0].id, title: planners[0].name, current: planners[0].current, status: planners[0].status } : null;
    if (!planners.length) return goals;
    goals.set(planners[0].id, { ...PRESENTER, place: "meeting" });
    const ids = new Set(planners.map((p) => p.id));
    const guests = [...planners.slice(1), ...list.filter((a) => a.kind === "subagent" && !a.leaving && ids.has(a.parent) && isActive(a))];
    let i = 0;
    for (const g of guests) {
      while (i < FUN.meeting.length && taken.has(`meeting:${i}`)) i++;
      if (i >= FUN.meeting.length) break;
      taken.add(`meeting:${i}`);
      goals.set(g.id, { ...FUN.meeting[i], place: "meeting", spot: i });
    }
    return goals;
  }

  function evaluate() {
    const now = nowS();
    const list = [...avatars.values()].sort((a, b) => (a.created - b.created) || (a.id < b.id ? -1 : 1));
    let cafe = 0, sofa = 0, stand = 0;
    const taken = new Set();
    const subCount = new Map();
    const planGoals = planMeeting(list, taken);
    for (const av of list) {
      let g;
      if (av.leaving) g = { ...DOOR_SPOT, pose: "stand", back: false, place: "door" };
      else if (planGoals.has(av.id)) g = planGoals.get(av.id);
      else if (av.kind === "subagent") {
        const k = subCount.get(av.parent) || 0;
        if (av.desk != null && isActive(av)) g = { ...seatTarget(DESKS[av.desk]), pose: av.status === "working" ? "type" : "sit", place: "desk" };
        else { subCount.set(av.parent, k + 1); g = { ...subSpot(av, k), pose: "stand", back: false, place: "sub" }; }
      } else if (av.wake) {
        g = av.goal || { ...seatTarget(DESKS[av.desk || 0]), place: "desk" };
      } else if (isActive(av)) {
        g = av.desk != null ? { ...seatTarget(DESKS[av.desk]), pose: av.status === "working" ? "type" : "sit", place: "desk" }
          : { ...STANDING[stand++ % STANDING.length], pose: "stand", back: false, place: "standing" };
      } else {
        const idle = Math.max(0, now - (av.last || now));
        const cyc = idle % IDLE_CYCLE, round = Math.floor(idle / IDLE_CYCLE);
        if (idle > 7200) {
          g = (sofa < SOFA_SEATS.length ? { ...SOFA_SEATS[sofa++], pose: "sit", back: false, place: "sofa" } : null)
            || funSpot(av, ["terrace", "meeting"], 0, taken)
            || (stand < STANDING.length ? { ...STANDING[stand++], pose: "stand", back: false, place: "standing" } : null);
        } else if (cyc < 480 && av.desk != null) g = { ...seatTarget(DESKS[av.desk]), pose: "sleep", place: "desk" };
        else if (cyc < 720 && cafe < CAFE_SPOTS.length) g = { ...CAFE_SPOTS[cafe++], pose: "cup", back: false, place: "cafe" };
        else if (cyc >= 720) g = funSpot(av, venueOrder(av, round), round, taken);
        if (!g) g = av.desk != null ? { ...seatTarget(DESKS[av.desk]), pose: "sleep", place: "desk" } : { ...STANDING[stand++ % STANDING.length], pose: "stand", back: false, place: "standing" };
      }
      setGoal(av, g);
    }
  }

  function setGoal(av, g) {
    const same = av.goal && Math.abs(av.goal.x - g.x) < 0.01 && Math.abs(av.goal.y - g.y) < 0.01;
    av.goal = g;
    if (!av.placed) { av.x = g.x; av.y = g.y; av.path = []; av.placed = true; av.place = g.place; av.pose = g.pose; av.back = !!g.back; av.sitT = isSitPose(g.pose) ? 1 : 0; return; }
    if (same && (av.path.length || atGoal(av))) { if (atGoal(av)) { av.pose = g.pose; av.back = !!g.back; av.place = g.place; } return; }
    av.path = route(av, g) || [{ x: g.x, y: g.y }];
  }
  const isSitPose = (p) => p === "sit" || p === "type" || p === "sleep";
  const atGoal = (av) => av.goal && Math.hypot(av.x - av.goal.x, av.y - av.goal.y) < 0.02 && !av.path.length;

  function moveAlong(av, dt, speed) {
    let left = speed * dt;
    while (left > 0 && av.path.length) {
      const p = av.path[0];
      const dx = p.x - av.x, dy = p.y - av.y, d = Math.hypot(dx, dy);
      if (d <= left) { av.x = p.x; av.y = p.y; av.path.shift(); left -= d; } else { av.x += dx / d * left; av.y += dy / d * left; av.back = dx + dy < -0.01; left = 0; }
    }
  }

  function stepAvatar(av, dt) {
    const walking = av.path.length > 0;
    if (walking) {
      av.sitT = Math.max(0, av.sitT - dt / 0.26);
      moveAlong(av, dt, SPEED[av.kind] || SPEED.session);
      av.pose = "walk";
      if (!av.path.length && av.goal) { av.pose = av.goal.pose; av.back = !!av.goal.back; av.place = av.goal.place; }
    } else if (av.goal && av.pose !== av.goal.pose && atGoal(av)) { av.pose = av.goal.pose; av.back = !!av.goal.back; av.place = av.goal.place; }
    if (S.state && av.kind !== "manager" && !walking && (S.state.pending || []).some((p) => p.session === av.id)) av.pose = av.place === "desk" ? av.pose : "raise";
    const sit = isSitPose(av.pose) && !walking;
    av.sitT = clamp(av.sitT + (sit ? 1 : -1) * dt / 0.26, 0, 1);
    av.ft += dt;
    const period = av.pose === "walk" ? 0.14 : av.pose === "type" ? 0.16 : av.pose === "dance" ? 0.32 : 0.6;
    if (av.ft >= period) { av.ft = 0; av.frame = (av.frame + 1) % 2; }
    if (av.jump > 0) av.jump = Math.max(0, av.jump - dt);
    if (av.status === "working" && !walking && av.kind !== "manager") {
      av.dollarT -= dt;
      if (av.dollarT <= 0) { av.dollarT = 2.4 / costLevel(av.model, av.effort); av.dollars.push({ t: 0, dx: (Math.random() - 0.5) * 18 }); }
    }
    av.dollars = (av.dollars || []).filter((d) => (d.t += dt) < 1.6);
    if (av.ring > 0) av.ring = Math.max(0, av.ring - dt);
    if (av.react) { av.react.t -= dt; if (av.react.t <= 0) av.react = null; }
    if (av.kind !== "manager") {
      av.reactT = (av.reactT == null ? 6 + Math.random() * 20 : av.reactT) - dt;
      if (av.reactT <= 0) {
        av.reactT = 22 + Math.random() * 30;
        if (!walking && !av.react && [...avatars.values()].filter((o) => o.react).length < 3) react(av, pickLine(av));
      }
    }
  }

  function react(av, text) { if (av) av.react = { text, t: 4.5 }; }
  function pickLine(av) {
    const ctxLines = LINES[av.place] || LINES[av.status] || LINES.working;
    const own = isActive(av) && av.arch ? av.arch.lines : [];
    const pool = own.length && Math.random() < 0.6 ? own : ctxLines;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ---------- partículas (confete, faíscas) ----------
  const FX = [];
  function burst(av, kind) {
    const [px, py] = iso(av.x, av.y, 70);
    const n = kind === "confetti" ? 26 : 14;
    const cols = ["#ff6b6b", "#feca57", "#48dbfb", "#1dd1a1", "#ff9ff3", "#a29bfe"];
    for (let k = 0; k < n; k++) {
      FX.push(kind === "confetti"
        ? { kind, x: px, y: py, vx: (Math.random() - 0.5) * 140, vy: -60 - Math.random() * 110, life: 1.8, max: 1.8, col: cols[k % cols.length], rot: Math.random() * 6 }
        : { kind, x: px + (Math.random() - 0.5) * 40, y: py + (Math.random() - 0.5) * 30, vx: 0, vy: -20 - Math.random() * 20, life: 1.2, max: 1.2, col: "#d6b3ff", rot: 0 });
    }
    if (FX.length > 400) FX.splice(0, FX.length - 400);
  }
  function stepFx(dt) {
    for (let i = FX.length - 1; i >= 0; i--) {
      const p = FX[i];
      p.life -= dt;
      if (p.life <= 0) { FX.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === "confetti") { p.vy += 240 * dt; p.vx *= 0.99; p.rot += dt * 8; }
    }
  }

  function nearSpot(av) {
    for (const [dx, dy] of [[0.75, 0.3], [-0.75, 0.3], [0.3, 0.8], [0.75, -0.3], [-0.75, -0.3], [0, -0.8]]) {
      const p = { x: av.x + dx, y: av.y + dy };
      if (freePoint(p.x, p.y, 0.1) && segmentFree(p, av, 0.0)) return p;
    }
    const c = nearestFree(av);
    return c ? cellPt(c.i, c.j) : { x: av.x, y: av.y };
  }

  function stepManager(dt) {
    const m = manager;
    const atChair = Math.hypot(m.x - CHAIR.x, m.y - CHAIR.y) < 0.05 && !m.path.length;
    if (!m.task) {
      while (m.queue.length) {
        const av = avatars.get(m.queue[0]);
        if (av && av.wake && !av.leaving) break;
        m.queue.shift();
      }
      const next = m.queue.length ? avatars.get(m.queue[0]) : null;
      if (next && next.desk != null && atChair) {
        m.queue.shift();
        m.task = { id: next.id, phase: "dial", t: 0.9, mode: "phone" };
        m.say = `Ligando para ${String(next.name).slice(0, 16)}…`;
      } else if (next && next.desk == null) {
        m.queue.shift();
        m.task = { id: next.id, phase: "go", t: 0, mode: "walk" };
        m.goal = { ...nearSpot(next), pose: "stand", back: false };
        m.path = route(m, m.goal) || [{ x: m.goal.x, y: m.goal.y }];
        m.say = null;
      } else if (!m.path.length && !atChair) {
        m.goal = { ...CHAIR, back: false };
        m.path = route(m, m.goal) || [{ x: CHAIR.x, y: CHAIR.y }];
      }
    } else {
      const T = m.task;
      const av = avatars.get(T.id);
      if (!av || av.leaving || (!av.wake && T.phase !== "talk")) { m.task = null; m.say = null; m.phone = false; if (av) av.ring = 0; }
      else if (T.mode === "phone") {
        m.phone = true;
        T.t -= dt;
        if (T.phase === "dial" && T.t <= 0) { T.phase = "ring"; T.t = 2.2; av.ring = 2.2; }
        else if (T.phase === "ring" && T.t <= 0) {
          av.ring = 0; av.jump = 0.45; av.wake = false;
          react(av, av.place === "desk" ? "Alô? Já vou!" : "Opa, o telefone! Voltando…");
          m.say = `${String(av.name).slice(0, 16)}, chegou comando!`;
          T.phase = "talk"; T.t = 1.4;
          evaluate();
        } else if (T.phase === "talk" && T.t <= 0) { m.task = null; m.say = null; m.phone = false; }
      } else if (T.phase === "go" && !m.path.length) {
        T.phase = "raise"; T.t = 2.6; m.pose = "raise"; m.goal.pose = "raise";
        m.say = `Acorda, ${String(av.name).slice(0, 18)}! Chegou comando`;
      } else if (T.phase === "raise") {
        T.t -= dt;
        if (T.t <= 0) { av.jump = 0.45; av.wake = false; m.task = null; m.say = null; m.goal.pose = "stand"; evaluate(); }
      }
    }
    stepAvatar(m, dt);
    m.phraseT -= dt;
    if (m.phraseT <= 0) { m.phraseT = 4; m.phraseI++; }
  }

  function managerPhrase() {
    if (manager.say) return manager.say;
    const st = S.state;
    if (!st) return "carregando o escritório…";
    const ag = st.agents || [];
    const n = (s) => ag.filter((a) => a.status === s).length;
    const list = [];
    if ((st.pending || []).length) return `${st.pending.length} pedido(s) de permissão no topo!`;
    list.push(`${ag.filter((a) => a.kind === "session").length} agentes no escritório`);
    const sub = ag.find((a) => a.kind === "subagent" && a.status !== "done");
    if (sub) { const p = avatars.get(sub.parent); list.push(`${p ? p.name.slice(0, 18) : "alguém"} chamou reforço`); }
    if (ag.some((a) => a.status === "done")) list.push("subagente entregou o resultado");
    list.push(`${n("working")} trabalhando · ${n("thinking")} pensando · ${n("waiting")} terminaram`);
    const places = { desk: 0, cafe: 0, sofa: 0 };
    for (const av of avatars.values()) if (!isActive(av) && av.kind === "session") places[av.place] = (places[av.place] || 0) + 1;
    const fun = (places.terrace || 0) + (places.arcade || 0) + (places.meeting || 0);
    list.push(`${places.desk} cochilando · ${places.cafe || 0} no café · ${fun} no lazer · ${places.sofa || 0} no sofá`);
    list.push(BOSS_LINES[Math.floor(manager.phraseI / 7) % BOSS_LINES.length]);
    if (S.meeting) list.unshift(`${String(S.meeting.title).slice(0, 18)} está apresentando um plano na sala de reunião`);
    const f = (st.feed || [])[0];
    if (f) list.push(`${String(f.name).slice(0, 16)}: ${toolLabel(f.tool)} ${String(f.text).slice(0, 30)}`);
    return list[manager.phraseI % list.length];
  }

  // ---------- 4.5 câmera e salas ----------
  function bounds(which) {
    if (which === "fun") {
      const l = iso(0, WH)[0], r = iso(W, H)[0], t = iso(0, H, 110)[1], b = iso(W, WH)[1];
      return { x: (l + r) / 2, y: (t + b) / 2, w: r - l + 60, h: b - t + 60 };
    }
    if (which === "all") {
      const l = iso(0, WH)[0], r = iso(W, 0)[0], t = iso(0, 0, WALL)[1], b = iso(W, WH)[1];
      return { x: (l + r) / 2, y: (t + b) / 2, w: r - l + 60, h: b - t + 60 };
    }
    if (which === "annex") {
      const l = iso(ANNEX_X, H)[0], r = iso(W, 0)[0], t = iso(ANNEX_X, 0)[1] - WALL, b = iso(W, H)[1];
      return { x: (l + r) / 2, y: (t + b) / 2 + 20 };
    }
    const l = iso(0, H)[0], r = iso(MAIN_W, 0)[0], t = OY - WALL, b = iso(MAIN_W, H)[1];
    return { x: (l + r) / 2, y: (t + b) / 2 + 20 };
  }
  function viewSize() { return { w: view.cw * view.dpr, h: view.ch * view.dpr, scale: view.scale, dpr: view.dpr }; }
  function camTarget() {
    const o = bounds("office"), a = bounds("annex");
    if (S.room === "annex") return { x: a.x, y: a.y, z: 1 };
    if (S.room === "fun" || S.room === "overview") {
      const b = bounds(S.room === "fun" ? "fun" : "all");
      const vw = view.cw * view.dpr, vh = view.ch * view.dpr;
      return { x: b.x, y: b.y, z: Math.min(1, vw / (b.w * view.scale), vh / (b.h * view.scale)) * 0.97 };
    }
    return { x: o.x, y: o.y, z: 1 };
  }
  function setRoom(r, instant) {
    S.room = r;
    const t = camTarget();
    cam.tx = t.x; cam.ty = t.y; cam.tz = t.z;
    if (instant) { cam.x = t.x; cam.y = t.y; cam.z = t.z; }
    renderTabs();
  }
  function toView(wx, wy) {
    const k = view.scale * cam.z, vw = view.cw * view.dpr, vh = view.ch * view.dpr;
    return [(wx - cam.x) * k + vw / 2, (wy - cam.y) * k + vh / 2];
  }
  function fromView(sx, sy) {
    const k = view.scale * cam.z, vw = view.cw * view.dpr, vh = view.ch * view.dpr;
    return [(sx - vw / 2) / k + cam.x, (sy - vh / 2) / k + cam.y];
  }
  function resize() {
    const cv = $("stage");
    view.cw = cv.clientWidth || 1280; view.ch = cv.clientHeight || 720; view.dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(view.cw * view.dpr); cv.height = Math.round(view.ch * view.dpr);
    const needW = (MAIN_W + H) * TW / 2 + 80, needH = (MAIN_W + H) * TH / 2 + WALL + 160;
    view.scale = Math.max(0.5, Math.floor(Math.min(view.cw / needW, view.ch / needH) * view.dpr * 4) / 4);
    roomCache = null;
    setRoom(S.room, true);
  }

  // ---------- desenho ----------
  let ctx = null, roomCache = null;
  const hits = [];
  function poly(c, pts, fill, stroke, lw) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
  }
  function box(x, y, w, d, h, [top, left, right], z = 0, c = ctx) {
    const a = iso(x, y, z + h), b = iso(x + w, y, z + h), cc = iso(x + w, y + d, z + h), e = iso(x, y + d, z + h);
    const c0 = iso(x + w, y + d, z), b0 = iso(x + w, y, z), e0 = iso(x, y + d, z);
    if (left) poly(c, [e0, c0, cc, e], left);
    if (right) poly(c, [c0, b0, b, cc], right);
    if (top) poly(c, [a, b, cc, e], top);
  }
  function dropShadow(x, y, w, d, alpha = 0.22, c = ctx) {
    poly(c, [iso(x + 0.08, y + 0.08), iso(x + w + 0.12, y + 0.08), iso(x + w + 0.12, y + d + 0.12), iso(x + 0.08, y + d + 0.12)], `rgba(0,0,0,${alpha})`);
  }
  const shade = (hex, k) => (window.Sprites ? window.Sprites.shade(hex, k) : hex);
  const B3 = (hex) => [hex, shade(hex, 0.78), shade(hex, 0.62)];

  function zoneOf(x, y) {
    if (y >= H) return x < FUN_X[0] ? "meeting" : x < FUN_X[1] ? (x < 14.5 ? "deck" : "grass") : "arcade";
    if (x >= ANNEX_X) return y >= 10.8 ? "lounge" : "annex";
    if (x >= MAIN_W) return null;
    if (x >= SPLIT_X) return y < SPLIT_Y ? "stage" : "cozinha";
    if (x >= LIVING.x0 && y < LIVING.y1) return "sala";
    return "office";
  }

  function drawRoom() {
    const cw = Math.ceil((iso(W, 0)[0] + 60) * view.scale), chh = Math.ceil((iso(W, WH)[1] + 60) * view.scale);
    const cv = doc.createElement("canvas");
    cv.width = cw; cv.height = chh;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    // laje
    poly(c, [iso(0, WH), iso(W, WH), iso(W, WH, -16), iso(0, WH, -16)], "#1d4557");
    poly(c, [iso(W, 0), iso(W, WH), iso(W, WH, -16), iso(W, 0, -16)], "#163a4a");
    // piso
    for (let j = 0; j < WH; j++) {
      for (let i = 0; i < W; i++) {
        const z = zoneOf(i + 0.5, j + 0.5);
        if (!z) continue;
        const x0 = i === MAIN_W && j < H ? ANNEX_X : i, pal = FLOORS[z];
        poly(c, [iso(x0, j), iso(i + 1, j), iso(i + 1, j + 1), iso(x0, j + 1)], (i + j) % 2 ? pal[1] : pal[0]);
        c.globalAlpha = 0.35;
        c.strokeStyle = pal[2]; c.lineWidth = 1;
        c.beginPath(); c.moveTo(...iso(x0, j)); c.lineTo(...iso(i + 1, j)); c.stroke();
        c.strokeStyle = pal[3];
        c.beginPath(); c.moveTo(...iso(i + 1, j)); c.lineTo(...iso(i + 1, j + 1)); c.stroke();
        c.globalAlpha = 1;
        if (z === "sala") {
          c.strokeStyle = pal[3]; c.globalAlpha = 0.5;
          for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(...iso(i, j + k / 4)); c.lineTo(...iso(i + 1, j + k / 4)); c.stroke(); }
          c.globalAlpha = 1;
        }
        if (z === "deck") {
          c.strokeStyle = pal[3]; c.globalAlpha = 0.45;
          for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(...iso(i + k / 3, j)); c.lineTo(...iso(i + k / 3, j + 1)); c.stroke(); }
          c.globalAlpha = 1;
        }
        if (z === "grass") {
          for (let k = 0; k < 5; k++) {
            const h = hashStr(`g${i},${j},${k}`);
            const [px, py] = iso(i + (h % 97) / 97, j + ((h >>> 8) % 89) / 89);
            c.fillStyle = k === 0 && h % 7 === 0 ? ["#fff", "#ffd32a", "#ff6b81"][h % 3] : "rgba(30,90,25,.45)";
            c.fillRect(px, py - 2, 1.5, 3);
          }
        }
        if (z === "arcade") {
          for (let k = 0; k < 2; k++) { const h = hashStr(`a${i},${j},${k}`); const [px, py] = iso(i + (h % 97) / 97, j + ((h >>> 8) % 89) / 89); c.fillStyle = ["#ff6be6", "#7ff6ff", "#fdcb6e"][h % 3]; c.globalAlpha = 0.35; c.fillRect(px, py, 2, 2); c.globalAlpha = 1; }
        }
        if (z === "annex" || z === "lounge") {
          c.fillStyle = z === "annex" ? "rgba(40,45,50,.35)" : "rgba(255,255,255,.08)";
          for (let k = 0; k < 3; k++) { const h = hashStr(`${i},${j},${k}`); const [px, py] = iso(i + (h % 97) / 97, j + ((h >>> 8) % 89) / 89); c.fillRect(px, py, 2, 2); }
        }
      }
    }
    // gap da divisória do anexo
    poly(c, [iso(MAIN_W, 0), iso(ANNEX_X, 0), iso(ANNEX_X, H), iso(MAIN_W, H)], "#3f4c58");
    // tapete da sala de reunião e caminho de pedras do terraço
    poly(c, [iso(1.8, 16.2), iso(9.2, 16.2), iso(9.2, 19.8), iso(1.8, 19.8)], "#3d566e", "#2c3e50", 2);
    for (let k = 0; k < 7; k++) {
      const [px, py] = iso(16.0, H + 0.5 + k * 0.42);
      c.fillStyle = "#d5d0c4"; c.beginPath(); c.ellipse(px + (k % 2 ? 6 : -6), py, 9, 4.5, 0, 0, Math.PI * 2); c.fill();
    }
    // tapete da cafeteria
    poly(c, [iso(14.7, 9.6), iso(18.9, 9.6), iso(18.9, 12.9), iso(14.7, 12.9)], "#b5653a", "#7a3e1f", 2);
    poly(c, [iso(15.0, 9.9), iso(18.6, 9.9), iso(18.6, 12.6), iso(15.0, 12.6)], null, "rgba(255,225,180,.45)", 1.5);
    for (let k = 0; k < 4; k++) { const [px, py] = iso(15.6 + k * 0.85, 11.25); c.fillStyle = "rgba(255,225,180,.4)"; c.fillRect(px - 3, py - 1.5, 6, 3); }
    // tapete vermelho e faixa dourada
    poly(c, [iso(9.5, 0.9), iso(11.5, 0.9), iso(11.5, 3.4), iso(9.5, 3.4)], "#b03a3a", "#7d2222", 2);
    c.strokeStyle = "#d4a017"; c.lineWidth = 3;
    c.beginPath(); c.moveTo(...iso(SPLIT_X + 0.1, 6.6)); c.lineTo(...iso(MAIN_W - 0.05, 6.6)); c.stroke();
    // paredes
    const backWall = (x0, x1) => {
      poly(c, [iso(x0, 0), iso(x1, 0), iso(x1, 0, WALL), iso(x0, 0, WALL)], "#c6d6df");
      poly(c, [iso(x0, 0), iso(x1, 0), iso(x1, 0, 8), iso(x0, 0, 8)], "#80979f");
      poly(c, [iso(x0, 0, WALL), iso(x1, 0, WALL), iso(x1, -0.18, WALL), iso(x0, -0.18, WALL)], "#4d6472");
    };
    poly(c, [iso(0, 0), iso(0, H), iso(0, H, WALL), iso(0, 0, WALL)], "#a9bcc8");
    poly(c, [iso(0, 0), iso(0, H), iso(0, H, 8), iso(0, 0, 8)], "#6e8592");
    poly(c, [iso(0, 0, WALL), iso(0, H, WALL), iso(-0.18, H, WALL), iso(-0.18, 0, WALL)], "#4d6472");
    backWall(0, MAIN_W);
    backWall(ANNEX_X, W);
    // janelas + feixe de luz (o céu muda com a hora: dia, entardecer, noite)
    const phase = skyPhase(nightLevel(localHour()));
    const SKY = { day: ["#7cc8f5", "#e3f6ff"], dusk: ["#5b4a8a", "#ffad6b"], night: ["#060d24", "#1b2c55"] };
    for (const wx of WINDOWS) {
      const g = c.createLinearGradient(0, iso(wx, 0, 100)[1], 0, iso(wx, 0, 34)[1]);
      g.addColorStop(0, SKY[phase][0]); g.addColorStop(1, SKY[phase][1]);
      poly(c, [iso(wx, 0, 30), iso(wx + 2.2, 0, 30), iso(wx + 2.2, 0, 102), iso(wx, 0, 102)], "#e8eef2");
      poly(c, [iso(wx + 0.1, 0, 34), iso(wx + 2.1, 0, 34), iso(wx + 2.1, 0, 98), iso(wx + 0.1, 0, 98)], g);
      c.strokeStyle = "#e8eef2"; c.lineWidth = 3;
      if (phase === "night") {
        c.fillStyle = "#e8ecff";
        for (let k = 0; k < 9; k++) {
          const h = hashStr(`${wx}:${k}`);
          const [sx, sy] = iso(wx + 0.15 + ((h % 97) / 97) * 1.8, 0, 40 + ((h >>> 8) % 55));
          c.fillRect(sx, sy, k % 3 ? 1.5 : 2.5, k % 3 ? 1.5 : 2.5);
        }
        if (wx === WINDOWS[1]) {
          const [mx, my] = iso(wx + 1.6, 0, 84);
          c.fillStyle = "#fdf6d8"; c.beginPath(); c.arc(mx, my, 7, 0, Math.PI * 2); c.fill();
          c.fillStyle = SKY.night[0]; c.beginPath(); c.arc(mx + 3, my - 2, 6, 0, Math.PI * 2); c.fill();
        }
      } else if (phase === "dusk" && wx === WINDOWS[0]) {
        const [sx, sy] = iso(wx + 1.5, 0, 46);
        c.fillStyle = "#ffcf6e"; c.beginPath(); c.arc(sx, sy, 8, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = "#e8eef2"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(...iso(wx + 1.1, 0, 34)); c.lineTo(...iso(wx + 1.1, 0, 98)); c.stroke();
      const beam = { day: "rgba(255,255,230,.07)", dusk: "rgba(255,170,90,.06)", night: "rgba(150,170,255,.035)" }[phase];
      poly(c, [iso(wx + 0.2, 0.1), iso(wx + 2.2, 0.1), iso(wx + 3.4, 3.2), iso(wx + 1.4, 3.2)], beam);
    }
    // quadros e porta de entrada na parede esquerda
    for (const [py, col] of [[3.2, "#e74c3c"], [7.4, "#3498db"]]) {
      poly(c, [iso(0, py, 50), iso(0, py + 1.4, 50), iso(0, py + 1.4, 90), iso(0, py, 90)], "#5a4334");
      poly(c, [iso(0, py + 0.12, 55), iso(0, py + 1.28, 55), iso(0, py + 1.28, 85), iso(0, py + 0.12, 85)], col);
    }
    const dy0 = H - 2.6;
    poly(c, [iso(0, dy0 - 0.1, 0), iso(0, dy0 + 1.3, 0), iso(0, dy0 + 1.3, 86), iso(0, dy0 - 0.1, 86)], "#5a4334");
    poly(c, [iso(0, dy0, 0), iso(0, dy0 + 1.2, 0), iso(0, dy0 + 1.2, 80), iso(0, dy0, 80)], "#8b5a3c");
    c.fillStyle = "#f1c40f"; const kn = iso(0, dy0 + 0.25, 40); c.fillRect(kn[0] - 2, kn[1] - 2, 4, 4);
    // letreiro Claude Office
    c.save();
    const sg = iso(15.0, 0, 96);
    c.transform(1, 0.5, 0, 1, sg[0], sg[1]);
    c.fillStyle = "#3a2a00"; c.fillRect(-2, -2, 128, 26);
    c.fillStyle = "#ffcc33"; c.fillRect(0, 0, 124, 22);
    c.fillStyle = "#3a2a00"; c.font = "bold 11px Verdana"; c.textBaseline = "middle"; c.fillText(BRAND, 10, 11);
    c.restore();
    // neon STARTUP LAB e quadro branco
    c.save();
    const ng = iso(28.0, 0, 104);
    c.transform(1, 0.5, 0, 1, ng[0], ng[1]);
    c.fillStyle = "#16122a"; c.fillRect(0, 0, 150, 58);
    c.font = "bold 20px Verdana"; c.textBaseline = "top";
    c.shadowColor = "#ff2fd1"; c.shadowBlur = 10; c.fillStyle = "#ff6be6"; c.fillText("STARTUP", 12, 6);
    c.shadowColor = "#00e5ff"; c.fillStyle = "#7ff6ff"; c.fillText("LAB ⚡", 40, 30);
    c.restore();
    c.save();
    const wb = iso(24.4, 0, 96);
    c.transform(1, 0.5, 0, 1, wb[0], wb[1]);
    c.fillStyle = "#9aa7b0"; c.fillRect(-3, -3, 106, 60);
    c.fillStyle = "#fbfbfb"; c.fillRect(0, 0, 100, 54);
    c.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      c.strokeStyle = ["#e74c3c", "#2980b9", "#27ae60"][k % 3];
      c.beginPath(); c.moveTo(8 + k * 14, 12 + (k % 2) * 18);
      c.bezierCurveTo(14 + k * 14, 4, 20 + k * 12, 40, 30 + k * 11, 22 + (k % 3) * 8); c.stroke();
    }
    c.restore();
    return cv;
  }

  // ---------- móveis (ordenados por profundidade) ----------
  function occupantOf(i) { const id = seats.get(i); return id ? avatars.get(id) : null; }
  function drawMainDesk(d, i) {
    const occ = occupantOf(i);
    dropShadow(d.x, d.y, 1.6, 0.8);
    for (const [lx, ly] of [[0.05, 0.05], [1.5, 0.05], [0.05, 0.7], [1.5, 0.7]]) box(d.x + lx, d.y + ly, 0.05, 0.05, 26, B3("#8fa9b5"));
    box(d.x, d.y, 1.6, 0.8, 4, ["rgba(190,232,248,.85)", "rgba(120,180,205,.9)", "rgba(100,160,190,.9)"], 26);
    const on = occ && isActive(occ);
    // teclado e mouse do lado de quem senta
    box(d.x + 0.4, d.y + 0.07, 0.64, 0.17, 2, B3("#dfe6e9"), 30);
    box(d.x + 1.12, d.y + 0.1, 0.1, 0.13, 2, B3("#b2bec3"), 30);
    // monitor: base, haste e painel (a traseira fica voltada para quem olha a cena)
    box(d.x + 0.6, d.y + 0.45, 0.3, 0.2, 2, B3("#636e72"), 30);
    box(d.x + 0.72, d.y + 0.52, 0.06, 0.06, 8, B3("#7f8c8d"), 32);
    if (on) {
      ctx.save();
      ctx.shadowColor = "#74b9ff"; ctx.shadowBlur = 10;
      box(d.x + 0.36, d.y + 0.46, 0.78, 0.06, 24, ["#74b9ff", "#2b3034", "#353b40"], 36);
      ctx.restore();
    } else box(d.x + 0.36, d.y + 0.46, 0.78, 0.06, 24, ["#4b545a", "#2b3034", "#353b40"], 36);
    poly(ctx, [iso(d.x + 0.4, d.y + 0.52, 39), iso(d.x + 1.1, d.y + 0.52, 39), iso(d.x + 1.1, d.y + 0.52, 57), iso(d.x + 0.4, d.y + 0.52, 57)], "#31373c");
    const [lx, ly] = iso(d.x + 0.75, d.y + 0.52, 48);
    ctx.fillStyle = "#7f8c8d"; ctx.fillRect(lx - 2, ly - 2, 4, 4);
    // luminária de status e caneca
    box(d.x + 1.4, d.y + 0.14, 0.04, 0.04, 16, B3("#95a5a6"), 30);
    box(d.x + 1.33, d.y + 0.07, 0.18, 0.18, 6, B3(occ ? STATUS_COLORS[occ.status] || "#888" : "#555"), 46);
    box(d.x + 0.12, d.y + 0.5, 0.11, 0.11, 8, B3("#ecf0f1"), 30);
    drawPhone(d.x + 0.08, d.y + 0.14, occ);
    if (occ && occ.arch && occ.arch.key === "prank") {
      box(d.x + 1.05, d.y + 0.45, 0.24, 0.2, 9, ["rgba(241,196,15,.75)", "rgba(200,160,10,.75)", "rgba(220,180,12,.75)"], 30);
      box(d.x + 1.1, d.y + 0.52, 0.14, 0.06, 3, B3("#7f8c8d"), 33);
    }
  }
  function drawPhone(x, y, occ, z = 30) {
    const ring = occ && occ.ring > 0;
    const j = ring ? Math.sin(nowS() * 70) * 0.025 : 0;
    box(x + j, y, 0.24, 0.18, 4, B3("#2d3436"), z);
    box(x + 0.02 + j, y + 0.02, 0.2, 0.06, 3, B3(ring ? "#e74c3c" : "#636e72"), z + (ring ? 8 : 4));
  }
  function deskPhonePos(i) {
    const d = DESKS[i];
    return d.room === "annex" ? [d.x + 1.3, d.y + 0.21, 42] : [d.x + 0.2, d.y + 0.23, 42];
  }
  function drawOfficeChair(d) {
    const s = seatFor(d);
    box(s.x - 0.2, s.y - 0.2, 0.4, 0.4, 2, B3("#2d3436"));
    box(s.x - 0.03, s.y - 0.03, 0.06, 0.06, 14, B3("#636e72"), 2);
    box(s.x - 0.2, s.y - 0.18, 0.4, 0.36, 4, B3("#3b6e8f"), 16);
    box(s.x - 0.17, s.y - 0.27, 0.34, 0.06, 18, B3("#2f5a75"), 22);
  }
  function drawLabDesk(d, i) {
    dropShadow(d.x, d.y, 1.6, 0.8);
    for (const [lx, ly] of [[0.05, 0.05], [1.5, 0.05], [0.05, 0.7], [1.5, 0.7]]) box(d.x + lx, d.y + ly, 0.06, 0.06, 26, B3("#b08a5a"));
    box(d.x, d.y, 1.6, 0.8, 5, B3("#e6c9a0"), 26);
    box(d.x + 0.5, d.y + 0.25, 0.6, 0.4, 2, B3("#b2bec3"), 31);
    poly(ctx, [iso(d.x + 0.5, d.y + 0.25, 33), iso(d.x + 1.1, d.y + 0.25, 33), iso(d.x + 1.1, d.y + 0.25, 52), iso(d.x + 0.5, d.y + 0.25, 52)], "#dfe6e9");
    const h = hashStr(`${d.x},${d.y}`);
    for (let k = 0; k < 4; k++) {
      const [px, py] = iso(d.x + 0.6 + ((h >>> (k * 3)) % 5) * 0.1, d.y + 0.25, 36 + ((h >>> (k * 4)) % 12));
      ctx.fillStyle = SHIRTS[(h >>> (k * 5)) % SHIRTS.length]; ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    box(d.x + 1.3, d.y + 0.5, 0.12, 0.12, 8, B3("#fd79a8"), 31);
    drawPhone(d.x + 1.18, d.y + 0.12, occupantOf(i), 31);
  }
  function drawLabChair(d, i, part) {
    const s = seatFor(d), col = LAB_CHAIRS[i % 4];
    if (part === "seat") { box(s.x - 0.22, s.y - 0.2, 0.44, 0.4, 4, B3(col), 14); box(s.x - 0.03, s.y - 0.03, 0.06, 0.06, 14, B3("#636e72")); }
    else box(s.x - 0.22, s.y + 0.2, 0.44, 0.08, 26, B3(col), 16);
  }
  function drawManagerDesk() {
    const m = MANAGER;
    dropShadow(m.x, m.y, m.w, m.d);
    box(m.x, m.y, m.w, m.d, 30, B3("#4a2f1e"));
    box(m.x, m.y, m.w, m.d, 3, B3("#3a2416"), 30);
    box(m.x + 0.9, m.y + 0.1, 0.9, 0.1, 30, ["#111", "#0b0b0b", "#151515"], 33);
    const ag = (S.state && S.state.agents) || [];
    const p0 = iso(m.x + 0.95, m.y + 0.2, 60);
    ctx.save();
    ctx.shadowColor = "#4fc3ff"; ctx.shadowBlur = 8;
    poly(ctx, [iso(m.x + 0.95, m.y + 0.2, 36), iso(m.x + 1.75, m.y + 0.2, 36), iso(m.x + 1.75, m.y + 0.2, 61), iso(m.x + 0.95, m.y + 0.2, 61)], "#0d2b45");
    ctx.restore();
    for (let k = 0; k < Math.min(20, ag.length); k++) {
      const cx = k % 5, cy = Math.floor(k / 5);
      ctx.fillStyle = STATUS_COLORS[ag[k].status] || "#888";
      ctx.fillRect(p0[0] + 3 + cx * 4.5, p0[1] + 3 + cy * 5 + cx * 2.25, 3, 3);
    }
    box(m.x + 0.2, m.y + 0.4, 0.5, 0.35, 1, B3("#ffffff"), 33);
    box(m.x + 2.2, m.y + 0.5, 0.12, 0.12, 8, B3("#ecf0f1"), 33);
    box(m.x + 1.0, m.y + 0.75, 0.6, 0.12, 6, B3("#d4a017"), 33);
    if (!manager.phone) drawPhone(m.x + 0.25, m.y + 0.08, null, 33);
    else box(m.x + 0.25, m.y + 0.08, 0.24, 0.18, 4, B3("#2d3436"), 33);
    box(m.x + 2.3, m.y + 0.12, 0.16, 0.16, 3, B3("#7f6000"), 33);
    box(m.x + 2.34, m.y + 0.16, 0.08, 0.08, 14, B3("#f1c40f"), 36);
  }
  function drawManagerChair() {
    box(CHAIR.x - 0.25, CHAIR.y - 0.22, 0.5, 0.44, 5, B3("#7b2335"), 14);
    box(CHAIR.x - 0.25, CHAIR.y - 0.34, 0.5, 0.1, 40, B3("#6b1d2c"), 14);
    box(CHAIR.x - 0.03, CHAIR.y - 0.03, 0.06, 0.06, 14, B3("#333"));
  }
  function drawPlant(x, y) {
    box(x + 0.1, y + 0.1, 0.3, 0.3, 14, B3("#8d6e63"));
    const [px, py] = iso(x + 0.25, y + 0.25, 30);
    for (const [dx, dy, r, col] of [[-6, 2, 8, "#27ae60"], [6, 0, 8, "#2ecc71"], [0, -8, 9, "#229954"], [0, 2, 7, "#58d68d"]]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px + dx, py + dy, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function drawSofa() {
    dropShadow(SOFA.x, SOFA.y, 1.0, SOFA.len);
    box(SOFA.x, SOFA.y, 0.9, SOFA.len, 14, B3("#c0392b"));
    box(SOFA.x + 0.7, SOFA.y, 0.3, SOFA.len, 34, B3("#a93226"));
    box(SOFA.x, SOFA.y, 1.0, 0.25, 22, B3("#922b21"));
  }
  function drawSofaArm() { box(SOFA.x, SOFA.y + SOFA.len - 0.25, 1.0, 0.25, 22, B3("#922b21")); }
  function drawCoffeeTable() {
    const t = COFFEE_TABLE;
    box(t.x + 0.1, t.y + 0.1, 0.05, 0.05, 14, B3("#95a5a6")); box(t.x + t.w - 0.15, t.y + t.d - 0.15, 0.05, 0.05, 14, B3("#95a5a6"));
    box(t.x, t.y, t.w, t.d, 3, ["rgba(200,235,250,.8)", "rgba(140,190,210,.8)", "rgba(120,170,195,.8)"], 14);
    box(t.x + 0.38, t.y + 0.5, 0.14, 0.14, 12, B3("#ecf0f1"), 17);
    const [px, py] = iso(t.x + 0.45, t.y + 0.57, 34);
    for (const [dx, col] of [[-3, "#e84393"], [3, "#fdcb6e"], [0, "#e74c3c"]]) { ctx.fillStyle = col; ctx.fillRect(px + dx - 2, py - 4 + Math.abs(dx), 4, 4); }
  }
  function drawTV() {
    box(TV.x, TV.y, TV.w, TV.d, 22, B3("#2d3436"));
    box(TV.x + 0.2, TV.y + 0.1, TV.w - 0.4, 0.08, 40, ["#111", "#111", "#222"], 22);
    poly(ctx, [iso(TV.x + 0.25, TV.y + 0.18, 26), iso(TV.x + TV.w - 0.25, TV.y + 0.18, 26), iso(TV.x + TV.w - 0.25, TV.y + 0.18, 58), iso(TV.x + 0.25, TV.y + 0.18, 58)], "#3d8bfd");
  }
  // ---------- cafeteria ----------
  function drawCounter() {
    const k = COUNTER, top = 37;
    dropShadow(k.x, k.y, k.w, k.d);
    box(k.x, k.y, k.w, k.d, 34, ["#6d4c41", "#5d4037", "#7b5545"]);
    ctx.strokeStyle = "rgba(40,22,14,.55)"; ctx.lineWidth = 1;
    for (let yy = k.y + 0.32; yy < k.y + k.d - 0.1; yy += 0.32) {
      ctx.beginPath(); ctx.moveTo(...iso(k.x + k.w, yy, 4)); ctx.lineTo(...iso(k.x + k.w, yy, 30)); ctx.stroke();
    }
    box(k.x - 0.03, k.y - 0.03, k.w + 0.06, k.d + 0.06, 3, ["#f5f0e8", "#d9d2c5", "#e6dfd2"], 34);
    // máquina de espresso cromada com dois grupos e vapor
    box(k.x + 0.08, k.y + 0.18, 0.5, 0.74, 22, ["#dfe6e9", "#aab4b9", "#c3ccd1"], top);
    box(k.x + 0.08, k.y + 0.18, 0.5, 0.74, 3, B3("#c0392b"), top + 22);
    for (const gy of [0.33, 0.63]) {
      box(k.x + 0.58, k.y + gy, 0.08, 0.12, 4, B3("#2d3436"), top + 9);
      box(k.x + 0.6, k.y + gy + 0.02, 0.07, 0.08, 5, B3("#ffffff"), top);
    }
    const t = nowS();
    for (let n = 0; n < 3; n++) {
      const ph = (t * 0.6 + n / 3) % 1;
      const [sx, sy] = iso(k.x + 0.35, k.y + 0.55, top + 28 + ph * 26);
      ctx.fillStyle = `rgba(255,255,255,${0.45 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(sx + Math.sin((t + n) * 2) * 3, sy, 3 + ph * 4, 0, Math.PI * 2); ctx.fill();
    }
    // moedor e xícaras
    box(k.x + 0.2, k.y + 1.08, 0.24, 0.24, 14, B3("#2d3436"), top);
    box(k.x + 0.22, k.y + 1.1, 0.2, 0.2, 9, ["rgba(120,72,40,.85)", "rgba(90,52,30,.85)", "rgba(105,62,35,.85)"], top + 14);
    for (let n = 0; n < 3; n++) box(k.x + 0.25, k.y + 1.55, 0.15, 0.15, 5, B3(n % 2 ? "#f6e7d8" : "#ffffff"), top + n * 5);
    box(k.x + 0.22, k.y + 1.85, 0.18, 0.12, 5, B3("#ffffff"), top);
    // vitrine de doces
    const vx = k.x + 0.06, vy = k.y + 2.15;
    box(vx, vy, 0.54, 0.95, 3, B3("#8d6e63"), top);
    const sweets = ["#e67e22", "#c0392b", "#f1c40f", "#8e44ad", "#d35400", "#fd79a8"];
    sweets.forEach((col, n) => box(vx + 0.08 + (n % 2) * 0.22, vy + 0.1 + Math.floor(n / 2) * 0.28, 0.16, 0.16, 5, B3(col), top + 3));
    box(vx, vy, 0.54, 0.95, 18, ["rgba(220,240,250,.32)", "rgba(190,225,240,.38)", "rgba(200,232,245,.42)"], top + 3);
    // pote de gorjeta
    box(k.x + 0.24, k.y + 3.38, 0.18, 0.18, 10, ["rgba(225,240,250,.7)", "rgba(190,215,230,.7)", "rgba(205,225,238,.7)"], top);
    box(k.x + 0.27, k.y + 3.41, 0.12, 0.12, 4, B3("#f1c40f"), top);
  }
  function drawMenuBoard() {
    poly(ctx, [iso(14.0, SPLIT_Y + 0.09, 34), iso(15.45, SPLIT_Y + 0.09, 34), iso(15.45, SPLIT_Y + 0.09, 70), iso(14.0, SPLIT_Y + 0.09, 70)], "#6d4c41");
    poly(ctx, [iso(14.06, SPLIT_Y + 0.1, 37), iso(15.39, SPLIT_Y + 0.1, 37), iso(15.39, SPLIT_Y + 0.1, 67), iso(14.06, SPLIT_Y + 0.1, 67)], "#26352a");
    ctx.save();
    const [bx, by] = iso(14.12, SPLIT_Y + 0.1, 65);
    ctx.transform(1, 0.5, 0, 1, bx, by);
    ctx.fillStyle = "#f4f1e8"; ctx.textBaseline = "top";
    ctx.font = "bold 6px Verdana"; ctx.fillText("CAFÉ ☕", 10, 1);
    ctx.font = "4px Verdana";
    [["espresso", "5"], ["latte", "7"], ["capuccino", "8"], ["pão de queijo", "4"]].forEach(([n, v], i) => {
      ctx.fillText(n, 1, 9 + i * 5); ctx.fillText(v, 36, 9 + i * 5);
    });
    ctx.restore();
  }
  function drawBistro() {
    const t = HIGH_TABLE, cx = t.x + 0.35, cy = t.y + 0.35;
    for (const [sx, sy] of [[cx - 0.62, cy + 0.05], [cx + 0.05, cy - 0.62]]) {
      box(sx - 0.03, sy - 0.03, 0.06, 0.06, 26, B3("#2d3436"));
      const [px, py] = iso(sx, sy, 27);
      ctx.fillStyle = "#5d4037"; ctx.beginPath(); ctx.ellipse(px, py + 2, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#8d6e63"; ctx.beginPath(); ctx.ellipse(px, py, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    const [bx, by] = iso(cx, cy, 0);
    ctx.fillStyle = "#2d3436"; ctx.beginPath(); ctx.ellipse(bx, by, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    box(cx - 0.04, cy - 0.04, 0.08, 0.08, 40, B3("#2d3436"));
    const [tx, ty] = iso(cx, cy, 41);
    ctx.fillStyle = "#4e342e"; ctx.beginPath(); ctx.ellipse(tx, ty + 3, 25, 12.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a1887f"; ctx.beginPath(); ctx.ellipse(tx, ty, 25, 12.5, 0, 0, Math.PI * 2); ctx.fill();
    box(cx - 0.12, cy, 0.1, 0.1, 6, B3("#ffffff"), 41);
    box(cx + 0.06, cy - 0.12, 0.1, 0.1, 6, B3("#f6e7d8"), 41);
    // luminária pendente
    const [lx0, ly0] = iso(cx, cy, 120), [lx1, ly1] = iso(cx, cy, 82);
    ctx.strokeStyle = "#2d3436"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1); ctx.stroke();
    ctx.fillStyle = "#2f3640"; ctx.beginPath(); ctx.moveTo(lx1 - 3, ly1); ctx.lineTo(lx1 + 3, ly1); ctx.lineTo(lx1 + 11, ly1 + 10); ctx.lineTo(lx1 - 11, ly1 + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffe8a3"; ctx.beginPath(); ctx.ellipse(lx1, ly1 + 10, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawFridge() {
    const f = FRIDGE;
    dropShadow(f.x, f.y, f.w, f.d);
    box(f.x, f.y, f.w, f.d, 66, ["#e5e9ec", "#b9c2c8", "#cfd6db"]);
    ctx.strokeStyle = "rgba(60,70,80,.6)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(...iso(f.x + f.w, f.y, 40)); ctx.lineTo(...iso(f.x + f.w, f.y + f.d, 40)); ctx.stroke();
    box(f.x + f.w, f.y + 0.12, 0.02, 0.05, 18, B3("#7f8c8d"), 44);
    box(f.x + f.w, f.y + 0.12, 0.02, 0.05, 14, B3("#7f8c8d"), 20);
    for (const [my, mz, col] of [[0.5, 56, "#e74c3c"], [0.68, 50, "#f1c40f"], [0.4, 30, "#3498db"]]) {
      const [px, py] = iso(f.x + f.w, f.y + my, mz); ctx.fillStyle = col; ctx.fillRect(px - 2, py - 2, 4, 4);
    }
  }
  function drawSimple(o, h, col) { dropShadow(o.x, o.y, o.w, o.d); box(o.x, o.y, o.w, o.d, h, B3(col)); }
  function drawCooler() {
    dropShadow(COOLER.x, COOLER.y, 0.5, 0.5);
    box(COOLER.x, COOLER.y, 0.5, 0.5, 34, B3("#ecf0f1"));
    box(COOLER.x + 0.42, COOLER.y + 0.2, 0.06, 0.1, 4, B3("#3498db"), 22);
    box(COOLER.x + 0.08, COOLER.y + 0.08, 0.34, 0.34, 26, ["rgba(116,185,255,.85)", "rgba(80,150,230,.85)", "rgba(60,130,210,.85)"], 34);
    box(COOLER.x + 0.18, COOLER.y + 0.18, 0.14, 0.14, 4, B3("#2980b9"), 60);
  }
  function drawBeanbag([x, y, col]) {
    const [px, py] = iso(x, y, 8);
    ctx.fillStyle = shade(col, 0.7); ctx.beginPath(); ctx.ellipse(px, py + 4, 24, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(px, py - 2, 21, 12, 0, 0, Math.PI * 2); ctx.fill();
  }
  function drawFoosball() {
    const f = FOOSBALL;
    drawSimple(f, 26, "#6d4c41");
    box(f.x + 0.08, f.y + 0.08, f.w - 0.16, f.d - 0.16, 1, B3("#27ae60"), 26);
    for (let k = 0; k < 4; k++) box(f.x + 0.3 + k * 0.42, f.y - 0.1, 0.04, f.d + 0.2, 3, B3("#bdc3c7"), 32);
  }
  function drawBar() {
    drawSimple(BAR, 32, "#6c3483");
    box(BAR.x + 0.3, BAR.y + 0.2, 0.35, 0.3, 18, B3("#2d3436"), 32);
    box(BAR.x + 1.4, BAR.y + 0.25, 0.14, 0.14, 8, B3("#fd79a8"), 32);
  }
  function drawWall(w, a, b) {
    if (w.low) return drawLowWall(w, a, b);
    const glass = w.axis === "y" && a < SPLIT_Y;
    const cols = glass ? ["rgba(214,240,250,.55)", "rgba(170,215,235,.35)", "rgba(150,200,225,.35)"] : ["#d7dfe4", "#b9c6cf", "#a3b2bc"];
    if (w.axis === "y") box(w.at, a, w.t, b - a, 70, cols); else box(a, w.at, b - a, w.t, 70, cols);
    if (glass) {
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(...iso(w.at + w.t, a, 70)); ctx.lineTo(...iso(w.at + w.t, b, 70)); ctx.stroke();
    }
  }
  function drawLowWall(w, a, b) {
    const mid = (a + b) / 2;
    const hedge = w.axis === "y" || (mid > FUN_X[0] && mid < FUN_X[1]);
    const cols = hedge ? ["#5fa84a", "#3f7f30", "#4e9640"] : ["#d7dfe4", "#b9c6cf", "#a3b2bc"];
    const hgt = hedge ? 30 : 26;
    if (w.axis === "y") box(w.at, a, w.t, b - a, hgt, cols); else box(a, w.at, b - a, w.t, hgt, cols);
    if (hedge) {
      for (let k = 0; k < 3; k++) {
        const h = hashStr(`h${w.at}${a}${k}`);
        const u = a + (b - a) * ((h % 90) / 100 + 0.05);
        const [px, py] = w.axis === "y" ? iso(w.at + 0.08, u, hgt + 1) : iso(u, w.at + 0.08, hgt + 1);
        ctx.fillStyle = ["#ff6b81", "#ffd32a", "#ffffff"][h % 3]; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    } else if (w.axis === "y") box(w.at - 0.02, a, w.t + 0.04, b - a, 3, B3("#8d6e63"), hgt);
    else box(a, w.at - 0.02, b - a, w.t + 0.04, 3, B3("#8d6e63"), hgt);
  }
  function drawJamb(x, y) { box(x, y, 0.16, 0.16, 74, B3("#5a4334")); }
  const hexA = (h, a) => { const n = parseInt(String(h).slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  function ellipse(x, y, rx, ry, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function drawSeatChair(s, col, part) {
    if (part === "back") { box(s.x - 0.2, s.y + 0.2, 0.4, 0.07, 22, B3(shade(col, 0.85)), 18); return; }
    box(s.x - 0.03, s.y - 0.03, 0.06, 0.06, 14, B3("#636e72"));
    box(s.x - 0.2, s.y - 0.18, 0.4, 0.36, 4, B3(col), 14);
    if (part === false) box(s.x - 0.18, s.y - 0.27, 0.36, 0.07, 22, B3(shade(col, 0.85)), 18);
  }
  function drawConfTable() {
    const t = CONF_TABLE;
    dropShadow(t.x, t.y, t.w, t.d);
    for (const [lx, ly] of [[0.2, 0.2], [t.w - 0.3, 0.2], [0.2, t.d - 0.3], [t.w - 0.3, t.d - 0.3]]) box(t.x + lx, t.y + ly, 0.1, 0.1, 26, B3("#3e2723"));
    box(t.x, t.y, t.w, t.d, 4, ["#6d4c41", "#4e342e", "#5d4037"], 26);
    for (let k = 0; k < 5; k++) box(t.x + 0.4 + k * 1.2, t.y + 0.12, 0.34, 0.26, 1, B3("#ffffff"), 30);
    for (let k = 0; k < 5; k++) {
      const lx = t.x + 0.38 + k * 1.2, ly = t.y + t.d - 0.42;
      box(lx, ly, 0.4, 0.26, 2, B3("#95a5a6"), 30);
      poly(ctx, [iso(lx, ly, 32), iso(lx + 0.4, ly, 32), iso(lx + 0.4, ly, 44), iso(lx, ly, 44)], "#34495e");
    }
    box(t.x + t.w / 2 - 0.35, t.y + 0.55, 0.7, 0.45, 5, B3("#f8c291"), 30);
    for (let k = 0; k < 4; k++) { const [px, py] = iso(t.x + t.w / 2 - 0.22 + (k % 2) * 0.32, t.y + 0.66 + Math.floor(k / 2) * 0.22, 36); ellipse(px, py, 5, 2.5, ["#e84393", "#6d4c41", "#fdcb6e", "#e84393"][k]); }
  }
  function drawProjector() {
    const p = PROJ_SCREEN, X = p.x + p.w;
    box(p.x + 0.1, p.y + 0.2, 0.08, 0.08, 20, B3("#636e72"));
    box(p.x + 0.1, p.y + p.d - 0.3, 0.08, 0.08, 20, B3("#636e72"));
    box(p.x, p.y, p.w, p.d, 52, ["#ecf0f1", "#bdc3c7", "#ffffff"], 20);
    poly(ctx, [iso(X, p.y + 0.2, 28), iso(X, p.y + p.d - 0.2, 28), iso(X, p.y + p.d - 0.2, 66), iso(X, p.y + 0.2, 66)], "#dfe6e9");
    poly(ctx, [iso(X, p.y + 0.35, 60), iso(X, p.y + 1.5, 60), iso(X, p.y + 1.5, 63), iso(X, p.y + 0.35, 63)], "#2d3436");
    const mt = S.meeting;
    if (mt) {
      poly(ctx, [iso(X, p.y + 0.2, 28), iso(X, p.y + p.d - 0.2, 28), iso(X, p.y + p.d - 0.2, 66), iso(X, p.y + 0.2, 66)], "#f7f1e3");
      ctx.save();
      const [ox, oy] = iso(X, p.y + p.d - 0.28, 62);
      ctx.transform(1, -0.5, 0, 1, ox, oy);
      ctx.textBaseline = "top";
      ctx.fillStyle = "#c0392b"; ctx.font = "bold 7px Verdana"; ctx.fillText("PLANO", 2, 0);
      ctx.fillStyle = "#2d3436"; ctx.font = "5px Verdana";
      ctx.fillText(String(mt.title || "").slice(0, 22), 2, 9);
      const steps = mt.status === "waiting" ? ["✔ plano pronto", "aguardando aprovação"] : ["1. ler o código", "2. " + String((mt.current && mt.current.text) || "analisar").slice(0, 18), "3. propor mudanças"];
      steps.forEach((tx, k) => ctx.fillText(tx, 4, 16 + k * 6));
      ctx.restore();
      return;
    }
    [12, 20, 16, 28].forEach((hh, k) => {
      const y0 = p.y + 0.45 + k * 0.42;
      poly(ctx, [iso(X, y0, 32), iso(X, y0 + 0.25, 32), iso(X, y0 + 0.25, 32 + hh), iso(X, y0, 32 + hh)], ["#3498db", "#2ecc71", "#f1c40f", "#e74c3c"][k]);
    });
  }
  function drawTrophies() {
    const t = TROPHY_SHELF;
    box(t.x, t.y, t.w, t.d, 40, ["#8d6e63", "#5d4037", "#6d4c41"]);
    for (let k = 0; k < 3; k++) {
      box(t.x + 0.2 + k * 0.5, t.y + 0.15, 0.2, 0.2, 4, B3("#7f6000"), 40);
      box(t.x + 0.25 + k * 0.5, t.y + 0.2, 0.1, 0.1, 14 + k * 2, B3("#f1c40f"), 44);
    }
  }
  function drawFountain() {
    const f = FOUNTAIN, t = nowS();
    const [cx, cy] = iso(f.x, f.y);
    const rx = f.r * 45, ry = f.r * 22.6;
    ellipse(cx, cy, rx, ry, "#7f8c8d");
    ctx.fillStyle = "#7f8c8d"; ctx.fillRect(cx - rx, cy - 14, rx * 2, 14);
    ellipse(cx, cy - 14, rx, ry, "#bdc3c7");
    const g = ctx.createRadialGradient(cx, cy - 14, 2, cx, cy - 14, rx * 0.85);
    g.addColorStop(0, "#74d0f5"); g.addColorStop(1, "#2e86de");
    ellipse(cx, cy - 14, rx * 0.85, ry * 0.85, g);
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.5 + k / 3) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy - 14, rx * (0.2 + ph * 0.6), ry * (0.2 + ph * 0.6), 0, 0, Math.PI * 2); ctx.stroke();
    }
    box(f.x - 0.08, f.y - 0.08, 0.16, 0.16, 30, B3("#bdc3c7"), 12);
    const [tx, ty] = iso(f.x, f.y, 42);
    ellipse(tx, ty + 3, 16, 8, "#95a5a6"); ellipse(tx, ty, 16, 8, "#bdc3c7"); ellipse(tx, ty, 12, 6, "#74d0f5");
    for (let k = 0; k < 12; k++) {
      const ph = (t * 1.1 + k / 12) % 1, ang = (k / 12) * Math.PI * 2;
      ctx.fillStyle = `rgba(210,245,255,${0.9 - ph * 0.6})`;
      ctx.fillRect(tx + Math.cos(ang) * 20 * ph - 1, ty + Math.sin(ang) * 10 * ph - 16 * Math.sin(ph * Math.PI) + ph * 12, 2, 3);
    }
  }
  function drawParasol() {
    const p = PARASOL;
    dropShadow(p.x, p.y, p.w, p.d);
    box(p.x + 0.25, p.y + 0.25, 0.1, 0.1, 26, B3("#2d3436"));
    const [tx, ty] = iso(p.x + 0.3, p.y + 0.3, 27);
    ellipse(tx, ty + 2, 22, 11, "#bdc3c7"); ellipse(tx, ty, 22, 11, "#ffffff");
    box(p.x + 0.28, p.y + 0.28, 0.04, 0.04, 70, B3("#ecf0f1"), 27);
    const [ux, uy] = iso(p.x + 0.3, p.y + 0.3, 104);
    const rim = (k) => [ux + Math.cos(k / 8 * Math.PI * 2) * 62, uy + Math.sin(k / 8 * Math.PI * 2) * 31 + 12];
    for (let k = 0; k < 8; k++) poly(ctx, [[ux, uy], rim(k), rim(k + 1)], k % 2 ? "#ecf0f1" : "#e74c3c", "rgba(0,0,0,.15)");
  }
  function drawBench(b) {
    for (const lx of [0.1, b.w - 0.2]) box(b.x + lx, b.y + 0.05, 0.1, 0.2, 12, B3("#4e342e"));
    box(b.x, b.y - 0.04, b.w, 0.06, 18, B3("#8d6e63"), 14);
    for (let k = 0; k < 3; k++) box(b.x, b.y + k * 0.1, b.w, 0.08, 2, B3("#a1887f"), 12);
  }
  function drawArcade(m) {
    const t = nowS(), Y = m.y + m.d + 0.002;
    dropShadow(m.x, m.y, m.w, m.d);
    box(m.x, m.y, m.w, m.d, 72, B3(shade(m.col, 0.55)));
    box(m.x - 0.02, m.y + m.d - 0.15, m.w + 0.04, 0.22, 6, B3("#2d3436"), 34);
    const [jx, jy] = iso(m.x + 0.25, m.y + m.d - 0.04, 42); ctx.fillStyle = "#e74c3c"; ctx.fillRect(jx - 2, jy - 5, 4, 5);
    for (let k = 0; k < 3; k++) { const [bx, by] = iso(m.x + 0.45 + k * 0.1, m.y + m.d - 0.04, 41); ctx.fillStyle = ["#f1c40f", "#3498db", "#2ecc71"][k]; ctx.fillRect(bx - 1.5, by - 1.5, 3, 3); }
    poly(ctx, [iso(m.x + 0.08, Y, 44), iso(m.x + m.w - 0.08, Y, 44), iso(m.x + m.w - 0.08, Y, 64), iso(m.x + 0.08, Y, 64)], "#0b1d33");
    for (let k = 0; k < 4; k++) {
      const u = ((t * (0.3 + k * 0.17) + k * 0.31) % 1) * (m.w - 0.3);
      const [px, py] = iso(m.x + 0.12 + u, Y, 48 + k * 4);
      ctx.fillStyle = k % 2 ? m.col : "#ffffff"; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    poly(ctx, [iso(m.x, Y, 66), iso(m.x + m.w, Y, 66), iso(m.x + m.w, Y, 72), iso(m.x, Y, 72)], m.col);
  }
  function drawPool() {
    const p = POOL;
    dropShadow(p.x, p.y, p.w, p.d);
    for (const [lx, ly] of [[0.1, 0.1], [p.w - 0.25, 0.1], [0.1, p.d - 0.25], [p.w - 0.25, p.d - 0.25]]) box(p.x + lx, p.y + ly, 0.15, 0.15, 22, B3("#3e2723"));
    box(p.x, p.y, p.w, p.d, 6, B3("#5d4037"), 22);
    box(p.x + 0.12, p.y + 0.12, p.w - 0.24, p.d - 0.24, 1, B3("#1e8449"), 28);
    for (let k = 0; k < 8; k++) {
      const h = hashStr(`pool${k}`);
      const [px, py] = iso(p.x + 0.3 + (h % 100) / 100 * (p.w - 0.6), p.y + 0.3 + ((h >>> 8) % 100) / 100 * (p.d - 0.6), 31);
      ellipse(px, py, 3, 2, ["#ffffff", "#f1c40f", "#e74c3c", "#2980b9", "#8e44ad", "#e67e22", "#111", "#27ae60"][k]);
    }
    ctx.strokeStyle = "#d4a373"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(...iso(p.x + 0.4, p.y + 0.5, 36)); ctx.lineTo(...iso(p.x + 1.4, p.y + 0.9, 32)); ctx.stroke();
  }
  function drawJukebox() {
    const j = JUKEBOX, t = nowS(), Y = j.y + j.d + 0.002;
    box(j.x, j.y, j.w, j.d, 58, B3("#8e44ad"));
    for (let k = 0; k < 4; k++) {
      const hh = 6 + Math.abs(Math.sin(t * 4 + k)) * 18;
      const x0 = j.x + 0.08 + k * 0.12;
      poly(ctx, [iso(x0, Y, 18), iso(x0 + 0.08, Y, 18), iso(x0 + 0.08, Y, 18 + hh), iso(x0, Y, 18 + hh)], ["#fdcb6e", "#ff6be6", "#7ff6ff", "#55efc4"][k]);
    }
    const [nx, ny] = iso(j.x + j.w / 2, Y, 66);
    ctx.fillStyle = "#ff6be6"; ctx.font = "bold 9px Verdana"; ctx.fillText("♪", nx - 3 + Math.sin(t * 3) * 3, ny - Math.abs(Math.sin(t * 2)) * 6);
  }
  function drawDanceFloor() {
    const t = nowS(), D = DANCE, cols = ["#ff6be6", "#7ff6ff", "#fdcb6e", "#a29bfe", "#55efc4"];
    const nx = 5, ny = 4, cw = D.w / nx, ch = D.d / ny;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x0 = D.x + i * cw, y0 = D.y + j * ch;
        const k = (hashStr(`${i}:${j}`) + Math.floor(t * 2.5)) % cols.length;
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 4 + i + j);
        poly(ctx, [iso(x0, y0), iso(x0 + cw, y0), iso(x0 + cw, y0 + ch), iso(x0, y0 + ch)], cols[k], "rgba(0,0,0,.35)");
      }
    }
    ctx.globalAlpha = 1;
  }
  function bulbs() {
    const out = [];
    STRINGS.forEach(([a, b], s) => {
      for (let k = 1; k < 10; k++) {
        const u = k / 10;
        out.push({ x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: 96 - Math.sin(u * Math.PI) * 18, k: s * 10 + k });
      }
    });
    return out;
  }
  function drawStringLights() {
    const t = nowS(), night = nightLevel(localHour());
    for (const [x, y] of [[11.6, 14.6], [21.6, 14.6], [11.6, 21.6], [21.6, 21.6]]) box(x - 0.04, y - 0.04, 0.08, 0.08, 98, B3("#4e342e"));
    ctx.strokeStyle = "rgba(30,30,30,.7)"; ctx.lineWidth = 1;
    for (const [a, b] of STRINGS) {
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const u = k / 20;
        const [px, py] = iso(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 96 - Math.sin(u * Math.PI) * 18);
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    const cols = ["#ffd36e", "#ff8a80", "#82ccdd", "#b8e994"];
    for (const bl of bulbs()) {
      const [px, py] = iso(bl.x, bl.y, bl.z);
      const tw = 0.6 + 0.4 * Math.sin(t * 3 + bl.k);
      ctx.globalAlpha = 0.45 + 0.55 * Math.max(night, 0.25) * tw;
      ellipse(px, py + 3, 2.5, 2.5, cols[bl.k % 4]);
    }
    ctx.globalAlpha = 1;
  }
  function drawArcadeSign() {
    ctx.save();
    const [sx, sy] = iso(27.4, H + 0.05, 104);
    ctx.transform(1, 0.5, 0, 1, sx, sy);
    ctx.fillStyle = "#16122a"; ctx.fillRect(0, 0, 112, 30);
    ctx.font = "bold 18px Verdana"; ctx.textBaseline = "top";
    ctx.shadowColor = "#ff2fd1"; ctx.shadowBlur = 10; ctx.fillStyle = "#ff6be6";
    ctx.fillText("ARCADE", 10, 5);
    ctx.restore();
    for (const x of [27.6, 30.6]) box(x, H + 0.02, 0.06, 0.06, 104, B3("#2d3436"));
  }

  const FURNITURE = [];
  (function buildFurniture() {
    const add = (key, draw) => FURNITURE.push({ key, draw });
    DESKS.forEach((d, i) => {
      if (d.room === "main") { add(d.x + d.y + 0.15 - 0.02, () => drawOfficeChair(d)); add(d.x + 0.8 + d.y + 0.4, () => drawMainDesk(d, i)); }
      else { add(d.x + d.y + 1.2, () => drawLabDesk(d, i)); add(d.x + 0.6 + d.y + 1.15 - 0.05, () => drawLabChair(d, i, "seat")); add(d.x + 0.6 + d.y + 1.15 + 0.3, () => drawLabChair(d, i, "back")); }
    });
    add(CHAIR.x + CHAIR.y - 0.05, drawManagerChair);
    add(MANAGER.x + MANAGER.w / 2 + MANAGER.y + MANAGER.d / 2, drawManagerDesk);
    add(SOFA.x + 0.5 + SOFA.y + 0.2, drawSofa);
    add(SOFA.x + 0.5 + SOFA.y + SOFA.len, drawSofaArm);
    add(COFFEE_TABLE.x + COFFEE_TABLE.y + 1.0, drawCoffeeTable);
    add(TV.x + TV.y + 0.6, drawTV);
    add(COUNTER.x + COUNTER.y + 2.2, drawCounter);
    add(FRIDGE.x + FRIDGE.y + 0.9, drawFridge);
    add(HIGH_TABLE.x + HIGH_TABLE.y + 0.7, drawBistro);
    add(22.5, drawMenuBoard);
    add(COOLER.x + COOLER.y + 0.5, drawCooler);
    PLANTS.forEach(([x, y]) => add(x + y + 0.5, () => drawPlant(x, y)));
    BEANBAGS.forEach((b) => add(b[0] + b[1], () => drawBeanbag(b)));
    add(FOOSBALL.x + FOOSBALL.y + 1.4, drawFoosball);
    add(BAR.x + BAR.y + 1.7, drawBar);
    add(-1e4, drawDanceFloor);
    add(CONF_TABLE.x + CONF_TABLE.y + 1.2, drawConfTable);
    FUN.meeting.forEach((st) => {
      if (!st.back) add(st.x + st.y - 0.05, () => drawSeatChair(st, "#34495e", false));
      else { add(st.x + st.y - 0.05, () => drawSeatChair(st, "#34495e", "seat")); add(st.x + st.y + 0.3, () => drawSeatChair(st, "#34495e", "back")); }
    });
    add(PROJ_SCREEN.x + PROJ_SCREEN.y + 1.2, drawProjector);
    add(TROPHY_SHELF.x + TROPHY_SHELF.y + 1.0, drawTrophies);
    add(FOUNTAIN.x + FOUNTAIN.y, drawFountain);
    add(PARASOL.x + PARASOL.y + 0.6, drawParasol);
    FUN.terrace.slice(4, 6).forEach((st) => add(st.x + st.y - 0.05, () => drawSeatChair(st, "#e17055", false)));
    BENCHES.forEach((bb) => add(bb.x + bb.y - 0.05, () => drawBench(bb)));
    ARCADES.forEach((m) => add(m.x + m.y + 0.7, () => drawArcade(m)));
    add(POOL.x + POOL.y + 1.8, drawPool);
    add(JUKEBOX.x + JUKEBOX.y + 0.55, drawJukebox);
    FUN_PLANTS.forEach(([x, y]) => add(x + y + 0.5, () => drawPlant(x, y)));
    add(H + 27, drawArcadeSign);
    add(1e4, drawStringLights);
    for (const w of WALLS) {
      for (let a = w.a; a < w.b - 1e-6; a += 1) {
        const b = Math.min(w.b, a + 1);
        const key = w.axis === "y" ? w.at + w.t / 2 + (a + b) / 2 : (a + b) / 2 + w.at + w.t / 2;
        add(key, () => drawWall(w, a, b));
      }
    }
    for (const [g0, g1] of [DOORS.sala, DOORS.cozinha]) { add(SPLIT_X + g0 - 0.1, () => drawJamb(SPLIT_X - 0.08, g0 - 0.16)); add(SPLIT_X + g1 + 0.1, () => drawJamb(SPLIT_X - 0.08, g1)); }
    for (const [g0, g1] of ANNEX_DOORS) { add(MAIN_W + g0 - 0.1, () => drawJamb(MAIN_W, g0 - 0.16)); add(MAIN_W + g1 + 0.1, () => drawJamb(MAIN_W, g1)); }
    add(DOORS.salaCozinha[0] + SPLIT_Y - 0.1, () => drawJamb(DOORS.salaCozinha[0] - 0.16, SPLIT_Y - 0.08));
    add(DOORS.salaCozinha[1] + SPLIT_Y + 0.1, () => drawJamb(DOORS.salaCozinha[1], SPLIT_Y - 0.08));
  })();

  function drawAvatar(av) {
    if (!window.Sprites) return;
    const [px, py] = iso(av.x, av.y);
    const sc = av.kind === "subagent" ? 1.6 : 2;
    const pose = av.pose === "dance" ? (av.frame % 2 ? "raise" : "walk") : av.pose === "present" ? (Math.floor(nowS() / 1.6) % 2 ? "raise" : "stand") : av.pose;
    const spr = window.Sprites.build(av.look, pose, av.frame, av.back);
    const bob = av.pose === "dance" ? Math.abs(Math.sin(nowS() * 6 + av.x * 3)) * 6 : 0;
    const lift = 8 * av.sitT + bob, jump = av.jump > 0 ? Math.sin((1 - av.jump / 0.45) * Math.PI) * 12 : 0;
    const w = spr.width * sc, h = spr.height * sc * (1 - 0.05 * av.sitT);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(px, py, 14 * sc / 2, 6 * sc / 2, 0, 0, Math.PI * 2); ctx.fill();
    if (av.kind === "subagent") {
      ctx.fillStyle = "rgba(214,179,255,.35)";
      ctx.beginPath(); ctx.ellipse(px, py - h / 2, w * 0.7, h * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (S.selected === av.id) {
      const pulse = 1 + 0.15 * Math.sin(nowS() * 5);
      ctx.strokeStyle = "rgba(255,204,51,.95)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(px, py, 18 * pulse, 9 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
    }
    const top = py - h + 4 * sc - lift - jump;
    ctx.drawImage(spr, px - w / 2, top, w, h);
    if (av === manager && manager.phone) {
      ctx.fillStyle = "#111"; ctx.fillRect(px + 11, top + 14, 6, 18);
      ctx.fillStyle = "#2d3436"; ctx.fillRect(px + 9, top + 12, 10, 4); ctx.fillRect(px + 9, top + 30, 10, 4);
    }
    av.headX = px; av.headY = top + window.Sprites.TOP * sc;
    av.hit = [px - w / 2, top, w, h];
  }

  // ---------- dia e noite ----------
  const urlHour = (() => { try { const m = /[?&]hora=(\d{1,2}(?:\.\d+)?)/.exec(window.location.search || ""); return m ? +m[1] : null; } catch (e) { return null; } })();
  function localHour() {
    if (S.hourOverride != null) return S.hourOverride;
    if (urlHour != null) return urlHour;
    const d = new Date(nowS() * 1000);
    return d.getHours() + d.getMinutes() / 60;
  }
  function nightLevel(h) {
    if (h >= 7 && h < 17.5) return 0;
    if (h >= 17.5 && h < 19) return (h - 17.5) / 1.5;
    if (h >= 5.5 && h < 7) return 1 - (h - 5.5) / 1.5;
    return 1;
  }
  const skyPhase = (n) => (n < 0.25 ? "day" : n < 0.75 ? "dusk" : "night");
  let lightCanvas = null, roomPhase = null;
  function nightLights() {
    const out = [];
    DESKS.forEach((d, i) => {
      const occ = occupantOf(i);
      if (!occ) return;
      const on = isActive(occ);
      const p = d.room === "annex" ? [d.x + 0.8, d.y + 0.3, 40] : [d.x + 0.75, d.y + 0.4, 46];
      out.push({ p, r: on ? 95 : 55, a: on ? 1 : 0.7, glow: on ? "rgba(116,185,255,.35)" : "rgba(160,190,215,.18)", desk: true });
      out.push({ p: d.room === "annex" ? [d.x + 1.36, d.y + 0.56, 36] : [d.x + 1.42, d.y + 0.16, 50], r: 22, a: 0.8, glow: null, desk: true });
    });
    out.push({ p: [MANAGER.x + 1.35, MANAGER.y + 0.25, 48], r: 90, a: 1, glow: "rgba(79,195,255,.3)" });
    out.push({ p: [TV.x + 0.9, TV.y + 0.2, 42], r: 80, a: 0.9, glow: "rgba(61,139,253,.3)" });
    out.push({ p: [COUNTER.x + 0.3, COUNTER.y + 2.6, 46], r: 55, a: 0.75, glow: "rgba(255,190,110,.22)" });
    out.push({ p: [HIGH_TABLE.x + 0.35, HIGH_TABLE.y + 0.35, 60], r: 90, a: 0.95, glow: "rgba(255,200,120,.3)" });
    out.push({ p: [0.2, H - 2.0, 90], r: 70, a: 0.8, glow: "rgba(255,210,140,.25)" });
    if (S.lab.level > 0.3) out.push({ p: [29.0, 0.1, 80], r: 130, a: S.lab.level, glow: "rgba(255,107,230,.22)" });
    for (const bl of bulbs()) if (bl.k % 3 === 0) out.push({ p: [bl.x, bl.y, bl.z], r: 38, a: 0.85, glow: "rgba(255,210,120,.28)" });
    ARCADES.forEach((m) => out.push({ p: [m.x + 0.4, m.y + m.d + 0.1, 52], r: 55, a: 0.9, glow: hexA(m.col, 0.3) }));
    out.push({ p: [DANCE.x + DANCE.w / 2, DANCE.y + DANCE.d / 2, 10], r: 150, a: 0.9, glow: "rgba(255,107,230,.22)" });
    out.push({ p: [JUKEBOX.x + 0.3, JUKEBOX.y + 0.5, 30], r: 50, a: 0.8, glow: "rgba(253,203,110,.25)" });
    out.push({ p: [FOUNTAIN.x, FOUNTAIN.y, 20], r: 70, a: 0.8, glow: "rgba(116,208,245,.25)" });
    if (S.meeting) out.push({ p: [PROJ_SCREEN.x + 0.6, PROJ_SCREEN.y + PROJ_SCREEN.d / 2, 46], r: 110, a: 0.95, glow: "rgba(255,245,220,.3)" });
    return out;
  }
  function drawNight(level, vw, vh) {
    if (!lightCanvas) lightCanvas = doc.createElement("canvas");
    if (lightCanvas.width !== vw || lightCanvas.height !== vh) { lightCanvas.width = vw; lightCanvas.height = vh; }
    const lc = lightCanvas.getContext("2d");
    const k = view.scale * cam.z;
    const lights = nightLights().map((l) => ({ ...l, s: toView(...iso(...l.p)), rr: l.r * k }));
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, vw, vh);
    lc.fillStyle = `rgba(4,8,26,${0.7 * level})`;
    lc.fillRect(0, 0, vw, vh);
    lc.globalCompositeOperation = "destination-out";
    for (const l of lights) {
      const g = lc.createRadialGradient(l.s[0], l.s[1], 0, l.s[0], l.s[1], l.rr);
      g.addColorStop(0, `rgba(0,0,0,${l.a})`); g.addColorStop(1, "rgba(0,0,0,0)");
      lc.fillStyle = g;
      lc.fillRect(l.s[0] - l.rr, l.s[1] - l.rr, l.rr * 2, l.rr * 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCanvas, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    for (const l of lights) {
      if (!l.glow) continue;
      const g = ctx.createRadialGradient(l.s[0], l.s[1], 0, l.s[0], l.s[1], l.rr * 0.6);
      g.addColorStop(0, l.glow); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = level;
      ctx.fillStyle = g;
      ctx.fillRect(l.s[0] - l.rr, l.s[1] - l.rr, l.rr * 2, l.rr * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function renderScene() {
    const cv = $("stage");
    if (!ctx) ctx = cv.getContext("2d");
    const vw = cv.width, vh = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    ctx.imageSmoothingEnabled = false;
    const night = nightLevel(localHour());
    const phase = skyPhase(night);
    if (phase !== roomPhase) { roomCache = null; roomPhase = phase; }
    if (!roomCache) roomCache = drawRoom();
    const k = view.scale * cam.z;
    ctx.setTransform(k, 0, 0, k, vw / 2 - cam.x * k, vh / 2 - cam.y * k);
    ctx.drawImage(roomCache, 0, 0, roomCache.width / view.scale, roomCache.height / view.scale);
    drawMotes(night);
    const objs = FURNITURE.slice();
    for (const av of avatars.values()) objs.push({ key: av.x + av.y, draw: () => drawAvatar(av) });
    objs.push({ key: manager.x + manager.y, draw: () => drawAvatar(manager) });
    objs.sort((a, b) => a.key - b.key);
    for (const o of objs) o.draw();
    drawFx();
    drawLab();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (night > 0.01) drawNight(night, vw, vh);
    drawOverlay(vw, vh);
  }

  function drawMotes(night) {
    if (night > 0.6) return;
    const t = nowS();
    ctx.fillStyle = `rgba(255,250,220,${0.55 * (1 - night)})`;
    for (const wx of WINDOWS) {
      for (let k = 0; k < 8; k++) {
        const h = hashStr(`${wx}m${k}`);
        const u = ((h % 100) / 100 + t * 0.015 * (1 + (k % 3))) % 1, v = (((h >>> 8) % 100) / 100 + t * 0.01) % 1;
        const [px, py] = iso(wx + 0.2 + u * 2 + v * 1.2, 0.1 + v * 3.1, 10 + ((h >>> 16) % 50) + Math.sin(t + k) * 4);
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }
  }
  function drawFx() {
    for (const p of FX) {
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
      ctx.fillStyle = p.col;
      if (p.kind === "confetti") { const w = 4 * Math.abs(Math.cos(p.rot)) + 1; ctx.fillRect(p.x - w / 2, p.y - 2, w, 4); }
      else { ctx.font = "bold 10px Verdana"; ctx.fillText("✦", p.x, p.y); }
    }
    ctx.globalAlpha = 1;
  }

  function drawLab() {
    const lv = S.lab.level;
    if (lv > 0.02) {
      for (const d of [DESKS[13], DESKS[14], DESKS[17], DESKS[18]]) {
        const [px, py] = iso(d.x + 0.8, d.y + 0.4);
        const g = ctx.createRadialGradient(px, py, 4, px, py, 130);
        g.addColorStop(0, `rgba(255,240,200,${0.18 * lv})`); g.addColorStop(1, "rgba(255,240,200,0)");
        ctx.fillStyle = g; ctx.fillRect(px - 130, py - 70, 260, 140);
      }
    }
    if (lv < 0.98) {
      poly(ctx, [iso(ANNEX_X, 0, WALL), iso(W, 0, WALL), iso(W, 0), iso(W, H), iso(ANNEX_X, H), iso(ANNEX_X, 0)], `rgba(5,8,20,${0.72 * (1 - lv)})`);
      if (lv < 0.5) {
        const [tx, ty] = iso((ANNEX_X + W) / 2, H / 2);
        ctx.textAlign = "center"; ctx.fillStyle = `rgba(230,230,255,${0.9 * (1 - 2 * lv)})`;
        ctx.font = "bold 16px Verdana"; ctx.fillText("Startup Lab · luz apagada", tx, ty);
        ctx.font = "11px Verdana"; ctx.fillText("acende quando o escritório lotar (mais de 12 agentes)", tx, ty + 18);
        ctx.textAlign = "left";
      }
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function label(c, x, y, lines, opts = {}) {
    const fs = opts.size || 11;
    c.font = `bold ${fs}px Verdana`;
    const w = Math.max(...lines.map((l) => l.segs.reduce((s, sg) => s + c.measureText(sg.t).width + (sg.pill ? 8 : 0), 0))) + 12;
    const h = lines.length * (fs + 4) + 6;
    const bx = x - w / 2, by = y - h;
    c.fillStyle = opts.bg || "rgba(15,25,35,.86)";
    roundRect(c, bx, by, w, h, 4); c.fill();
    if (opts.border) { c.strokeStyle = opts.border; c.lineWidth = opts.borderW || 1.5; c.stroke(); }
    lines.forEach((l, i) => {
      let cx = bx + 6;
      const ly = by + 4 + i * (fs + 4) + fs - 1;
      for (const sg of l.segs) {
        c.font = `${sg.bold === false ? "" : "bold "}${sg.size || fs}px Verdana`;
        const tw = c.measureText(sg.t).width;
        if (sg.pill) { c.fillStyle = sg.pill; roundRect(c, cx, ly - fs + 1, tw + 6, fs + 2, 3); c.fill(); c.fillStyle = "#111"; c.fillText(sg.t, cx + 3, ly); cx += tw + 8; }
        else { c.fillStyle = sg.c || "#fff"; c.fillText(sg.t, cx, ly); cx += tw; }
      }
    });
    return [bx, by, w, h];
  }

  function speech(c, x, y, text) {
    c.font = "italic 10px Verdana";
    const w = c.measureText(text).width + 12, h = 17, bx = x - w / 2, by = y - h;
    c.fillStyle = "rgba(255,255,255,.95)"; roundRect(c, bx, by, w, h, 6); c.fill();
    c.strokeStyle = "#2d3436"; c.lineWidth = 1; c.stroke();
    c.beginPath(); c.moveTo(x - 4, by + h); c.lineTo(x, by + h + 5); c.lineTo(x + 4, by + h); c.closePath(); c.fill();
    c.fillStyle = "#2d3436"; c.fillText(text, bx + 6, by + 12);
  }

  function drawOverlay(vw, vh) {
    const c = ctx, t = nowS(), dpr = view.dpr;
    hits.length = 0;
    c.save();
    c.scale(dpr, dpr);
    const sv = (wx, wy) => { const [sx, sy] = toView(wx, wy); return [sx / dpr, sy / dpr]; };
    const pend = (S.state && S.state.pending) || [];
    // placas das portas
    for (const [txt, wx, wy, z, col] of [["CAFÉ ☕ →", SPLIT_X, 11.2, 86, "#d7a26b"], ["SALA DE REUNIÃO ↓", 9.7, H, 44, "#85929e"],
      ["TERRAÇO ↓", 16.0, H, 44, "#7fcf68"], ["ARCADE ↓", 25.2, H, 44, "#ff6be6"], ["STARTUP LAB →", MAIN_W, 5.2, 86, S.lab.on ? "#a55eea" : "#7f8c8d"],
      ["STARTUP LAB →", MAIN_W, 10.4, 86, S.lab.on ? "#a55eea" : "#7f8c8d"]]) {
      const [sx, sy] = sv(...iso(wx, wy, z));
      label(c, sx, sy, [{ segs: [{ t: txt, c: "#111" }] }], { bg: col, size: 9 });
    }
    const list = [...avatars.values()];
    for (const av of list) {
      if (av.headX == null) continue;
      if (av.kind === "subagent" && avatars.get(av.parent)) {
        const p = avatars.get(av.parent);
        if (p.headX != null) {
          c.setLineDash([5, 4]); c.lineDashOffset = -t * 20; c.strokeStyle = "rgba(162,155,254,.8)"; c.lineWidth = 1.5;
          const a = sv(av.headX, av.headY + 30), b = sv(p.headX, p.headY + 30);
          c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]);
        }
      }
    }
    for (const av of [...list, manager]) {
      if (av.headX == null) continue;
      const [sx, sy] = sv(av.headX, av.headY);
      if (av === manager) {
        const q = manager.queue.length + (manager.task ? 1 : 0);
        label(c, sx, sy - 4, [{ segs: [{ t: "Office (gerente)", c: "#ffcc33" }, ...(q ? [{ t: ` · fila ${q}`, c: "#fff" }] : [])] }], { size: 10 });
        const ph = managerPhrase();
        if (ph && (manager.pose === "sit" || manager.say)) label(c, sx, sy - 30, [{ segs: [{ t: "GERENTE", pill: TOOL_COLORS.GERENTE }, { t: " " + ph.slice(0, 48), c: "#fff", bold: false }] }], { size: 10, bg: "rgba(40,30,0,.85)" });
        continue;
      }
      const sel = S.selected === av.id;
      const col = STATUS_COLORS[av.status] || "#ccc";
      const lv = costLevel(av.model, av.effort);
      const pr = label(c, sx, sy - 4, [{ segs: [{ t: String(av.name).slice(0, 22), c: col }] },
        { segs: [{ t: `${modelShort(av.model)}${av.effort ? " · " + av.effort : ""} `, c: "#dfe6e9", bold: false, size: 9 }, { t: "$".repeat(lv), c: LEVEL_COLORS[lv - 1], size: 9 }] }],
        { size: 10, border: sel ? "#ffcc33" : null });
      hits.push({ rect: pr, id: av.id });
      for (const d of av.dollars || []) {
        c.globalAlpha = 1 - d.t / 1.6; c.fillStyle = "#4cd964"; c.font = "bold 12px Verdana";
        c.fillText("$", sx + d.dx, sy - 40 - d.t * 30); c.globalAlpha = 1;
      }
      const p = pend.find((x) => x.session === av.id);
      let by = pr[1] - 4;
      if (p) {
        const blink = Math.floor(t * 3) % 2 === 0;
        const left = Math.max(0, Math.round((p.expires_in || 0) - (t - (S.stateAt || t))));
        const r = label(c, sx, by, [{ segs: [{ t: `${toolLabel(p.tool)} pede permissão`, c: "#c0392b" }] }, { segs: [{ t: String(p.text || "").slice(0, 34), c: "#2d3436", bold: false }] },
          { segs: [{ t: ` PERMITIR (${left}s) `, pill: "#4cd964" }] }], { bg: "#ffffff", border: blink ? "#e74c3c" : "#ff9f9f", borderW: 2.5 });
        hits.push({ rect: r, approve: p.id, id: av.id });
        continue;
      }
      let segs = null;
      if (av.kind === "subagent" && av.status === "done") segs = [{ t: "entreguei o resultado", c: "#fff", bold: false }];
      else if (av.place === "cafe" && av.status === "waiting") segs = [{ t: "CAFÉ", pill: TOOL_COLORS["CAFÉ"] }, { t: " terminei, sua vez", c: "#fff", bold: false }];
      else if (av.place === "meeting" && av.mode === "plan" && av.status === "waiting") segs = [{ t: "PLANO", pill: "#ff7675" }, { t: " pronto, aguardando aprovação", c: "#fff", bold: false }];
      else if (av.status === "thinking") segs = [{ t: "pensando" + ".".repeat(1 + (Math.floor(t * 2.5) % 3)), c: "#5ac8fa", bold: false }];
      else if (av.status === "working" && av.current) {
        const lb = toolLabel(av.current.tool);
        segs = [{ t: lb, pill: toolColor(lb) }, { t: " " + String(av.current.text || "").slice(0, 34), c: "#fff", bold: false }];
      }
      if (segs && av.place === "meeting" && av.mode === "plan" && isActive(av)) segs = [{ t: "PLANO", pill: "#ff7675" }, ...segs];
      if (segs) label(c, sx, by, [{ segs }], { size: 10 });
      if (av.react) speech(c, sx, (segs ? by - 22 : by) - 2, av.react.text);
      if (av.pose === "sleep" || (av.place === "sofa" && av.status === "away")) {
        for (let k = 0; k < 3; k++) {
          const ph = (t * 0.45 + k / 3) % 1;
          c.globalAlpha = 1 - ph; c.fillStyle = "#dfe6e9"; c.font = `bold ${9 + ph * 6}px Verdana`;
          c.fillText("z", sx + 12 + ph * 14, sy + 6 - ph * 26);
        }
        c.globalAlpha = 1;
      }
      if (av.ring > 0 && av.desk != null) {
        const [rx, ry] = sv(...iso(...deskPhonePos(av.desk)));
        const jx = Math.sin(t * 50) * 2;
        c.strokeStyle = "rgba(255,204,51,.9)"; c.lineWidth = 1.5;
        for (let k = 0; k < 2; k++) { const ph = (t * 2 + k / 2) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.arc(rx, ry, 6 + ph * 14, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
        c.globalAlpha = 1;
        label(c, rx + jx, ry - 12, [{ segs: [{ t: "♪ RIIIM ♪", c: "#111" }] }], { bg: "#ffcc33", size: 9 });
      }
      const [hx, hy, hw, hh] = av.hit || [0, 0, 0, 0];
      const a = sv(hx, hy), b = sv(hx + hw, hy + hh);
      hits.push({ rect: [a[0], a[1], b[0] - a[0], b[1] - a[1]], id: av.id });
    }
    {
      const [hx, hy, hw, hh] = manager.hit || [0, 0, 0, 0];
      const a = sv(hx, hy), b = sv(hx + hw, hy + hh);
      hits.push({ rect: [a[0], a[1], b[0] - a[0], b[1] - a[1]], id: "__manager" });
    }
    c.restore();
    const g = c.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.45, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.45)");
    c.fillStyle = g; c.fillRect(0, 0, vw, vh);
  }

  // ---------- simulação ----------
  let evalT = 0;
  function step(dt) {
    if (TEST) clock.t += dt;
    const kk = 1 - Math.exp(-6 * dt);
    const tg = camTarget();
    cam.tx = tg.x; cam.ty = tg.y; cam.tz = tg.z;
    cam.x += (cam.tx - cam.x) * kk; cam.y += (cam.ty - cam.y) * kk; cam.z += (cam.tz - cam.z) * kk;
    const labOn = [...seats.keys()].some((i) => DESKS[i].room === "annex");
    if (labOn && !S.lab.on && !S.first && !TEST) toast("Escritório lotado: a luz do Startup Lab acendeu", "yellow");
    S.lab.on = labOn;
    S.lab.level = clamp(S.lab.level + (labOn ? 1 : -1) * dt / 1.5, 0, 1);
    evalT -= dt;
    if (evalT <= 0) { evalT = 1; if (S.state) evaluate(); }
    stepManager(dt);
    stepFx(dt);
    for (const av of [...avatars.values()]) {
      stepAvatar(av, dt);
      if (av.leaving && !av.path.length && Math.hypot(av.x - DOOR_SPOT.x, av.y - DOOR_SPOT.y) < 0.05) avatars.delete(av.id);
    }
  }

  function update(state) {
    if (!state) return;
    if (TEST && state.now) clock.t = state.now;
    else if (state.now) clock.offset = state.now - Date.now() / 1000;
    S.state = state;
    S.stateAt = nowS();
    syncAvatars(state.agents || []);
    assignSeats();
    evaluate();
    S.first = false;
    renderUI();
  }

  // ---------- 5. painéis ----------
  async function api(path, body) {
    const opts = body ? { method: "POST", headers: { "Content-Type": "application/json", "X-Office-Token": S.token || "" }, body: JSON.stringify(body) } : {};
    const r = await fetch(path, opts);
    let j = {};
    try { j = await r.json(); } catch (e) { j = {}; }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  function toast(msg, kind = "green") {
    const box2 = $("toasts");
    if (!box2) return;
    const el = doc.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = msg;
    box2.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
  const fmtTime = (ts) => { if (!ts) return "--:--"; const d = new Date(ts * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const ago = (ts) => { if (!ts) return "—"; const s = Math.max(0, nowS() - ts); return s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.round(s / 60)}min` : `${Math.round(s / 3600)}h`; };
  const unitFmt = (v, unit) => unit === "tokens" ? (v >= 1e6 ? (v / 1e6).toFixed(1).replace(".", ",") + "M" : v >= 1e3 ? Math.round(v / 1e3) + "k" : String(Math.round(v)))
    : Number(v || 0).toFixed(1).replace(".", ",");
  const unitIcon = (unit) => (unit === "tokens" ? "TOK" : "USD");
  const agentById = (id) => ((S.state && S.state.agents) || []).find((a) => a.id === id);

  function evItem(e, agentId) {
    const lb = toolLabel(e.tool);
    const key = `${agentId}|${e.ref || ""}`;
    const open = e.ref && S.openRefs.has(key);
    const more = e.ref ? `<button class="more" data-agent="${esc(agentId)}" data-ref="${esc(e.ref)}">${open ? "recolher ▴" : "ver tudo ▾"}</button>` : "";
    const full = open ? `<pre class="full">${esc(S.fullCache.get(key) || "carregando…")}</pre>` : "";
    return `<span class="pill" style="background:${toolColor(lb)}">${esc(lb)}</span> ${esc(e.text)} ${more}${full}`;
  }

  function renderUI() {
    if (TEST && !$("agentList")) return;
    const st = S.state || {};
    const ag = st.agents || [];
    // contadores
    const cnt = (s) => ag.filter((a) => a.status === s).length;
    const cc = $("bbCounts");
    if (cc) cc.innerHTML = ["working", "thinking", "waiting", "away"].map((s) => `<span><i class="dot" style="background:${STATUS_COLORS[s]}"></i>${cnt(s)} ${STATUS_LABEL[s]}</span>`).join("");
    // lista de agentes
    const list = $("agentList");
    if (list) {
      list.innerHTML = ag.length ? ag.map((a) => `<li data-id="${esc(a.id)}" class="${S.selected === a.id ? "sel" : ""}"><i class="dot" style="background:${STATUS_COLORS[a.status]}"></i>${a.kind === "subagent" ? "↳ " : ""}${esc(a.title)}<span class="ago">${ago(a.last_activity_at)}</span></li>`).join("")
        : `<li class="muted">ninguém no escritório nesta janela</li>`;
    }
    // chatlog
    const log = $("chatlog");
    if (log) {
      log.innerHTML = (st.feed || []).map((e) => {
        const av = avatars.get(e.agent);
        const col = av ? av.look.shirt : "#ccc";
        return `<div class="ev"><span class="t">${fmtTime(e.ts)}</span> <b style="color:${col}">${esc(String(e.name).slice(0, 24))}:</b> ${evItem(e, e.agent)}</div>`;
      }).join("");
    }
    renderDetail();
    renderLife();
    renderRanking();
    renderTabs();
    renderDiag();
    notify();
    queueChat(st.feed || []);
  }

  function renderDetail() {
    const box2 = $("detail");
    if (!box2) return;
    const a = agentById(S.selected);
    box2.classList.toggle("empty", !a);
    if (!a) { $("detMeta").innerHTML = `<p class="muted">Clique num boneco ou na lista para ver detalhes.</p>`; $("detPerm").innerHTML = ""; $("detJob").innerHTML = ""; $("detEvents").innerHTML = ""; $("detForm").hidden = true; return; }
    const lv = costLevel(a.model, a.effort);
    const mc = (S.state.model_costs || {})[a.model];
    const unit = (S.state.usage || {}).unit;
    $("detMeta").innerHTML = `<h3 style="color:${STATUS_COLORS[a.status]}">${esc(a.title)}</h3>
      <div class="meta"><span><i class="dot" style="background:${STATUS_COLORS[a.status]}"></i>${STATUS_LABEL[a.status]}</span> · última atividade há ${ago(a.last_activity_at)}</div>
      <div class="meta">${esc(modelShort(a.model))}${a.effort ? " · " + esc(a.effort) : ""} <b style="color:${LEVEL_COLORS[lv - 1]}">${"$".repeat(lv)}</b>${mc ? ` · média ${unitFmt(mc, unit)} ${unitIcon(unit)}/sessão` : ""}</div>
      ${avatars.get(a.id) && avatars.get(a.id).arch ? `<div class="meta">personagem: <i>${esc(avatars.get(a.id).arch.nick)}</i></div>` : ""}
      <div class="meta mono">${esc(a.id)}${a.mode ? " · " + esc(a.mode) : ""}</div><div class="meta">pasta: ${esc(a.workspace || "?")}</div>`;
    const p = (S.state.pending || []).find((x) => x.session === a.id);
    $("detPerm").innerHTML = p ? `<div class="perm"><b>${esc(toolLabel(p.tool))} pede permissão</b><pre>${esc(p.detail)}</pre>
      <button class="btn green" data-decide="approve" data-id="${p.id}">Permitir</button> <button class="btn" data-decide="skip" data-id="${p.id}">Decidir no app</button></div>` : "";
    const form = $("detForm");
    form.hidden = a.kind !== "session";
    const busy = a.busy || S.jobs.some((j) => j.running && j.session === a.id);
    $("cmdStatus").textContent = busy ? "executando comando..." : a.origin === "office" ? "" : "sessão criada fora do escritório: se estiver aberta num terminal, feche-a antes de enviar.";
    const job = S.jobs.find((j) => j.session === a.id);
    if (job) {
      const secs = Math.round((job.finished || nowS()) - job.started);
      const head = job.running ? `executando… ${secs}s <button class="btn red" data-cancel="${job.id}">Cancelar</button>`
        : `${job.error ? "falhou" : job.incomplete ? "resposta possivelmente incompleta" : "última resposta"} · ${fmtTime(job.finished)} · ${secs}s · ${esc(modelShort(job.model || a.model))}`;
      $("detJob").innerHTML = `<div class="job"><b>Última resposta</b><div class="meta">${head}</div>${job.error ? `<div class="err">${esc(job.error)}</div>` : ""}${job.output ? `<pre class="full">${esc(job.output)}</pre>` : ""}</div>`;
    } else $("detJob").innerHTML = "";
    $("detEvents").innerHTML = (a.events || []).map((e) => `<div class="ev"><span class="t">${fmtTime(e.ts)}</span> ${evItem(e, a.id)}</div>`).join("") || `<p class="muted">sem eventos</p>`;
  }

  function resetText(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000), hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (ts - nowS() < 20 * 3600) return `reinicia às ${hm}`;
    return `reinicia ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
  }

  function renderLife() {
    const el = $("lifebar");
    if (!el || !S.state) return;
    const u = S.state.usage || null;
    const lim = S.state.limits || null;
    const rows = ((lim && lim.rows) || []).filter((r) => r.percent != null);
    const unit = (u && u.unit) || "usd";
    const est = u ? `<div class="lbSub"><span>estimativa local do ciclo: ${unitFmt(u.spent, unit)} ${unitIcon(unit)} · hoje ${unitFmt(u.today_spent, unit)}</span></div>` : "";
    if (!rows.length) {
      el.classList.remove("pulse");
      el.innerHTML = `<div class="lbHead"><span class="unit">CLAUDE</span> limites do plano${lim && lim.refreshing ? " ↻" : ""}</div>
        <div class="hint">${esc((lim && lim.reason) || "conecte o CLI do Claude para ver os limites de 5 h e da semana")}</div>${est}`;
      return;
    }
    el.innerHTML = `<div class="lbHead"><span class="unit">CLAUDE</span> limites do plano · atualizado há ${ago(lim.fetched_at)}${lim.refreshing ? " ↻" : ""}</div>` +
      rows.slice(0, 4).map((r) => {
        const left = clamp(100 - r.percent, 0, 100);
        const cls = r.percent < 70 ? "ok" : r.percent < 90 ? "warn" : "danger";
        return `<div class="lim"><div class="limTop"><b>${esc(r.label)}</b><span>${Math.round(left)}% disponível · ${r.reset_passed ? "reiniciado" : esc(resetText(r.resets_at))}</span></div>
          <div class="lbBar"><i class="fill ${cls}" style="width:${left}%"></i><div class="grid"></div></div></div>`;
      }).join("") + est;
    el.classList.toggle("pulse", rows.some((r) => r.percent >= 90));
  }

  function renderRanking() {
    const u = (S.state && S.state.usage) || {};
    const el = $("rankList");
    if (!el) return;
    const rk = u.ranking || [];
    const top = rk.length ? rk[0].spent : 1;
    const medals = ["#ffcc33", "#dfe6e9", "#e1a95f", "#8395a7", "#8395a7"];
    el.innerHTML = rk.map((r, i) => {
      const av = avatars.get(r.id);
      const lv = costLevel(r.model, av && av.effort);
      return `<li data-id="${esc(r.id)}"><span class="pos" style="background:${medals[i]}">${i + 1}º</span><i class="sq" style="background:${av ? av.look.shirt : "#888"}"></i>
        <div class="rk"><div class="rt"><b>${esc(String(r.title).slice(0, 22))}</b><b>${unitFmt(r.spent, u.unit)}</b></div>
        <div class="rs"><span>${esc(modelShort(r.model))}${av && av.effort ? " · " + esc(av.effort) : ""} <b style="color:${LEVEL_COLORS[lv - 1]}">${"$".repeat(lv)}</b></span><span>+${unitFmt(r.today, u.unit)} hoje · ${String(r.share).replace(".", ",")}%</span></div>
        <div class="rb"><i style="width:${Math.round(100 * r.spent / top)}%"></i></div></div></li>`;
    }).join("") || `<li class="muted">sem consumo neste ciclo</li>`;
  }

  function renderTabs() {
    const t1 = $("tabOffice"), t2 = $("tabLab"), t3 = $("tabOverview");
    if (!t1 || !t2) return;
    const n = [...seats.keys()].filter((i) => DESKS[i].room === "annex").length;
    t2.textContent = n ? `Startup Lab · ${n}` : "Startup Lab · apagada";
    t1.classList.toggle("on", S.room === "office"); t2.classList.toggle("on", S.room === "annex"); t3.classList.toggle("on", S.room === "overview");
    const t4 = $("tabFun");
    if (t4) {
      const nf = [...avatars.values()].filter((a) => ["meeting", "terrace", "arcade"].includes(a.place)).length;
      t4.textContent = nf ? `Lazer · ${nf}` : "Lazer";
      t4.classList.toggle("on", S.room === "fun");
    }
    t2.classList.toggle("blink", n > 0 && S.room === "office");
  }

  function renderDiag() {
    const d = $("diag");
    if (!d || !S.state) return;
    const src = S.state.source || {};
    const empty = !(S.state.agents || []).length;
    d.hidden = !(empty || S.error);
    if (d.hidden) return;
    d.innerHTML = `<b>${S.error ? "Erro ao ler o escritório" : "Escritório vazio nesta janela"}</b><br>pasta lida: <code>${esc(src.projects)}</code> ${src.exists === false ? "(não existe)" : ""}<br>
      sessões encontradas: ${src.total_sessions || 0} · última atividade: ${src.latest_activity_at ? fmtTime(src.latest_activity_at) + " (há " + ago(src.latest_activity_at) + ")" : "—"}<br>
      ${S.error ? esc(S.error) + "<br>" : ""}Aumente a janela ou rode <code>python server.py --projects &lt;pasta&gt;</code>.`;
  }

  function beep(freqs, dur = 0.12) {
    if (!S.sound || TEST) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      S.audio = S.audio || new AC();
      freqs.forEach((f, i) => {
        const o = S.audio.createOscillator(), g = S.audio.createGain();
        o.type = "square"; o.frequency.value = f; g.gain.value = 0.04;
        o.connect(g); g.connect(S.audio.destination);
        const t0 = S.audio.currentTime + i * dur;
        o.start(t0); o.stop(t0 + dur * 0.9);
      });
    } catch (e) { /* sem áudio */ }
  }

  function notify() {
    const st = S.state;
    const pend = st.pending || [];
    const ids = new Set(pend.map((p) => p.id));
    if ([...ids].some((i) => !S.lastPending.has(i))) beep([880, 1175, 880]);
    S.lastPending = ids;
    for (const a of st.agents || []) {
      const was = S.prevStatus.get(a.id);
      if (was && isActive({ status: was }) && a.status === "waiting") { beep([660, 990]); if (doc.hidden) S.unseen++; }
      S.prevStatus.set(a.id, a.status);
    }
    if (!doc.hidden) S.unseen = 0;
    doc.title = pend.length ? `(${pend.length}) Claude Office · permissão pendente` : S.unseen ? `(${S.unseen}) Claude Office` : "Claude Office";
  }

  let chatSeen = null;
  function queueChat(feed) {
    const fresh = [];
    if (chatSeen === null) { chatSeen = new Set(feed.map((e) => `${e.agent}|${e.ts}|${e.tool}`)); return; }
    for (const e of feed.slice().reverse()) {
      const k = `${e.agent}|${e.ts}|${e.tool}`;
      if (!chatSeen.has(k)) { chatSeen.add(k); fresh.push(e); }
    }
    chatQ.push(...fresh.slice(-10));
  }
  function releaseChat() {
    const box2 = $("floatlog");
    if (!box2 || !chatQ.length || box2.children.length >= 5) return;
    const e = chatQ.shift();
    const av = avatars.get(e.agent);
    const lb = toolLabel(e.tool);
    const el = doc.createElement("div");
    el.className = "float";
    el.innerHTML = `<i class="sq" style="background:${av ? av.look.shirt : "#888"}"></i>${esc(String(e.name).slice(0, 14))}… <span class="pill" style="background:${toolColor(lb)}">${esc(lb)}</span> ${esc(String(e.text).slice(0, 60))}`;
    box2.appendChild(el);
    setTimeout(() => el.remove(), 6000);
  }

  function renderCli() {
    const el = $("bbCli");
    if (!el) return;
    const c = S.cli;
    let txt = "CLI: …", cls = "orange";
    if (S.state && S.state.demo) { txt = "CLI: demo"; cls = "gray"; }
    else if (c) {
      if (S.loginUntil && !c.logged_in && Date.now() < S.loginUntil) { txt = "CLI: aguardando login…"; cls = "orange"; }
      else if (c.logged_in) { txt = "CLI ok"; cls = "green"; }
      else if (c.auth_state === "expired") { txt = "CLI: expirado · conectar"; cls = "red"; }
      else { txt = "CLI: conectar"; cls = "red"; }
      el.title = `${c.version || "versão ?"}\n${c.path || "claude não encontrado"}\n${c.auth_message || ""}`;
    }
    el.textContent = txt;
    el.className = "seal " + cls;
  }

  async function refreshCli(recheck) {
    if (S.state && S.state.demo) { S.cli = { demo: true, available: false, logged_in: false, workspaces: [], jobs: [] }; renderCli(); return; }
    try {
      S.cli = await api(`/api/cli/status${recheck ? "?recheck=1" : ""}`);
      S.jobs = S.cli.jobs || [];
      if (S.cli.logged_in) S.loginUntil = 0;
    } catch (e) { S.cli = { available: false, logged_in: false, auth_state: "error", auth_message: e.message, workspaces: [], jobs: [] }; }
    renderCli();
    if (S.selected) renderDetail();
  }

  // ---------- diálogos ----------
  const images = { cmd: [], new: [] };
  function renderTray(which) {
    const tray = $(which === "cmd" ? "cmdTray" : "newTray");
    if (!tray) return;
    tray.innerHTML = images[which].map((src, i) => `<span class="thumb"><img src="${src}" alt=""><b data-rm="${which}:${i}">×</b></span>`).join("");
  }
  function addImageFile(which, file) {
    if (!file || !/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return toast("Só PNG, JPEG, GIF ou WEBP", "red");
    if (file.size > 5 * 1024 * 1024) return toast("Imagem acima de 5 MB", "red");
    if (images[which].length >= 5) return toast("No máximo 5 imagens", "red");
    const fr = new FileReader();
    fr.onload = () => { images[which].push(fr.result); renderTray(which); };
    fr.readAsDataURL(file);
  }
  function bindPaste(el, which) {
    if (!el) return;
    el.addEventListener("paste", (ev) => {
      for (const it of (ev.clipboardData && ev.clipboardData.items) || []) if (it.kind === "file") { ev.preventDefault(); addImageFile(which, it.getAsFile()); }
    });
    el.addEventListener("dragover", (ev) => ev.preventDefault());
    el.addEventListener("drop", (ev) => { ev.preventDefault(); for (const f of (ev.dataTransfer && ev.dataTransfer.files) || []) addImageFile(which, f); });
  }
  function modal(id, on) { const m = $(id); if (m) m.classList.toggle("open", on); }

  function askPlan(text, n) {
    return new Promise((resolve) => {
      $("planPreview").textContent = String(text || "").slice(0, 400) + (n ? `  (+${n} imagens anexadas)` : "");
      modal("dlgPlan", true);
      const done = (v) => { modal("dlgPlan", false); resolve(v); };
      $("planCancel").onclick = () => done(null);
      $("planNo").onclick = () => done(false);
      $("planYes").onclick = () => done(true);
    });
  }

  function fillModels(sel, firstLabel) {
    if (!sel) return;
    const m = S.models || { groups: [] };
    sel.innerHTML = `<option value="">${esc(firstLabel)}</option>` + (m.groups || []).filter((g) => g.models.length)
      .map((g) => `<optgroup label="${esc(g.label)}">${g.models.map((x) => `<option>${esc(x)}</option>`).join("")}</optgroup>`).join("");
  }

  let nextSeed = "";
  function newSeed() {
    nextSeed = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const cv = $("newFace");
    if (!cv || !window.Sprites) return;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    const spr = window.Sprites.build(lookFor(nextSeed), "stand", 0);
    c.drawImage(spr, 0, 0, 24, 33, 0, 0, 40, 55);
  }

  async function openNew() {
    await refreshCli();
    const c = S.cli || {};
    const warn = $("newWarn");
    const bad = !c.available || !c.logged_in;
    warn.hidden = !bad;
    warn.textContent = S.state && S.state.demo ? "Indisponível no modo demo." : !c.available ? "Claude Code não encontrado nesta máquina." : !c.logged_in ? "O CLI não está logado: clique no selo CLI na barra de baixo." : "";
    $("newSend").disabled = bad;
    $("newCwd").innerHTML = (c.workspaces || []).map((w) => `<option>${esc(w)}</option>`).join("") || `<option value="">(nenhuma pasta em workspace_roots)</option>`;
    fillModels($("newModel"), "padrão do CLI");
    $("newModel").value = store.get("office.model", "");
    $("newCli").textContent = `${c.version || "versão ?"} · ${c.path || "claude não encontrado"}`;
    images.new = []; renderTray("new");
    modal("dlgNew", true);
  }

  async function sendNew() {
    const prompt = $("newPrompt").value.trim();
    if (!prompt && !images.new.length) return toast("Escreva a primeira mensagem", "red");
    const plan = await askPlan(prompt, images.new.length);
    if (plan === null) return;
    const title = $("newTitle").value.trim();
    try {
      store.set("office.model", $("newModel").value);
      const job = await api("/api/cli/new", { cwd: $("newCwd").value, title, prompt, plan, model: $("newModel").value || null, look_seed: nextSeed, images: images.new });
      S.jobs.unshift(job);
      modal("dlgNew", false);
      $("newPrompt").value = ""; $("newTitle").value = ""; images.new = [];
      toast(`Especialista '${title || "sem nome"}' chamado; ele entra pela porta em instantes`);
      newSeed();
    } catch (e) { toast(e.message, "red"); }
  }

  async function sendCmd() {
    const a = agentById(S.selected);
    if (!a) return;
    const prompt = $("cmdText").value.trim();
    if (!prompt && !images.cmd.length) return;
    const plan = await askPlan(prompt, images.cmd.length);
    if (plan === null) return;
    try {
      const job = await api("/api/cli/send", { session: a.id, prompt, plan, model: $("cmdModel").value || null, images: images.cmd });
      S.jobs.unshift(job);
      if (job.warning) toast(job.warning, "yellow");
      $("cmdText").value = ""; images.cmd = []; renderTray("cmd");
      renderDetail();
    } catch (e) { toast(e.message, "red"); }
  }

  async function decide(id, decision) {
    try { await api("/api/decide", { id, decision }); toast(decision === "approve" ? "Permitido" : "Decida no app do Claude Code", decision === "approve" ? "green" : "yellow"); poll(); }
    catch (e) { toast(e.message, "red"); }
  }

  function select(id) {
    if (!id || id === "__manager") return;
    S.selected = id;
    const av = avatars.get(id);
    if (av && S.room !== "overview") {
      const rr = roomOf(av.x, av.y);
      const r = rr === "annex" ? "annex" : ["meeting", "terrace", "arcade"].includes(rr) ? "fun" : "office";
      if (r !== S.room) setRoom(r);
    }
    renderUI();
  }

  async function toggleMore(btn) {
    const agent = btn.dataset.agent, ref = btn.dataset.ref, key = `${agent}|${ref}`;
    if (S.openRefs.has(key)) S.openRefs.delete(key);
    else {
      S.openRefs.add(key);
      if (!S.fullCache.has(key)) {
        try {
          const sid = agent;
          const r = await api(`/api/full?session=${encodeURIComponent(sid)}&ref=${encodeURIComponent(ref)}`);
          S.fullCache.set(key, r.text);
        } catch (e) { S.fullCache.set(key, `erro: ${e.message}`); }
      }
    }
    renderUI();
  }

  // ---------- laço ----------
  async function poll() {
    try {
      const st = await api(`/api/state?hours=${S.hours}&limit=24`);
      S.error = null;
      update(st);
      const clk = $("bbClock");
      if (clk) { clk.textContent = fmtTime(Date.now() / 1000) + ":" + String(new Date().getSeconds()).padStart(2, "0"); clk.classList.remove("off"); }
    } catch (e) {
      S.error = e.message;
      const clk = $("bbClock");
      if (clk) { clk.textContent = `offline: ${e.message}`; clk.classList.add("off"); }
      renderDiag();
    }
    if (S.jobs.some((j) => j.running)) refreshCli();
  }

  function bind() {
    const cv = $("stage");
    cv.addEventListener("click", (ev) => {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      for (let i = hits.length - 1; i >= 0; i--) {
        const [hx, hy, hw, hh] = hits[i].rect;
        if (x >= hx && x <= hx + hw && y >= hy && y <= hy + hh) { if (hits[i].approve) decide(hits[i].approve, "approve"); else select(hits[i].id); return; }
      }
    });
    cv.addEventListener("mousemove", (ev) => {
      const r = cv.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      const tip = $("tooltip");
      const h = hits.slice().reverse().find((k) => x >= k.rect[0] && x <= k.rect[0] + k.rect[2] && y >= k.rect[1] && y <= k.rect[1] + k.rect[3]);
      const av = h && (h.id === "__manager" ? manager : avatars.get(h.id));
      if (!av) { tip.hidden = true; cv.style.cursor = "default"; return; }
      cv.style.cursor = "pointer";
      tip.hidden = false;
      tip.style.left = x + 14 + "px"; tip.style.top = y + 10 + "px";
      tip.innerHTML = av === manager ? "<b>Office (gerente)</b><br>cuida do escritório" : `<b>${esc(av.name)}</b>${av.arch ? "<br><i>" + esc(av.arch.nick) + "</i>" : ""}<br>${STATUS_LABEL[av.status] || ""}${av.current ? "<br>" + esc(toolLabel(av.current.tool) + " " + av.current.text) : ""}`;
    });
    $("tabOffice").onclick = () => setRoom("office");
    $("tabLab").onclick = () => setRoom("annex");
    $("tabOverview").onclick = () => setRoom("overview");
    $("tabFun").onclick = () => setRoom("fun");
    $("agentList").addEventListener("click", (ev) => { const li = ev.target.closest && ev.target.closest("li[data-id]"); if (li) select(li.dataset.id); });
    $("rankList").addEventListener("click", (ev) => { const li = ev.target.closest && ev.target.closest("li[data-id]"); if (li) select(li.dataset.id); });
    $("rankHead").onclick = () => { const c = !$("ranking").classList.contains("collapsed"); $("ranking").classList.toggle("collapsed", c); store.set("office.rank", c ? "0" : "1"); };
    $("ranking").classList.toggle("collapsed", store.get("office.rank", "1") === "0");
    doc.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t || !t.dataset) return;
      if (t.classList && t.classList.contains("more")) toggleMore(t);
      else if (t.dataset.decide) decide(t.dataset.id, t.dataset.decide);
      else if (t.dataset.cancel) api("/api/cli/cancel", { id: t.dataset.cancel }).then(refreshCli).catch((e) => toast(e.message, "red"));
      else if (t.dataset.rm) { const [w, i] = t.dataset.rm.split(":"); images[w].splice(+i, 1); renderTray(w); }
    });
    const win = $("bbWindow");
    win.value = String(S.hours);
    win.onchange = () => { S.hours = +win.value; store.set("office.hours", win.value); poll(); };
    const snd = $("bbSound");
    const sndTxt = () => { snd.textContent = S.sound ? "som: ligado" : "som: mudo"; };
    sndTxt();
    snd.onclick = () => { S.sound = !S.sound; store.set("office.sound", S.sound ? "1" : "0"); sndTxt(); };
    $("bbCli").onclick = async () => {
      if (S.state && S.state.demo) return toast("Indisponível no modo demo", "yellow");
      if (S.cli && S.cli.logged_in) return refreshCli(true);
      try {
        await api("/api/cli/auth", { action: "login" });
        S.loginUntil = Date.now() + 120000;
        toast("Conclua o login na janela que abriu", "yellow");
        renderCli();
        const iv = setInterval(async () => { await refreshCli(true); if ((S.cli && S.cli.logged_in) || Date.now() > S.loginUntil) clearInterval(iv); }, 3000);
      } catch (e) { toast(e.message, "red"); }
    };
    $("newBtn").onclick = openNew;
    $("newCancel").onclick = () => modal("dlgNew", false);
    $("newSend").onclick = sendNew;
    $("cmdSend").onclick = sendCmd;
    $("cmdText").addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.ctrlKey) { ev.preventDefault(); sendCmd(); } });
    bindPaste($("cmdText"), "cmd");
    bindPaste($("newPrompt"), "new");
    $("lifebar").onclick = () => { if (!(S.state && S.state.demo)) { toast("Atualizando os limites do plano…", "yellow"); refreshCli(true); } };
    window.addEventListener("resize", resize);
    setInterval(releaseChat, 350);
  }

  let lastT = 0, pollT = 0;
  function frame(t) {
    const dt = Math.min(0.1, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    step(dt);
    renderScene();
    pollT -= dt;
    if (pollT <= 0) { pollT = doc.hidden ? 10 : 2; poll(); }
    window.requestAnimationFrame(frame);
  }

  async function start() {
    resize();
    bind();
    newSeed();
    try { S.token = (await api("/api/token")).token; } catch (e) { S.token = null; }
    try { S.models = await api("/api/cli/models"); } catch (e) { S.models = { groups: [] }; }
    fillModels($("cmdModel"), "modelo atual da sessão");
    await poll();
    refreshCli();
    setInterval(() => refreshCli(), 30000);
    window.requestAnimationFrame(frame);
  }

  window.__office = {
    manager, avatars, seats, seatFor, seatTarget, cam, setRoom, toView, fromView, viewSize, route, OBSTACLES, DESKS, update, step, evaluate,
    freePoint, segmentFree, roomOf, nearestFree, nearSpot, subSpot, view, debugScale: (k) => { view.scale = k; roomCache = null; }, nightLevel, FUN, PRESENTER, bulbs, burst, FX, ARCHETYPES, deskPhonePos, setHour: (h) => { S.hourOverride = h; }, nightLights, lookFor, costLevel, toolLabel, modelShort, renderScene, iso, now: nowS, S,
    constants: { TW, TH, MAIN_W, W, H, WH, WALL, SPLIT_X, SPLIT_Y, PW, DOORS, ANNEX_X, ANNEX_DOORS, SOFA_SEATS, STANDING, CAFE_SPOTS, DOOR_SPOT, SUB_SPOTS, CHAIR, PLANTS, GRID, CLEAR },
  };
  if (TEST) resize();
  else if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})();
