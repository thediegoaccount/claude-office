// Confere a largura de todas as linhas dos mapas de sprites: node tests/check_sprites.js
const { load } = require("./fakedom");
const win = load(["sprites.js"]);
const S = win.Sprites;
let bad = 0, total = 0;
for (const [name, map] of Object.entries(S.maps)) {
  const width = S.widths[name];
  const groups = Array.isArray(map) ? { [name]: map } : map;
  for (const [g, rows] of Object.entries(groups)) {
    rows.forEach((row, i) => {
      total++;
      if (row !== "" && row.length !== width) {
        bad++;
        console.log(`${name}.${g}[${i}] tem ${row.length} colunas (esperado ${width}): "${row}"`);
      }
    });
  }
}
const looks = [
  { shirt: "#e74c3c", hair: "#2d1b0e", skin: "#f5cba7", pants: "#2c3e50", accent: "#c0392b", jacket: "#1a1a1a", hairStyle: "bun", torso: "jacket", glasses: true, bag: true, blush: true },
  { shirt: "#3498db", hair: "#111", skin: "#8d5524", pants: "#555", accent: "#27ae60", jacket: "#4a3b2a", hairStyle: "bald", torso: "dress", glasses: false, bag: false, blush: false },
];
for (const look of looks) {
  for (const pose of ["stand", "walk", "type", "sit", "sleep", "cup", "raise"]) {
    for (const back of [false, true]) {
      const cv = S.build(look, pose, 1, back);
      const want = S.TOP + (["sit", "type", "sleep"].includes(pose) ? 34 : 42);
      total++;
      if (cv.width !== S.W || cv.height !== want) { bad++; console.log(`build ${pose} ${cv.width}x${cv.height}`); }
    }
  }
}
console.log(`${total} linhas/sprites verificados, ${bad} falhas`);
process.exit(bad ? 1 : 0);
