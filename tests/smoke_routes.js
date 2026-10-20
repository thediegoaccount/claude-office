// node tests/smoke_routes.js — todas as rotas chegam sem atravessar obstáculos nem sair do mundo.
const { load } = require("./fakedom");
const O = load().__office;
const C = O.constants;
let total = 0, fails = 0;
function verify(name, from, to) {
  total++;
  const path = O.route(from, to);
  const why = !path ? "sem rota" : null;
  let bad = why;
  if (!bad) {
    let prev = from;
    for (const p of path) {
      if (!O.segmentFree(prev, p, 0)) { bad = `atravessa obstáculo entre (${prev.x.toFixed(2)},${prev.y.toFixed(2)}) e (${p.x.toFixed(2)},${p.y.toFixed(2)})`; break; }
      if (p.x < 0 || p.y < 0 || p.x > C.W || p.y > C.WH) { bad = "sai do mundo"; break; }
      prev = p;
    }
    const last = path[path.length - 1];
    if (!bad && Math.hypot(last.x - to.x, last.y - to.y) > 1e-6) bad = "não chega ao destino";
  }
  if (bad) { fails++; console.log(`FALHA ${name}: ${bad}`); }
}
const seats = O.DESKS.map((d) => O.seatFor(d));
const pt = (p) => ({ x: p.x, y: p.y });
seats.forEach((s, i) => {
  verify(`porta→mesa ${i}`, C.DOOR_SPOT, s);
  verify(`mesa ${i}→porta`, s, C.DOOR_SPOT);
  C.CAFE_SPOTS.forEach((c, k) => { verify(`mesa ${i}→café ${k}`, s, c); verify(`café ${k}→mesa ${i}`, c, s); });
  C.SOFA_SEATS.forEach((c, k) => { verify(`mesa ${i}→sofá ${k}`, s, c); verify(`sofá ${k}→mesa ${i}`, c, s); });
  C.STANDING.forEach((c, k) => verify(`mesa ${i}→em pé ${k}`, s, c));
  const wake = O.nearSpot(s);
  verify(`gerente→acordar mesa ${i}`, C.CHAIR, wake);
  verify(`acordar mesa ${i}→gerente`, wake, C.CHAIR);
  C.SUB_SPOTS.forEach(([dx, dy], k) => {
    const sp = { x: O.DESKS[i].x + dx, y: O.DESKS[i].y + dy };
    if (O.freePoint(sp.x, sp.y, 0.05)) verify(`pai ${i}→SUB_SPOT ${k}`, s, sp);
  });
});
C.CAFE_SPOTS.forEach((c, k) => C.SOFA_SEATS.forEach((f, j) => verify(`café ${k}→sofá ${j}`, c, f)));
C.SOFA_SEATS.forEach((f, j) => {
  const wake = O.nearSpot(f);
  verify(`gerente→acordar sofá ${j}`, C.CHAIR, wake);
  verify(`acordar sofá ${j}→gerente`, wake, C.CHAIR);
});
for (const [venue, spots] of Object.entries(O.FUN)) {
  spots.forEach((sp, k) => {
    verify(`porta→${venue} ${k}`, C.DOOR_SPOT, sp);
    for (const i of [0, 5, 11, 12, 23]) { verify(`mesa ${i}→${venue} ${k}`, seats[i], sp); verify(`${venue} ${k}→mesa ${i}`, sp, seats[i]); }
    C.CAFE_SPOTS.forEach((c, j) => j % 3 === 0 && verify(`café ${j}→${venue} ${k}`, c, sp));
  });
}
seats.forEach((s, i) => { verify(`mesa ${i}→telão`, s, O.PRESENTER); verify(`telão→mesa ${i}`, O.PRESENTER, s); });
console.log(`${total} rotas verificadas, ${fails} falhas`);
process.exit(fails ? 1 : 0);
