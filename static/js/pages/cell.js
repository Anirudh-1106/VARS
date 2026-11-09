import { api } from "../core/api.js";
import { $, $$, clear, copyText, downloadFile, h, icon, mount, pnrChip, pnrClass, pnrText, statusFromCount, tickerBlock, toast } from "../core/ui.js";

const panel = $("#panel");
const tabsEl = $("#tabs");
let tab = new URLSearchParams(location.search).get("tab") || "drive";
let catalog = [];
let cohort = []; // in memory only: [{ file, data, valid }]

const COMP = [["technical_depth", "Technical"], ["problem_solving", "Problem solving"], ["coding", "Coding"], ["communication", "Communication"], ["behavioural", "Behavioural"], ["resume_ownership", "Resume"]];
const COMPANY = { service: "Service company", product: "Product company", startup: "Startup" };
const LEVEL = { fresher: "Fresher", intern: "Experienced intern", stretch: "Stretch" };

async function boot() {
  try {
    catalog = (await api.get("/api/roles")).roles;
  } catch (err) {
    toast(err.message, "error");
  }
  $$("[data-tab]", tabsEl).forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  render();
}

function setTab(t) {
  tab = t;
  const url = new URL(location.href);
  url.searchParams.set("tab", t);
  history.replaceState(null, "", url);
  render();
}

function render() {
  $$("[data-tab]", tabsEl).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  panel.setAttribute("aria-labelledby", `tab-${tab}`);
  if (tab === "cohort") renderCohort();
  else renderDrive();
}

// ── drive links ─────────────────────────────────────────────────────────
function renderDrive() {
  const cfg = { name: "", org: "", role: "sde-service", company: "service", level: "fresher", counts: { technical: 5, coding: 1, hr: 3 }, questions: ["", "", ""] };
  const out = h("aside", { class: "pass" });
  const form = h("div", { class: "setup-form" });

  const paint = () => {
    clear(form);
    const name = h("input", { class: "input", value: cfg.name, placeholder: "e.g. Infosys-style mock drive, CSE 2026", oninput: (e) => { cfg.name = e.target.value; } });
    const org = h("input", { class: "input", value: cfg.org, placeholder: "e.g. Training & Placement Cell, GEC Thrissur", oninput: (e) => { cfg.org = e.target.value; } });
    const role = h("select", { class: "select" });
    for (const fam of [...new Set(catalog.map((r) => r.family))]) {
      const g = h("optgroup", { label: fam });
      catalog.filter((r) => r.family === fam).forEach((r) => g.append(h("option", { value: r.id, selected: r.id === cfg.role }, r.title)));
      role.append(g);
    }
    role.addEventListener("change", () => { cfg.role = role.value; });
    const choice = (key, opts) => h("div", { class: "opt-grid" }, opts.map(([v, t, s]) => h("button", { type: "button", class: "opt-card", "aria-pressed": String(cfg[key] === v), onclick: () => { cfg[key] = v; paint(); } }, h("b", null, t), s)));
    const counter = (key, title, min, max) => h("div", { class: "counter" }, h("div", null, h("b", null, title)),
      h("div", { class: "stepper" },
        h("button", { type: "button", "aria-label": `Fewer ${title}`, disabled: cfg.counts[key] <= min, onclick: () => { cfg.counts[key] -= 1; paint(); } }, "−"),
        h("output", null, cfg.counts[key]),
        h("button", { type: "button", "aria-label": `More ${title}`, disabled: cfg.counts[key] >= max, onclick: () => { cfg.counts[key] += 1; paint(); } }, "+")));
    form.append(
      h("fieldset", null, h("legend", null, "The drive"),
        h("label", { class: "field" }, h("span", null, "Drive name"), name),
        h("label", { class: "field" }, h("span", null, "Placement cell or college"), org)),
      h("fieldset", null, h("legend", null, "Role"), role),
      h("fieldset", null, h("legend", null, "Company style"), choice("company", [["service", "Service company", "Fundamentals and clarity"], ["product", "Product company", "Depth and trade-offs"], ["startup", "Startup", "Breadth and ownership"]])),
      h("fieldset", null, h("legend", null, "Difficulty"), choice("level", [["fresher", "Fresher", "Fair for final years"], ["intern", "Experienced intern", "Expects detail"], ["stretch", "Stretch", "Demanding"]])),
      h("fieldset", null, h("legend", null, "Rounds"), counter("technical", "Technical questions", 2, 8), counter("coding", "Coding problems", 0, 2), counter("hr", "HR questions", 0, 5)),
      h("fieldset", null, h("legend", null, "Your own questions (optional)"),
        h("p", { class: "small muted" }, "The panel will work these into the right round, for example a question your recruiters always ask."),
        cfg.questions.map((q, i) => h("input", { class: "input", value: q, placeholder: `Question ${i + 1}`, oninput: (e) => { cfg.questions[i] = e.target.value; } }))),
      h("div", { class: "row" }, h("button", { class: "btn lg", type: "button", onclick: create }, icon("link"), "Create signed drive link")));
  };

  const create = async () => {
    if (!cfg.name.trim()) return toast("Give the drive a name so students recognise it.", "warn");
    const payload = {
      id: Math.random().toString(36).slice(2, 10),
      name: cfg.name.trim(), org: cfg.org.trim() || null, role: cfg.role, company: cfg.company, level: cfg.level,
      counts: { ...cfg.counts }, questions: cfg.questions.map((q) => q.trim()).filter(Boolean), created: new Date().toISOString().slice(0, 10),
    };
    try {
      const res = await api.post("/api/sign", { kind: "drive", payload });
      const link = `${location.origin}/interview?drive=${res.token}`;
      paintPass(payload, link, res.ephemeral);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const paintPass = (p, link, ephemeral) => {
    const role = catalog.find((r) => r.id === p.role);
    mount(out,
      h("div", { class: "pass-head" }, h("b", null, "MOCK DRIVE"), h("span", null, p.created)),
      h("div", { class: "pass-row" }, h("div", null, h("small", null, "Drive"), h("b", null, p.name)), h("div", null, h("small", null, "Set by"), h("b", null, p.org || "—"))),
      h("div", { class: "pass-row" }, h("div", null, h("small", null, "Role"), h("b", null, role?.title)), h("div", null, h("small", null, "Panel"), h("b", null, `${COMPANY[p.company]} · ${LEVEL[p.level]}`))),
      h("div", { class: "pass-row" }, h("div", { style: { gridColumn: "1 / -1" } }, h("small", null, "Rounds"), h("b", null, `${p.counts.technical} technical · ${p.counts.coding} coding · ${p.counts.hr} HR${p.questions.length ? ` · ${p.questions.length} of your questions` : ""}`))),
      h("div", { class: "pass-checks" },
        h("label", { class: "field" }, h("span", null, "Share this link with students"), h("input", { class: "input mono", readonly: true, value: link, onclick: (e) => e.target.select() })),
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", onclick: () => copyText(link).then(() => toast("Link copied.", "ok")) }, icon("copy"), "Copy link"),
          h("a", { class: "btn secondary", href: link, target: "_blank", rel: "noopener" }, icon("arrow"), "Try it"))),
      h("div", { class: "pass-foot" },
        h("p", { class: "small" }, "The settings live inside the link and are signed, so students cannot change the role or rounds. VARS stores nothing about this drive."),
        ephemeral ? h("div", { class: "note warn" }, icon("warn"), h("span", null, "This server has no fixed signing key (VARS_SIGNING_KEY), so links and report files stop verifying after it restarts. Set the key in .env before running a real drive.")) : null,
        h("p", { class: "small muted" }, "Ask students to finish the interview, choose “Export for placement cell” on their report and send you the file. Then open “Read student reports”.")));
  };

  mount(out,
    h("div", { class: "pass-head" }, h("b", null, "MOCK DRIVE"), h("span", null, "Not created yet")),
    h("div", { class: "pass-foot" }, h("p", null, "Fill in the drive on the left. You get one link to share; every student who opens it sits the same panel."),
      h("p", { class: "small muted" }, "Students sit the interview on their own device. Their answers never reach you unless they choose to export their report.")));
  paint();
  mount(panel, h("div", { class: "setup" }, form, out));
}

// ── cohort ──────────────────────────────────────────────────────────────
function renderCohort() {
  const input = h("input", { type: "file", accept: ".json,application/json", multiple: true, class: "sr", id: "reports" });
  const drop = h("div", { class: "drop", style: { maxWidth: "860px" } },
    h("h2", null, "Drop student report files here"),
    h("p", { class: "formats" }, "*.vars.json · as many as you like"),
    h("label", { class: "btn lg", for: "reports" }, icon("upload"), "Choose files"),
    input,
    h("p", { class: "privacy-line" }, icon("shield"), "Files are read in this browser. Only each file's signature check touches the server, and nothing is kept. Close the tab and the cohort is gone."));
  const add = async (files) => {
    for (const file of files) {
      try {
        const data = JSON.parse(await file.text());
        if (data.format !== "vars-report") throw new Error("not a VARS report");
        const { signature, ...payload } = data;
        let valid = false;
        try {
          valid = (await api.post("/api/verify", { kind: "report", payload, sig: signature })).valid;
        } catch {}
        cohort = cohort.filter((c) => c.data.id !== data.id);
        cohort.push({ file: file.name, data, valid });
      } catch (err) {
        toast(`${file.name}: ${err.message}`, "error");
      }
    }
    render();
  };
  input.addEventListener("change", () => add([...input.files]));
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => add([...(e.dataTransfer?.files || [])]));

  if (!cohort.length) {
    mount(panel, drop, h("div", { class: "empty" }, h("h3", null, "What you will see"), h("p", null, "Each student's readiness status (CNF, RAC or WL), overall score, weakest competency and whether the file is genuine. Across the batch: how many are ready, the average for every competency, and the skill to run a workshop on.")));
    return;
  }

  const trusted = cohort.filter((c) => c.valid);
  const basis = trusted.length ? trusted : [];
  const n = basis.length;
  const counts = { CNF: 0, RAC: 0, WL: 0 };
  basis.forEach((c) => { counts[c.data.result.status.code] = (counts[c.data.result.status.code] || 0) + 1; });
  const avg = (key) => {
    const vals = basis.map((c) => c.data.result.competencies?.[key]).filter((v) => typeof v === "number");
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const overallAvg = n ? Math.round(basis.reduce((a, c) => a + c.data.result.overall, 0) / n) : "—";
  const plural = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  const compAvg = COMP.map(([k, l]) => [k, l, avg(k)]).filter(([, , v]) => v !== null);
  const weakest = [...compAvg].sort((a, b) => a[2] - b[2])[0];
  const invalid = cohort.filter((c) => !c.valid).length;

  const rows = [...cohort].sort((a, b) => b.data.result.overall - a.data.result.overall).map((c) => {
    const d = c.data;
    const comps = Object.entries(d.result.competencies || {}).filter(([, v]) => typeof v === "number");
    const low = comps.sort((a, b) => a[1] - b[1])[0];
    return h("tr", null,
      h("td", null, h("strong", null, d.candidate || "Unnamed"), h("span", { class: "sub" }, c.file)),
      h("td", { class: "small" }, d.role, h("span", { class: "sub" }, d.drive?.name || `${COMPANY[d.company] || ""} · ${LEVEL[d.level] || ""}`)),
      h("td", { class: "num" }, d.result.overall),
      h("td", { class: "small" }, low ? `${COMP.find((x) => x[0] === low[0])?.[1] || low[0]} ${low[1]}` : "—"),
      h("td", { class: `st ${c.valid ? "s-cnf" : "s-wl"}` }, c.valid ? "SIGNED" : "EDITED"),
      h("td", { class: `st s-${pnrClass(d.result.status)}` }, pnrText(d.result.status)));
  });

  const csv = () => {
    const head = ["candidate", "role", "drive", "overall", "status", ...COMP.map(([k]) => k), "signature_valid", "file"];
    const lines = cohort.map((c) => {
      const d = c.data;
      return [d.candidate || "", d.role, d.drive?.name || "", d.result.overall, pnrText(d.result.status), ...COMP.map(([k]) => d.result.competencies?.[k] ?? ""), c.valid, c.file]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    downloadFile("cohort_readiness.csv", [head.join(","), ...lines].join("\n"), "text/csv");
  };

  mount(panel, h("div", { class: "stack", style: { "--gap": "24px", maxWidth: "1180px" } },
    h("div", { class: "status-block" },
      h("div", { class: "code" }, h("span", { class: `pnr ${n && counts.CNF / n >= 0.6 ? "cnf" : n && counts.CNF / n >= 0.3 ? "rac" : "wl"}` }, `${counts.CNF}/${n} CNF`)),
      h("div", { class: "what" },
        h("b", null, weakest ? `Run a session on ${weakest[1].toLowerCase()}: the batch averages ${weakest[2]}.` : "Readiness across the batch"),
        h("span", null, `Cohort of ${plural(n, "verified file", "verified files")}. ${plural(counts.RAC, "student is", "students are")} one to three items away (RAC) and ${plural(counts.WL, "needs", "need")} more work (WL).${invalid ? ` ${plural(invalid, "file", "files")} failed the signature check and ${invalid === 1 ? "is" : "are"} left out of these numbers.` : ""}`))),
    h("div", { class: "strip", style: { "--n": compAvg.length + 1 } },
      h("div", { class: "inv" }, h("span", null, "Average overall"), h("b", null, overallAvg)),
      compAvg.map(([, l, v]) => h("div", { class: v < 60 ? "low" : "" }, h("span", null, l), h("b", null, v)))),
    h("div", { class: "chart-wrap" }, h("table", { class: "chart" },
      h("thead", null, h("tr", null, h("th", null, "Student"), h("th", null, "Role / drive"), h("th", { style: { textAlign: "right" } }, "Overall"), h("th", null, "Weakest"), h("th", { style: { textAlign: "right" } }, "File"), h("th", { style: { textAlign: "right" } }, "Status"))),
      h("tbody", null, rows))),
    h("div", { class: "row" },
      h("label", { class: "btn secondary", for: "reports" }, icon("upload"), "Add more files"), input,
      h("button", { class: "btn secondary", type: "button", onclick: csv }, icon("download"), "Download CSV"),
      h("button", { class: "btn ghost", type: "button", onclick: () => { cohort = []; render(); } }, icon("trash"), "Clear cohort"))));
}

boot();
