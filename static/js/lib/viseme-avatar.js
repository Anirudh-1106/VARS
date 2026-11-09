// Word-accurate talking face. The still face is drawn every frame and the
// mouth region is swapped for real mouths cut from the interviewer's footage
// (see tools/build_visemes.py), one per sound, crossfading in ~45 ms. Blinks
// use real closed-eye frames from the same footage.

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FADE_MS = 45;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function createVisemeAvatar(spec, onFail) {
  const host = document.createElement("div");
  host.className = "photo-avatar viseme-avatar";
  // Show the still face at once; the canvas covers it when the mouth sheet is ready.
  host.style.background = `#D9CBBE url("${spec.base}") 50% 32% / cover no-repeat`;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  host.append(canvas);
  const ctx = canvas.getContext("2d");

  let base = null;
  let sheet = null;
  let meta = null;
  Promise.all([loadImage(spec.base), loadImage(spec.sheet), fetch(spec.meta).then((r) => (r.ok ? r.json() : Promise.reject(new Error("meta"))))])
    .then(([b, s, m]) => {
      base = b;
      sheet = s;
      meta = m;
    })
    .catch(() => onFail?.());

  const state = { mode: "idle", cur: "REST", prev: "REST", switchedAt: 0, blinkAt: -1e9, nextBlink: performance.now() + 2200, nod: 0 };
  let size = { w: 0, h: 0, dpr: 1 };

  function measure() {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (r.width !== size.w || r.height !== size.h || dpr !== size.dpr) {
      size = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    }
  }

  function viewRect() {
    const [W0, H0] = meta.size;
    const A = size.w / Math.max(1, size.h);
    const small = Math.min(size.w, size.h) < 200;
    let H = small ? spec.face.h * 1.1 : H0;
    let W = H * A;
    if (W > W0) {
      W = W0;
      H = W / A;
    }
    const fx = small ? spec.face.x + spec.face.w / 2 : spec.focus.x;
    const fy = small ? spec.face.y + spec.face.h / 2 : spec.focus.y;
    return { sx: Math.min(W0 - W, Math.max(0, fx - W / 2)), sy: Math.min(H0 - H, Math.max(0, fy - H / 2)), W, H };
  }

  function patch(name, alpha) {
    const p = meta.patches[name];
    if (!p || alpha <= 0) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sheet, p.sx, p.sy, p.w, p.h, p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 1;
  }

  function frame(now, energy = 0, mic = 0, viseme = null) {
    measure();
    if (!base || !meta || !size.w) return;

    // Which mouth to show: the scheduled sound while speaking, closed otherwise.
    let target = state.mode === "speaking" && viseme ? viseme : "REST";
    if (target !== state.cur) {
      state.prev = state.cur;
      state.cur = target;
      state.switchedAt = now;
    }
    const blend = Math.min(1, (now - state.switchedAt) / FADE_MS);

    if (now > state.nextBlink) {
      state.blinkAt = now;
      state.nextBlink = now + 2600 + Math.random() * 3600;
    }
    const since = now - state.blinkAt;
    const blink = since < 180 ? 1 - Math.abs(since - 90) / 90 : 0;
    if (state.mode === "listening" && mic > 0.18 && !reduced) state.nod += 0.07;

    const v = viewRect();
    const scale = size.w / v.W;
    const breathe = reduced ? 0 : Math.sin(now * 0.0016) * 0.0035;
    const swayX = reduced ? 0 : Math.sin(now * 0.0007) * 1.2;
    const nodY = state.mode === "listening" && !reduced ? Math.sin(state.nod) * 1.4 : 0;
    const s = scale * size.dpr * (1 + breathe);
    const fx = v.sx + v.W / 2;
    const fy = v.sy + v.H / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - (fx - swayX) * s, canvas.height / 2 - (fy - nodY) * s);
    ctx.drawImage(base, 0, 0);

    if (state.prev !== "REST" && blend < 1) patch(state.prev, 1 - blend);
    if (state.cur !== "REST") patch(state.cur, blend);

    if (blink > 0.55) {
      patch("blinkL", 1);
      patch("blinkR", 1);
    } else if (blink > 0.15) {
      patch("blinkHalfL", 1);
      patch("blinkHalfR", 1);
    }
  }

  return {
    el: host,
    setMode(mode) {
      state.mode = mode;
    },
    label(text) {
      canvas.setAttribute("aria-label", text);
    },
    frame,
  };
}
