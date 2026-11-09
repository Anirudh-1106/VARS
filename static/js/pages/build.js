import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { $, clear, fmtTime, h, icon, mount, pnrChip, statusFromCount, tickerBlock, toast } from "../core/ui.js";
import { renderCV, setPath } from "../core/cv.js";
import * as R from "../core/resume-model.js";
import { Recorder, levelDots } from "../lib/recorder.js";

const panel = $("#panel");
const actionsEl = $("#actions");
const recorder = new Recorder();
let raf = 0;
let clockTimer = 0;
let assistant = null; // { questions, index }

const EMPTY = { name: null, email: null, phone: null, linkedin: null, github: null, location: null, summary: null, education: [], skills: [], experience: [], projects: [], certifications: [], achievements: [] };

const PROMPTS = [
  ["about", "Who you are", "Your name, college, branch, year and CGPA.", (r) => r.name && r.education?.length],
  ["contact", "How to reach you", "Email, phone, LinkedIn and GitHub. Say “at” and “dot” for the email.", (r) => r.email && r.phone],
  ["experience", "An internship or job", "Company, your role, the months, and what you built or changed.", (r) => r.experience?.length],
  ["projects", "A project", "What it does, the tools you used, and one result you can measure.", (r) => r.projects?.length],
  ["skills", "Your skills", "Languages, frameworks, databases and tools you have actually used.", (r) => r.skills?.length],
  ["extra", "Anything else", "Certifications, hackathons, awards or positions of responsibility.", (r) => r.certifications?.length || r.achievements?.length],
];

const resumeData = () => ({ ...EMPTY, ...(store.get("voice")?.resume || {}) });
function saveResume(resume) {
  store.set("voice", { ...(store.get("voice") || {}), resume });
}

const hasText = (v) => typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "none";
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || "").trim());
const validPhone = (v) => /^\+?[\d\s\-()]+$/.test((v || "").trim()) && (v || "").replace(/\D/g, "").length >= 10 && (v || "").replace(/\D/g, "").length <= 15;
const spokenEmail = (v) => (v || "").trim().replace(/\s*\(at\)\s*/gi, "@").replace(/\s+at\s+the\s+rate\s+(of\s+)?/gi, "@").replace(/\s+at\s+/gi, "@").replace(/\s+dot\s+/gi, ".").replace(/\s+underscore\s+/gi, "_").replace(/\s+dash\s+/gi, "-").replace(/\s+/g, "");
const normUrl = (v) => ((v || "").trim() ? (/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`) : "");

function missingQuestions(r) {
  const qs = [];
  if (!hasText(r.name)) qs.push({ path: "name", q: "What is your full name?", hint: "As you want it on the resume.", ph: "Ananya Raj", required: true, check: (v) => hasText(v) || "Your name is required." });
  if (!validEmail(spokenEmail(r.email || ""))) qs.push({ path: "email", q: hasText(r.email) ? "That email looks wrong. What is the correct one?" : "What is your email address?", hint: "Recruiters write to this address.", ph: "name@example.com", required: true, norm: spokenEmail, check: (v) => validEmail(v) || "Use the format name@example.com." });
  if (!validPhone(r.phone || "")) qs.push({ path: "phone", q: hasText(r.phone) ? "That number looks wrong. What is your phone number?" : "What is your phone number?", hint: "10 to 15 digits; include +91 if you like.", ph: "+91 98765 43210", required: true, check: (v) => validPhone(v) || "Use 10 to 15 digits." });
  if (!hasText(r.linkedin)) qs.push({ path: "linkedin", q: "Your LinkedIn profile link?", hint: "Optional. Skip if you do not have one.", ph: "linkedin.com/in/your-name", norm: normUrl, check: (v) => !v || /linkedin\.com\/.+/i.test(v) || "That does not look like a LinkedIn link." });
  if (!hasText(r.github)) qs.push({ path: "github", q: "Your GitHub profile link?", hint: "Optional, but strong evidence for tech roles.", ph: "github.com/your-username", norm: normUrl, check: (v) => !v || /github\.com\/.+/i.test(v) || "That does not look like a GitHub link." });
  (r.experience || []).forEach((e, i) => {
    if (!hasText(e.duration) && (hasText(e.role) || hasText(e.company))) qs.push({ path: `experience.${i}.duration`, q: `When was ${e.role || "this role"} at ${e.company || "this company"}?`, hint: "Months and years, e.g. Jun 2025 – Aug 2025.", ph: "Jun 2025 – Aug 2025", check: (v) => !!v || "Add the months or skip." });
  });
  return qs;
}

function completeness(r) {
  const req = [["Name", hasText(r.name)], ["Email", validEmail(r.email || "")], ["Phone", validPhone(r.phone || "")], ["Education", r.education?.length > 0], ["Projects or experience", r.projects?.length > 0 || r.experience?.length > 0], ["Skills", r.skills?.length > 0]];
  const opt = [["LinkedIn", hasText(r.linkedin)], ["GitHub", hasText(r.github)], ["Summary", hasText(r.summary)]];
  return { req, opt, missing: req.filter(([, ok]) => !ok).length };
}

// ── boot ────────────────────────────────────────────────────────────────
async function boot() {
  const from = new URLSearchParams(location.search).get("from");
  const rs = store.get("resume");
  if (from === "studio" && rs?.analysis?.structured) {
    const s = rs.analysis.structured;
    saveResume({ ...EMPTY, ...s });
    toast(Object.keys(rs.fixed || {}).length ? "Loaded the details from your last check. Re-check in Studio first if you applied fixes since." : "Loaded your resume details from Resume Studio.", "info", { ms: 7000 });
    history.replaceState(null, "", "/build");
  }
  render();
}

function render() {
  const r = resumeData();
  const comp = completeness(r);
  const st = statusFromCount(comp.missing);
  mount(actionsEl,
    h("button", { class: "btn secondary", type: "button", disabled: !Object.values(r).some((v) => (Array.isArray(v) ? v.length : v)), onclick: polish }, icon("edit"), "Polish wording"),
    h("a", { class: "btn secondary", href: "/resume/print", "aria-disabled": String(!r.name) }, icon("print"), "Preview PDF"),
    h("button", { class: "btn", type: "button", disabled: comp.missing > 2, onclick: scoreIt }, icon("doc"), "Score it in Studio"));

  const left = h("div", { class: "speak" }, assistant ? assistantPanel(r) : speakPanel(r));
  const fieldRows = [...comp.req.map(([k, ok]) => [k, ok, true]), ...comp.opt.map(([k, ok]) => [k, ok, false])].map(([k, ok, req]) => h("tr", null,
    h("td", null, k, req ? null : h("span", { class: "sub" }, "Optional")),
    h("td", { class: `st ${ok ? "s-cnf" : req ? "s-wl" : "muted"}` }, ok ? "CNF" : req ? "MISSING" : "—")));
  const right = h("div", { class: "stack", style: { "--gap": "18px" } },
    h("div", { class: "status-block" },
      h("div", { class: "code" }, h("span", { class: `pnr ${st.code.toLowerCase()}` }, st.code === "CNF" ? "CNF" : `${st.code} ${st.n}`)),
      h("div", { class: "what" }, h("b", null, comp.missing ? `Ready to send once ${comp.missing} required detail${comp.missing > 1 ? "s are" : " is"} in` : "Ready to send: every required detail is in"), h("span", null, comp.missing ? "Keep speaking, or let VARS ask for exactly what is missing." : "Polish the wording, then preview the PDF or score it in Resume Studio."),
        missingQuestions(r).length && !assistant ? h("div", { style: { marginTop: "10px" } }, h("button", { class: "btn sm", type: "button", onclick: () => { assistant = { questions: missingQuestions(r), index: 0 }; render(); } }, icon("chat"), "Ask me what's missing")) : null)),
    h("div", { class: "chart-wrap" }, h("table", { class: "chart fields" }, h("thead", null, h("tr", null, h("th", null, "Detail"), h("th", { style: { textAlign: "right" } }, "Status"))), h("tbody", null, fieldRows))),
    renderCV(r));
  mount(panel, h("div", { class: "build" }, left, right));
}

function speakPanel(r) {
  const meter = levelDots(26);
  const clock = h("span", { class: "rec-clock" }, "0:00");
  const info = h("div", null, h("b", null, "Tap and talk"), h("span", null, "Speak naturally in English, Malayalam or both. Stop when you finish a topic."));
  const mic = h("button", { class: "mic", type: "button", "aria-label": "Start recording" }, icon("mic"));
  const review = h("div");
  mic.addEventListener("click", async () => {
    if (recorder.recording) {
      cancelAnimationFrame(raf);
      clearInterval(clockTimer);
      mic.classList.remove("rec");
      mic.disabled = true;
      mount(info, h("b", null, "Transcribing…"), h("span", null, "Translating into English if you spoke Malayalam."));
      const rec = await recorder.stop();
      meter.set(0);
      mic.disabled = false;
      if (!rec || rec.seconds < 1) {
        mount(info, h("b", null, "That was too short"), h("span", null, "Tap the mic and try again."));
        return;
      }
      try {
        const form = new FormData();
        form.append("audio", rec.blob, `speech.${rec.ext}`);
        form.append("mode", "translate");
        const res = await api.upload("/api/speech/transcribe", form);
        mount(info, h("b", null, "Check the transcript"), h("span", null, "Fix names or numbers it misheard, then add it."));
        showReview(review, res.text);
      } catch (err) {
        mount(info, h("b", null, "Could not transcribe"), h("span", null, err.message));
      }
      return;
    }
    try {
      await recorder.start();
      mic.classList.add("rec");
      mic.setAttribute("aria-label", "Stop recording");
      mount(info, h("b", null, "Listening… tap again to stop"), h("span", null, "One topic at a time works best."));
      const t0 = performance.now();
      clearInterval(clockTimer);
      clockTimer = setInterval(() => { clock.textContent = fmtTime((performance.now() - t0) / 1000); }, 250);
      const loop = () => { meter.set(recorder.level()); raf = requestAnimationFrame(loop); };
      loop();
    } catch {
      toast("Microphone blocked. Allow it in the address bar, or type below.", "error");
    }
  });
  const typed = h("button", { class: "linkish small", type: "button", onclick: () => showReview(review, "") }, "Type instead");
  const prompts = h("div", { class: "prompts" }, PROMPTS.map(([key, title, sub, done]) => h("button", { type: "button", class: done(r) ? "done" : "", onclick: () => showReview(review, "", sub) },
    icon(done(r) ? "check" : "mic"), h("div", null, title, h("small", null, sub)), done(r) ? h("span", { class: "pnr-chip cnf" }, "CNF") : h("span"))));
  return [
    h("div", { class: "speak-panel" },
      h("h2", null, "Talk about one thing at a time"),
      h("div", { class: "big-mic" }, mic, h("div", { class: "stack", style: { "--gap": "8px" } }, info, meter), clock),
      review,
      h("div", { class: "row small" }, typed, h("span", { class: "muted" }, "· Audio is transcribed and discarded; nothing is stored.")),
    ),
    h("div", null, h("div", { class: "rule-title" }, "What to cover"), prompts),
  ];
}

function showReview(host, text, hint) {
  const ta = h("textarea", { class: "textarea", rows: 5, placeholder: hint ? `Say or type: ${hint}` : "What you said appears here. Edit anything that is wrong.", "aria-label": "Transcript" }, text);
  const add = h("button", { class: "btn", type: "button" }, icon("check"), "Add to my resume");
  const cancel = h("button", { class: "btn ghost", type: "button", onclick: () => clear(host) }, "Discard");
  add.addEventListener("click", async () => {
    const transcript = ta.value.trim();
    if (!transcript) return ta.focus();
    add.disabled = true;
    mount(host, tickerBlock("UPDATING RESUME", "Working out whether you added something or asked for a change."));
    try {
      const res = await api.post("/api/voice/process", { resume: resumeData(), transcript });
      saveResume(res.resume);
      const v = store.get("voice") || {};
      store.set("voice", { ...v, transcripts: [...(v.transcripts || []), transcript].slice(-30) });
      toast(res.action === "modify" ? "Change applied." : "Added to your resume.", "ok");
      const qs = missingQuestions(res.resume);
      if (res.action === "add" && qs.some((q) => q.required) && (v.transcripts || []).length >= 1) assistant = { questions: qs, index: 0 };
      render();
    } catch (err) {
      mount(host, h("div", { class: "note err" }, icon("warn"), err.message));
    }
  });
  mount(host, h("div", { class: "stack", style: { "--gap": "10px" } }, ta, h("div", { class: "row" }, add, cancel), h("p", { class: "tiny muted" }, "Tip: you can also ask for changes, like “remove MS Office from skills” or “make my summary shorter”.")));
  ta.focus();
}

function assistantPanel(r) {
  const { questions, index } = assistant;
  const q = questions[index];
  if (!q) {
    assistant = null;
    return speakPanel(r);
  }
  const current = q.path.split(".").reduce((a, k) => (a == null ? undefined : a[/^\d+$/.test(k) ? Number(k) : k]), r);
  const input = h("input", { class: "input", placeholder: q.ph, value: hasText(current) ? current : "", "aria-label": q.q });
  const err = h("p", { class: "err", role: "alert" });
  const next = h("button", { class: "btn", type: "button" }, index === questions.length - 1 ? "Save and finish" : "Next");
  const commit = () => {
    const raw = input.value.trim();
    const v = q.norm ? q.norm(raw) : raw;
    const ok = q.check(v);
    if (ok !== true) { err.textContent = ok; input.focus(); return; }
    const data = resumeData();
    if (v) setPath(data, q.path, v);
    saveResume(data);
    assistant.index += 1;
    if (assistant.index >= questions.length) { assistant = null; toast("Details saved.", "ok"); }
    render();
  };
  next.addEventListener("click", commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
  const meterHost = h("span");
  const voice = h("button", { class: "btn secondary", type: "button" }, icon("mic"), "Say it");
  voice.addEventListener("click", async () => {
    if (recorder.recording) {
      voice.disabled = true;
      const rec = await recorder.stop();
      mount(voice, icon("mic"), "Say it");
      try {
        const form = new FormData();
        form.append("audio", rec.blob, `a.${rec.ext}`);
        form.append("mode", "translate");
        const res = await api.upload("/api/speech/transcribe", form);
        input.value = q.norm ? q.norm(res.text.replace(/[.。]$/, "")) : res.text.replace(/[.。]$/, "");
      } catch (e) { err.textContent = e.message; }
      voice.disabled = false;
      return;
    }
    try { await recorder.start(); mount(voice, icon("stop"), "Stop"); } catch { err.textContent = "Microphone blocked; type it instead."; }
  });
  setTimeout(() => input.focus(), 30);
  return h("div", { class: "assistant", role: "group", "aria-label": "Missing details" },
    h("span", { class: "step" }, `DETAIL ${index + 1} OF ${questions.length}`),
    h("h3", null, q.q), h("p", { class: "small muted" }, q.hint), input, err,
    h("div", { class: "row" }, next, voice, meterHost,
      h("span", { class: "grow" }),
      index > 0 ? h("button", { class: "btn ghost sm", type: "button", onclick: () => { assistant.index -= 1; render(); } }, "Back") : null,
      q.required ? null : h("button", { class: "btn ghost sm", type: "button", onclick: () => { assistant.index += 1; if (assistant.index >= questions.length) assistant = null; render(); } }, "Skip"),
      h("button", { class: "btn ghost sm", type: "button", onclick: () => { assistant = null; render(); } }, "Close")));
}

async function polish() {
  mount(panel, tickerBlock("POLISHING", "Turning your words into action-led lines. Facts stay exactly as you said them."));
  try {
    const res = await api.post("/api/voice/refine", { resume: resumeData() });
    saveResume(res.resume);
    if (res.errors?.length) res.errors.forEach((e) => toast(e, "warn"));
    else toast("Wording polished. Check every line is still true.", "ok");
  } catch (err) {
    toast(err.message, "error");
  }
  render();
}

async function scoreIt() {
  mount(panel, tickerBlock("READING RESUME", "Scoring your voice-built resume line by line."));
  try {
    const { text } = await api.post("/api/voice/to-text", { resume: resumeData() });
    const analysis = await api.post("/api/resume/analyze", { text, target_role: store.get("resume")?.targetRole || null, file_name: "Voice-built resume" });
    store.set("resume", R.newResumeState(analysis, { source: "voice", fileName: "Voice-built resume" }));
    store.set("chat", []);
    location.assign("/studio");
  } catch (err) {
    toast(err.message, "error");
    render();
  }
}

boot();
