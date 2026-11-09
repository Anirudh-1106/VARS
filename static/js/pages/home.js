import { store } from "../core/store.js";
import { $, h, icon, mount, pnrClass, pnrText } from "../core/ui.js";
import { readinessFor, roleFit } from "../core/resume-model.js";

const host = $("#enquiry");

function row(label, sub, status, trail) {
  return h("tr", null, h("td", null, label, sub ? h("small", null, sub) : null), h("td", { class: `st s-${pnrClass(status)}` }, trail || pnrText(status)));
}

function sample() {
  return h("div", { class: "enquiry", "aria-label": "Sample readiness enquiry for a fictional student" },
    h("div", { class: "enquiry-head" }, h("b", null, "READINESS ENQUIRY"), h("span", null, "Sample · fictional student")),
    h("div", { class: "enquiry-who" }, h("b", null, "Aditya Menon"), h("small", null, "B.Tech CSE '26 · Backend Developer")),
    h("table", null, h("tbody", null,
      row("Resume", "11 findings, 7 cleared", { code: "RAC", n: 3 }, "WL 9 → RAC 3"),
      row("Role fit", "Missing: Docker", { code: "RAC", n: 1 }),
      row("Technical round", "Auth design answer was thin", { code: "RAC", n: 2 }),
      row("Coding round", "10 of 10 hidden tests", { code: "CNF", n: 0 }),
      row("HR round", "Clear STAR answer", { code: "CNF", n: 0 }))),
    h("div", { class: "enquiry-foot" }, h("span", null, "CHART STATUS"), h("span", { class: "pnr rac" }, "RAC 2")));
}

function mine(s) {
  const rs = s.resume;
  const rep = s.reports?.[0];
  const rows = [];
  if (rs?.analysis) {
    const st = readinessFor(rs);
    const init = rs.initial?.[rs.targetRole];
    const fit = roleFit(rs);
    rows.push(row("Resume", `${rs.fileName || "Your resume"} · ${fit?.title || ""}`, st, init && pnrText(init) !== pnrText(st) ? `${pnrText(init)} → ${pnrText(st)}` : null));
    rows.push(row("Role fit", fit?.missing?.length ? `Missing: ${fit.missing.slice(0, 2).map((m) => m.skill).join(", ")}` : "Core skills covered", { code: fit?.missing?.filter((m) => m.weight >= 2).length ? "RAC" : "CNF", n: fit?.missing?.filter((m) => m.weight >= 2).length || 0 }));
  } else {
    rows.push(h("tr", null, h("td", null, "Resume", h("small", null, "Not checked yet")), h("td", { class: "st" }, h("a", { href: "/studio" }, "Check"))));
  }
  if (rep) {
    const c = rep.report.competencies;
    // One competency below the bar of 60 is one item to clear: RAC 1.
    const round = (label, key, value) => {
      if (value === null || value === undefined) return;
      const st = value >= 60 ? { code: "CNF", n: 0 } : { code: "RAC", n: 1 };
      rows.push(row(label, `${key} ${value}${value < 60 ? " · below the bar of 60" : ""}`, st));
    };
    round("Technical round", "Technical depth", c.technical_depth);
    round("Coding round", "Coding", c.coding);
    round("HR round", "Behavioural", c.behavioural);
  } else {
    rows.push(h("tr", null, h("td", null, "Mock interview", h("small", null, "Not taken yet")), h("td", { class: "st" }, h("a", { href: "/interview" }, "Start"))));
  }
  const overall = rep ? rep.report.status : rs?.analysis ? readinessFor(rs) : null;
  return h("div", { class: "enquiry", "aria-label": "Your readiness in this session" },
    h("div", { class: "enquiry-head" }, h("b", null, "YOUR STATUS"), h("span", null, "This tab only")),
    h("div", { class: "enquiry-who" }, h("b", null, rs?.analysis?.structured?.name || "You"), h("small", null, rep ? rep.config.roleTitle : rs ? roleFit(rs)?.title : "")),
    h("table", null, h("tbody", null, rows)),
    h("div", { class: "enquiry-foot" }, h("span", null, rep ? "CHART PREPARED" : "CHART PENDING"), overall ? h("span", { class: `pnr ${pnrClass(overall)}` }, pnrText(overall)) : h("a", { href: "/studio", class: "btn sm" }, icon("arrow"), "Begin")));
}

const s = store.state;
mount(host, s.resume?.analysis || s.reports?.length ? mine(s) : sample());
