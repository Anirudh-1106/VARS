// Session store. Lives in sessionStorage: it survives a reload of this tab
// and disappears when the tab is closed. Nothing here is sent to the server
// except the pieces a request needs, and the server keeps none of it.

const KEY = "vars.session.v1";
const listeners = new Set();

function blank() {
  return {
    createdAt: Date.now(),
    resume: null,      // { source, fileName, text, lines, analysis, targetRole, fixed: {}, addedSkills: [], initial: {} }
    voice: null,       // { resume, transcripts: [] }
    chat: [],          // [{ role, content }]
    jd: null,          // { text, result }
    interview: null,   // active or last interview session
    reports: [],       // finished reports (newest first)
    prefs: { persona: "meera", hrPersona: "arjun", review: true, captions: true, camera: false },
  };
}

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...JSON.parse(raw) };
  } catch {
    return blank();
  }
}

let state = load();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Session storage is full or blocked", err);
    }
  }, 60);
}

export const store = {
  get state() {
    return state;
  },
  get(key) {
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    persist();
    listeners.forEach((fn) => fn(state, key));
  },
  patch(key, partial) {
    state[key] = { ...(state[key] || {}), ...partial };
    persist();
    listeners.forEach((fn) => fn(state, key));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  flush() {
    clearTimeout(saveTimer);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  },
  clear() {
    state = blank();
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    listeners.forEach((fn) => fn(state, "*"));
  },
};

window.addEventListener("pagehide", () => store.flush());
