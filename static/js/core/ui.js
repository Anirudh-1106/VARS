// Small DOM toolkit shared by every page.

export function h(tag, attrs, ...children) {
  const el = tag.includes(":") ? document.createElementNS("http://www.w3.org/2000/svg", tag.split(":")[1]) : document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (key === "class") el.setAttribute("class", value);
      else if (key === "style" && typeof value === "object") {
        for (const [prop, v] of Object.entries(value)) {
          if (prop.startsWith("--")) el.style.setProperty(prop, String(v));
          else el.style[prop] = v;
        }
      }
      else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "html") el.innerHTML = value;
      else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function icon(name, cls = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $$(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ── PNR status ────────────────────────────────────────────────────────────
export function pnrText(status) {
  if (!status) return "—";
  return status.code === "CNF" ? "CNF" : `${status.code} ${status.n}`;
}

export function pnrClass(status) {
  return status ? status.code.toLowerCase() : "idle";
}

export function pnrChip(status, label) {
  return h("span", { class: `pnr-chip ${pnrClass(status)}`, title: label || pnrMeaning(status) }, pnrText(status));
}

export function pnrMeaning(status) {
  if (!status) return "Not checked yet";
  if (status.code === "CNF") return "Confirmed: nothing open for this target";
  if (status.code === "RAC") return `${status.n} item${status.n === 1 ? "" : "s"} from confirmed`;
  return `Waitlisted: ${status.n} items to clear`;
}

export function statusFromCount(n) {
  if (n <= 0) return { code: "CNF", n: 0 };
  if (n <= 3) return { code: "RAC", n };
  return { code: "WL", n };
}

// Dot-matrix count animation: steps through intermediate values like a
// chart printer catching up, then settles.
export function tickTo(el, status) {
  const target = pnrText(status);
  if (el.textContent === target) return;
  const from = parseInt((el.textContent.match(/\d+/) || ["0"])[0], 10);
  const to = status.n;
  el.className = el.className.replace(/\b(cnf|rac|wl|idle)\b/g, "").trim() + " " + pnrClass(status);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !Number.isFinite(from) || from === to) {
    el.textContent = target;
    return;
  }
  const steps = [];
  const dir = to > from ? 1 : -1;
  for (let v = from; v !== to; v += dir) steps.push(v);
  steps.push(to);
  let i = 0;
  const run = () => {
    const v = steps[i];
    const s = statusFromCount(v);
    el.textContent = pnrText(s);
    el.className = el.className.replace(/\b(cnf|rac|wl|idle)\b/g, "").trim() + " " + pnrClass(s);
    el.classList.remove("tick");
    void el.offsetWidth;
    el.classList.add("tick");
    i += 1;
    if (i < steps.length) setTimeout(run, 110);
  };
  run();
}

// ── ticker (loading) ─────────────────────────────────────────────────────
export function ticker(text) {
  return h("span", { class: "ticker", role: "status" }, text, h("span", { class: "dots", "aria-hidden": "true" }, h("b"), h("b"), h("b"), h("b")));
}

export function tickerBlock(text, sub) {
  return h("div", { class: "ticker-block" }, ticker(text), sub ? h("p", null, sub) : null);
}

// ── toasts ────────────────────────────────────────────────────────────────
export function toast(message, kind = "info", opts = {}) {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const chip = kind === "ok" ? { code: "CNF", n: 0 } : kind === "error" ? { code: "WL", n: 0 } : kind === "warn" ? { code: "RAC", n: 0 } : null;
  const label = kind === "ok" ? "DONE" : kind === "error" ? "ERR" : kind === "warn" ? "NOTE" : "INFO";
  const close = h("button", { type: "button", "aria-label": "Dismiss" }, icon("x"));
  const el = h("div", { class: "toast" }, h("span", { class: `pnr-chip ${chip ? pnrClass(chip) : "idle"}` }, label), h("div", null, message), close);
  const remove = () => el.remove();
  close.addEventListener("click", remove);
  wrap.append(el);
  setTimeout(remove, opts.ms || (kind === "error" ? 7000 : 4200));
}

// ── misc ──────────────────────────────────────────────────────────────────
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = h("textarea", { style: { position: "fixed", opacity: "0" } }, text);
  document.body.append(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
  return Promise.resolve();
}

export function downloadFile(name, content, type = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Minimal, safe markdown for chat answers: paragraphs, lists (with
// continuation lines), **bold**, *italic* and `code`. Never uses innerHTML.
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const inline = (line) => {
    const out = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
    let last = 0;
    let m;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) out.push(h("strong", null, tok.slice(2, -2)));
      else if (tok.startsWith("`")) out.push(h("code", { class: "mono" }, tok.slice(1, -1)));
      else out.push(h("em", null, tok.slice(1, -1)));
      last = m.index + tok.length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  };
  const bullet = /^\s*([-*•]|\d+[.)])\s+/;
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let list = null;
  let lastLi = null;
  let para = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      list = null;
      lastLi = null;
      para = null;
      continue;
    }
    if (bullet.test(line)) {
      if (!list) {
        list = h(/^\s*\d/.test(line) ? "ol" : "ul");
        frag.append(list);
      }
      lastLi = h("li", null, inline(line.replace(bullet, "")));
      list.append(lastLi);
      para = null;
    } else if (/^#{1,4}\s/.test(line)) {
      frag.append(h("p", null, h("strong", null, line.replace(/^#+\s*/, ""))));
      list = null;
      lastLi = null;
      para = null;
    } else if (lastLi) {
      lastLi.append(h("br"), ...inline(line.trim()));
    } else {
      if (!para) {
        para = h("p");
        frag.append(para);
      } else {
        para.append(h("br"));
      }
      para.append(...inline(line));
    }
  }
  return frag;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function confirmDialog({ title, body, confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const ok = h("button", { class: `btn ${danger ? "danger" : ""}`, type: "button" }, confirm);
    const cancel = h("button", { class: "btn secondary", type: "button" }, "Cancel");
    const dlg = h("dialog", { class: "dlg", "aria-labelledby": "dlg-title" },
      h("div", { class: "dlg-head" }, h("h2", { id: "dlg-title" }, title)),
      h("div", { class: "dlg-body" }, h("p", null, body)),
      h("div", { class: "dlg-foot" }, cancel, ok));
    document.body.append(dlg);
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    ok.addEventListener("click", () => done(true));
    cancel.addEventListener("click", () => done(false));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(false); });
    dlg.showModal();
    cancel.focus();
  });
}
