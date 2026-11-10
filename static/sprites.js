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
  // Mago (gerente): chapéu pontudo (18 colunas, 3 linhas acima da cabeça) e barba longa sobre o peito.
  const WIZ_HAT = ["........oo........", ".......ozzo.......", "......ozzzZo......", ".....ozzzzzZo.....", "....ozzzzzzzZo....",
    "...ozzzzzzzzzZo...", "..onnnnnnnnnnnNo..", "ozzzzzzzzzzzzzzzZo", "oooooooooooooooooo"];
  const BEARD = ["", "", "", "", "", "", "", "", "", "", "", ".ohhhhhhhhhhhho.", ".ohhhhmmmhhhhho.", ".ohhhhhhhhhhhho.", "..ohhhhhhhhhho..",
    "..ohhhhhhhhhHo..", "...ohhhhhhhHo...", "...ohhhhhhhHo...", "....ohhhhhHo....", "....ohhhhhHo....", ".....ohhHHo.....", "......ohHo......",
    ".......oo......."];
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
      z: look.hatColor || look.accent, Z: shade(look.hatColor || look.accent, 0.72),
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

  /* Mascote dos modelos Anthropic: bichinho laranja de pixel, com acessórios sorteados (peruca, chapéu, óculos, café…). */
  const MUG = ["wqw..", "wwwww", "www.w", "wwwww", "www.."];
  function critterGrid(look, pose, frame, back) {
    const sitting = !!SITTING[pose];
    const h = TOP + (sitting ? 34 : 42);
    const g = Array.from({ length: h }, () => new Array(W).fill(null));
    const put = (x, y, w, hh, ch) => {
      for (let r = y; r < y + hh; r++) for (let c = x; c < x + w; c++) if (r >= 0 && r < h && c >= 0 && c < W) g[r][c] = ch;
    };
    const f = frame % 2;
    const dy = pose === "type" ? f : pose === "sleep" ? 1 : 0;
    const feet = h - (sitting ? 14 : 2), legH = sitting ? 2 : 5; // sentado fica mais alto, para aparecer acima da cadeira e da mesa
    const top = feet - legH - 12 + dy, bot = top + 12;
    [4, 8, 14, 18].forEach((x, i) => put(x, bot + 1, 2, feet - bot - (pose === "walk" && (i + f) % 2 === 0 ? 1 : 0), "C"));
    put(3, top, 18, 13, "c");
    put(3, bot, 18, 1, "C");
    put(20, top, 1, 13, "C");
    const head = look.head, wig = head === "long" || head === "bob";
    if (wig) {
      const len = head === "long" ? 10 : 6;
      put(2, top - 2, 20, 3, "h"); put(4, top - 3, 16, 1, "h");
      if (back) put(2, top + 1, 20, len, "h");
      else { put(2, top + 1, 2, len, "h"); put(20, top + 1, 2, len, "H"); put(4, top + 1, 5, 1, "h"); put(13, top + 1, 7, 1, "h"); put(11, top - 2, 1, 3, "H"); }
    } else if (head === "curly") {
      put(2, top - 3, 20, 4, "h"); put(1, top - 1, 22, 3, "h"); put(3, top - 4, 18, 1, "h");
      [3, 8, 13, 18].forEach((x) => put(x, top - 5, 3, 1, "h"));
      [5, 10, 15].forEach((x) => put(x, top - 2, 2, 1, "H"));
      if (back) put(2, top + 1, 20, 4, "h");
    } else if (head === "mohawk") {
      put(10, top - 5, 4, 5, "n"); put(11, top - 6, 2, 1, "n"); put(13, top - 5, 1, 5, "N");
    } else if (head === "cap") {
      put(4, top - 3, 16, 3, "n"); put(5, top - 4, 14, 1, "n"); put(back ? 1 : 3, top - 1, 20, 1, "N");
    } else if (head === "top") {
      put(7, top - 7, 10, 6, "k"); put(7, top - 3, 10, 1, "n"); put(4, top - 1, 16, 1, "k");
    } else if (head === "party") {
      for (let i = 0; i < 6; i++) put(11 - i, top - 6 + i, 2 + 2 * i, 1, i % 2 ? "N" : "n");
      put(11, top - 8, 2, 2, "w");
    } else if (head === "beanie") {
      put(5, top - 4, 14, 1, "n"); put(4, top - 3, 16, 2, "n"); put(3, top - 1, 18, 1, "N"); put(11, top - 6, 2, 2, "w");
    } else if (head === "phones") {
      put(3, top - 2, 18, 1, "k"); put(2, top - 1, 2, 1, "k"); put(20, top - 1, 2, 1, "k");
      put(1, top, 3, 5, "k"); put(20, top, 3, 5, "k"); put(1, top + 1, 1, 3, "n"); put(22, top + 1, 1, 3, "n");
    }
    const phones = head === "phones", armY = top + (phones ? 7 : 5);
    const mug = !back && (pose === "cup" || (look.coffee && pose !== "type" && pose !== "raise" && pose !== "sleep"));
    put(1, armY + (pose === "type" ? f : 0), 2, 3, "c");
    if (pose === "raise") put(21, top - 4, 2, 9, "c");
    else if (mug) put(21, top + 8, 2, 2, "c");
    else put(21, armY + (pose === "type" ? 1 - f : 0), 2, 3, "c");
    if (!back) {
      const eyes = () => {
        if (pose === "sleep") { put(7, top + 5, 2, 1, "e"); put(15, top + 5, 2, 1, "e"); }
        else { put(7, top + 3, 2, 3, "e"); put(15, top + 3, 2, 3, "e"); }
      };
      if (look.glasses === "shades") {
        put(5, top + 3, 6, 3, "k"); put(13, top + 3, 6, 3, "k"); put(3, top + 3, 18, 1, "k"); put(6, top + 4, 1, 1, "w"); put(14, top + 4, 1, 1, "w");
      } else if (look.glasses === "round") {
        put(5, top + 2, 6, 5, "k"); put(13, top + 2, 6, 5, "k"); put(11, top + 4, 2, 1, "k");
        put(6, top + 3, 4, 3, "w"); put(14, top + 3, 4, 3, "w");
        eyes();
      } else eyes();
      if (look.neck === "tie") { put(10, top + 8, 4, 1, "T"); put(11, top + 9, 2, 3, "t"); }
      else if (look.neck === "bow") { put(8, top + 9, 3, 3, "t"); put(13, top + 9, 3, 3, "t"); put(11, top + 10, 2, 1, "T"); }
      else if (look.neck === "scarf") { put(3, top + 9, 18, 2, "t"); put(3, top + 10, 18, 1, "T"); put(15, top + 11, 3, 3, "t"); }
      if (mug) stamp(g, MUG, 18, top + 4);
    } else if (look.neck === "scarf") { put(3, top + 9, 18, 2, "t"); put(3, top + 10, 18, 1, "T"); }
    const src = g.map((row) => row.slice());
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < W; x++) {
        if (src[y][x]) continue;
        if ((y > 0 && src[y - 1][x]) || (y < h - 1 && src[y + 1][x]) || (x > 0 && src[y][x - 1]) || (x < W - 1 && src[y][x + 1])) g[y][x] = "o";
      }
    }
    return g;
  }

  function critterPalette(look) {
    const body = look.body || "#d97757";
    return { o: "#4a2416", c: body, C: shade(body, 0.82), e: "#2b1d14", h: look.hair, H: shade(look.hair, 0.7),
      n: look.shirt, N: shade(look.shirt, 0.72), t: look.accent, T: shade(look.accent, 0.72), w: "#ffffff", q: "#6e4b2a", k: "#222" };
  }

  function grid(look, pose, frame, back) {
    const sitting = !!SITTING[pose];
    const h = TOP + (sitting ? 34 : 42);
    const g = Array.from({ length: h }, () => new Array(W).fill(null));
    const headY = 3, torsoY = 20, armY = 21, legY = 31;
    const dy = pose === "type" ? frame % 2 : pose === "sleep" ? 2 : 0;
    const dress = look.torso === "dress";
    const robe = look.robe ? (ch) => (ch === "s" ? "p" : ch) : null;
    if (sitting) stamp(g, dress ? SKIRT_SIT : LEG_SIT, 4, legY, dress ? robe : null);
    else if (dress) stamp(g, SKIRT, 4, legY, robe);
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
    if (look.beard && !back) stamp(g, BEARD, 4, headY + dy);
    if (look.hat === "wizard") stamp(g, WIZ_HAT, 3, headY + dy - 3);
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
    const critter = look.kind === "critter";
    const g = critter ? critterGrid(look, pose, frame, back) : grid(look, pose, frame, back);
    const pal = critter ? critterPalette(look) : palette(look);
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
    if (critter) cv.headTop = Math.max(0, g.findIndex((row) => row.some(Boolean)));
    if (cache.size > 600) cache.clear();
    cache.set(key, cv);
    return cv;
  }

  root.Sprites = {
    build, grid, critterGrid, shade, W, TOP,
    maps: { WIZ_HAT, BEARD, HEAD, HAIRS, GLASSES, BLUSH, TORSOS, BAG_STRAP, BAG, ARM_DOWN, ARM_TYPE, ARM_UP, ARM_CUP, LEG, LEG_SIT, SKIRT, SKIRT_SIT },
    widths: { WIZ_HAT: 18, BEARD: 16, HEAD: 16, HAIRS: 16, GLASSES: 16, BLUSH: 16, TORSOS: 16, BAG_STRAP: 16, BAG: 8, ARM_DOWN: 4, ARM_TYPE: 4, ARM_UP: 4,
      ARM_CUP: 4, LEG: 7, LEG_SIT: 16, SKIRT: 16, SKIRT_SIT: 16 },
  };
})(typeof window !== "undefined" ? window : globalThis);
