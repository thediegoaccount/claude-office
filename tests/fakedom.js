// DOM falso mínimo para rodar static/*.js no Node (getElementById, querySelector*, canvas via Proxy).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const STATIC = path.join(__dirname, "..", "static");

function ctx2d() {
  const store = { canvas: null };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "measureText") return (s) => ({ width: String(s).length * 6 });
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => ({ addColorStop() {} });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function element(tag = "div", id = "") {
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(), id, children: [], style: {}, dataset: {}, attributes: {},
    textContent: "", innerHTML: "", value: "", checked: false, disabled: false, hidden: false, title: "",
    width: 300, height: 150, clientWidth: 1280, clientHeight: 720, offsetWidth: 1280, offsetHeight: 720,
    classList: {
      set: new Set(),
      add(...c) { c.forEach((x) => this.set.add(x)); }, remove(...c) { c.forEach((x) => this.set.delete(x)); },
      toggle(c, on) { const v = on === undefined ? !this.set.has(c) : on; v ? this.set.add(c) : this.set.delete(c); return v; },
      contains(c) { return this.set.has(c); },
    },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener() {},
    dispatch(ev, data = {}) { (listeners[ev] || []).forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, target: el, ...data })); },
    appendChild(c) { el.children.push(c); return c; }, removeChild() {}, remove() {}, append(...c) { el.children.push(...c); },
    insertBefore(c) { el.children.push(c); return c; }, replaceChildren() { el.children = []; },
    setAttribute(k, v) { el.attributes[k] = v; }, getAttribute(k) { return el.attributes[k]; }, removeAttribute(k) { delete el.attributes[k]; },
    querySelector() { return element(); }, querySelectorAll() { return []; }, closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }; },
    focus() {}, blur() {}, click() { el.dispatch("click"); }, showModal() { el.open = true; }, close() { el.open = false; },
    scrollIntoView() {}, select() {},
  };
  if (el.tagName === "CANVAS") {
    const c = ctx2d();
    c.canvas = el;
    el.getContext = () => c;
    el.toDataURL = () => "data:image/png;base64,";
  }
  return el;
}

function load(files = ["sprites.js", "office.js"], opts = {}) {
  const byId = {};
  const document = {
    getElementById(id) { return byId[id] || (byId[id] = element(id === "stage" || id.endsWith("canvas") ? "canvas" : "div", id)); },
    createElement: (t) => element(t), querySelector: (s) => document.getElementById(s.replace(/^[#.]/, "")), querySelectorAll: () => [],
    addEventListener() {}, body: element("body"), documentElement: element("html"), hidden: false, visibilityState: "visible", title: "",
  };
  const storage = {};
  const win = {
    document, console, Math, Date, JSON, Promise, Map, Set, Array, Object, Number, String, Boolean, Symbol, Error, RegExp,
    Uint8ClampedArray, parseInt, parseFloat, isFinite, isNaN, encodeURIComponent, decodeURIComponent,
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: (k) => { delete storage[k]; } },
    addEventListener() {}, removeEventListener() {}, setTimeout: (fn) => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    performance: { now: () => Date.now() }, navigator: { clipboard: {} }, location: { origin: "http://127.0.0.1:8777" },
    __OFFICE_TEST__: true, ...opts,
  };
  win.window = win;
  win.globalThis = win;
  vm.createContext(win);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(STATIC, f), "utf8"), win, { filename: f });
  return win;
}

module.exports = { load, element };
