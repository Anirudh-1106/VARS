import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { $, downloadFile, fmtTime, h, icon, mount, pnrChip, pnrClass, pnrText, toast } from "../core/ui.js";

const panel = $("#panel");
const metaEl = $("#meta");
const actionsEl = $("#actions");

const COMP = [
  ["technical_depth", "Technical depth"],
  ["problem_solving", "Problem solving"],
  ["coding", "Coding"],
  ["communication", "Communication"],
  ["behavioural", "Behavioural"],
  ["resume_ownership", "Resume ownership"],
];
const VERDICT = { strong_hire: "Strong hire", hire: "Hire", lean_no: "Lean no hire", no: "No hire" };
const COMPANY = { service: "Service company", product: "Product company", startup: "Startup" };
const LEVEL = { fresher: "Fresher", intern: "Experienced intern", stretch: "Stretch" };

let catalog = [];

function prettyArea(text) {
  const t = String(text || "").replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function scoreStatus(score) {
  if (score === null || score === undefined) return { code: "WL", n: 0 };
  if (score >= 7) return { code: "CNF", n: 0 };
  if (score >= 5) return { code: "RAC", n: 0 };
  return { code: "WL", n: 0 };
}

function verdictWord(ev) {
  if (!ev) return { t: "—", c: "muted" };
  return { strong: { t: "STRONG", c: "s-cnf" }, adequate: { t: "PASS", c: "s-rac" }, weak: { t: "WEAK", c: "s-wl" }, no_answer: { t: "NONE", c: "s-wl" } }[ev.verdict] || { t: "—", c: "muted" };
}

async function boot() {
  const reports = store.get("reports") || [];
  try {
    catalog = (await api.get("/api/roles")).roles;
  } catch {}
  const id = new URLSearchParams(location.search).get("id");
  const entry = reports.find((r) => r.id === id) || reports[0];
  if (!entry) {
    metaEl.textContent = "";
    mount(panel, h("div", { class: "empty" },
      h("h3", null, "No report in this session yet"),
      h("p", null, "Finish a mock interview and your report appears here, scored question by question. Reports live only in this tab; export one to keep it."),
      h("div", { class: "row" }, h("a", { class: "btn", href: "/interview" }, icon("person"), "Start a mock interview"), h("a", { class: "btn secondary", href: "/cell" }, "Open a report file"))));
    return;
  }
  render(entry, reports);
}

function render(entry, reports) {
  const rep = entry.report;
  const cfg = entry.config;
  const when = new Date(entry.createdAt);
  metaEl.textContent = `${when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${fmtTime(entry.durationSec || 0)} long`;
  mount(actionsEl,
    h("button", { class: "btn secondary", type: "button", onclick: () => window.print() }, icon("print"), "Print or save PDF"),
    h("button", { class: "btn secondary", type: "button", onclick: () => exportSigned(entry) }, icon("download"), "Export for placement cell"),
    h("a", { class: "btn", href: `/interview?role=${encodeURIComponent(cfg.role)}` }, icon("refresh"), "Practise again"));

  const status = rep.status;
  const below = (rep.below_bar || []).map((k) => COMP.find((c) => c[0] === k)?.[1]).filter(Boolean);
  const head = h("div", { class: "chart-head" },
    h("div", { class: "stamp" }, "CHART PREPARED", h("small", null, entry.early ? "Interview ended early: only answered questions are scored." : "Every answer scored against its rubric.")),
    h("dl", null,
      h("div", null, h("dt", null, "Candidate"), h("dd", null, entry.candidate || "You")),
      h("div", null, h("dt", null, "Role"), h("dd", null, cfg.roleTitle)),
      h("div", null, h("dt", null, "Panel"), h("dd", null, `${COMPANY[cfg.company] || ""} · ${LEVEL[cfg.level] || ""}`)),
      cfg.drive ? h("div", null, h("dt", null, "Drive"), h("dd", null, cfg.drive.name)) : null));

  const strip = h("div", { class: "strip", style: { "--n": 7 } },
    h("div", { class: "inv" }, h("span", null, "Overall"), h("b", null, rep.overall)),
    COMP.map(([k, label]) => h("div", { class: rep.competencies[k] !== null && rep.competencies[k] < 60 ? "low" : "" }, h("span", null, label), h("b", null, rep.competencies[k] ?? "—"))));

  const top = h("div", { class: "report-top" }, head, h("div", { class: "inner" },
    h("div", { class: "status-block" },
      h("div", { class: "code" }, h("span", { class: `pnr ${pnrClass(status)}` }, pnrText(status))),
      h("div", { class: "what" },
        h("p", { class: "headline" }, rep.headline || "Your interview, scored."),
        h("div", { class: "verdict-line", style: { marginTop: "8px" } }, h("span", { class: "muted" }, "Interview readiness for this role. Simulated panel verdict:"), h("strong", null, VERDICT[rep.verdict] || "—"),
          below.length ? h("span", { class: "muted" }, `· Below the bar: ${below.join(", ")}`) : h("span", { class: "s-cnf" }, "· Every competency at or above 60")))),
    strip,
    rep.summary ? h("p", { class: "summary" }, rep.summary) : null));

  const strengths = h("div", null, h("div", { class: "rule-title" }, "What worked"),
    h("div", { class: "pointlist" }, (rep.strengths || []).map((s) => h("div", { class: "point" }, h("span", { class: "pnr-chip cnf" }, "CNF"), h("div", null, s)))));
  const gaps = h("div", null, h("div", { class: "rule-title" }, "What to fix before the drive"),
    h("div", { class: "pointlist" }, (rep.gaps || []).map((g, i) => h("div", { class: "point" }, h("span", { class: "pnr-chip wl" }, `WL ${i + 1}`), h("div", null, h("strong", null, prettyArea(g.area)), h("small", null, g.evidence), h("div", { style: { marginTop: "4px" } }, g.fix))))));

  const sections = [top];
  if ((rep.strengths || []).length || (rep.gaps || []).length) sections.push(h("div", { class: "two" }, strengths, gaps));
  sections.push(questionsTable(entry));
  const coding = codingSection(entry);
  if (coding) sections.push(coding);
  const delivery = deliverySection(entry);
  if (delivery) sections.push(delivery);
  if ((rep.better_answers || []).length) sections.push(betterSection(rep));
  if ((rep.plan || []).length) sections.push(planSection(rep, cfg));
  if (reports.length > 1) {
    sections.push(h("div", null, h("div", { class: "rule-title" }, "Earlier in this session"),
      h("div", { class: "report-pick", style: { marginTop: "10px" } }, reports.map((r) => h("a", { href: `/report?id=${r.id}`, "aria-current": String(r.id === entry.id) }, `${new Date(r.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · ${r.config.roleTitle} · `, pnrText(r.report.status))))));
  }
  mount(panel, h("div", { class: "report" }, sections));
}

function questionsTable(entry) {
  const tbody = h("tbody");
  const rows = entry.questions.filter((q) => q.answers?.length || q.evaluation);
  for (const q of rows) {
    const ev = q.evaluation;
    const vw = verdictWord(ev);
    const detail = h("tr", { hidden: true }, h("td", { colspan: 4, style: { background: "var(--sheet)" } }, h("div", { class: "qa" },
      q.exchange.map((t) => h("div", { class: `turn ${t.who === "candidate" ? "me" : ""}` }, h("span", { class: "who" }, t.who === "candidate" ? "YOU" : "PANEL"), h("div", null, t.text))),
      ev ? h("div", { class: "cols" },
        h("div", null, h("h4", null, "Got right"), ev.strengths?.length ? h("ul", null, ev.strengths.map((s) => h("li", null, s))) : h("p", { class: "muted" }, "Nothing notable.")),
        h("div", null, h("h4", null, "Missing"), ev.gaps?.length ? h("ul", null, ev.gaps.map((s) => h("li", null, s))) : h("p", { class: "muted" }, "Nothing major.")),
        h("div", null, h("h4", null, "A strong answer"), h("p", null, ev.model_answer || "—"))) : null)));
    const row = h("tr", { class: "clickable", tabindex: 0, "aria-expanded": "false" },
      h("td", { class: "id" }, q.id.toUpperCase()),
      h("td", null, h("strong", null, q.ask), q.grounding ? h("span", { class: "sub" }, `Based on: ${q.grounding}`) : null),
      h("td", { class: "num" }, ev ? `${ev.score}/10` : "—"),
      h("td", { class: `st ${vw.c}` }, vw.t));
    const toggle = () => {
      detail.hidden = !detail.hidden;
      row.setAttribute("aria-expanded", String(!detail.hidden));
      row.classList.toggle("is-current", !detail.hidden);
    };
    row.addEventListener("click", toggle);
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    tbody.append(row, detail);
  }
  return h("div", null,
    h("div", { class: "rule-title" }, h("span", { class: "grow" }, "Question by question"), h("span", { class: "tiny" }, "Open a row for the transcript and a model answer")),
    rows.length ? h("div", { class: "chart-wrap" }, h("table", { class: "chart" }, h("thead", null, h("tr", null, h("th", null, "ID"), h("th", null, "Question"), h("th", { style: { textAlign: "right" } }, "Score"), h("th", { style: { textAlign: "right" } }, "Verdict"))), tbody)) : h("p", { class: "muted", style: { marginTop: "10px" } }, "No spoken questions were answered."));
}

function codingSection(entry) {
  const items = (entry.coding || []).filter((c) => c.results);
  if (!items.length) return null;
  return h("div", null, h("div", { class: "rule-title" }, "Coding round"),
    items.map((c) => {
      const rv = c.review || {};
      const st = c.results.passed === c.results.total ? { code: "CNF", n: 0 } : c.results.passed ? { code: "RAC", n: c.results.total - c.results.passed } : { code: "WL", n: c.results.total };
      return h("div", { class: "stack", style: { "--gap": "12px", paddingTop: "14px" } },
        h("div", { class: "row" }, h("strong", { style: { fontSize: "18px" } }, c.problem.title), h("span", { class: "pnr-chip idle" }, c.problem.difficulty.toUpperCase()), h("span", { class: "muted small" }, `${c.language} · ${c.minutes ? `${c.minutes} min` : "under a minute"} · ${c.runs} test run${c.runs === 1 ? "" : "s"} before submitting`)),
        h("div", { class: "strip", style: { "--n": 5 } },
          h("div", { class: "inv" }, h("span", null, "Tests passed"), h("b", null, `${c.results.passed}`, h("small", null, `/ ${c.results.total}`))),
          h("div", null, h("span", null, "Correctness"), h("b", null, rv.scores?.correctness ?? "—")),
          h("div", null, h("span", null, "Efficiency"), h("b", null, rv.scores?.efficiency ?? "—")),
          h("div", null, h("span", null, "Style"), h("b", null, rv.scores?.style ?? "—")),
          h("div", null, h("span", null, "Your complexity"), h("b", { style: { fontSize: "20px", lineHeight: "1.9" } }, rv.complexity?.time || "?"))),
        h("p", { class: "small" }, pnrChip(st), ` Best known approach: ${rv.optimal || c.problem.expected || "—"}.`),
        [...(rv.notes || []), ...(rv.bugs || [])].length ? h("ul", { class: "topic-list" }, [...(rv.notes || []), ...(rv.bugs || [])].map((n) => h("li", null, n))) : null,
        c.followup?.evaluation ? h("div", { class: "point" }, h("span", { class: `pnr-chip ${pnrClass(scoreStatus(c.followup.evaluation.score))}` }, `${c.followup.evaluation.score}/10`), h("div", null, h("strong", null, c.followup.ask), h("small", null, c.followup.answers?.[0] || ""))) : null,
        c.code ? h("details", { class: "fold" }, h("summary", null, icon("code"), "Show submitted code"), h("pre", { class: "code-view" }, c.code)) : null);
    }));
}

function deliverySection(entry) {
  const rows = entry.questions.filter((q) => q.delivery && q.delivery.seconds);
  if (!rows.length) return null;
  const secs = rows.reduce((a, q) => a + (q.delivery.seconds || 0), 0);
  const words = rows.reduce((a, q) => a + (q.delivery.words || 0), 0);
  const fillers = {};
  rows.forEach((q) => Object.entries(q.delivery.fillers || {}).forEach(([k, v]) => { fillers[k] = (fillers[k] || 0) + v; }));
  const fillerTotal = Object.values(fillers).reduce((a, b) => a + b, 0);
  const perMin = secs ? fillerTotal / (secs / 60) : 0;
  const pace = secs >= 3 ? Math.round(words / (secs / 60)) : null;
  const top = Object.entries(fillers).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const paceState = (wpm) => !wpm ? "muted" : wpm >= 110 && wpm <= 165 ? "s-cnf" : wpm >= 90 && wpm <= 190 ? "s-rac" : "s-wl";
  const tbody = h("tbody", null, rows.map((q) => h("tr", null,
    h("td", { class: "id" }, q.id.toUpperCase()),
    h("td", { class: "small" }, q.ask.length > 90 ? q.ask.slice(0, 88) + "…" : q.ask),
    h("td", { class: `num ${paceState(q.delivery.wpm)}` }, q.delivery.wpm ?? "—"),
    h("td", { class: "num" }, q.delivery.filler_total ?? 0),
    h("td", { class: "num" }, fmtTime(q.delivery.seconds)))));
  return h("div", null,
    h("div", { class: "rule-title" }, h("span", { class: "grow" }, "How you sounded"), h("span", { class: "tiny" }, "From your recordings; typed answers are not included")),
    h("div", { class: "strip", style: { "--n": 4, marginTop: "12px" } },
      h("div", null, h("span", null, "Pace (words/min)"), h("b", { class: paceState(pace) }, pace ?? "—")),
      h("div", null, h("span", null, "Filler words"), h("b", null, fillerTotal)),
      h("div", null, h("span", null, "Fillers per minute"), h("b", { class: perMin < 2 ? "s-cnf" : perMin < 4 ? "s-rac" : "s-wl" }, perMin.toFixed(1))),
      h("div", null, h("span", null, "Speaking time"), h("b", null, fmtTime(secs)))),
    h("p", { class: "small muted", style: { margin: "10px 0" } }, `A clear interview pace is about 110 to 165 words a minute.${top.length ? ` Your most frequent fillers: ${top.map(([k, v]) => `“${k}” ×${v}`).join(", ")}.` : " You used almost no filler words."}`),
    h("div", { class: "chart-wrap" }, h("table", { class: "chart" }, h("thead", null, h("tr", null, h("th", null, "ID"), h("th", null, "Question"), h("th", { style: { textAlign: "right" } }, "Pace"), h("th", { style: { textAlign: "right" } }, "Fillers"), h("th", { style: { textAlign: "right" } }, "Length"))), tbody)));
}

function betterSection(rep) {
  return h("div", null, h("div", { class: "rule-title" }, "Say this instead"),
    h("p", { class: "small muted", style: { margin: "10px 0 0" } }, "Built from your own answer. Only say what you actually did, keep “I would” for things you have not done yet, and replace every [X] with your real figure."),
    h("div", { class: "better" }, rep.better_answers.map((b) => h("div", { class: "better-item" },
      h("span", { class: "id" }, String(b.qid || "").toUpperCase()),
      b.question ? h("p", { class: "q" }, b.question) : null,
      h("div", { style: { gridColumn: "2" } }, h("h4", null, "You said"), h("p", { class: "said" }, b.you_said)),
      h("div", null, h("h4", null, "A stronger answer"), h("p", { class: "instead" }, b.say_instead))))));
}

function planSection(rep, cfg) {
  const role = catalog.find((r) => r.id === cfg.role);
  return h("div", null, h("div", { class: "rule-title" }, "Your next three weeks"),
    h("div", { class: "plan", style: { marginTop: "12px" } }, rep.plan.slice(0, 3).map((p, i) => h("div", null, h("b", null, `WEEK ${p.week || i + 1}`), h("h4", null, p.focus), h("ul", null, (p.tasks || []).map((t) => h("li", null, t)))))),
    role?.resources?.length ? h("p", { class: "small", style: { marginTop: "12px" } }, "Start with: ", role.resources.map((r, i) => [i ? " · " : "", h("a", { href: r.url, target: "_blank", rel: "noopener" }, r.title)])) : null);
}

function askExport() {
  return new Promise((resolve) => {
    const box = h("input", { type: "checkbox" });
    const ok = h("button", { class: "btn", type: "button" }, icon("download"), "Export file");
    const cancel = h("button", { class: "btn secondary", type: "button" }, "Cancel");
    const dlg = h("dialog", { class: "dlg", "aria-labelledby": "exp-title" },
      h("div", { class: "dlg-head" }, h("h2", { id: "exp-title" }, "Export for your placement cell")),
      h("div", { class: "dlg-body" },
        h("p", null, "VARS signs the file so your placement cell can check it was not edited. The file is created in your browser; VARS keeps no copy."),
        h("label", { class: "check" }, box, h("span", null, "Include my full answers (otherwise only scores and feedback)"))),
      h("div", { class: "dlg-foot" }, cancel, ok));
    document.body.append(dlg);
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    ok.addEventListener("click", () => done({ includeAnswers: box.checked }));
    cancel.addEventListener("click", () => done(null));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); done(null); });
    dlg.showModal();
  });
}

async function exportSigned(entry) {
  const choice = await askExport();
  if (!choice) return;
  const includeAnswers = choice.includeAnswers;
  const payload = {
    format: "vars-report",
    version: 1,
    id: entry.id,
    createdAt: new Date(entry.createdAt).toISOString(),
    candidate: entry.candidate || null,
    role: entry.config.roleTitle,
    role_id: entry.config.role,
    company: entry.config.company,
    level: entry.config.level,
    drive: entry.config.drive || null,
    duration_sec: entry.durationSec || 0,
    early: !!entry.early,
    result: {
      overall: entry.report.overall,
      status: entry.report.status,
      verdict: entry.report.verdict,
      competencies: entry.report.competencies,
      below_bar: entry.report.below_bar,
      headline: entry.report.headline,
      gaps: (entry.report.gaps || []).map((g) => prettyArea(g.area)),
    },
    questions: entry.questions.filter((q) => q.evaluation).map((q) => ({ id: q.id, round: q.round, question: q.ask, score: q.evaluation.score, ...(includeAnswers ? { answer: (q.answers || []).join(" / ") } : {}) })),
    coding: (entry.coding || []).filter((c) => c.results).map((c) => ({ title: c.problem.title, passed: c.results.passed, total: c.results.total, language: c.language })),
  };
  try {
    const res = await api.post("/api/sign", { kind: "report", payload });
    const file = { ...payload, signature: res.sig };
    const name = `${(entry.candidate || "candidate").replace(/\s+/g, "_").toLowerCase()}_${entry.config.role}_${entry.id}.vars.json`;
    downloadFile(name, JSON.stringify(file, null, 2));
    toast(res.ephemeral ? "Exported. Note: this server's signing key resets on restart, so verify the file today." : "Exported a signed file. Send it to your placement cell.", res.ephemeral ? "warn" : "ok", { ms: 8000 });
  } catch (err) {
    toast(err.message, "error");
  }
}

boot();
