// node tests/smoke_wake.js — ciclo de ócio (mesa → café → lazer → mesa → sofá) e o gerente ligando na mesa.
const { load } = require("./fakedom");
const { NOW, agent, state, run, check, done } = require("./helpers");
const O = load().__office;
const C = O.constants;
const near = (av, p) => Math.hypot(av.x - p.x, av.y - p.y) < 0.05;
const funSpots = Object.values(O.FUN).flat();
const st = (t, status, last) => state([agent("a", "working", { last_activity_at: t }), agent("i", status, { last_activity_at: last, order: 1 })], t);

O.update(st(NOW, "waiting", NOW - 60));
run(O, 10);
const av = O.avatars.get("i");
check(av.place === "desk" && av.pose === "sleep", `deveria cochilar na mesa (${av.place}/${av.pose})`);
O.update(st(NOW + 600, "waiting", NOW - 60));
run(O, 25);
check(av.place === "cafe" && av.pose === "cup" && C.CAFE_SPOTS.some((p) => near(av, p)), `deveria estar no café (${av.place}/${av.pose})`);
O.update(st(NOW + 900, "waiting", NOW - 60));
run(O, 40);
check(["terrace", "arcade", "meeting"].includes(av.place) && funSpots.some((p) => near(av, p)), `deveria passear no lazer (${av.place})`);
O.update(st(NOW + 1260, "waiting", NOW - 60));
run(O, 40);
check(av.place === "desk" && av.pose === "sleep", `deveria voltar a cochilar (${av.place}/${av.pose})`);
O.update(st(NOW + 3 * 3600, "away", NOW - 60));
run(O, 40);
check(av.place === "sofa" && C.SOFA_SEATS.some((p) => near(av, p)), `deveria ir ao sofá (${av.place})`);

// chega comando: o gerente liga da própria mesa; o telefone da mesa toca e o boneco volta
const t = NOW + 3 * 3600 + 40;
O.update(st(t, "working", t));
const m = O.manager;
check(av.wake && (m.queue.includes("i") || (m.task && m.task.id === "i")), "gerente deveria entrar na fila");
let rang = false, phoned = false, moved = false;
for (let k = 0; k < 400 && (av.wake || !rang); k++) {
  O.step(0.05);
  if (av.ring > 0) rang = true;
  if (m.phone) phoned = true;
  if (Math.hypot(m.x - C.CHAIR.x, m.y - C.CHAIR.y) > 0.05) moved = true;
}
check(phoned && rang, "gerente deveria ligar e o telefone da mesa tocar");
check(!moved, "gerente não deveria sair da cadeira para acordar quem tem mesa");
check(!av.wake && av.react && /telefone|Alô/.test(av.react.text), "boneco deveria atender e voltar");
run(O, 40);
check(near(av, O.seatFor(O.DESKS[av.desk])) && av.pose === "type", `boneco não voltou à mesa (${av.pose})`);
check(near(m, C.CHAIR) && m.pose === "sit" && !m.phone, "gerente deveria seguir sentado e desligar");

// cochilando na própria mesa: atende o telefone ali mesmo
const t2 = t + 3000;
O.update(st(t2, "waiting", t2 - 30));
run(O, 10);
check(av.place === "desk" && av.pose === "sleep", "deveria cochilar na mesa antes da segunda ligação");
O.update(st(t2 + 15, "working", t2 + 15));
for (let k = 0; k < 200 && av.wake; k++) O.step(0.05);
check(av.react && /Alô/.test(av.react.text), "na mesa deveria atender com 'Alô'");
done("smoke_wake");
