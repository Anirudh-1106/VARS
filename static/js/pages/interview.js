import { api } from "../core/api.js";
import { store } from "../core/store.js";
import { $, clear, confirmDialog, fmtTime, h, icon, mount, renderMarkdown, tickerBlock, toast } from "../core/ui.js";
import * as R from "../core/resume-model.js";
import { avatarThumb, createAvatar, PERSONAS, roleOf, SEATS } from "../lib/avatar.js";
import { Recorder, levelDots } from "../lib/recorder.js";
import { Speaker } from "../lib/speaker.js";
import { CodeRunner, LANGS, STARTERS } from "../lib/coderunner.js";

const app = $("#app");
const params = new URLSearchParams(location.search);

let catalog = [];
let caps = {};
let drive = null;

const speaker = new Speaker();
const recorder = new Recorder();
let runner = null;
let avatar = null;
let miniAvatar = null;
let rafId = 0;
let camStream = null;
let clockTimer = 0;

const ACKS = ["Okay.", "Right.", "Got it.", "Alright.", "Fair enough.", "Okay, thank you."];
const MAX_FOLLOWUPS = { fresher: 1, intern: 1, stretch: 2 };

// ── session helpers ─────────────────────────────────────────────────────
const S = () => store.get("interview");
function saveSession(s) {
  // The transcript log is only ever appended through logLine(); keep the
  // newest copy even when a caller saves an older session object.
  const live = S();
  const log = live && (live.log || []).length > (s.log || []).length ? live.log : s.log;
  store.set("interview", { ...s, log });
}

function roundQuestions(s, round) {
  return s.questions.filter((q) => q.round === round);
}

function stagesFor(s) {
  const out = [];
  if (roundQuestions(s, "technical").length) out.push("technical");
  if (s.coding.length) out.push("coding");
  if (roundQuestions(s, "hr").length) out.push("hr");
  return out;
}

function personaFor(s, stage) {
  return stage === "hr" ? s.config.hr : s.config.tech;
}

// ── boot ────────────────────────────────────────────────────────────────
async function boot() {
  mount(app, h("div", { class: "page-body" }, tickerBlock("LOADING")));
  try {
    const [roles, problems] = await Promise.all([api.get("/api/roles"), api.get("/api/code/problems")]);
    catalog = roles.roles;
    caps = problems.capabilities;
  } catch (err) {
    mount(app, h("div", { class: "page-body" }, h("div", { class: "note err" }, icon("warn"), err.message)));
    return;
  }
  const token = params.get("drive");
  if (token) {
    try {
      const res = await api.post("/api/verify", { kind: "drive", token });
      if (res.valid) drive = { ...res.payload, sig: res.sig };
      else toast("This drive link is not valid. Ask your placement cell for a new one.", "error");
    } catch (err) {
      toast(err.message, "error");
    }
  }
  const s = S();
  if (s && s.status === "live" && !token) renderResumePrompt(s);
  else renderSetup();
}

// ── setup ───────────────────────────────────────────────────────────────
function defaultConfig() {
  const rs = store.get("resume");
  const prefs = store.get("prefs") || {};
  return {
    role: params.get("role") || rs?.targetRole || "sde-service",
    company: "service",
    level: "fresher",
    counts: { technical: 5, coding: 1, hr: 3 },
    tech: SEATS.tech.includes(prefs.persona) ? prefs.persona : "meera",
    hr: SEATS.hr.includes(prefs.hrPersona) && prefs.hrPersona !== prefs.persona ? prefs.hrPersona : "arjun",
    review: prefs.review !== false,
    captions: prefs.captions !== false,
    camera: !!prefs.camera,
    answerMode: "voice",
  };
}

function estimate(cfg) {
  return Math.round(cfg.counts.technical * 3 + cfg.counts.hr * 2.5 + cfg.counts.coding * 15 + 1);
}

function faceThumb(key) {
  return avatarThumb(key);
}

function renderSetup() {
  document.body.classList.remove("in-room");
  const cfg = defaultConfig();
  if (drive) {
    Object.assign(cfg, { role: drive.role, company: drive.company, level: drive.level, counts: { ...cfg.counts, ...drive.counts } });
  }
  const locked = !!drive;
  const rs = store.get("resume");
  const resumeData = rs?.analysis?.structured || store.get("voice")?.resume || null;

  const form = h("div", { class: "setup-form" });
  const passEl = h("aside", { class: "pass", "aria-label": "Interview pass" });

  const paint = () => {
    clear(form);
    const roleSel = h("select", { class: "select", disabled: locked, "aria-label": "Target role" });
    for (const fam of [...new Set(catalog.map((r) => r.family))]) {
      const g = h("optgroup", { label: fam });
      catalog.filter((r) => r.family === fam).forEach((r) => g.append(h("option", { value: r.id, selected: r.id === cfg.role }, r.title)));
      roleSel.append(g);
    }
    roleSel.addEventListener("change", () => { cfg.role = roleSel.value; paint(); });

    const choice = (key, options) => h("div", { class: "opt-grid", role: "group" }, options.map(([value, title, sub]) =>
      h("button", { type: "button", class: "opt-card", "aria-pressed": String(cfg[key] === value), disabled: locked, onclick: () => { cfg[key] = value; paint(); } }, h("b", null, title), sub)));

    const counter = (key, title, sub, min, max) => h("div", { class: "counter" }, h("div", null, h("b", null, title), h("span", null, sub)),
      h("div", { class: "stepper" },
        h("button", { type: "button", "aria-label": `Fewer ${title}`, disabled: locked || cfg.counts[key] <= min, onclick: () => { cfg.counts[key] -= 1; paint(); } }, "−"),
        h("output", { "aria-live": "polite" }, cfg.counts[key]),
        h("button", { type: "button", "aria-label": `More ${title}`, disabled: locked || cfg.counts[key] >= max, onclick: () => { cfg.counts[key] += 1; paint(); } }, "+")));

    const persona = (slot, keys) => h("div", { class: "persona-row" }, keys.map((k) => h("button", { type: "button", class: "persona", "aria-pressed": String(cfg[slot] === k), onclick: () => {
      cfg[slot] = k;
      // One person cannot sit in both seats of the same panel.
      const other = slot === "tech" ? "hr" : "tech";
      if (cfg[other] === k) cfg[other] = SEATS[other].find((x) => x !== k);
      paint();
    } },
      faceThumb(k), h("div", null, h("b", null, PERSONAS[k].name), h("span", null, `${roleOf(k, slot === "tech" ? "tech" : "hr")} · ${PERSONAS[k].voice}`)))));

    const javaOk = caps.java?.server;
    form.append(
      h("fieldset", null, h("legend", null, "The role"), roleSel,
        h("p", { class: "small muted" }, catalog.find((r) => r.id === cfg.role)?.summary || "")),
      h("fieldset", null, h("legend", null, "Company style"), choice("company", [
        ["service", "Service company", "Mass drive: fundamentals and clarity"],
        ["product", "Product company", "Depth, trade-offs, ownership"],
        ["startup", "Startup", "Breadth and shipping end to end"]])),
      h("fieldset", null, h("legend", null, "Difficulty"), choice("level", [
        ["fresher", "Fresher", "Fair for a final-year student"],
        ["intern", "Experienced intern", "Expects concrete detail"],
        ["stretch", "Stretch", "A demanding panel"]])),
      h("fieldset", null, h("legend", null, "Rounds"),
        counter("technical", "Technical questions", "From your resume and the role's fundamentals", 2, 8),
        counter("coding", "Coding problems", `Python and JavaScript run in your browser${javaOk ? "; Java runs on the server" : ""}`, 0, 2),
        counter("hr", "HR questions", "Behaviour, situations, motivation", 0, 5)),
      h("fieldset", null, h("legend", null, "Your panel"),
        h("span", { class: "label" }, "Technical and coding"), persona("tech", SEATS.tech),
        h("span", { class: "label", style: { marginTop: "6px" } }, "HR"), persona("hr", SEATS.hr)),
      h("fieldset", null, h("legend", null, "How you answer"),
        h("div", { class: "seg", role: "group", "aria-label": "Answer mode" },
          [["voice", "Speak (recommended)"], ["text", "Type"]].map(([v, l]) => h("button", { type: "button", "aria-pressed": String(cfg.answerMode === v), onclick: () => { cfg.answerMode = v; paint(); } }, l))),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: cfg.review, onchange: (e) => { cfg.review = e.target.checked; } }), h("span", null, "Let me check the transcript before it is sent")),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: cfg.camera, onchange: (e) => { cfg.camera = e.target.checked; } }), h("span", null, "Show my camera as a self-view (it never leaves this device)")),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: cfg.captions, onchange: (e) => { cfg.captions = e.target.checked; } }), h("span", null, "Show captions for the interviewer"))),
    );
    paintPass();
  };

  const meter = levelDots(22);
  let testing = false;
  const testMic = async (btn) => {
    if (testing) return;
    testing = true;
    btn.disabled = true;
    try {
      await recorder.open();
      const until = performance.now() + 5000;
      const loop = () => {
        meter.set(recorder.level());
        if (performance.now() < until) requestAnimationFrame(loop);
        else { meter.set(0); testing = false; btn.disabled = false; btn.textContent = "Test again"; }
      };
      loop();
    } catch {
      testing = false;
      btn.disabled = false;
      toast("Microphone access was blocked. Allow it in the address bar, or answer by typing.", "error");
    }
  };

  const paintPass = () => {
    const role = catalog.find((r) => r.id === cfg.role);
    const micBtn = h("button", { class: "btn sm secondary", type: "button", onclick: (e) => testMic(e.currentTarget) }, "Test microphone");
    const voiceBtn = h("button", { class: "btn sm secondary", type: "button", onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      speaker.unlock();
      await speaker.say(`Hi, I'm ${PERSONAS[cfg.tech].name.split(" ")[0]}. This is how I will sound in your interview.`, cfg.tech);
      btn.disabled = false;
    } }, icon("volume"), "Hear the voice");
    mount(passEl,
      h("div", { class: "pass-head" }, h("b", null, drive ? "MOCK DRIVE PASS" : "INTERVIEW PASS"), h("span", null, new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))),
      h("div", { class: "pass-row" }, h("div", null, h("small", null, "Candidate"), h("b", null, resumeData?.name || "You")), h("div", null, h("small", null, "Role"), h("b", null, role?.title || ""))),
      h("div", { class: "pass-row" },
        h("div", null, h("small", null, "Rounds"), h("b", null, [cfg.counts.technical && "Technical", cfg.counts.coding && "Coding", cfg.counts.hr && "HR"].filter(Boolean).join(" · "))),
        h("div", null, h("small", null, "About"), h("b", { class: "big" }, `${estimate(cfg)} min`))),
      h("div", { class: "pass-row" }, h("div", { style: { gridColumn: "1 / -1" } }, h("small", null, "Questions are based on"),
        resumeData ? h("b", null, rs?.fileName || "Your voice-built resume") : h("span", { class: "small" }, "The role only. ", h("a", { href: "/studio" }, "Add your resume"), " to be asked about your own projects."))),
      h("div", { class: "pass-checks" },
        h("div", { class: "check-row" }, h("div", null, h("b", null, "Microphone"), h("span", null, "Speak; the dots should move.")), micBtn),
        meter,
        h("div", { class: "check-row" }, h("div", null, h("b", null, "Interviewer voice"), h("span", null, "Use headphones so the mic does not pick it up.")), voiceBtn)),
      h("div", { class: "pass-foot" },
        h("button", { class: "btn lg", type: "button", onclick: () => begin(cfg, resumeData) }, icon("play"), "Begin interview"),
        h("p", { class: "tiny muted" }, "Your answers are transcribed and scored one at a time and nothing is kept on the server. The full interview stays in this tab until you close it.")));
  };

  paint();
  mount(app,
    h("div", { class: "page-head" }, h("h1", null, "Mock interview"), h("span", { class: "meta" }, "Technical · Coding · HR")),
    h("div", { class: "page-body" },
      drive ? h("div", { class: "drive-banner" }, h("span", { class: "pnr-chip" }, "DRIVE"), h("div", null, h("b", null, drive.name || "Mock drive"), h("div", { class: "small muted" }, `Set by ${drive.org || "your placement cell"}. Role, rounds and difficulty are fixed for this drive.`))) : null,
      h("div", { class: "setup" }, form, passEl)));
}

function renderResumePrompt(s) {
  const answered = s.questions.filter((q) => q.status === "done").length;
  mount(app,
    h("div", { class: "page-head" }, h("h1", null, "Mock interview")),
    h("div", { class: "page-body" }, h("div", { class: "empty" },
      h("h3", null, "You have an interview in progress"),
      h("p", null, `${s.plan.role_title}: ${answered} of ${s.questions.length} questions answered. Continue where you stopped, or finish now and get the report for what you answered.`),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => { speaker.unlock(); enterRoom(); resumeFlow(); } }, icon("play"), "Continue interview"),
        answered ? h("button", { class: "btn secondary", type: "button", onclick: () => finish(true) }, "Finish and get report") : null,
        h("button", { class: "btn ghost", type: "button", onclick: () => { store.set("interview", null); renderSetup(); } }, "Start a new one")))));
}

// ── begin ───────────────────────────────────────────────────────────────
async function begin(cfg, resumeData) {
  speaker.unlock();
  store.set("prefs", { ...(store.get("prefs") || {}), persona: cfg.tech, hrPersona: cfg.hr, review: cfg.review, captions: cfg.captions, camera: cfg.camera });
  if (cfg.answerMode === "voice") {
    try {
      await recorder.open();
    } catch {
      toast("Microphone blocked, so this interview will use typed answers. You can allow the mic and switch back.", "warn", { ms: 8000 });
      cfg.answerMode = "text";
    }
  }
  mount(app, h("div", { class: "page-body" }, tickerBlock("PREPARING YOUR PANEL", "Reading your resume and writing questions about your own projects.")));
  const role = catalog.find((r) => r.id === cfg.role);
  try {
    const body = {
      config: { role: cfg.role, company: cfg.company, level: cfg.level, counts: cfg.counts, tech_name: PERSONAS[cfg.tech].name.split(" ")[0], hr_name: PERSONAS[cfg.hr].name.split(" ")[0] },
      resume: resumeData,
    };
    if (drive) Object.assign(body.config, { drive: driveCore(drive), drive_sig: drive.sig });
    const plan = await api.post("/api/interview/plan", body);
    const problems = [];
    for (const p of plan.problems || []) problems.push(await api.get(`/api/code/problem/${p.id}`));
    const session = {
      id: Math.random().toString(36).slice(2, 10),
      status: "live",
      startedAt: Date.now(),
      elapsed: 0,
      config: { ...cfg, roleTitle: role?.title || plan.role_title, drive: drive ? { name: drive.name, org: drive.org, id: drive.id } : null },
      plan: { opening: plan.opening, coding_intro: plan.coding_intro, hr_intro: plan.hr_intro, closing: plan.closing, role_title: plan.role_title },
      questions: plan.questions.map((q) => ({ ...q, exchange: [], answers: [], evaluation: null, delivery: null, followUps: 0, status: "pending" })),
      coding: problems.map((p) => ({ problem: { id: p.id, title: p.title, difficulty: p.difficulty, topics: p.topics, statement: p.statement, input_format: p.input_format, output_format: p.output_format, constraints: p.constraints, expected: p.expected, samples: p.samples }, language: caps.python?.browser ? "python" : "java", code: null, results: null, review: null, runs: 0, minutes: 0, followup: null, status: "pending" })),
      cursor: { stage: "opening", index: 0 },
      log: [],
    };
    saveSession(session);
    speaker.prefetch(session.plan.opening, cfg.tech);
    if (session.questions[0]) speaker.prefetch(session.questions[0].ask, cfg.tech);
    ACKS.forEach((a) => speaker.prefetch(a, cfg.tech));
    if (problems.length && caps.python?.browser) {
      runner = new CodeRunner(caps);
      runner.preloadPython().catch(() => {});
    }
    enterRoom();
    resumeFlow();
  } catch (err) {
    toast(err.message, "error");
    renderSetup();
  }
}

function driveCore(d) {
  const { sig, ...rest } = d;
  return rest;
}

// ── room ────────────────────────────────────────────────────────────────
const ui = {};

function enterRoom() {
  const s = S();
  document.body.classList.add("in-room");
  avatar = createAvatar(personaFor(s, s.cursor.stage === "hr" ? "hr" : "technical"));
  ui.state = h("span", { class: "state" }, "READY");
  ui.plateName = h("b");
  ui.plateRole = h("span");
  ui.self = s.config.camera ? h("div", { class: "self" }, h("video", { autoplay: true, muted: true, playsinline: true }), h("span", null, "You")) : null;
  ui.tile = h("div", { class: "tile" }, avatar.el, ui.state, h("div", { class: "plate" }, ui.plateName, ui.plateRole), ui.self);
  ui.capWho = h("small");
  ui.capSaid = h("span");
  ui.capRest = h("span", { class: "rest" });
  ui.captions = h("div", { class: "captions", "aria-live": "polite", hidden: !s.config.captions }, ui.capWho, ui.capSaid, ui.capRest);
  ui.stage = h("div", { class: "stage" }, ui.tile, ui.captions);
  ui.qcard = h("div", { class: "qcard" });
  ui.answer = h("div", { class: "answer" });
  ui.log = h("div", { class: "log", "aria-label": "Interview transcript" });
  ui.side = h("div", { class: "side" }, ui.qcard, ui.answer, ui.log);
  ui.main = h("div", { class: "room-main" }, ui.stage, ui.side);
  ui.stations = h("div", { class: "stations", "aria-label": "Rounds" });
  ui.clock = h("span", { class: "clock", "aria-label": "Elapsed time" }, "0:00");
  const capBtn = h("button", { class: "tool", type: "button", "aria-pressed": String(s.config.captions), title: "Captions", onclick: () => {
    const cur = S();
    cur.config.captions = !cur.config.captions;
    saveSession(cur);
    capBtn.setAttribute("aria-pressed", String(cur.config.captions));
    ui.captions.hidden = !cur.config.captions;
  } }, icon("cc"), h("span", null, "Captions"));
  const camBtn = h("button", { class: "tool", type: "button", "aria-pressed": String(!!s.config.camera), title: "Self-view", onclick: () => toggleCamera(camBtn) }, icon(s.config.camera ? "camera" : "camera-off"), h("span", null, "Self-view"));
  const room = h("div", { class: "room" },
    h("div", { class: "room-top" },
      h("span", { class: "brand-mini" }, "VARS"),
      h("span", { class: "ctx" }, `${s.config.roleTitle} · ${{ service: "Service company", product: "Product company", startup: "Startup" }[s.config.company]}`),
      ui.stations,
      h("div", { class: "room-tools" }, ui.clock, capBtn, camBtn,
        h("button", { class: "end-btn", type: "button", onclick: endEarly }, icon("end"), h("span", null, "End interview")))),
    ui.main);
  mount(app, room);
  if (s.config.camera) startCamera();
  paintStations();
  paintPersona();
  paintLog();
  cancelAnimationFrame(rafId);
  const loop = (now) => {
    const energy = speaker.sample();
    const mic = recorder.recording ? recorder.level() : 0;
    const viseme = speaker.viseme();
    avatar?.frame(now, energy, mic, viseme);
    miniAvatar?.frame(now, energy, mic, viseme);
    if (ui.meter && recorder.recording) ui.meter.set(mic);
    if (speaker.speaking && ui.capText) paintCaption(speaker.progress());
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
  clearInterval(clockTimer);
  const t0 = Date.now() - (s.elapsed || 0) * 1000;
  clockTimer = setInterval(() => {
    const cur = S();
    if (!cur || cur.status !== "live") return;
    const secs = (Date.now() - t0) / 1000;
    ui.clock.textContent = fmtTime(secs);
    cur.elapsed = secs;
    store.state.interview.elapsed = secs;
  }, 1000);
  document.addEventListener("keydown", onKey);
}

async function startCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
    const v = ui.self?.querySelector("video");
    if (v) v.srcObject = camStream;
  } catch {
    toast("Camera blocked. The interview continues without a self-view.", "warn");
    ui.self?.remove();
    ui.self = null;
  }
}

function stopCamera() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
}

function toggleCamera(btn) {
  const s = S();
  s.config.camera = !s.config.camera;
  saveSession(s);
  btn.setAttribute("aria-pressed", String(s.config.camera));
  mount(btn, icon(s.config.camera ? "camera" : "camera-off"), h("span", null, "Self-view"));
  if (s.config.camera) {
    ui.self = h("div", { class: "self" }, h("video", { autoplay: true, muted: true, playsinline: true }), h("span", null, "You"));
    ui.tile.append(ui.self);
    startCamera();
  } else {
    stopCamera();
    ui.self?.remove();
    ui.self = null;
  }
}

function paintStations() {
  const s = S();
  const list = stagesFor(s);
  const idx = list.indexOf(s.cursor.stage);
  mount(ui.stations, list.map((st, i) => h("span", { class: `station ${s.cursor.stage === "closing" || s.cursor.stage === "done" || i < idx ? "done" : i === idx ? "now" : ""}`, "aria-current": i === idx ? "step" : null }, h("i"), h("span", null, { technical: "Technical", coding: "Coding", hr: "HR" }[st]))));
}

function paintPersona() {
  const s = S();
  const seat = s.cursor.stage === "hr" || s.cursor.stage === "closing" ? "hr" : "tech";
  const key = seat === "hr" ? s.config.hr : s.config.tech;
  avatar.setPersona(key);
  ui.plateName.textContent = PERSONAS[key].name;
  ui.plateRole.textContent = roleOf(key, seat);
}

function setMode(mode) {
  avatar?.setMode(mode);
  miniAvatar?.setMode(mode);
  if (ui.state) {
    ui.state.className = `state ${mode}`;
    ui.state.textContent = { speaking: "SPEAKING", listening: "LISTENING", thinking: "THINKING", idle: "READY" }[mode] || "READY";
  }
}

function paintCaption(progress) {
  const words = ui.capText.split(/\s+/);
  const n = Math.round(words.length * Math.min(1, progress * 1.04));
  ui.capSaid.textContent = words.slice(0, n).join(" ") + (n < words.length ? " " : "");
  ui.capRest.textContent = words.slice(n).join(" ");
}

function logLine(who, text, sep) {
  const s = S();
  s.log = [...(s.log || []), { who, text, sep: sep || null }];
  saveSession(s);
  paintLog();
}

function paintLog() {
  const s = S();
  if (!ui.log) return;
  clear(ui.log);
  for (const item of s.log || []) {
    if (item.sep) ui.log.append(h("div", { class: "log-sep" }, item.sep));
    if (item.text) ui.log.append(h("div", { class: `log-item ${item.who === "you" ? "me" : ""}` }, h("span", { class: "who" }, item.who === "you" ? "YOU" : item.who.toUpperCase()), h("div", null, item.text)));
  }
  ui.log.scrollTop = ui.log.scrollHeight;
}

async function speak(text, personaKey, whoLabel) {
  if (!text) return;
  ui.capText = text;
  ui.capWho.textContent = whoLabel.toUpperCase();
  ui.capSaid.textContent = "";
  ui.capRest.textContent = text;
  logLine(whoLabel, text);
  setMode("thinking");
  await speaker.say(text, personaKey, { onStart: () => setMode("speaking") });
  ui.capSaid.textContent = text;
  ui.capRest.textContent = "";
  setMode("idle");
}

// Speak a sequence of parts (e.g. a cached acknowledgement then the next question).
async function speakParts(parts, personaKey, whoLabel) {
  const full = parts.filter(Boolean).join(" ");
  ui.capText = full;
  ui.capWho.textContent = whoLabel.toUpperCase();
  ui.capSaid.textContent = "";
  ui.capRest.textContent = full;
  logLine(whoLabel, full);
  let done = "";
  for (const part of parts.filter(Boolean)) {
    setMode("thinking");
    ui.capText = part;
    await speaker.say(part, personaKey, { onStart: () => setMode("speaking") });
    done = `${done} ${part}`.trim();
  }
  ui.capText = full;
  ui.capSaid.textContent = full;
  ui.capRest.textContent = "";
  setMode("idle");
}

// ── flow ────────────────────────────────────────────────────────────────
function firstName(key) {
  return PERSONAS[key].name.split(" ")[0];
}

async function resumeFlow() {
  const s = S();
  const stage = s.cursor.stage;
  if (stage === "opening") {
    logLine("", "", "Technical round");
    await speak(s.plan.opening, s.config.tech, firstName(s.config.tech));
    const cur = S();
    cur.cursor = { stage: stagesFor(cur)[0] || "closing", index: 0 };
    saveSession(cur);
    paintStations();
    return resumeFlow();
  }
  if (stage === "technical" || stage === "hr") {
    const qs = roundQuestions(s, stage);
    const q = qs[s.cursor.index];
    if (!q) return advanceStage();
    const p = personaFor(s, stage);
    paintPersona();
    if (!q.exchange.length) {
      q.exchange.push({ who: "interviewer", text: q.ask });
      saveSession(s);
      showQuestion(q);
      await speak(q.ask, p, firstName(p));
    } else {
      showQuestion(q);
      const last = [...q.exchange].reverse().find((t) => t.who === "interviewer");
      if (last) await speak(last.text, p, firstName(p));
    }
    prefetchNext(stage, s.cursor.index);
    return listen(q);
  }
  if (stage === "coding") return runCoding();
  if (stage === "closing") return closing();
  if (stage === "done") return finish(false);
}

function prefetchNext(stage, index) {
  const s = S();
  const qs = roundQuestions(s, stage);
  const next = qs[index + 1];
  if (next) speaker.prefetch(next.ask, personaFor(s, stage));
}

function nextStageAfter(s, stage) {
  const list = stagesFor(s);
  const i = list.indexOf(stage);
  return list[i + 1] || "closing";
}

async function advanceStage() {
  const s = S();
  const next = nextStageAfter(s, s.cursor.stage);
  s.cursor = { stage: next, index: 0 };
  saveSession(s);
  paintStations();
  if (next === "hr") {
    logLine("", "", "HR round");
    paintPersona();
    const first = roundQuestions(s, "hr")[0];
    if (first) {
      first.exchange.push({ who: "interviewer", text: first.ask });
      saveSession(s);
      showQuestion(first);
      ACKS.forEach((a) => speaker.prefetch(a, s.config.hr));
      speaker.prefetch(first.ask, s.config.hr);
      await speakParts([s.plan.hr_intro, first.ask], s.config.hr, firstName(s.config.hr));
      prefetchNext("hr", 0);
      return listen(first);
    }
  }
  if (next === "coding") logLine("", "", "Coding round");
  return resumeFlow();
}

function showQuestion(q) {
  const s = S();
  const qs = roundQuestions(s, q.round);
  const i = qs.indexOf(q);
  mount(ui.qcard,
    h("div", { class: "qhead" }, h("span", { class: "qid" }, q.id.toUpperCase()), h("span", null, `${q.round === "hr" ? "HR" : "Technical"} · question ${i + 1} of ${qs.length}`), q.followUps ? h("span", { class: "pnr-chip rac" }, `FOLLOW-UP ${q.followUps}`) : null),
    h("h2", null, [...q.exchange].reverse().find((t) => t.who === "interviewer")?.text || q.ask),
    q.grounding ? h("p", { class: "ground" }, h("b", null, "Based on: "), q.grounding) : null);
}

// ── answering ───────────────────────────────────────────────────────────
let answerStart = 0;
let answerTimer = 0;
let pendingAnswer = null;

function listen(q, opts = {}) {
  const s = S();
  setMode("listening");
  pendingAnswer = { q, resolve: null, ...opts };
  const voice = s.config.answerMode === "voice";
  ui.meter = levelDots(26);
  ui.answerClock = h("span", { class: "answer-clock", "aria-label": "Answer time" }, "0:00");
  const mic = h("button", { class: "mic", type: "button", "aria-label": "Start answering", title: "Start or stop answering (Space)", onclick: () => toggleRecord(mic) }, icon("mic"));
  ui.mic = mic;
  const info = h("div", { class: "mic-info" }, h("b", null, "Tap to answer"), h("span", null, "Aim for one to two minutes. Press Space to start and stop."));
  ui.micInfo = info;
  const typeBtn = h("button", { class: "btn sm ghost", type: "button", onclick: () => typedAnswer(q) }, icon("keyboard"), "Type instead");
  const skip = h("button", { class: "btn sm ghost", type: "button", onclick: () => skipQuestion(q) }, icon("skip"), "Skip");
  const repeat = h("button", { class: "btn sm ghost", type: "button", onclick: async () => {
    const last = [...q.exchange].reverse().find((t) => t.who === "interviewer");
    const p = personaFor(S(), q.round);
    setMode("speaking");
    await speaker.say(last.text, p, { onStart: () => setMode("speaking") });
    setMode("listening");
  } }, icon("refresh"), "Repeat question");
  if (voice) {
    mount(ui.answer, h("div", { class: "mic-row" }, mic, h("div", { class: "stack", style: { "--gap": "6px" } }, info, ui.meter), ui.answerClock), h("div", { class: "answer-actions" }, repeat, typeBtn, h("span", { class: "grow" }), skip));
  } else {
    typedAnswer(q, { repeat, skip });
  }
}

function typedAnswer(q, extra = {}) {
  recorder.cancel();
  const ta = h("textarea", { class: "textarea", placeholder: "Type your answer as you would say it…", "aria-label": "Your answer" });
  const send = h("button", { class: "btn", type: "button", onclick: () => {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    submitAnswer(q, text, null);
  } }, icon("send"), "Send answer");
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send.click(); });
  const voiceBtn = S().config.answerMode === "voice" || recorder.stream ? h("button", { class: "btn sm ghost", type: "button", onclick: () => listen(q) }, icon("mic"), "Speak instead") : null;
  mount(ui.answer, h("div", { class: "transcript-box" }, ta), h("div", { class: "answer-actions" }, send, voiceBtn, h("span", { class: "grow" }), h("span", { class: "tiny muted" }, h("span", { class: "kbd" }, "Ctrl"), " + ", h("span", { class: "kbd" }, "Enter")), extra.skip || h("button", { class: "btn sm ghost", type: "button", onclick: () => skipQuestion(q) }, icon("skip"), "Skip")));
  ta.focus();
}

async function toggleRecord(btn) {
  if (!pendingAnswer) return;
  if (recorder.recording) {
    clearInterval(answerTimer);
    btn.classList.remove("rec");
    btn.disabled = true;
    mount(ui.micInfo, h("b", null, "Transcribing…"), h("span", null, "Turning your answer into text."));
    const rec = await recorder.stop();
    ui.meter?.set(0);
    if (!rec || rec.seconds < 0.8) {
      btn.disabled = false;
      mount(ui.micInfo, h("b", null, "That was too short"), h("span", null, "Tap the mic and answer again."));
      return;
    }
    setMode("thinking");
    try {
      const form = new FormData();
      form.append("audio", rec.blob, `answer.${rec.ext}`);
      form.append("mode", "transcribe");
      const res = await api.upload("/api/speech/transcribe", form);
      const delivery = { ...res.delivery, seconds: res.delivery.seconds || Math.round(rec.seconds) };
      if (S().config.review) reviewTranscript(pendingAnswer.q, res.text, delivery);
      else submitAnswer(pendingAnswer.q, res.text, delivery);
    } catch (err) {
      setMode("listening");
      btn.disabled = false;
      mount(ui.micInfo, h("b", null, "Could not transcribe"), h("span", null, err.message));
    }
    return;
  }
  try {
    speaker.stop();
    await recorder.start();
    btn.classList.add("rec");
    btn.setAttribute("aria-label", "Stop answering");
    mount(ui.micInfo, h("b", null, "Listening… tap again when you finish"), h("span", null, "Take a breath before you start; a short pause is fine."));
    setMode("listening");
    answerStart = performance.now();
    clearInterval(answerTimer);
    answerTimer = setInterval(() => {
      const secs = (performance.now() - answerStart) / 1000;
      ui.answerClock.textContent = fmtTime(secs);
      ui.answerClock.classList.toggle("warn", secs > 150);
    }, 250);
  } catch {
    toast("Microphone blocked. Allow it in the address bar or type your answer.", "error");
  }
}

function reviewTranscript(q, text, delivery) {
  setMode("listening");
  const ta = h("textarea", { class: "textarea", "aria-label": "Transcript of your answer" }, text);
  const send = h("button", { class: "btn", type: "button", onclick: () => submitAnswer(q, ta.value.trim() || text, delivery) }, icon("send"), "Send answer");
  const again = h("button", { class: "btn sm secondary", type: "button", onclick: () => listen(q) }, icon("mic"), "Record again");
  const stats = [delivery?.wpm ? `${delivery.wpm} words a minute` : null, delivery?.filler_total ? `${delivery.filler_total} filler word${delivery.filler_total > 1 ? "s" : ""}` : "no filler words", `${fmtTime(delivery?.seconds || 0)} long`].filter(Boolean).join(" · ");
  mount(ui.answer,
    h("div", { class: "transcript-box" }, h("span", { class: "label" }, "Check what we heard"), ta, h("span", { class: "tiny muted" }, stats, ". Fix recognition mistakes only; the interviewer judges what you said.")),
    h("div", { class: "answer-actions" }, send, again));
  send.focus();
}

async function skipQuestion(q) {
  submitAnswer(q, "(The candidate skipped this question.)", null, true);
}

async function submitAnswer(q, text, delivery, skipped = false) {
  if (!pendingAnswer) return;
  pendingAnswer = null;
  clearInterval(answerTimer);
  recorder.cancel();
  const s = S();
  const live = s.questions.find((x) => x.id === q.id) || q;
  live.exchange.push({ who: "candidate", text });
  live.answers.push(skipped ? "" : text);
  if (delivery) live.delivery = mergeDelivery(live.delivery, delivery);
  saveSession(s);
  logLine("you", skipped ? "Skipped." : text);
  mount(ui.answer, h("div", { class: "row" }, h("span", { class: "ticker" }, "THINKING", h("span", { class: "dots" }, h("b"), h("b"), h("b"), h("b")))));
  setMode("thinking");

  const stage = s.cursor.stage;
  const qs = roundQuestions(s, stage);
  const idx = qs.findIndex((x) => x.id === live.id);
  const nextQ = qs[idx + 1] || null;
  const nextStage = nextStageAfter(s, stage);
  const p = personaFor(s, stage);
  let transition = "";
  if (!nextQ) {
    if (nextStage === "coding") transition = s.plan.coding_intro;
    else if (nextStage === "hr" && stage === "technical") transition = `That's all from my side. I'll hand you over to ${firstName(s.config.hr)} from HR.`;
  }
  const followLeft = skipped ? 0 : (MAX_FOLLOWUPS[s.config.level] || 1) - live.followUps;

  let res;
  try {
    res = await api.post("/api/interview/turn", {
      question: { kind: live.kind, ask: live.ask, grounding: live.grounding, rubric: live.rubric, probe: live.probe },
      exchange: live.exchange, follow_ups_left: followLeft, next_ask: nextQ ? nextQ.ask : "", transition,
      role_title: s.config.roleTitle, level: s.config.level, delivery: live.delivery || {},
    });
  } catch (err) {
    toast(`${err.message} Your answer is saved; moving on.`, "error");
    res = { evaluation: null, action: "next", ack: "Okay.", say: "" };
  }
  const cur = S();
  clear(ui.answer);
  const target = cur.questions.find((x) => x.id === live.id);
  const answeredBefore = target.answers.some((a) => a);
  if (res.evaluation) {
    if (skipped && !answeredBefore) target.evaluation = { ...res.evaluation, score: 0, verdict: "no_answer" };
    else if (skipped && target.evaluation) target.evaluation = { ...target.evaluation, gaps: [...(target.evaluation.gaps || []), "Skipped the follow-up question"].slice(0, 4) };
    else target.evaluation = res.evaluation;
  }
  if (res.action === "follow_up" && res.follow_up) {
    target.followUps += 1;
    target.exchange.push({ who: "interviewer", text: res.follow_up });
    saveSession(cur);
    showQuestion(target);
    await speakParts([res.ack && ACKS.includes(res.ack) ? res.ack : null, res.follow_up], p, firstName(p));
    return listen(target);
  }
  target.status = "done";
  if (nextQ) {
    cur.cursor = { stage, index: idx + 1 };
    const nq = cur.questions.find((x) => x.id === nextQ.id);
    nq.exchange.push({ who: "interviewer", text: nextQ.ask });
    saveSession(cur);
    showQuestion(nq);
    await speakParts([res.ack || "Okay.", nextQ.ask], p, firstName(p));
    prefetchNext(stage, idx + 1);
    return listen(nq);
  }
  saveSession(cur);
  if (transition && nextStage !== "hr") {
    await speakParts([res.ack || "Okay.", nextStage === "coding" ? null : transition], p, firstName(p));
  } else {
    await speakParts([res.ack || "Okay.", transition], p, firstName(p));
  }
  return advanceStage();
}

function mergeDelivery(prev, d) {
  if (!prev) return d;
  const seconds = (prev.seconds || 0) + (d.seconds || 0);
  const words = (prev.words || 0) + (d.words || 0);
  const fillers = { ...(prev.fillers || {}) };
  for (const [k, v] of Object.entries(d.fillers || {})) fillers[k] = (fillers[k] || 0) + v;
  return { words, seconds, wpm: seconds >= 3 ? Math.round(words / (seconds / 60)) : null, fillers, filler_total: Object.values(fillers).reduce((a, b) => a + b, 0), long_pauses: [...(prev.long_pauses || []), ...(d.long_pauses || [])], lead_in: prev.lead_in };
}

function onKey(e) {
  if (e.code !== "Space") return;
  const tag = (document.activeElement?.tagName || "").toLowerCase();
  if (["textarea", "input", "select", "button"].includes(tag) || document.activeElement?.closest(".CodeMirror")) return;
  if (ui.mic && document.body.contains(ui.mic) && !ui.mic.disabled) {
    e.preventDefault();
    toggleRecord(ui.mic);
  }
}

// ── coding round ────────────────────────────────────────────────────────
let cm = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = h("script", { src });
    el.onload = resolve;
    el.onerror = reject;
    document.head.append(el);
  });
}

async function loadEditor() {
  if (window.CodeMirror) return true;
  const base = "https://cdn.jsdelivr.net/npm/codemirror@5.65.18";
  try {
    if (!document.querySelector(`link[href^="${base}"]`)) document.head.append(h("link", { rel: "stylesheet", href: `${base}/lib/codemirror.min.css` }));
    await loadScript(`${base}/lib/codemirror.min.js`);
    await Promise.all([
      loadScript(`${base}/mode/python/python.min.js`),
      loadScript(`${base}/mode/javascript/javascript.min.js`),
      loadScript(`${base}/mode/clike/clike.min.js`),
      loadScript(`${base}/addon/edit/matchbrackets.min.js`),
      loadScript(`${base}/addon/edit/closebrackets.min.js`),
      loadScript(`${base}/addon/selection/active-line.min.js`),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function runCoding() {
  const s = S();
  if (ui.qcard) clear(ui.answer);
  const item = s.coding[s.cursor.index];
  if (!item) return advanceStage();
  runner = runner || new CodeRunner(caps);
  if (!item.code) {
    item.code = STARTERS[item.language];
    item.startedAt = Date.now();
    saveSession(s);
  }
  const problem = await api.get(`/api/code/problem/${item.problem.id}`).catch(() => null);
  const editorOk = await loadEditor();

  miniAvatar = createAvatar(s.config.tech);
  ui.miniSay = h("p", null, "");
  const prob = h("div", { class: "prob" },
    h("div", { class: "mini-tile" }, miniAvatar.el, h("div", null, h("small", null, firstName(s.config.tech).toUpperCase()), ui.miniSay)),
    h("div", null, h("div", { class: "row small muted", style: { gap: "8px" } }, h("span", { class: "pnr-chip idle" }, item.problem.difficulty.toUpperCase()), item.problem.topics.join(" · ")), h("h2", { style: { marginTop: "8px" } }, item.problem.title)),
    h("div", { class: "stmt" }, item.problem.statement),
    h("div", null, h("h3", null, "Input"), h("p", { class: "fmt" }, item.problem.input_format)),
    h("div", null, h("h3", null, "Output"), h("p", { class: "fmt" }, item.problem.output_format)),
    h("div", null, h("h3", null, "Constraints"), h("p", { class: "fmt mono" }, item.problem.constraints)),
    item.problem.samples.map((smp, i) => h("div", null, h("h3", null, `Example ${i + 1}`), h("div", { class: "io", style: { gridTemplateColumns: "1fr 1fr" } }, h("div", null, h("small", null, "Input"), h("pre", null, smp.input)), h("div", null, h("small", null, "Output"), h("pre", null, smp.output))), smp.explain ? h("p", { class: "small muted", style: { marginTop: "4px" } }, smp.explain) : null)));

  const langSel = h("select", { class: "select", "aria-label": "Language" });
  for (const [key, meta] of Object.entries(LANGS)) {
    if (!runner.available(key)) continue;
    langSel.append(h("option", { value: key, selected: key === item.language }, meta.label));
  }
  const where = h("span", { class: "where" });
  const paintWhere = () => { where.textContent = ["python", "javascript"].includes(langSel.value) ? "Runs in your browser" : "Runs on the server in a throwaway folder"; };
  paintWhere();
  const editorHost = h("div", { class: "editor" });
  const consoleEl = h("div", { class: "console" }, h("div", { class: "empty" }, h("p", null, "Run the examples to test your code. Submit runs every hidden test too.")));
  const runBtn = h("button", { class: "btn secondary", type: "button" }, icon("play"), "Run examples");
  const submitBtn = h("button", { class: "btn", type: "button" }, icon("check"), "Submit solution");
  const ide = h("div", { class: "ide" },
    h("div", { class: "ide-bar" }, langSel, where, h("span", { class: "grow" }), h("span", { class: "tiny muted" }, "Runs before submit: ", h("b", { id: "runCount" }, String(item.runs)))),
    editorHost,
    h("div", { class: "ide-actions" }, runBtn, submitBtn, h("span", { class: "grow" }), h("button", { class: "btn sm ghost", type: "button", onclick: () => { if (cm) cm.setValue(STARTERS[langSel.value]); else editorHost.querySelector("textarea").value = STARTERS[langSel.value]; } }, "Reset code")),
    consoleEl);
  ui.main.replaceWith(ui.main = h("div", { class: "coding room-main", style: { gridTemplateColumns: "" } }, prob, ide));
  setMode("idle");

  let getCode;
  if (editorOk) {
    cm = window.CodeMirror(editorHost, {
      value: item.code, mode: LANGS[item.language].mode, theme: "vars", lineNumbers: true, indentUnit: 4, tabSize: 4,
      matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, viewportMargin: 20,
      extraKeys: { Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection(" ".repeat(c.getOption("indentUnit")))), "Ctrl-Enter": () => runBtn.click() },
    });
    getCode = () => cm.getValue();
    setTimeout(() => cm.refresh(), 50);
  } else {
    const ta = h("textarea", { class: "fallback", spellcheck: "false", "aria-label": "Code editor" }, item.code);
    editorHost.append(ta);
    getCode = () => ta.value;
  }
  const persist = () => { const cur = S(); cur.coding[cur.cursor.index].code = getCode(); cur.coding[cur.cursor.index].language = langSel.value; saveSession(cur); };
  cm?.on("change", () => persist());
  langSel.addEventListener("change", () => {
    const code = getCode();
    const wasStarter = Object.values(STARTERS).some((st) => st.trim() === code.trim());
    if (wasStarter) cm ? cm.setValue(STARTERS[langSel.value]) : (editorHost.querySelector("textarea").value = STARTERS[langSel.value]);
    cm?.setOption("mode", LANGS[langSel.value].mode);
    paintWhere();
    persist();
    if (langSel.value === "python") runner.preloadPython().catch(() => {});
  });

  const paintResults = (out, hidden) => {
    if (out.compileError) {
      mount(consoleEl, h("div", { class: "review-box" }, h("div", { class: "note err" }, icon("warn"), "Compilation failed"), h("pre", { class: "mono", style: { whiteSpace: "pre-wrap" } }, out.compileError)));
      return;
    }
    const passed = out.results.filter((r) => r.passed).length;
    const rows = out.results.map((r, i) => {
      const isSample = i < problem.samples.length;
      return h("tr", null,
        h("td", { class: "id" }, isSample ? `EX${i + 1}` : `T${i - problem.samples.length + 1}`),
        h("td", null, r.passed ? h("span", null, "Passed", h("span", { class: "sub" }, `${r.ms} ms`)) : h("div", null,
          r.timeout ? h("strong", null, "Time limit exceeded") : r.stderr ? h("strong", null, "Error") : h("strong", null, "Wrong answer"),
          isSample || !hidden ? h("div", { class: "io" }, h("div", null, h("small", null, "Input"), h("pre", null, r.input.slice(0, 400))), h("div", null, h("small", null, "Expected"), h("pre", null, (r.expected || "").slice(0, 400))), h("div", null, h("small", null, r.stderr ? "Error" : "Your output"), h("pre", null, (r.stderr || r.stdout || "(nothing)").slice(0, 600)))) : h("span", { class: "sub" }, "Hidden test: input not shown."))),
        h("td", { class: `st ${r.passed ? "s-cnf" : "s-wl"}` }, r.passed ? "PASS" : "FAIL"));
    });
    mount(consoleEl, h("div", { class: "review-box", style: { paddingBottom: "0" } }, h("div", { class: "row" }, h("span", { class: `pnr ${passed === out.results.length ? "cnf" : passed ? "rac" : "wl"}`, style: { fontSize: "26px" } }, `${passed}/${out.results.length}`), h("span", { class: "muted small" }, hidden ? "tests passed, including hidden ones" : "examples passed"))),
      h("table", { class: "chart" }, h("tbody", null, rows)));
  };

  runBtn.addEventListener("click", async () => {
    if (!problem) return toast("Could not load the tests for this problem.", "error");
    persist();
    runBtn.disabled = submitBtn.disabled = true;
    mount(consoleEl, h("div", { class: "review-box" }, h("span", { class: "ticker" }, langSel.value === "python" && !runner.pyReady ? "LOADING PYTHON" : "RUNNING", h("span", { class: "dots" }, h("b"), h("b"), h("b"), h("b")))));
    try {
      const out = await runner.run(langSel.value, getCode(), problem.samples);
      const cur = S();
      cur.coding[cur.cursor.index].runs += 1;
      saveSession(cur);
      $("#runCount").textContent = String(cur.coding[cur.cursor.index].runs);
      paintResults(out, false);
    } catch (err) {
      mount(consoleEl, h("div", { class: "review-box" }, h("div", { class: "note err" }, icon("warn"), err.message)));
    } finally {
      runBtn.disabled = submitBtn.disabled = false;
    }
  });

  submitBtn.addEventListener("click", async () => {
    if (!problem) return toast("Could not load the tests for this problem.", "error");
    const ok = await confirmDialog({ title: "Submit this solution?", body: "Your code runs against every hidden test, then the interviewer reviews it and asks you about it. You cannot edit it after submitting.", confirm: "Submit" });
    if (!ok) return;
    persist();
    runBtn.disabled = submitBtn.disabled = true;
    langSel.disabled = true;
    cm?.setOption("readOnly", true);
    mount(consoleEl, h("div", { class: "review-box" }, h("span", { class: "ticker" }, "RUNNING HIDDEN TESTS", h("span", { class: "dots" }, h("b"), h("b"), h("b"), h("b")))));
    const all = [...problem.samples, ...problem.tests];
    let out;
    try {
      out = await runner.run(langSel.value, getCode(), all, { problemId: problem.id, hidden: true });
    } catch (err) {
      out = { compileError: err.message, results: [] };
    }
    paintResults(out, true);
    const passed = out.results.filter((r) => r.passed).length;
    const failures = out.results.filter((r) => !r.passed).slice(0, 3).map((r) => ({ timeout: r.timeout, error: (r.stderr || "").slice(0, 300), input_size: (r.input || "").length }));
    const cur = S();
    const entry = cur.coding[cur.cursor.index];
    entry.results = { passed, total: all.length, failures, compile_error: out.compileError || null };
    entry.minutes = Math.round((Date.now() - (entry.startedAt || Date.now())) / 60000);
    entry.code = getCode();
    entry.language = langSel.value;
    entry.status = "submitted";
    saveSession(cur);
    setMode("thinking");
    ui.miniSay.textContent = "Reading your code…";
    let review;
    try {
      review = await api.post("/api/interview/code-review", { problem: { title: problem.title, statement: problem.statement, expected: problem.expected }, language: LANGS[entry.language].label, code: entry.code, results: entry.results, minutes: entry.minutes, runs: entry.runs });
    } catch (err) {
      review = { scores: { correctness: Math.round((10 * passed) / all.length), efficiency: 5, style: 5 }, complexity: { time: "?", space: "?" }, notes: [err.message], bugs: [], follow_up: "Walk me through your approach and its time complexity." };
    }
    const cur2 = S();
    cur2.coding[cur2.cursor.index].review = review;
    saveSession(cur2);
    consoleEl.append(h("div", { class: "review-box" }, h("div", { class: "rule-title" }, "Interviewer's notes"),
      h("p", { class: "small" }, `Your code: ${review.complexity.time} time, ${review.complexity.space} space. Best known: ${review.optimal || "—"}.`),
      h("ul", { class: "topic-list small" }, [...review.notes, ...review.bugs].map((n) => h("li", null, n)))));
    codeFollowUp(review.follow_up, passed, all.length);
  });

  const intro = s.cursor.index === 0 ? s.plan.coding_intro : `Here is one more problem: ${item.problem.title}.`;
  ui.miniSay.textContent = intro;
  logLine(firstName(s.config.tech), intro);
  setMode("thinking");
  await speaker.say(intro, s.config.tech, { onStart: () => setMode("speaking") });
  setMode("idle");
  ui.miniSay.textContent = "Take your time. Talk me through your approach in comments if it helps.";
}

async function codeFollowUp(question, passed, total) {
  const s = S();
  const p = s.config.tech;
  const lead = passed === total ? "Okay, that passes everything." : passed ? `Okay, ${passed} of ${total} tests pass.` : "Okay, that doesn't pass the tests yet.";
  ui.miniSay.textContent = `${lead} ${question}`;
  logLine(firstName(p), `${lead} ${question}`);
  setMode("thinking");
  await speaker.say(`${lead} ${question}`, p, { onStart: () => setMode("speaking") });
  setMode("listening");
  const q = { id: `c${s.cursor.index + 1}`, round: "technical", kind: "scenario", ask: question, grounding: "Your submitted code", rubric: ["Correct time and space complexity", "Names the bottleneck", "Proposes a concrete improvement or edge case"], probe: "", exchange: [{ who: "interviewer", text: question }], answers: [], evaluation: null, delivery: null, followUps: 0 };
  const bar = h("div", { class: "code-answer" });
  ui.main.querySelector(".ide").append(bar);
  const answered = await answerInline(bar, q);
  bar.remove();
  const cur = S();
  cur.coding[cur.cursor.index].followup = answered;
  cur.coding[cur.cursor.index].status = "done";
  const more = cur.coding[cur.cursor.index + 1];
  if (more) {
    cur.cursor = { stage: "coding", index: cur.cursor.index + 1 };
    saveSession(cur);
    cm = null;
    miniAvatar = null;
    return runCoding();
  }
  saveSession(cur);
  // leave the coding layout and continue
  cm = null;
  miniAvatar = null;
  ui.main.replaceWith(ui.main = h("div", { class: "room-main" }, ui.stage, ui.side));
  mount(ui.qcard, h("div", { class: "qhead" }, h("span", { class: "qid" }, "CODE")), h("h2", null, "Coding round complete."));
  clear(ui.answer);
  const next = nextStageAfter(cur, "coding");
  if (next === "hr") await speak(`Good. That's all from my side. I'll hand you over to ${firstName(cur.config.hr)} from HR.`, p, firstName(p));
  return advanceStage();
}

// A compact answer bar for questions asked inside the coding layout.
function answerInline(host, q) {
  return new Promise((resolve) => {
    const s = S();
    const ta = h("textarea", { class: "textarea", rows: 3, placeholder: "Answer by voice or type here…", "aria-label": "Your answer" });
    const mic = h("button", { class: "btn secondary", type: "button" }, icon("mic"), "Speak");
    const send = h("button", { class: "btn", type: "button" }, icon("send"), "Send answer");
    let delivery = null;
    mic.hidden = !recorder.stream && s.config.answerMode !== "voice";
    mic.addEventListener("click", async () => {
      if (recorder.recording) {
        mic.disabled = true;
        const rec = await recorder.stop();
        mount(mic, icon("mic"), "Speak");
        try {
          const form = new FormData();
          form.append("audio", rec.blob, `answer.${rec.ext}`);
          const res = await api.upload("/api/speech/transcribe", form);
          ta.value = `${ta.value} ${res.text}`.trim();
          delivery = res.delivery;
        } catch (err) {
          toast(err.message, "error");
        }
        mic.disabled = false;
        return;
      }
      try {
        await recorder.start();
        mount(mic, icon("stop"), "Stop");
      } catch {
        toast("Microphone blocked. Type your answer instead.", "error");
      }
    });
    send.addEventListener("click", async () => {
      const text = ta.value.trim();
      if (!text) return ta.focus();
      send.disabled = mic.disabled = true;
      q.exchange.push({ who: "candidate", text });
      q.answers.push(text);
      q.delivery = delivery;
      logLine("you", text);
      setMode("thinking");
      try {
        const res = await api.post("/api/interview/turn", { question: q, exchange: q.exchange, follow_ups_left: 0, next_ask: "", transition: "", role_title: s.config.roleTitle, level: s.config.level, delivery: delivery || {} });
        q.evaluation = res.evaluation;
        ui.miniSay.textContent = res.ack || "Okay.";
        await speaker.say(res.ack || "Okay.", s.config.tech, { onStart: () => setMode("speaking") });
      } catch (err) {
        toast(err.message, "error");
      }
      setMode("idle");
      resolve(q);
    });
    mount(host, h("span", { class: "label" }, q.ask), ta, h("div", { class: "answer-actions" }, send, mic));
    ta.focus();
  });
}

// ── closing & report ────────────────────────────────────────────────────
async function closing() {
  const s = S();
  ui.qcard && mount(ui.qcard, h("div", { class: "qhead" }, h("span", { class: "qid" }, "END")), h("h2", null, "That's the end of the interview."));
  ui.answer && clear(ui.answer);
  const p = stagesFor(s).includes("hr") ? s.config.hr : s.config.tech;
  if (avatar) avatar.setPersona(p);
  await speak(s.plan.closing, p, firstName(p));
  const cur = S();
  cur.cursor = { stage: "done", index: 0 };
  saveSession(cur);
  return finish(false);
}

async function endEarly() {
  const s = S();
  const answered = s.questions.some((q) => q.answers.length) || s.coding.some((c) => c.results);
  const ok = await confirmDialog({
    title: "End the interview now?",
    body: answered ? "You will get a report for the questions you answered. Unanswered questions are left out, not scored as zero." : "You have not answered anything yet, so there will be no report.",
    confirm: answered ? "End and get report" : "End interview",
    danger: true,
  });
  if (!ok) return;
  speaker.stop();
  recorder.cancel();
  if (!answered) {
    store.set("interview", null);
    teardown();
    renderSetup();
    return;
  }
  finish(true);
}

function teardown() {
  cancelAnimationFrame(rafId);
  clearInterval(clockTimer);
  clearInterval(answerTimer);
  document.removeEventListener("keydown", onKey);
  speaker.stop();
  recorder.close();
  stopCamera();
  Object.values(runner?.workers || {}).forEach((w) => w.terminate());
  document.body.classList.remove("in-room");
}

async function finish(early) {
  const s = S();
  teardown();
  mount(app, h("div", { class: "page-body finish" }, tickerBlock("CHART PREPARING", "Scoring every answer against its rubric and writing your debrief.")));
  const answeredQs = s.questions.filter((q) => q.answers.length);
  const codeQs = s.coding.filter((c) => c.followup?.evaluation).map((c) => ({ ...c.followup, round: "technical", kind: "scenario" }));
  const session = {
    role_title: s.config.roleTitle, company: s.config.company, level: s.config.level,
    questions: [...answeredQs, ...codeQs].map((q) => ({ id: q.id, round: q.round, kind: q.kind, ask: q.ask, answers: q.answers, evaluation: q.evaluation, delivery: q.delivery })),
    coding: s.coding.filter((c) => c.results).map((c) => ({ problem: { title: c.problem.title }, results: c.results, review: c.review })),
    resume_brief: store.get("resume")?.analysis?.structured ? { name: store.get("resume").analysis.structured.name, skills: store.get("resume").analysis.structured.skills, projects: (store.get("resume").analysis.structured.projects || []).map((p) => p.name) } : null,
  };
  let report;
  try {
    report = await api.post("/api/interview/report", { session });
  } catch (err) {
    mount(app, h("div", { class: "page-body" }, h("div", { class: "note err" }, icon("warn"), err.message),
      h("div", { class: "row", style: { marginTop: "14px" } }, h("button", { class: "btn", type: "button", onclick: () => finish(early) }, icon("refresh"), "Try again"))));
    return;
  }
  const entry = {
    id: s.id,
    createdAt: Date.now(),
    early,
    config: s.config,
    durationSec: Math.round(s.elapsed || 0),
    candidate: store.get("resume")?.analysis?.structured?.name || store.get("voice")?.resume?.name || null,
    questions: s.questions.map((q) => ({ id: q.id, round: q.round, kind: q.kind, ask: q.ask, grounding: q.grounding, exchange: q.exchange, answers: q.answers, evaluation: q.evaluation, delivery: q.delivery, status: q.status })),
    coding: s.coding.map((c) => ({ problem: { id: c.problem.id, title: c.problem.title, difficulty: c.problem.difficulty, expected: c.problem.expected }, language: c.language, code: c.code, results: c.results, review: c.review, minutes: c.minutes, runs: c.runs, followup: c.followup })),
    report,
  };
  const reports = [entry, ...(store.get("reports") || []).filter((r) => r.id !== entry.id)].slice(0, 6);
  store.set("reports", reports);
  const cur = S();
  cur.status = "done";
  saveSession(cur);
  store.flush();
  location.assign(`/report?id=${entry.id}`);
}

window.addEventListener("beforeunload", (e) => {
  const s = S();
  if (s && s.status === "live" && document.body.classList.contains("in-room")) {
    e.preventDefault();
    e.returnValue = "";
  }
});

boot();
