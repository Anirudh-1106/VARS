import { api } from "../core/api.js";
import { store } from "../core/store.js";
import {
  $, $$, clear, copyText, downloadFile, h, icon, mount, pnrChip, pnrClass, pnrMeaning, pnrText,
  renderMarkdown, tickTo, tickerBlock, toast,
} from "../core/ui.js";
import * as R from "../core/resume-model.js";
import { SAMPLE_JD, SAMPLE_RESUME } from "../core/samples.js";

const panel = $("#panel");
const tabsEl = $("#tabs");
const metaEl = $("#docMeta");
const actionsEl = $("#headActions");

let catalog = [];
let tab = new URLSearchParams(location.search).get("tab") || "analysis";
let filter = "open";
let expanded = null;
let selectedRole = null;
let chatBusy = false;

const resumeState = () => store.get("resume");
const save = (rs) => store.set("resume", { ...rs });

// ── boot ────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const data = await api.get("/api/roles");
    catalog = data.roles;
  } catch (err) {
    toast(err.message, "error");
  }
  $$("[data-tab]", tabsEl).forEach((btn) => btn.addEventListener("click", () => setTab(btn.dataset.tab)));
  tabsEl.addEventListener("keydown", (e) => {
    if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const list = $$("[data-tab]", tabsEl);
    const i = list.findIndex((b) => b.dataset.tab === tab);
    const next = list[(i + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
    setTab(next.dataset.tab);
    next.focus();
  });
  render();
}

function setTab(next) {
  tab = next;
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  history.replaceState(null, "", url);
  render();
}

function render() {
  const rs = resumeState();
  if (!rs || !rs.analysis) {
    tabsEl.hidden = true;
    clear(metaEl);
    clear(actionsEl);
    renderIntake();
    return;
  }
  tabsEl.hidden = false;
  $$("[data-tab]", tabsEl).forEach((b) => {
    b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    b.tabIndex = b.dataset.tab === tab ? 0 : -1;
  });
  panel.setAttribute("aria-labelledby", `tab-${tab}`);
  $("#countOpen").textContent = String(R.openFindings(rs).length);
  renderHead(rs);
  if (tab === "roles") renderRoles(rs);
  else if (tab === "jd") renderJD(rs);
  else if (tab === "ask") renderAsk(rs);
  else renderAnalysis(rs);
}

// ── intake ──────────────────────────────────────────────────────────────
function roleSelect(value, onChange, opts = {}) {
  const sel = h("select", { class: "select", id: opts.id || null, "aria-label": opts.label || "Target role" });
  if (opts.suggest) sel.append(h("option", { value: "" }, "Let VARS suggest one"));
  const families = [...new Set(catalog.map((r) => r.family))];
  for (const fam of families) {
    const group = h("optgroup", { label: fam });
    catalog.filter((r) => r.family === fam).forEach((r) => group.append(h("option", { value: r.id, selected: r.id === value }, r.title)));
    sel.append(group);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function renderIntake(error) {
  let chosenRole = new URLSearchParams(location.search).get("role") || "";
  const fileInput = h("input", { type: "file", accept: ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain", class: "sr", id: "file" });
  const pasteArea = h("textarea", { class: "textarea", placeholder: "Paste the full text of your resume here", rows: 10, "aria-label": "Resume text" });
  const pasteWrap = h("div", { class: "stack", style: { width: "100%" }, hidden: true },
    pasteArea,
    h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => {
      const text = pasteArea.value.trim();
      if (text.length < 80) return toast("That is too short to be a resume. Paste the whole text.", "warn");
      analyze({ text, source: "paste" }, chosenRole);
    } }, icon("check"), "Score this text")));

  const drop = h("div", { class: "drop" },
    h("h2", null, "Drop your resume here"),
    h("p", { class: "formats" }, "PDF · DOCX · TXT, up to 12 MB"),
    h("div", { class: "row" },
      h("label", { class: "btn lg", for: "file" }, icon("upload"), "Choose a file"),
      h("button", { class: "linkish", type: "button", onclick: () => { pasteWrap.hidden = !pasteWrap.hidden; if (!pasteWrap.hidden) pasteArea.focus(); } }, "or paste the text")),
    fileInput,
    pasteWrap,
    h("label", { class: "field", style: { width: "min(360px, 100%)" } }, h("span", null, "Score it for"), roleSelect(chosenRole, (v) => (chosenRole = v), { suggest: true, label: "Score it for" })),
    h("p", { class: "privacy-line" }, icon("shield"), "Your file is read in memory, scored, and discarded. Nothing is saved on the server; the results live only in this tab."));

  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) analyze({ file, source: "upload" }, chosenRole);
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) analyze({ file, source: "upload" }, chosenRole);
  });

  const side = h("div", { class: "intake-side" },
    h("div", { class: "opt" }, h("h3", null, "No resume yet?"), h("p", null, "Speak about your studies, projects and internships in English or Malayalam. VARS turns it into a clean resume."), h("a", { href: "/build", class: "btn secondary", style: { justifySelf: "start" } }, icon("mic"), "Build one by voice")),
    h("div", { class: "opt" }, h("h3", null, "See it work first"), h("p", null, "Score a sample resume of a fictional final-year student, Aditya Menon, for a backend role."), h("button", { class: "btn secondary", type: "button", style: { justifySelf: "start" }, onclick: () => analyze({ text: SAMPLE_RESUME, source: "sample", fileName: "sample: aditya_menon (fictional)" }, chosenRole || "backend") }, icon("play"), "Try the sample resume")),
    h("div", { class: "opt" }, h("h3", null, "What you get"), h("p", null, "A score that cites the line behind every point, rewrites you can apply in one click, your fit for 16 campus roles, and a readiness status that clears as you fix things.")));

  mount(panel, error ? h("div", { class: "note err", style: { marginBottom: "18px", maxWidth: "1180px" } }, icon("warn"), error) : null, h("div", { class: "intake" }, drop, side));
}

const STEPS = [
  ["READING RESUME", "Extracting text and layout in memory."],
  ["CHECKING LINES", "Testing every bullet for verbs, numbers and filler."],
  ["MATCHING ROLES", "Comparing your skills with 16 campus roles."],
  ["WRITING FIXES", "Drafting rewrites that keep your facts."],
];

async function analyze(input, role) {
  let step = 0;
  const show = () => mount(panel, tickerBlock(STEPS[step][0], STEPS[step][1]));
  show();
  const timer = setInterval(() => { step = Math.min(step + 1, STEPS.length - 1); show(); }, 2400);
  try {
    let analysis;
    if (input.file) {
      const form = new FormData();
      form.append("file", input.file);
      if (role) form.append("target_role", role);
      analysis = await api.upload("/api/resume/analyze", form);
    } else {
      analysis = await api.post("/api/resume/analyze", { text: input.text, target_role: role || null, file_name: input.fileName || null });
    }
    const rs = R.newResumeState(analysis, { source: input.source, fileName: input.file?.name || input.fileName || null });
    store.set("resume", rs);
    store.set("chat", []);
    store.set("jd", null);
    tab = "analysis";
    filter = "open";
    expanded = null;
    if (analysis.warnings?.length) analysis.warnings.forEach((w) => toast(w, "warn", { ms: 9000 }));
    render();
    window.scrollTo({ top: 0 });
  } catch (err) {
    renderIntake(err.message);
  } finally {
    clearInterval(timer);
  }
}

// ── head ────────────────────────────────────────────────────────────────
function renderHead(rs) {
  const a = rs.analysis;
  const words = a.stats?.words ?? 0;
  metaEl.textContent = `${rs.fileName || "Pasted text"} · ${a.layout?.pages || 1} page${(a.layout?.pages || 1) > 1 ? "s" : ""} · ${words} words`;
  const sel = roleSelect(rs.targetRole, (value) => {
    const cur = resumeState();
    cur.targetRole = value;
    save(cur);
    render();
  }, { label: "Target role" });
  sel.style.width = "auto";
  sel.style.maxWidth = "320px";
  mount(actionsEl,
    h("label", { class: "row", style: { gap: "8px" } }, h("span", { class: "small muted" }, "Target"), sel),
    h("button", { class: "btn secondary", type: "button", onclick: newResume }, icon("upload"), "New resume"),
    h("a", { class: "btn", href: `/interview?role=${encodeURIComponent(rs.targetRole)}` }, icon("person"), "Start mock interview"));
}

async function newResume() {
  store.set("resume", null);
  store.set("chat", []);
  store.set("jd", null);
  render();
}

// ── analysis ────────────────────────────────────────────────────────────
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function findingLabel(rs, f, counters) {
  if (rs.fixed?.[f.id]) return { text: rs.fixed[f.id].how === "dismissed" ? "N/A" : "CNF", cls: rs.fixed[f.id].how === "dismissed" ? "muted" : "s-cnf" };
  if (f.severity === "high") return { text: `WL ${(counters.wl += 1)}`, cls: "s-wl" };
  if (f.severity === "medium") return { text: `RAC ${(counters.rac += 1)}`, cls: "s-rac" };
  return { text: "OPT", cls: "muted" };
}

function pinClass(rs, f) {
  if (rs.fixed?.[f.id]) return "cnf";
  return f.severity === "high" ? "wl" : f.severity === "medium" ? "rac" : "opt";
}

function renderDoc(rs) {
  const a = rs.analysis;
  const byLine = new Map();
  for (const f of a.findings) {
    if (f.line === null || f.line === undefined) continue;
    if (!byLine.has(f.line)) byLine.set(f.line, []);
    byLine.get(f.line).push(f);
  }
  const headings = new Set(a.sections.map((s) => s.line));
  const firstText = a.lines.findIndex((l) => l && l.trim());
  const sheet = h("div", { class: "resume-sheet sheet", id: "resumeSheet" });
  rs.lines.forEach((line, idx) => {
    const original = a.lines[idx];
    if (original === "" && (line === "" || line === null)) {
      sheet.append(h("div", { class: "rl blank" }));
      return;
    }
    const deleted = line === null;
    const text = deleted ? original : line;
    const findings = byLine.get(idx) || [];
    const cls = ["rl"];
    if (idx === firstText) cls.push("name");
    else if (idx === firstText + 1 && /@|\+?\d{5}/.test(text || "")) cls.push("contact");
    else if (headings.has(idx)) cls.push("head");
    else if ((text || "").startsWith("• ")) cls.push("bullet");
    if (deleted) cls.push("deleted");
    else if (line !== original) cls.push("changed");
    if (findings.length) cls.push("has-pin");

    const body = (text || "").replace(/^• /, "");
    const tx = h("span", { class: "tx" });
    const openOnLine = findings.filter((f) => !rs.fixed?.[f.id] && f.quote && body.includes(f.quote));
    if (openOnLine.length && !deleted) {
      const f = openOnLine[0];
      const at = body.indexOf(f.quote);
      tx.append(body.slice(0, at), h("mark", { class: `mark-${pinClass(rs, f) === "opt" ? "opt" : pinClass(rs, f)}`, style: { color: "inherit" } }, f.quote), body.slice(at + f.quote.length));
    } else {
      tx.append(body);
    }
    const pins = findings.map((f) => h("button", {
      class: `pin ${pinClass(rs, f)}`, type: "button", title: `${f.id}: ${f.title}`, "aria-label": `Finding ${f.id}: ${f.title}`,
      onclick: () => openFinding(f.id),
    }, f.id));
    sheet.append(h("div", { class: cls.join(" "), "data-line": idx }, h("div", { class: "t" }, tx), h("div", { class: "m" }, pins)));
  });
  return sheet;
}

function renderAnalysis(rs) {
  const a = rs.analysis;
  const status = R.readinessFor(rs);
  const initial = rs.initial?.[rs.targetRole] || status;
  const fit = R.roleFit(rs);
  const projected = R.projectedScore(rs);
  const prevText = panel.querySelector("[data-status-code]")?.textContent;

  const statusCode = h("span", { class: `pnr ${pnrClass(status)}`, "data-status-code": "" }, prevText || pnrText(status));
  const trail = [pnrText(initial)];
  if (pnrText(initial) !== pnrText(status)) trail.push(pnrText(status));
  if (status.code !== "CNF") trail.push("CNF");
  const statusBlock = h("div", { class: "status-block" },
    h("div", { class: "code" }, statusCode),
    h("div", { class: "what" },
      h("b", null, `${fit?.title || "Your target"}: `, status.code === "CNF" ? "confirmed" : status.n === 1 ? "one item from confirmed" : `${status.n} items from confirmed`),
      h("span", null, status.code === "CNF" ? "Every high and medium finding is cleared and you cover the role's core skills." : `${plural(R.openFindings(rs).filter((f) => f.severity !== "low").length, "open finding", "open findings")} and ${plural(fit ? fit.missing.filter((m) => m.weight >= 2).length : 0, "missing core skill", "missing core skills")}. Each one you clear moves you up.`),
      h("div", { class: "trail", "aria-label": "Status history" }, trail.map((t, i) => [i ? " → " : "", i === trail.length - 1 && t === "CNF" ? h("b", { class: "s-cnf" }, t) : t]))));

  const strip = h("div", { class: "strip", style: { "--n": 6 } },
    h("div", { class: "inv" }, h("span", null, projected !== a.scores.overall ? `Overall (was ${a.scores.overall})` : "Overall"), h("b", null, projected)),
    R.SCORE_LABELS.map(([key, label]) => h("div", { class: a.scores[key] < 55 ? "low" : "" }, h("span", null, label), h("b", null, a.scores[key]))));

  const impression = a.first_impression?.length
    ? h("div", { class: "stack", style: { "--gap": "10px" } },
      h("p", { class: "verdict" }, a.verdict),
      h("div", { class: "impression", "aria-label": "What a recruiter notices in six seconds" }, a.first_impression.map((t, i) => h("div", null, h("b", null, `SCAN ${i + 1}`), t))))
    : a.verdict ? h("p", { class: "verdict" }, a.verdict) : null;

  const counts = { open: R.openFindings(rs).length, fixed: a.findings.length - R.openFindings(rs).length, all: a.findings.length };
  const filterSeg = h("div", { class: "seg", role: "group", "aria-label": "Filter findings" },
    [["open", `Open ${counts.open}`], ["fixed", `Cleared ${counts.fixed}`], ["all", `All ${counts.all}`]].map(([key, label]) =>
      h("button", { type: "button", "aria-pressed": String(filter === key), onclick: () => { filter = key; render(); } }, label)));

  const counters = { wl: 0, rac: 0 };
  const labels = new Map(a.findings.map((f) => [f.id, findingLabel(rs, f, counters)]));
  const rows = a.findings.filter((f) => filter === "all" || (filter === "open" ? !rs.fixed?.[f.id] : rs.fixed?.[f.id]));
  const tbody = h("tbody");
  for (const f of rows) {
    const label = labels.get(f.id);
    const isOpen = expanded === f.id;
    const tr = h("tr", {
      class: `find-row clickable ${rs.fixed?.[f.id] ? "is-fixed" : ""} ${isOpen ? "is-current" : ""}`,
      "data-id": f.id, tabindex: 0, "aria-expanded": String(isOpen),
      onclick: () => toggleFinding(f.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFinding(f.id); } },
    },
    h("td", { class: "id" }, f.id),
    h("td", { class: "q" },
      h("span", { class: "ttl" }, f.title, h("span", { class: "cat" }, R.CATEGORY_LABEL[f.category] || f.category)),
      f.quote ? h("span", { class: "sub" }, h("q", null, f.quote.length > 110 ? f.quote.slice(0, 108) + "…" : f.quote)) : h("span", { class: "sub" }, f.detail),
      f.rewrite && !rs.fixed?.[f.id] ? h("span", { class: "sub try" }, h("strong", null, "Try: "), f.rewrite) : null),
    h("td", { class: `st ${label.cls}` }, label.text));
    tbody.append(tr);
    if (isOpen) tbody.append(h("tr", { class: "find-detail" }, h("td", { colspan: 3 }, fixBox(rs, f))));
  }
  const table = rows.length
    ? h("div", { class: "chart-wrap" }, h("table", { class: "chart" }, h("thead", null, h("tr", null, h("th", null, "Line"), h("th", null, "What the recruiter sees"), h("th", { style: { textAlign: "right" } }, "Status"))), tbody))
    : h("div", { class: "empty" }, h("h3", null, filter === "open" ? "Nothing open." : "Nothing here yet."), h("p", null, filter === "open" ? "Every finding is cleared. Re-check the resume to confirm the new score." : "Fixes you apply will be listed here."));

  const openLines = new Set(R.openFindings(rs).filter((f) => f.line !== null && f.line !== undefined).map((f) => f.line));
  const keep = (a.strengths || []).filter((s) => !openLines.has(s.line));
  const strengths = keep.length
    ? h("div", { class: "stack", style: { "--gap": "8px" } },
      h("div", { class: "rule-title" }, "Keep these lines"),
      keep.map((s) => h("div", { class: "row small", style: { alignItems: "flex-start", gap: "10px" } }, h("span", { class: "pnr-chip cnf" }, "CNF"), h("div", null, h("q", null, s.quote), h("span", { class: "muted" }, " — ", s.why)))))
    : null;

  const foot = h("div", { class: "row" },
    h("button", { class: "btn", type: "button", onclick: recheck, disabled: !Object.keys(rs.fixed || {}).length }, icon("refresh"), "Re-check with my fixes"),
    h("button", { class: "btn secondary", type: "button", onclick: () => copyText(R.workingText(rs)).then(() => toast("Improved resume text copied.", "ok")) }, icon("copy"), "Copy text"),
    h("button", { class: "btn ghost", type: "button", onclick: () => downloadFile(`${(rs.analysis.structured?.name || "resume").replace(/\s+/g, "_")}_improved.txt`, R.workingText(rs), "text/plain") }, icon("download"), "Download .txt"),
    h("a", { class: "btn ghost", href: "/build?from=studio" }, icon("print"), "Make a clean PDF"));

  const side = h("div", { class: "studio-side" }, statusBlock, strip, impression,
    h("div", null, h("div", { class: "find-bar" }, h("h2", null, "Findings, worst first"), filterSeg), table),
    strengths, foot);
  const grid = h("div", { class: "studio-grid" },
    h("div", { class: "doc-col" }, renderDoc(rs), h("p", { class: "sheet-foot" }, icon("info"), "This is the text an applicant tracking system reads from your file. Pins mark each finding.")),
    side);
  mount(panel, grid);
  if (prevText && prevText !== pnrText(status)) tickTo(statusCode, status);
}

function toggleFinding(id) {
  expanded = expanded === id ? null : id;
  render();
  if (expanded) focusLine(id);
}

function openFinding(id) {
  const rs = resumeState();
  if (rs.fixed?.[id] && filter === "open") filter = "all";
  expanded = id;
  render();
  $(`tr[data-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  focusLine(id);
}

function focusLine(id) {
  const rs = resumeState();
  const f = rs.analysis.findings.find((x) => x.id === id);
  $$(".rl.focus").forEach((el) => el.classList.remove("focus"));
  if (!f || f.line === null || f.line === undefined) return;
  const el = $(`.rl[data-line="${f.line}"]`);
  if (el) {
    el.classList.add("focus");
    const col = $(".doc-col");
    if (col && col.scrollHeight > col.clientHeight) col.scrollTo({ top: el.offsetTop - col.clientHeight / 3, behavior: "smooth" });
  }
}

function highlightPlaceholders(text) {
  const parts = text.split(/(\[[^\]]{1,30}\])/g);
  return parts.map((p) => (/^\[[^\]]+\]$/.test(p) ? h("span", { class: "ph" }, p) : p));
}

function commitFix(f, how, mutate, detail) {
  const rs = resumeState();
  mutate?.(rs);
  R.markFixed(rs, f, how, detail);
  expanded = null;
  save(rs);
  render();
  const row = $(`tr[data-id="${f.id}"]`);
  if (row) row.classList.add("flash");
  toast(how === "dismissed" ? `${f.id} set aside. It no longer counts against you.` : `${f.id} cleared.`, "ok");
}

function fixBox(rs, f) {
  const box = h("div", { class: "fix-box" });
  if (f.detail) box.append(h("p", { class: "why" }, f.detail, f.fix ? h("span", null, " ", h("strong", null, f.fix)) : null));
  const fixedInfo = rs.fixed?.[f.id];
  if (fixedInfo) {
    box.append(h("div", { class: "fix-actions" },
      h("span", { class: "small muted" }, fixedInfo.how === "dismissed" ? "Set aside as not applicable." : "Cleared in your working copy."),
      h("button", { class: "btn sm secondary", type: "button", onclick: (e) => { e.stopPropagation(); undoFix(f); } }, "Undo")));
    return box;
  }

  const hasLine = f.line !== null && f.line !== undefined && rs.lines[f.line] !== null;
  const actions = h("div", { class: "fix-actions" });

  if (hasLine) {
    if (f.rewrite) box.append(rewriteOption(f, f.rewrite, "Suggested rewrite"));
    const more = h("div", { class: "rewrite" });
    box.append(more);
    actions.append(h("button", { class: "btn sm secondary", type: "button", onclick: async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      mount(more, tickerBlock("DRAFTING OPTIONS"));
      try {
        const fit = R.roleFit(rs);
        const res = await api.post("/api/resume/rewrite", { line: rs.lines[f.line].replace(/^• /, ""), role_title: fit?.title || "", context: R.sectionTitle(f.section) });
        mount(more, h("span", { class: "lbl" }, "Three more ways to say it"), res.options.map((o) => rewriteOption({ ...f, quote: "" }, o.text, o.style, true)));
      } catch (err) {
        mount(more, h("div", { class: "note err" }, icon("warn"), err.message));
      } finally {
        btn.disabled = false;
      }
    } }, icon("refresh"), "More options"));
    actions.append(h("button", { class: "btn sm secondary", type: "button", onclick: (e) => { e.stopPropagation(); editLine(box, f); } }, icon("edit"), "Edit the line myself"));
    if (["personal", "declaration", "hobbies"].includes(f.section) || f.category === "practice" && /personal|declaration/i.test(f.title)) {
      actions.prepend(h("button", { class: "btn sm", type: "button", onclick: (e) => { e.stopPropagation(); commitFix(f, "deleted", (s) => R.deleteLine(s, f.line)); } }, icon("trash"), "Delete this line"));
    }
  } else {
    const contact = /email|phone|linkedin|github/i.exec(f.title);
    if (contact) {
      const kind = contact[0].toLowerCase();
      const input = h("input", { class: "input", placeholder: { email: "name@example.com", phone: "+91 98765 43210", linkedin: "linkedin.com/in/your-name", github: "github.com/your-username" }[kind], "aria-label": `Your ${kind}`, onclick: (e) => e.stopPropagation() });
      box.append(h("div", { class: "row", style: { maxWidth: "520px" } }, h("div", { class: "grow" }, input),
        h("button", { class: "btn sm", type: "button", onclick: (e) => {
          e.stopPropagation();
          const value = input.value.trim();
          if (!value) return input.focus();
          commitFix(f, "added", (s) => addContact(s, value), value);
        } }, "Add to resume")));
    } else {
      actions.append(h("button", { class: "btn sm", type: "button", onclick: (e) => { e.stopPropagation(); commitFix(f, "done"); } }, icon("check"), "I've fixed this in my file"));
    }
  }
  actions.append(h("button", { class: "btn sm ghost", type: "button", onclick: (e) => { e.stopPropagation(); commitFix(f, "dismissed"); } }, "Not applicable to me"));
  box.append(actions);
  return box;
}

function rewriteOption(f, text, label, isAlt = false) {
  const holes = R.placeholders(text);
  const inputs = holes.map((ph) => h("label", { class: "field" }, h("span", { class: "tiny" }, `Your figure for ${ph}`), h("input", { class: "input", "data-ph": ph, placeholder: "Your real figure", onclick: (e) => e.stopPropagation() })));
  const use = h("button", { class: "btn sm", type: "button", onclick: (e) => {
    e.stopPropagation();
    let final = text;
    for (const input of inputs.map((l) => l.querySelector("input"))) {
      if (!input.value.trim()) {
        input.focus();
        return toast("Fill in the bracketed figure with a real number, or edit the line yourself.", "warn");
      }
      final = final.split(input.dataset.ph).join(input.value.trim());
    }
    commitFix(f, "rewrite", (s) => R.applyRewrite(s, isAlt ? { ...f, quote: "" } : f, final), final);
  } }, icon("check"), "Use this");
  return h("div", { class: "rewrite" },
    h("div", { class: "opt" }, h("div", null, h("small", null, label), highlightPlaceholders(text)), use),
    holes.length ? h("div", { class: "fill-grid" }, inputs) : null,
    holes.length ? h("p", { class: "tiny muted" }, "VARS never makes up numbers. Fill these with figures you can defend in an interview.") : null);
}

function editLine(box, f) {
  const rs = resumeState();
  const current = rs.lines[f.line] || "";
  const ta = h("textarea", { class: "textarea", rows: 3, onclick: (e) => e.stopPropagation() }, current.replace(/^• /, ""));
  const wrap = h("div", { class: "stack", style: { "--gap": "8px" } }, ta,
    h("div", { class: "row" },
      h("button", { class: "btn sm", type: "button", onclick: (e) => {
        e.stopPropagation();
        const value = ta.value.trim();
        if (!value) return;
        commitFix(f, "edited", (s) => { s.lines[f.line] = (current.startsWith("• ") ? "• " : "") + value; }, value);
      } }, "Save line"),
      h("button", { class: "btn sm ghost", type: "button", onclick: (e) => { e.stopPropagation(); wrap.remove(); } }, "Cancel")));
  box.append(wrap);
  ta.focus();
}

function addContact(rs, value) {
  const first = rs.lines.findIndex((l) => l && l.trim());
  const contactIdx = first + 1;
  if (rs.lines[contactIdx] && /@|\d{5}|linkedin|github/i.test(rs.lines[contactIdx])) {
    rs.lines[contactIdx] = `${rs.lines[contactIdx]} | ${value}`;
  } else {
    rs.lines.splice(contactIdx, 0, value);
    rs.analysis.lines.splice(contactIdx, 0, value);
    for (const f of rs.analysis.findings) if (f.line !== null && f.line >= contactIdx) f.line += 1;
    for (const s of rs.analysis.sections) if (s.line >= contactIdx) s.line += 1;
    for (const s of rs.analysis.strengths || []) if (s.line >= contactIdx) s.line += 1;
  }
}

function undoFix(f) {
  const rs = resumeState();
  const how = rs.fixed[f.id]?.how;
  if (["rewrite", "edited", "deleted"].includes(how) && f.line !== null) rs.lines[f.line] = rs.analysis.lines[f.line];
  R.unmark(rs, f);
  save(rs);
  render();
}

async function recheck() {
  const rs = resumeState();
  const text = R.workingText(rs);
  const keepInitial = rs.initial;
  mount(panel, tickerBlock("RE-CHECKING", "Scoring your working copy with the same rules, so the new number is comparable."));
  try {
    const analysis = await api.post("/api/resume/analyze", { text, target_role: rs.targetRole, file_name: rs.fileName, layout: rs.analysis.layout, links: rs.analysis.links || [] });
    const next = R.newResumeState(analysis, { source: rs.source, fileName: rs.fileName });
    next.initial = { ...next.initial, ...keepInitial };
    next.addedSkills = rs.addedSkills;
    next.previousScore = rs.analysis.scores.overall;
    store.set("resume", next);
    filter = "open";
    expanded = null;
    render();
    toast(`Re-checked: ${rs.analysis.scores.overall} → ${analysis.scores.overall}.`, analysis.scores.overall >= rs.analysis.scores.overall ? "ok" : "warn");
  } catch (err) {
    toast(err.message, "error");
    render();
  }
}

// ── role fit ────────────────────────────────────────────────────────────
function jobLinks(title) {
  const q = encodeURIComponent(title.replace(/\(.*?\)/g, "").trim());
  return [
    ["LinkedIn (entry level, India)", `https://www.linkedin.com/jobs/search/?keywords=${q}&location=India&f_E=1%2C2`],
    ["Naukri (fresher)", `https://www.naukri.com/${title.replace(/\(.*?\)/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-jobs?experience=0`],
    ["Indeed India", `https://in.indeed.com/jobs?q=${q}+fresher`],
  ];
}

function renderRoles(rs) {
  selectedRole = selectedRole || rs.targetRole;
  const fits = rs.analysis.roles.map((r) => ({ ...R.roleFit(rs, r.id), status: R.readinessFor(rs, r.id) })).sort((a, b) => b.fit - a.fit);
  const tbody = h("tbody");
  for (const r of fits) {
    tbody.append(h("tr", {
      class: `clickable ${r.id === selectedRole ? "is-current" : ""}`, tabindex: 0,
      onclick: () => { selectedRole = r.id; render(); },
      onkeydown: (e) => { if (e.key === "Enter") { selectedRole = r.id; render(); } },
    },
    h("td", null, h("strong", null, r.title), r.id === rs.targetRole ? h("span", { class: "sub" }, "Your target") : h("span", { class: "sub" }, r.family)),
    h("td", { class: "num" }, `${r.fit}%`),
    h("td", { class: "small" }, r.missing.length ? r.missing.slice(0, 3).map((m) => m.skill).join(", ") + (r.missing.length > 3 ? ` +${r.missing.length - 3}` : "") : h("span", { class: "s-cnf" }, "All core skills")),
    h("td", { class: `st s-${pnrClass(r.status)}` }, pnrText(r.status))));
  }
  const left = h("div", { class: "stack" },
    h("p", { class: "lede" }, "Fit is the weighted share of each role's core skills found anywhere in your resume. Status adds your open findings, so it is the same everywhere in VARS."),
    h("div", { class: "chart-wrap" }, h("table", { class: "chart" }, h("thead", null, h("tr", null, h("th", null, "Role"), h("th", { style: { textAlign: "right" } }, "Fit"), h("th", null, "Missing"), h("th", { style: { textAlign: "right" } }, "Status"))), tbody)),
    h("p", { class: "tiny muted" }, "Role guidance is curated for campus hiring. It is not live market data."));

  const role = catalog.find((r) => r.id === selectedRole);
  const fit = R.roleFit(rs, selectedRole);
  const status = R.readinessFor(rs, selectedRole);
  const added = new Set(rs.addedSkills.map((s) => s.toLowerCase()));
  const detail = role && fit ? h("div", { class: "role-detail" },
    h("div", { class: "status-block", style: { gridTemplateColumns: "auto minmax(0,1fr)" } },
      h("div", { class: "code" }, h("span", { class: `pnr ${pnrClass(status)}` }, pnrText(status))),
      h("div", { class: "what" }, h("b", null, `${role.title} · fit ${fit.fit}%`), h("span", null, role.summary))),
    h("div", { class: "row" },
      selectedRole !== rs.targetRole ? h("button", { class: "btn", type: "button", onclick: () => { const cur = resumeState(); cur.targetRole = selectedRole; save(cur); toast(`Target set to ${role.title}.`, "ok"); render(); } }, icon("target"), "Make this my target") : h("span", { class: "pnr-chip idle" }, "TARGET"),
      h("a", { class: "btn secondary", href: `/interview?role=${role.id}` }, icon("person"), "Practise this interview")),
    h("div", null, h("div", { class: "rule-title" }, "Core skills"),
      h("div", { class: "skill-list" },
        fit.matched.map((m) => h("div", { class: "skill-item ok" }, icon("check"), h("div", null, m.skill, h("small", null, `Found: ${m.via}`)), h("span", { class: "tiny muted" }, `×${m.weight}`))),
        fit.gained.map((m) => h("div", { class: "skill-item ok" }, icon("check"), h("div", null, m.skill, h("small", null, "You said you have this; add it to your resume")), h("button", { class: "linkish tiny", type: "button", onclick: () => toggleSkill(m.skill) }, "Undo"))),
        fit.missing.map((m) => h("div", { class: "skill-item miss" }, icon("x"), h("div", null, m.skill, h("small", null, `e.g. ${m.examples.join(", ")}`)),
          h("button", { class: "btn sm secondary", type: "button", onclick: () => toggleSkill(m.skill) }, added.has(m.skill.toLowerCase()) ? "Undo" : "I have this"))))),
    role.often_asked?.length ? h("div", null, h("div", { class: "rule-title" }, "Often asked for"), h("div", { class: "tagline", style: { marginTop: "10px" } }, role.often_asked.map((s) => h("span", { class: "t" }, s)))) : null,
    h("div", null, h("div", { class: "rule-title" }, "What interviewers ask"), h("ul", { class: "topic-list", style: { marginTop: "10px" } }, role.topics.map((t) => h("li", null, t)))),
    h("div", { class: "cols-2" },
      h("div", null, h("div", { class: "rule-title" }, "Learn"), h("div", { class: "res-list", style: { marginTop: "10px" } }, role.resources.map((r) => h("a", { href: r.url, target: "_blank", rel: "noopener" }, icon("link"), r.title)))),
      h("div", null, h("div", { class: "rule-title" }, "Search openings"), h("div", { class: "res-list", style: { marginTop: "10px" } }, jobLinks(role.title).map(([label, url]) => h("a", { href: url, target: "_blank", rel: "noopener" }, icon("arrow"), label)))))) : null;

  mount(panel, h("div", { class: "fit-grid" }, left, detail));
}

function toggleSkill(skill) {
  const rs = resumeState();
  const set = new Set(rs.addedSkills);
  const key = [...set].find((s) => s.toLowerCase() === skill.toLowerCase());
  if (key) set.delete(key);
  else set.add(skill);
  rs.addedSkills = [...set];
  save(rs);
  render();
}

// ── JD match ────────────────────────────────────────────────────────────
function renderJD(rs) {
  const jd = store.get("jd") || {};
  const ta = h("textarea", { class: "textarea", placeholder: "Paste the job description from the drive notice or job post", "aria-label": "Job description" }, jd.text || "");
  ta.addEventListener("input", () => store.set("jd", { ...(store.get("jd") || {}), text: ta.value }));
  const go = h("button", { class: "btn", type: "button" }, icon("target"), "Compare with my resume");
  const result = h("div", { class: "stack", style: { "--gap": "20px" } });
  go.addEventListener("click", async () => {
    const text = ta.value.trim();
    if (text.length < 80) return toast("Paste the full job description first.", "warn");
    go.disabled = true;
    mount(result, tickerBlock("MATCHING KEYWORDS", "Reading the description the way an applicant tracking system would."));
    try {
      const res = await api.post("/api/resume/jd-match", { text: R.workingText(rs), jd: text });
      store.set("jd", { text, result: res });
      paintJD(result, res);
    } catch (err) {
      mount(result, h("div", { class: "note err" }, icon("warn"), err.message));
    } finally {
      go.disabled = false;
    }
  });
  const left = h("div", { class: "stack" },
    h("label", { class: "field" }, h("span", null, "Job description"), ta),
    h("div", { class: "row" }, go, h("button", { class: "linkish small", type: "button", onclick: () => { ta.value = SAMPLE_JD; ta.dispatchEvent(new Event("input")); } }, "Use a sample (fictional) description")));
  if (jd.result) paintJD(result, jd.result);
  else mount(result, h("div", { class: "empty" }, h("h3", null, "Tailor your resume to one opening"), h("p", null, "VARS lists every requirement in the description, shows the line in your resume that proves it, and writes a summary aimed at this job using only your facts.")));
  mount(panel, h("div", { class: "jd-grid" }, left, result));
}

function paintJD(el, res) {
  const must = res.keywords.filter((k) => k.importance === "must");
  const missingMust = must.filter((k) => !k.found).length;
  const st = missingMust === 0 ? { code: "CNF", n: 0 } : missingMust <= 3 ? { code: "RAC", n: missingMust } : { code: "WL", n: missingMust };
  const rows = res.keywords.map((k) => h("tr", null,
    h("td", null, h("strong", null, k.term), h("span", { class: "sub" }, k.importance === "must" ? "Must have" : "Good to have")),
    h("td", { class: "small" }, k.found ? (k.evidence ? h("q", null, k.evidence) : "Mentioned") : h("span", { class: "muted" }, "Not in your resume")),
    h("td", { class: `st ${k.found ? "s-cnf" : k.importance === "must" ? "s-wl" : "s-rac"}` }, k.found ? "YES" : "NO")));
  mount(el,
    h("div", { class: "match-big" }, h("span", { class: `pnr ${pnrClass(st)}` }, `${res.match}%`), h("div", null, h("b", null, res.role_title), h("p", { class: "muted small" }, res.verdict), h("p", { class: "small" }, pnrChip(st), " ", missingMust ? `${missingMust} must-have requirement${missingMust > 1 ? "s" : ""} not shown` : "Every must-have is shown"))),
    h("div", { class: "chart-wrap" }, h("table", { class: "chart" }, h("thead", null, h("tr", null, h("th", null, "Requirement"), h("th", null, "Evidence in your resume"), h("th", { style: { textAlign: "right" } }, "Found"))), h("tbody", null, rows))),
    res.summary_rewrite ? h("div", null, h("div", { class: "rule-title" }, "Summary aimed at this job"),
      h("div", { class: "copy-block", style: { marginTop: "10px" } }, h("p", null, res.summary_rewrite), h("button", { class: "btn sm secondary", type: "button", onclick: () => copyText(res.summary_rewrite).then(() => toast("Summary copied.", "ok")) }, icon("copy"), "Copy"))) : null,
    res.emphasise?.length ? h("div", null, h("div", { class: "rule-title" }, "Move these up or expand them"), h("ul", { class: "topic-list", style: { marginTop: "10px" } }, res.emphasise.map((l) => h("li", null, l)))) : null,
    res.gaps?.length ? h("div", null, h("div", { class: "rule-title" }, "Gaps and what to do"), h("div", { class: "skill-list" }, res.gaps.map((g) => h("div", { class: "skill-item miss" }, icon("x"), h("div", null, h("strong", null, g.term), h("small", null, g.advice)), h("span"))))) : null);
}

// ── chat ────────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "What should I add to be taken seriously for this role?",
  "Rewrite my strongest project so it leads with the result.",
  "What will interviewers ask about my internship?",
  "Which line should I cut first if I need space?",
];

function renderAsk(rs) {
  const history = store.get("chat") || [];
  const log = h("div", { class: "chat-log", "aria-live": "polite" });
  const paint = () => {
    clear(log);
    if (!history.length) {
      log.append(h("div", { class: "msg" }, h("span", { class: "who" }, "VARS"), h("div", { class: "body" }, h("p", null, `I have read your resume and its findings for ${R.roleFit(rs)?.title || "your target role"}. Ask me anything about it: what to add, how to word a line, or what an interviewer will ask.`))));
      log.append(h("div", { class: "suggest" }, SUGGESTIONS.map((s) => h("button", { type: "button", onclick: () => send(s) }, s))));
    }
    for (const m of history) {
      log.append(h("div", { class: `msg ${m.role === "user" ? "me" : ""}` }, h("span", { class: "who" }, m.role === "user" ? "YOU" : "VARS"), h("div", { class: "body" }, m.role === "user" ? h("p", null, m.content) : renderMarkdown(m.content))));
    }
    log.scrollTop = log.scrollHeight;
  };
  const input = h("textarea", { class: "textarea", placeholder: "Ask about your resume…", rows: 1, "aria-label": "Your question" });
  const sendBtn = h("button", { class: "btn", type: "button", "aria-label": "Send" }, icon("send"), "Send");
  input.addEventListener("input", () => { input.style.height = "44px"; input.style.height = Math.min(160, input.scrollHeight + 2) + "px"; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  sendBtn.addEventListener("click", () => send(input.value));

  async function send(text) {
    text = (text || "").trim();
    if (!text || chatBusy) return;
    chatBusy = true;
    sendBtn.disabled = true;
    input.value = "";
    const prior = [...history];
    history.push({ role: "user", content: text });
    paint();
    const body = h("div", { class: "body" }, h("span", { class: "caret" }));
    log.append(h("div", { class: "msg" }, h("span", { class: "who" }, "VARS"), body));
    log.scrollTop = log.scrollHeight;
    const fit = R.roleFit(rs);
    try {
      const full = await api.stream("/api/chat", {
        question: text, history: prior, lines: rs.lines.map((l) => l ?? ""),
        findings: R.openFindings(rs), role_title: fit?.title || "",
      }, (_d, all) => { mount(body, renderMarkdown(all), h("span", { class: "caret" })); log.scrollTop = log.scrollHeight; });
      history.push({ role: "assistant", content: full.trim() });
      store.set("chat", history);
    } catch (err) {
      history.pop();
      mount(body, h("div", { class: "note err" }, icon("warn"), err.message));
    } finally {
      chatBusy = false;
      sendBtn.disabled = false;
      if (history.length && history[history.length - 1].role === "assistant") paint();
      input.focus();
    }
  }

  paint();
  mount(panel, h("div", { class: "chat" }, log, h("div", { class: "chat-input" }, input, sendBtn)),
    h("p", { class: "tiny muted", style: { marginTop: "10px" } }, "Each question sends your resume text with it; the server answers and forgets. The conversation stays in this tab."));
}

boot();
