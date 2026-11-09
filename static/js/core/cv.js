// Renders structured resume JSON as a clean, single-column, ATS-friendly page.

import { h } from "./ui.js";

const has = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() && v.trim().toLowerCase() !== "none" : !!v);
const url = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

export function renderCV(r, opts = {}) {
  if (!r || !Object.values(r).some(has)) return h("div", { class: "cv-empty" }, "Your resume appears here as you speak.");
  const edit = !!opts.editable;
  const field = (tag, key, text, attrs = {}) => h(tag, { ...attrs, contenteditable: edit ? "true" : null, "data-key": key, spellcheck: edit ? "true" : null }, text);
  const contact = [
    has(r.email) && h("span", null, r.email),
    has(r.phone) && h("span", null, r.phone),
    has(r.location) && h("span", null, r.location),
    has(r.linkedin) && h("a", { href: url(r.linkedin), target: "_blank", rel: "noopener" }, r.linkedin.replace(/^https?:\/\/(www\.)?/, "")),
    has(r.github) && h("a", { href: url(r.github), target: "_blank", rel: "noopener" }, r.github.replace(/^https?:\/\/(www\.)?/, "")),
  ].filter(Boolean);
  return h("article", { class: "cv", "aria-label": "Resume preview" },
    field("h1", "name", r.name || "Your Name"),
    contact.length ? h("div", { class: "contact" }, contact) : null,
    has(r.summary) ? [h("h2", null, "Summary"), field("p", "summary", r.summary)] : null,
    has(r.education) ? [h("h2", null, "Education"), r.education.map((e, i) => h("div", { class: "item" },
      h("div", { class: "item-top" }, field("b", `education.${i}.degree`, e.degree || ""), field("span", `education.${i}.year`, e.year || "")),
      h("div", { class: "muted" }, field("span", `education.${i}.institution`, e.institution || ""), has(e.score) ? [" · ", field("span", `education.${i}.score`, e.score)] : null)))] : null,
    has(r.experience) ? [h("h2", null, "Experience"), r.experience.map((e, i) => h("div", { class: "item" },
      h("div", { class: "item-top" }, h("span", { style: { color: "inherit", fontSize: "inherit", whiteSpace: "normal" } }, field("b", `experience.${i}.role`, e.role || ""), has(e.company) ? [" — ", field("span", `experience.${i}.company`, e.company, { style: { color: "inherit", fontSize: "inherit" } })] : null), field("span", `experience.${i}.duration`, e.duration || "")),
      has(e.bullets) ? h("ul", null, e.bullets.map((b, j) => field("li", `experience.${i}.bullets.${j}`, b))) : null))] : null,
    has(r.projects) ? [h("h2", null, "Projects"), r.projects.map((p, i) => h("div", { class: "item" },
      h("div", { class: "item-top" }, field("b", `projects.${i}.name`, p.name || ""), has(p.tech_stack) ? h("span", null, p.tech_stack.join(", ")) : null),
      has(p.description) ? field("p", `projects.${i}.description`, p.description) : null,
      has(p.link) ? h("a", { href: url(p.link), target: "_blank", rel: "noopener", class: "small" }, p.link) : null))] : null,
    has(r.skills) ? [h("h2", null, "Skills"), h("div", { class: "skills" }, r.skills.map((s) => h("span", null, s)))] : null,
    has(r.certifications) ? [h("h2", null, "Certifications"), h("ul", null, r.certifications.map((c, i) => field("li", `certifications.${i}`, c)))] : null,
    has(r.achievements) ? [h("h2", null, "Achievements"), h("ul", null, r.achievements.map((c, i) => field("li", `achievements.${i}`, c)))] : null);
}

export function setPath(obj, path, value) {
  const keys = path.split(".");
  let t = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = /^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i];
    if (t[k] == null) t[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    t = t[k];
  }
  const last = keys[keys.length - 1];
  t[/^\d+$/.test(last) ? Number(last) : last] = value;
}

export function collectEdits(root, resume) {
  const copy = JSON.parse(JSON.stringify(resume));
  root.querySelectorAll("[data-key]").forEach((node) => setPath(copy, node.dataset.key, node.textContent.trim()));
  return copy;
}
