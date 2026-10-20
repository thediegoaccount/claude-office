// Estados de exemplo para os smoke tests do frontend.
const NOW = 1800000000;
function agent(id, status, extra = {}) {
  return { id, kind: "session", title: `Agente ${id}`, model: "claude-sonnet-5-5", effort: "medium", mode: "default", workspace: "w",
    created_at: NOW - 3600 + (extra.order || 0), last_activity_at: NOW - 5, status, current: { ts: NOW - 5, tool: "Bash", text: "ls" }, events: [], ...extra };
}
function sub(id, parent, status, extra = {}) {
  return { ...agent(id, status, extra), kind: "subagent", parent, title: `Sub ${id}` };
}
function state(agents, now = NOW, extra = {}) {
  return { now, agents, feed: [], pending: [], model_costs: {}, source: { projects: "x", total_sessions: agents.length },
    usage: { budget: 100, spent: 10, remaining: 90, remaining_pct: 90, day: 1, days_in_month: 30, days_left: 30, cycle_start: "01/10", cycle_end: "30/10",
      pace_spent: 3, pace_remaining_pct: 97, today_spent: 1, daily_allowance: 3, status: "ok", ranking: [], unit: "usd", configured: true, cycle_start_day: 1 }, ...extra };
}
function run(O, secs, dt = 0.05) { for (let t = 0; t < secs; t += dt) O.step(dt); }
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log("FALHA: " + msg); } }
function done(name) { console.log(`${name}: ${failures ? failures + " falhas" : "ok"}`); process.exit(failures ? 1 : 0); }
module.exports = { NOW, agent, sub, state, run, check, done };
