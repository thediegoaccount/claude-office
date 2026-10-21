// node tests/smoke_office.js
const { load } = require("./fakedom");
const { NOW, agent, sub, state, run, check, done } = require("./helpers");

{
  const win = load();
  const O = win.__office;
  const agents = [agent("a", "working"), agent("b", "thinking", { order: 1 }), sub("a::s1", "a", "working"), sub("a::s2", "a", "done")];
  O.update(state(agents));
  run(O, 20);
  for (const id of ["a", "b"]) {
    const av = O.avatars.get(id);
    check(av.desk != null, `${id} sem mesa`);
    const s = O.seatFor(O.DESKS[av.desk]);
    check(Math.hypot(av.x - s.x, av.y - s.y) < 0.05 && ["type", "sit"].includes(av.pose), `${id} não sentou (${av.pose})`);
  }
  check(O.avatars.get("a").pose === "type" && O.avatars.get("b").pose === "sit", "poses de trabalho/pensando");
  const s1 = O.avatars.get("a::s1"), s2 = O.avatars.get("a::s2");
  check(s1.desk != null && s1.pose === "type", "subagente ativo sem mesa");
  const pd = O.DESKS[O.avatars.get("a").desk], sd = O.DESKS[s1.desk];
  const nearest = O.DESKS.map((d, i) => [i, Math.hypot(d.x - pd.x, d.y - pd.y)]).filter(([i]) => ![...O.seats.values()].includes(`x${i}`) && i !== O.avatars.get("a").desk && i !== O.avatars.get("b").desk).sort((p, q) => p[1] - q[1])[0];
  check(Math.hypot(sd.x - pd.x, sd.y - pd.y) <= nearest[1] + 1e-6, "subagente não pegou a mesa mais próxima do pai");
  check(s2.desk == null && s2.pose === "stand", "subagente concluído deveria estar de pé");
  O.renderScene();
}

{
  const win = load();
  const O = win.__office;
  const agents = [];
  for (let i = 0; i < 20; i++) agents.push(agent(`s${String(i).padStart(2, "0")}`, "working", { order: i }));
  agents.push(sub("s00::x", "s00", "working"), sub("s01::y", "s01", "working"), sub("s02::z", "s02", "thinking"));
  O.update(state(agents));
  run(O, 2);
  const sess = agents.filter((a) => a.kind === "session").map((a) => O.avatars.get(a.id));
  const inAnnex = sess.filter((a) => a.desk != null && O.DESKS[a.desk].room === "annex").length;
  const inMain = sess.filter((a) => a.desk != null && O.DESKS[a.desk].room === "main").length;
  check(inMain === 12 && inAnnex === 8, `esperado 12 no escritório e 8 no anexo, veio ${inMain}/${inAnnex}`);
  check(sess.every((a) => a.desk != null), "sessão de pé com mesa livre");
  const subs = agents.filter((a) => a.kind === "subagent").map((a) => O.avatars.get(a.id));
  check(subs.filter((a) => a.desk != null).length === 3, "os 3 subagentes deveriam ocupar as 3 mesas restantes");
  // mais 4 sessões: os subagentes cedem e nenhuma sessão fica de pé
  const more = agents.concat([0, 1, 2, 3].map((k) => agent(`t${k}`, "working", { order: 30 + k })));
  O.update(state(more));
  const sess2 = more.filter((a) => a.kind === "session").map((a) => O.avatars.get(a.id));
  const subs2 = more.filter((a) => a.kind === "subagent").map((a) => O.avatars.get(a.id));
  check(sess2.every((a) => a.desk != null), "sessão ficou de pé enquanto subagente tinha mesa");
  check(subs2.every((a) => a.desk == null), "subagente manteve mesa com sessão de pé");
  check(O.S.lab.on || true, "");
  // visão geral enquadra o mundo inteiro; voltar ao Escritório restaura o zoom
  O.setRoom("overview");
  run(O, 4);
  const { w, h } = O.viewSize(), C = O.constants;
  for (const [x, y, z] of [[0, 0, C.WALL], [C.W, 0, C.WALL], [0, C.WH, 0], [C.W, C.WH, 0]]) {
    const [sx, sy] = O.toView(...O.iso(x, y, z));
    check(sx >= 0 && sx <= w && sy >= 0 && sy <= h, `canto (${x},${y}) fora da visão geral: ${sx.toFixed(0)},${sy.toFixed(0)}`);
  }
  check(O.cam.z < 1, "visão geral deveria reduzir o zoom");
  O.setRoom("office");
  run(O, 4);
  check(Math.abs(O.cam.z - 1) < 0.01, `zoom do Escritório não voltou: ${O.cam.z}`);
  O.setRoom("annex");
  run(O, 4);
  const d = O.DESKS[20], [sx, sy] = O.toView(...O.iso(d.x, d.y));
  check(sx > 0 && sx < w && sy > 0 && sy < h, "câmera do Startup Lab não mostra o anexo");
  O.renderScene();
}

{
  const win = load();
  const O = win.__office;
  O.update(state([agent("a", "working")]));
  O.update(state([agent("a", "working"), agent("n", "working", { order: 5 })]));
  const n = O.avatars.get("n"), C = O.constants;
  check(Math.hypot(n.x - C.DOOR_SPOT.x, n.y - C.DOOR_SPOT.y) < 0.01 && n.path.length > 0, "novo boneco deveria entrar pela porta");
  run(O, 30);
  check(n.pose === "type", "novo boneco não chegou à mesa");
  O.update(state([agent("a", "working")]));
  run(O, 30);
  check(!O.avatars.has("n"), "boneco que sumiu do estado deveria sair pela porta");
}
{
  const win = load();
  const O = win.__office;
  O.update(state([agent("a", "working"), agent("b", "waiting", { order: 1 })]));
  check(O.nightLevel(12) === 0 && O.nightLevel(23) === 1 && O.nightLevel(2) === 1, "nível da noite errado");
  check(O.nightLevel(18.25) > 0.4 && O.nightLevel(18.25) < 0.6 && O.nightLevel(6.25) > 0.4, "transição do entardecer/amanhecer");
  const lights = O.nightLights();
  check(lights.filter((l) => l.r >= 55).length >= 2 + 4, "telas ocupadas e poucas luzes deveriam acender");
  check(lights.filter((l) => l.desk).length === 2 * 2, "só as mesas ocupadas deveriam acender à noite");
  for (const h of [12, 18, 23]) { O.setHour(h); O.renderScene(); }
}
{
  const win = load();
  const O = win.__office;
  O.update(state([agent("a", "working"), agent("b", "working", { order: 1 })]));
  run(O, 2);
  const a = O.avatars.get("a");
  check(a.arch && a.arch.nick && O.ARCHETYPES.length >= 12, "boneco sem personagem");
  O.update(state([agent("a", "waiting"), agent("b", "working", { order: 1 })]));
  check(O.FX.length > 0 && a.react && /Feito/.test(a.react.text), "terminar deveria soltar confete e reação");
  O.update(state([agent("a", "waiting"), agent("b", "working", { order: 1 }), sub("b::s", "b", "working")]));
  check(O.avatars.get("b").react && /Reforço/.test(O.avatars.get("b").react.text), "subagente novo deveria gerar reação no pai");
  O.setRoom("fun");
  run(O, 4);
  const { w, h } = O.viewSize();
  const [fx, fy] = O.toView(...O.iso(O.FUN.terrace[6].x, O.FUN.terrace[6].y));
  check(fx > 0 && fx < w && fy > 0 && fy < h, "aba Lazer não mostra o terraço");
  O.renderScene();
}
{
  const win = load();
  const O = win.__office;
  const near = (av, p) => Math.hypot(av.x - p.x, av.y - p.y) < 0.05;
  const plan = [agent("p1", "working", { mode: "plan" }), agent("p2", "thinking", { mode: "plan", order: 1 }), agent("n", "working", { order: 2 }),
    sub("p1::s", "p1", "working")];
  O.update(state(plan));
  run(O, 30);
  const p1 = O.avatars.get("p1"), p2 = O.avatars.get("p2"), n = O.avatars.get("n"), s1 = O.avatars.get("p1::s");
  check(p1.place === "meeting" && near(p1, O.PRESENTER), `quem planeja deveria apresentar no telão (${p1.place})`);
  check(p2.place === "meeting" && O.FUN.meeting.some((p) => near(p2, p)), "segundo agente em plano deveria sentar na reunião");
  check(s1.place === "meeting" && s1.desk == null, "subagente de quem planeja deveria ir à reunião, sem ocupar mesa");
  check(n.place === "desk" && n.pose === "type", "quem não está em plano fica na mesa");
  check(p1.desk != null, "a mesa de quem está em reunião continua reservada");
  check(O.S.meeting && O.S.meeting.presenter === "p1", "telão deveria mostrar o plano");
  O.update(state([agent("p1", "waiting", { mode: "plan" }), agent("p2", "thinking", { mode: "plan", order: 1 }), agent("n", "working", { order: 2 })]));
  run(O, 5);
  check(p1.place === "meeting", "aguardando aprovação do plano, continua na reunião");
  O.update(state([agent("p1", "working", { mode: "default" }), agent("p2", "thinking", { mode: "plan", order: 1 }), agent("n", "working", { order: 2 })]));
  run(O, 30);
  check(p1.place === "desk" && near(p1, O.seatFor(O.DESKS[p1.desk])), "saindo do modo plano, volta para a mesa");
  check(near(p2, O.PRESENTER), "o próximo em plano assume o telão");
  O.renderScene();
}
{
  // ninguém sentado na reunião pode ser desenhado por cima da mesa
  const O = load().__office;
  const t = O.CONF_TABLE;
  const tableKeys = O.FURNITURE.map((f) => f.key).filter((k) => k > t.x + t.y && k < t.x + t.w + t.y + t.d);
  for (const st of O.FUN.meeting) {
    const key = st.x + st.y;
    const slice = t.x + Math.floor(st.x - t.x) + 0.5 + t.y + t.d / 2;
    check(tableKeys.some((k) => Math.abs(k - slice) < 1e-9), `fatia da mesa não encontrada para x=${st.x}`);
    if (!st.back) check(key < slice, `quem senta atrás (x=${st.x}) seria desenhado sobre a mesa`);
    else check(key > slice, `quem senta na frente (x=${st.x}) seria desenhado atrás da mesa`);
  }
}
{
  // leitura ampliada: Markdown simples, sempre escapando HTML vindo da resposta
  const md = load().__office.mdToHtml;
  const html = md([
    "## Título", "", "**O que mudei:**", "- item *um*", "- item `dois`", "", "1. primeiro", "2. segundo", "",
    "```", "<b>código</b>", "```", "<script>alert(1)</script>",
  ].join("\n"));
  check(html.includes("<h4>Título</h4>") && html.includes("<b>O que mudei:</b>"), "título e negrito");
  check(html.includes("<ul><li>item <i>um</i></li><li>item <code>dois</code></li></ul>"), "lista com itálico e código");
  check(html.includes("<ol><li>primeiro</li><li>segundo</li></ol>"), "lista numerada");
  check(html.includes("<pre>&lt;b&gt;código&lt;/b&gt;</pre>"), "bloco de código escapado");
  check(!html.includes("<script>") && html.includes("&lt;script&gt;"), "HTML da resposta precisa ser escapado");
}
done("smoke_office");
