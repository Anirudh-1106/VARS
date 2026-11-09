import { createPhotoAvatar } from "./photo-avatar.js";
import { createVideoAvatar } from "./video-avatar.js";
import { createVisemeAvatar } from "./viseme-avatar.js";

// Illustrated interviewer: a flat SVG bust that blinks, breathes, lip-syncs
// to the voice's audio energy, nods while the candidate speaks and looks down
// at its notes while thinking.

const NS = "http://www.w3.org/2000/svg";

export const PERSONAS = {
  meera: {
    name: "Meera Nair", voice: "Indian English", gender: "female",
    roles: { tech: "Senior backend engineer", hr: "HR lead" },
    visemes: { base: "/static/img/avatars/meera-idle.jpg", sheet: "/static/img/avatars/meera-visemes.png", meta: "/static/img/avatars/meera-visemes.json", focus: { x: 380, y: 360 }, face: { x: 262, y: 150, w: 236, h: 270 } },
    video: { poster: "/static/img/avatars/meera-idle.jpg", talkWebm: "/static/video/meera-talk.webm", talk: "/static/video/meera-talk.mp4" },
    photo: {
      src: "/static/img/avatars/meera.jpg", w: 734, h: 765,
      focus: { x: 367, y: 382 },
      face: { x: 249, y: 165, w: 240, h: 285 },
      lidTop: 229,
      eyes: [
        { cx: 307.5, cy: 257, rx: 28.5, ry: 15 },
        { cx: 431, cy: 258, rx: 30, ry: 15 },
      ],
      mouth: { cx: 367, y: 352, halfW: 52, chin: 418, maxOpen: 9 },
    },
  },
  daniel: { name: "Daniel Price", voice: "British English", gender: "male", roles: { tech: "Engineering manager", hr: "People partner" }, skin: "#DDB092", shade: "#C2927A", hair: "#4B3427", hairStyle: "side", jacket: "#4E4C58", lapel: "#3D3B46", shirt: "#FFFFFF", glasses: false },
  arjun: { name: "Arjun Varma", voice: "Indian English", gender: "male", roles: { tech: "Tech lead", hr: "HR partner" }, skin: "#8B5A3C", shade: "#714630", hair: "#1A1517", hairStyle: "short", jacket: "#2E2D36", lapel: "#22212A", shirt: "#DDEAD6", glasses: false, stubble: true },
};

// Who can sit in which seat of the panel.
export const SEATS = { tech: ["meera", "daniel"], hr: ["arjun", "meera"] };

export function roleOf(key, seat) {
  const p = PERSONAS[key] || PERSONAS.meera;
  return p.roles[seat] || p.roles.tech;
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

const HAIR_BACK = {
  bun: (g, c) => el("circle", { cx: 160, cy: 64, r: 25, fill: c }, g),
  long: (g, c) => el("path", { d: "M96 132 C92 80 124 56 160 56 C196 56 228 80 224 132 L232 252 C214 266 196 264 186 256 L184 160 L136 160 L134 256 C124 264 106 266 88 252 Z", fill: c }, g),
  short: () => null,
  side: () => null,
};

const HAIR_FRONT = {
  bun: "M101 140 C96 88 124 64 160 64 C196 64 224 88 219 140 C214 116 200 100 166 98 L160 92 L154 98 C120 100 106 116 101 140 Z",
  long: "M100 146 C94 92 124 64 160 64 C196 64 226 92 220 146 C216 118 204 100 184 94 C166 108 132 110 114 104 C106 114 102 128 100 146 Z",
  short: "M103 132 C98 88 126 66 162 66 C196 66 222 88 217 128 C213 112 206 101 195 96 C176 105 140 103 121 96 C111 104 105 116 103 132 Z",
  side: "M103 136 C98 86 128 64 164 66 C198 68 222 92 217 132 C210 108 196 96 178 94 C164 102 132 108 112 104 C106 112 104 122 103 136 Z",
};

function createSvgAvatar(personaKey) {
  const svg = el("svg", { viewBox: "0 0 320 340", class: "avatar", role: "img" });
  const state = { mode: "idle", open: 0, blink: 0, nextBlink: performance.now() + 1800, blinkAt: 0, nod: 0, nodPhase: 0, persona: null };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let parts = {};

  function build(key) {
    const p = PERSONAS[key] || PERSONAS.daniel;
    state.persona = key;
    svg.replaceChildren();
    svg.setAttribute("aria-label", p.name);
    const torso = el("g", {}, svg);
    el("path", { d: "M26 340 C30 294 66 266 118 256 L202 256 C254 266 290 294 294 340 Z", fill: p.jacket }, torso);
    el("path", { d: "M130 256 L160 320 L190 256 Z", fill: p.shirt }, torso);
    el("path", { d: "M118 256 L160 320 L140 340 L100 340 C104 300 110 274 118 256 Z", fill: p.lapel }, torso);
    el("path", { d: "M202 256 L160 320 L180 340 L220 340 C216 300 210 274 202 256 Z", fill: p.lapel }, torso);
    el("path", { d: "M137 206 L183 206 L185 258 Q160 278 135 258 Z", fill: p.shade }, svg);

    const head = el("g", {}, svg);
    HAIR_BACK[p.hairStyle]?.(head, p.hair);
    el("ellipse", { cx: 104, cy: 146, rx: 8.5, ry: 13, fill: p.shade }, head);
    el("ellipse", { cx: 216, cy: 146, rx: 8.5, ry: 13, fill: p.shade }, head);
    if (p.earrings) {
      el("circle", { cx: 103, cy: 162, r: 2.8, fill: "#9A6200" }, head);
      el("circle", { cx: 217, cy: 162, r: 2.8, fill: "#9A6200" }, head);
    }
    el("path", { d: "M104 136 C104 92 128 72 160 72 C192 72 216 92 216 136 C216 186 192 216 160 218 C128 216 104 186 104 136 Z", fill: p.skin }, head);
    if (p.stubble) el("path", { d: "M108 158 C112 198 134 216 160 218 C186 216 208 198 212 158 C204 190 186 205 160 205 C134 205 116 190 108 158 Z", fill: p.hair, opacity: ".22" }, head);
    el("path", { d: HAIR_FRONT[p.hairStyle], fill: p.hair }, head);

    const brows = el("g", { stroke: p.hair, "stroke-width": 4, "stroke-linecap": "round", fill: "none" }, head);
    el("path", { d: "M125 127 Q137 121 149 126" }, brows);
    el("path", { d: "M171 126 Q183 121 195 127" }, brows);

    const eyes = [];
    for (const x of [138, 182]) {
      const g = el("g", {}, head);
      el("ellipse", { cx: 0, cy: 0, rx: 4.8, ry: 5.6, fill: "#221B1D" }, g);
      el("circle", { cx: 1.6, cy: -2, r: 1.3, fill: "#FFFFFF", opacity: ".85" }, g);
      eyes.push({ g, x, y: 145 });
    }
    if (p.glasses) {
      const gl = el("g", { stroke: "#22212A", "stroke-width": 2.4, fill: "none" }, head);
      el("rect", { x: 122, y: 132, width: 32, height: 24, rx: 8 }, gl);
      el("rect", { x: 166, y: 132, width: 32, height: 24, rx: 8 }, gl);
      el("path", { d: "M154 142 Q160 137 166 142 M122 140 L108 136 M198 140 L212 136" }, gl);
    }
    el("path", { d: "M160 150 C157 161 155 167 163 169", stroke: p.shade, "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" }, head);
    const mouthOpen = el("ellipse", { cx: 160, cy: 190, rx: 12, ry: 1.5, fill: "#5B2626" }, head);
    const lip = el("path", { d: "M147 189 Q160 194 173 189", stroke: "#6E342D", "stroke-width": 2.6, "stroke-linecap": "round", fill: "none" }, head);
    parts = { torso, head, brows, eyes, mouthOpen, lip };
  }

  build(personaKey);

  function frame(now, energy = 0, mic = 0) {
    const t = now;
    // blink
    if (now > state.nextBlink) {
      state.blinkAt = now;
      state.nextBlink = now + 2600 + Math.random() * 3400;
    }
    const since = now - state.blinkAt;
    const blink = since < 150 ? 1 - Math.abs(since - 75) / 75 : 0;
    // mouth
    const target = state.mode === "speaking" ? energy : 0;
    state.open += (target - state.open) * 0.5;
    // listening nods follow the candidate's voice
    if (state.mode === "listening" && mic > 0.18 && !reduced) state.nodPhase += 0.08;
    state.nod *= 0.9;
    const nodY = state.mode === "listening" ? Math.sin(state.nodPhase) * 2.2 : 0;

    const sway = reduced ? 0 : Math.sin(t * 0.0007) * 1.1 + (state.mode === "listening" ? 2.4 : 0) + (state.mode === "thinking" ? -1.5 : 0);
    const breathe = reduced ? 0 : Math.sin(t * 0.0016) * 1.2;
    parts.head.setAttribute("transform", `rotate(${sway.toFixed(2)} 160 210) translate(0 ${(nodY + breathe * 0.4).toFixed(2)})`);
    parts.torso.setAttribute("transform", `translate(0 ${breathe.toFixed(2)})`);

    const look = state.mode === "thinking" ? { x: -2.6, y: 3 } : { x: 0, y: 0 };
    for (const eye of parts.eyes) {
      eye.g.setAttribute("transform", `translate(${eye.x + look.x} ${eye.y + look.y}) scale(1 ${Math.max(0.08, 1 - blink).toFixed(2)})`);
    }
    const browLift = state.mode === "speaking" ? -Math.min(3, energy * 4) : state.mode === "thinking" ? -2.5 : 0;
    parts.brows.setAttribute("transform", `translate(0 ${browLift.toFixed(2)})`);
    const open = Math.min(1, state.open);
    parts.mouthOpen.setAttribute("ry", (1.4 + open * 9).toFixed(2));
    parts.mouthOpen.setAttribute("rx", (11 + open * 2).toFixed(2));
    parts.mouthOpen.setAttribute("cy", (190 + open * 3).toFixed(2));
    parts.lip.setAttribute("d", open > 0.05 ? `M147 ${189 - open} Q160 ${186 - open * 2} 173 ${189 - open}` : state.mode === "idle" ? "M147 189 Q160 195 173 189" : "M147 189 Q160 193 173 189");
  }

  return {
    el: svg,
    get persona() {
      return state.persona;
    },
    setPersona(key) {
      if (key !== state.persona) build(key);
    },
    setMode(mode) {
      state.mode = mode;
    },
    frame,
  };
}


// Public avatar: a stable host element that holds either the animated
// portrait (photo personas) or the illustrated bust, and can switch between
// them when the panel hands over.
export function createAvatar(personaKey = "meera") {
  const host = document.createElement("div");
  host.className = "avatar-host";
  let impl = null;
  let current = null;
  let mode = "idle";
  const videoFailed = new Set();
  const visemesFailed = new Set();
  function build(key) {
    const p = PERSONAS[key] || PERSONAS.meera;
    if (p.visemes && !visemesFailed.has(key)) {
      impl = createVisemeAvatar(p.visemes, () => {
        visemesFailed.add(key);
        if (current === key) build(key);
      });
    } else if (p.video && !videoFailed.has(key)) {
      impl = createVideoAvatar(p.video, () => {
        // Footage could not load: fall back to the animated portrait.
        videoFailed.add(key);
        if (current === key) build(key);
      });
    } else {
      impl = p.photo ? createPhotoAvatar(p.photo) : createSvgAvatar(key);
    }
    if (p.photo || p.video) impl.label?.(`${p.name}, interviewer`);
    host.replaceChildren(impl.el);
    host.classList.toggle("is-photo", !!(p.photo || p.video || p.visemes));
    impl.setMode(mode);
    current = key;
  }
  build(personaKey);
  return {
    el: host,
    get persona() {
      return current;
    },
    setPersona(key) {
      if (key !== current) build(key);
    },
    setMode(m) {
      mode = m;
      impl.setMode(m);
    },
    frame(now, energy, mic, viseme) {
      impl.frame(now, energy, mic, viseme);
    },
  };
}

// Small static face for pickers.
export function avatarThumb(key) {
  const p = PERSONAS[key] || PERSONAS.meera;
  if (p.photo) {
    const ph = p.photo;
    const box = 56;
    const scale = box / (ph.face.h * 0.9);
    const el = document.createElement("span");
    el.className = "face";
    el.style.backgroundImage = `url(${ph.src})`;
    el.style.backgroundSize = `${ph.w * scale}px ${ph.h * scale}px`;
    const cx = (ph.face.x + ph.face.w / 2) * scale;
    const cy = (ph.face.y + ph.face.h / 2) * scale;
    el.style.backgroundPosition = `${box / 2 - cx}px ${box / 2 - cy}px`;
    return el;
  }
  const av = createSvgAvatar(key);
  av.frame(performance.now(), 0, 0);
  av.el.setAttribute("viewBox", "80 40 160 170");
  const wrap = document.createElement("span");
  wrap.className = "face";
  wrap.append(av.el);
  return wrap;
}
