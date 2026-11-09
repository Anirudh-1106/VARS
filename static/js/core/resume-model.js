// Pure functions over the resume session object. Readiness is a counted
// status: open high/medium findings + missing weighty core skills for the
// target role. Zero is CNF, up to three is RAC n, more is WL n.

import { statusFromCount } from "./ui.js";

export function newResumeState(analysis, meta = {}) {
  const state = {
    source: meta.source || "upload",
    fileName: meta.fileName || analysis.file_name || null,
    analysis,
    lines: [...analysis.lines],
    targetRole: analysis.target_role,
    fixed: {},
    addedSkills: [],
    initial: {},
    analyzedAt: Date.now(),
  };
  for (const role of analysis.roles) {
    state.initial[role.id] = statusFromCount(openCount(state, role.id));
  }
  return state;
}

export function roleFit(rs, roleId) {
  const role = rs.analysis.roles.find((r) => r.id === (roleId || rs.targetRole));
  if (!role) return null;
  const added = new Set((rs.addedSkills || []).map((s) => s.toLowerCase()));
  const missing = role.missing.filter((m) => !added.has(m.skill.toLowerCase()));
  const gained = role.missing.filter((m) => added.has(m.skill.toLowerCase()));
  const total = role.matched.reduce((a, m) => a + m.weight, 0) + role.missing.reduce((a, m) => a + m.weight, 0) || 1;
  const got = role.matched.reduce((a, m) => a + m.weight, 0) + gained.reduce((a, m) => a + m.weight, 0);
  return { ...role, missing, gained, fit: Math.round((100 * got) / total) };
}

export function isOpen(rs, finding) {
  return !rs.fixed?.[finding.id];
}

export function openFindings(rs) {
  return rs.analysis.findings.filter((f) => isOpen(rs, f));
}

export function openCount(rs, roleId) {
  const findings = rs.analysis.findings.filter((f) => isOpen(rs, f) && f.severity !== "low").length;
  const fit = roleFit(rs, roleId);
  const skills = fit ? fit.missing.filter((m) => m.weight >= 2).length : 0;
  return findings + skills;
}

export function readinessFor(rs, roleId) {
  return statusFromCount(openCount(rs, roleId || rs.targetRole));
}

export function projectedScore(rs) {
  const base = rs.analysis.scores.overall;
  const gain = rs.analysis.findings.filter((f) => rs.fixed?.[f.id] && rs.fixed[f.id].how !== "dismissed").reduce((a, f) => a + (f.points || 0), 0);
  return Math.min(100, Math.round(base + gain));
}

export function workingText(rs) {
  return rs.lines.filter((l) => l !== null).join("\n");
}

export function lineText(rs, idx) {
  return rs.lines[idx];
}

// Replace the quoted span on a line (or the whole line) with new text.
export function applyRewrite(rs, finding, text) {
  const idx = finding.line;
  if (idx === null || idx === undefined || rs.lines[idx] === null) return false;
  const current = rs.lines[idx];
  const bullet = current.startsWith("• ") ? "• " : "";
  if (finding.quote && current.includes(finding.quote)) {
    rs.lines[idx] = current.replace(finding.quote, text);
  } else {
    rs.lines[idx] = bullet + text;
  }
  return true;
}

export function deleteLine(rs, idx) {
  if (idx === null || idx === undefined) return false;
  rs.lines[idx] = null;
  return true;
}

export function markFixed(rs, finding, how, detail) {
  rs.fixed = { ...(rs.fixed || {}), [finding.id]: { how, detail: detail || null, at: Date.now() } };
}

export function unmark(rs, finding) {
  const next = { ...(rs.fixed || {}) };
  delete next[finding.id];
  rs.fixed = next;
}

// Placeholders such as [N users] or [X%] that the student must fill in.
export function placeholders(text) {
  return [...new Set((text || "").match(/\[[^\]]{1,30}\]/g) || [])];
}

export function sectionTitle(key) {
  return {
    header: "Contact", summary: "Summary", education: "Education", experience: "Experience", projects: "Projects",
    skills: "Skills", certifications: "Certifications", achievements: "Achievements", activities: "Activities",
    publications: "Publications", languages: "Languages", hobbies: "Hobbies", declaration: "Declaration", personal: "Personal details",
  }[key] || "General";
}

export const CATEGORY_LABEL = {
  impact: "Impact", clarity: "Clarity", relevance: "Relevance", practice: "Practice", grammar: "Grammar", structure: "Structure", ats: "ATS",
};

export const SCORE_LABELS = [
  ["structure", "Structure"],
  ["impact", "Impact"],
  ["relevance", "Relevance"],
  ["ats", "ATS"],
  ["practice", "Practice"],
];
