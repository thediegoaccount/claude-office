/* Gerador de sprites pixel-art a partir de mapas de caracteres. */
(function (root) {
  "use strict";
  const W = 24, TOP = 3;
  const HEAD = [
    "....oooooooo....", "...ohhhhhhhho...", "..ohhhhhhhhhho..", ".ohhhhhhhhhhhho.", ".ohhhhhhhhhhhho.",
    ".ohHssssssssHho.", ".oHssssssssssHo.", ".osbbbssbbbssSo.", ".osswessswessSo.", ".osswessswessSo.",
    ".osssssssssssSo.", ".osssssssssssSo.", ".osssssmmmssSSo.", "..oSssssssssSo..", "...oSSssssSSo...",
    "....oooooooo....", "......osSo......",
  ];
  const HAIRS = {
    short: [],
    parted: ["", "...ohhhhHhhho...", "..ohhhhhHhhhho..", ".ohhhhhhHhhhhho.", ".ohhhhhhHhhhhho.", ".ohhhhhHssssHho."],
    long: ["", "", "", "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho",
      "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho",
      "ohh..........hho", "ohh..........hho", "ohhh........hhho", ".ooo........ooo."],
    bob: ["", "", "", "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohh..........hho",
      "ohh..........hho", "ohh..........hho", "ohh..........hho", "ohhh........hhho", ".ooo........ooo."],
    curly: ["..o.oo.oo.oo.o..", ".ohohhohhohhoho.", "ohhhhhhhhhhhhhho", "ohhhhhhhhhhhhhho", "ohhHhhhhhhhhHhho",
      "ohH..........Hho", "oh............ho", "oh............ho", "oh............ho", ".o............o."],
    bun: ["......oooo......", ".....ohhhho.....", ".....ohHHho....."],
    cap: ["....oooooooo....", "...onnnnnnnno...", "..onnnnnnnnnno..", ".onnnnnnnnnnnno.", "oNNNNNNNNNNNNNNo"],
    bald: ["", "...osssssssso...", "..osssssssssSo..", ".osssssssssssSo.", ".osssssssssssSo.", ".osssssssssssSo.",
      ".osssssssssssSo."],
  };
  const HAIR_TOP = { bun: -3 };
  const GLASSES = ["", "", "", "", "", "", "", "...gggg.gggg....", "...g..ggg..g....", "...g..g.g..g....", "...gggg.gggg...."];
  const BLUSH = ["", "", "", "", "", "", "", "", "", "", "", "..BB........BB.."];
  const TORSOS = {
    tie: ["..oooooooooooo..", ".ottttcnnctttTo.", ".otttttnnttttTo.", ".otttttnnttttTo.", ".otttttnnttttTo.",
      ".otttttnnttttTo.", ".otttttttttttTo.", ".oTttttttttttTo.", ".oTTTTTTTTTTTTo.", ".okkkkkkkkkkkko.", "..oooooooooooo.."],
    plain: ["..oooooooooooo..", ".ottttcccctttTo.", ".otttttttttttTo.", ".otttttttttttTo.", ".otttttttttttTo.",
      ".otttttttttttTo.", ".otttttttttttTo.", ".oTttttttttttTo.", ".oTTTTTTTTTTTTo.", ".okkkkkkkkkkkko.", "..oooooooooooo.."],
    jacket: ["..oooooooooooo..", ".ojjjjcnncjjjJo.", ".ojjjjtnntjjjJo.", ".ojjjjtnntjjjJo.", ".ojjjjjnnjjjjJo.",
      ".ojjjjjnnjjjjJo.", ".ojjjjjjjjjjjJo.", ".oJjjjjjjjjjjJo.", ".oJJJJJJJJJJJJo.", ".okkkkkkkkkkkko.", "..oooooooooooo.."],
    cardigan: ["..oooooooooooo..", ".ojjjjccccjjjJo.", ".ojjjttttttjjJo.", ".ojjjttttttjjJo.", ".ojjjttttttjjJo.",
      ".ojjjttttttjjJo.", ".ojjjttttttjjJo.", ".oJjjttttttjjJo.", ".oJJJTTTTTTJJJo.", ".okkkkkkkkkkkko.", "..oooooooooooo.."],
    dress: ["..oooooooooooo..", ".ottttcccctttTo.", ".otttttttttttTo.", ".otttttttttttTo.", ".otttttttttttTo.",
      ".otttttttttttTo.", ".otttttttttttTo.", ".otttttttttttTo.", ".oTttttttttttTo.", ".oTTTTTTTTTTTTo.", ".oTTTTTTTTTTTTo."],
  };
  const BAG_STRAP = ["", "...........q....", "..........q.....", ".........q......", "........q.......", ".......q........",
    "......q.........", ".....q..........", "....q..........."];
  const BAG = [".oooooo.", "oqqqqqqo", "oqQqqQqo", "oqqqqqqo", "oQQQQQQo", ".oooooo."];
  const ARM_DOWN = [".oo.", "oaao", "oaao", "oaao", "oaao", "oaao", "oAAo", "osso", "osso", ".oo."];
  const ARM_TYPE = [".oo.", "oaao", "oaao", "oAAo", "osso", "osso", ".oo."];
  const ARM_UP = [".oo.", "osso", "osso", "oaao", "oaao", "oaao", "oaao", "oaao", "oaao", "oaao", "oAAo", "oaao"];
  const ARM_CUP = [".oo.", "oaao", "oaao", "oaao", "oaao", "oAAo", "osso", "owwo", "owwo", ".oo."];
  const LEG = ["oppppPo", "oppppPo", "oppppPo", "oppppPo", "oppppPo", "oppppPo", "oppppPo", "oppppPo", "oppppPo",
    "oPPPPPo", "okkkkko", "okkkkko", "okkkkko", ".ooooo."];
  const LEG_SIT = ["opppppPoopppppPo", "opppppPoopppppPo", "oPPPPPPooPPPPPPo", ".okkkko..okkkko.", ".okkkko..okkkko.",
    "..oooo....oooo.."];
  const SKIRT = ["opppppppppppppPo", "opppppppppppppPo", "opppppppppppppPo", "opppppppppppppPo", "opppppppppppppPo",
    "oPPPPPPPPPPPPPPo", ".oooooooooooooo.", "...osso..osso...", "...osso..osso...", "...osso..osso...",
    "...okko..okko...", "..okkko..okkko..", "..okkko..okkko..", "..ooooo..ooooo.."];
  const SKIRT_SIT = ["opppppppppppppPo", "opppppppppppppPo", "oPPPPPPPPPPPPPPo", "..osso....osso..", "..okko....okko..",
    "..oooo....oooo.."];
  const SITTING = { sit: 1, type: 1, sleep: 1 };

  function shade(hex, k) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function palette(look) {
    const arm = look.torso === "jacket" ? look.jacket : look.shirt;
    return {
      o: "#1a1a1a", s: look.skin, S: shade(look.skin, 0.82), h: look.hair, H: shade(look.hair, 0.7), b: shade(look.hair, 0.8),
      w: "#ffffff", e: "#2b1d14", m: shade(look.skin, 0.55), B: "#f1948a", t: look.shirt, T: shade(look.shirt, 0.72),
      c: "#f4f4f4", n: look.accent, N: shade(look.accent, 0.72), j: look.jacket, J: shade(look.jacket, 0.72),
      a: arm, A: shade(arm, 0.72), p: look.pants, P: shade(look.pants, 0.72), k: "#222", g: "#2b2b2b", q: "#6e4b2a", Q: "#4e3319",
    };
  }

  function stamp(grid, rows, x, y, map) {
    rows.forEach((row, r) => {
      const gy = y + r;
      if (gy < 0 || gy >= grid.length) return;
      for (let c = 0; c < row.length; c++) {
        let ch = row[c];
        if (map) ch = map(ch, r, c);
        if (ch !== "." && ch !== " " && x + c >= 0 && x + c < W) grid[gy][x + c] = ch;
      }
    });
  }

  const cache = new Map();

  function grid(look, pose, frame, back) {
    const sitting = !!SITTING[pose];
    const h = TOP + (sitting ? 34 : 42);
    const g = Array.from({ length: h }, () => new Array(W).fill(null));
    const headY = 3, torsoY = 20, armY = 21, legY = 31;
    const dy = pose === "type" ? frame % 2 : pose === "sleep" ? 2 : 0;
    const dress = look.torso === "dress";
    if (sitting) stamp(g, dress ? SKIRT_SIT : LEG_SIT, 4, legY);
    else if (dress) stamp(g, SKIRT, 4, legY);
    else {
      const walk = pose === "walk";
      stamp(g, LEG, 4, legY - (walk && frame % 2 === 0 ? 1 : 0));
      stamp(g, LEG, 13, legY - (walk && frame % 2 === 1 ? 1 : 0));
    }
    const torso = back ? TORSOS.plain : TORSOS[look.torso] || TORSOS.plain;
    const jk = back && look.torso === "jacket";
    stamp(g, torso, 4, torsoY + dy, jk ? (ch) => (ch === "t" ? "j" : ch === "T" ? "J" : ch) : null);
    if (look.bag && !back) stamp(g, BAG_STRAP, 4, torsoY + dy);
    const left = pose === "type" ? ARM_TYPE : ARM_DOWN;
    const ly = pose === "type" ? armY + 3 + (frame % 2) : armY;
    stamp(g, left, 1, ly + dy);
    if (pose === "cup") stamp(g, ARM_CUP, 19, armY + dy);
    else if (pose === "raise") stamp(g, ARM_UP, 19, armY - 11 + dy);
    else stamp(g, left, 19, (pose === "type" ? armY + 3 + ((frame + 1) % 2) : armY) + dy);
    const bald = look.hairStyle === "bald";
    const faceMap = back ? (ch, r) => (r < 15 && "sSbwem".includes(ch) ? (bald ? "s" : "h") : ch) : null;
    stamp(g, HEAD, 4, headY + dy, faceMap);
    const hair = HAIRS[look.hairStyle] || [];
    stamp(g, hair, 4, headY + dy + (HAIR_TOP[look.hairStyle] || 0));
    if (!back) {
      if (look.blush) stamp(g, BLUSH, 4, headY + dy);
      if (pose === "sleep") {
        for (const x of [8, 13]) {
          for (let k = 0; k < 2; k++) { g[headY + dy + 8][x + k] = "s"; g[headY + dy + 9][x + k] = "o"; }
        }
      }
      if (look.glasses) stamp(g, GLASSES, 4, headY + dy);
      if (look.bag && !sitting) stamp(g, BAG, 1, legY - 1);
    }
    return g;
  }

  function build(look, pose, frame, back = false) {
    frame = frame || 0;
    const key = JSON.stringify([look, pose, frame % 2, back]);
    if (cache.has(key)) return cache.get(key);
    const g = grid(look, pose, frame, back);
    const pal = palette(look);
    const cv = root.document.createElement("canvas");
    cv.width = W;
    cv.height = g.length;
    const ctx = cv.getContext("2d");
    for (let y = 0; y < g.length; y++) {
      for (let x = 0; x < W; x++) {
        const ch = g[y][x];
        if (!ch) continue;
        ctx.fillStyle = pal[ch] || "#f0f";
        ctx.fillRect(x, y, 1, 1);
      }
    }
    if (cache.size > 600) cache.clear();
    cache.set(key, cv);
    return cv;
  }

  root.Sprites = {
    build, grid, shade, W, TOP,
    maps: { HEAD, HAIRS, GLASSES, BLUSH, TORSOS, BAG_STRAP, BAG, ARM_DOWN, ARM_TYPE, ARM_UP, ARM_CUP, LEG, LEG_SIT, SKIRT, SKIRT_SIT },
    widths: { HEAD: 16, HAIRS: 16, GLASSES: 16, BLUSH: 16, TORSOS: 16, BAG_STRAP: 16, BAG: 8, ARM_DOWN: 4, ARM_TYPE: 4, ARM_UP: 4,
      ARM_CUP: 4, LEG: 7, LEG_SIT: 16, SKIRT: 16, SKIRT_SIT: 16 },
  };
})(typeof window !== "undefined" ? window : globalThis);
