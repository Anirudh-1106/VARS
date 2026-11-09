// Animated portrait for photo personas. A canvas redraws the portrait every
// frame and adds three effects in image coordinates:
//   • lip-sync: the lower lip and jaw drop with the voice's audio energy,
//     revealing the inner mouth, with feathered edges so no seam shows;
//   • blinks: the eyelid skin above each eye is stretched down over it;
//   • life: slow breathing, a slight sway, and nods while the candidate talks.
// Landmarks are measured once per image (see PERSONAS in avatar.js).

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createPhotoAvatar(spec) {
  const host = document.createElement("div");
  host.className = "photo-avatar";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  const img = new Image();
  img.decoding = "async";
  img.src = spec.src;
  let ready = false;
  img.onload = () => {
    ready = true;
  };

  const state = { mode: "idle", open: 0, blinkAt: -1e9, nextBlink: performance.now() + 1500, nod: 0, sway: 0 };
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

  // Choose the part of the image to show: the full scene in a large tile,
  // a close crop of the face in a small one.
  function viewRect() {
    const A = size.w / Math.max(1, size.h);
    const small = Math.min(size.w, size.h) < 200;
    let H = small ? spec.face.h * 1.15 : spec.h;
    let W = H * A;
    if (W > spec.w) {
      W = spec.w;
      H = W / A;
    }
    const fx = small ? spec.face.x + spec.face.w / 2 : spec.focus.x;
    const fy = small ? spec.face.y + spec.face.h / 2 : spec.focus.y;
    const sx = Math.min(spec.w - W, Math.max(0, fx - W / 2));
    const sy = Math.min(spec.h - H, Math.max(0, fy - H / 2));
    return { sx, sy, W, H };
  }

  // The eyelid is built from the smooth skin under the eye, stretched up
  // over it in an offscreen patch whose edges fade
  // out, so the eye's own outline disappears under it instead of ringing.
  const lidCanvas = document.createElement("canvas");
  const lctx = lidCanvas.getContext("2d");
  function drawBlink(eye, lidTop, amount) {
    if (amount <= 0.03) return;
    const padX = 14;
    const padY = 9;
    const x = eye.cx - eye.rx - padX;
    const w = (eye.rx + padX) * 2;
    const top = lidTop;
    const bottom = eye.cy + eye.ry + padY;
    const h = bottom - top;
    const lashY = eye.cy - eye.ry - 3;
    const reach = lashY + (eye.ry * 2 + padY + 3) * amount;
    const k = 3;
    lidCanvas.width = Math.ceil(w * k);
    lidCanvas.height = Math.ceil(h * k);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    lctx.clearRect(0, 0, lidCanvas.width, lidCanvas.height);
    // Lid skin comes from the smooth band just under the eye (no crease, no
    // lashes), so nothing dark can read as an iris through the closed lid.
    lctx.drawImage(img, x, eye.cy + eye.ry + 10, w, 7, 0, (lashY - top) * k, lidCanvas.width, (reach - lashY) * k);
    // a soft crease shadow near the top of the lid gives it volume
    const crease = lctx.createLinearGradient(0, (lashY - top) * k, 0, (reach - top) * k);
    crease.addColorStop(0, "rgba(70, 38, 28, .16)");
    crease.addColorStop(0.35, "rgba(70, 38, 28, 0)");
    lctx.fillStyle = crease;
    lctx.fillRect(0, (lashY - top) * k, lidCanvas.width, (reach - lashY) * k);
    // feathered elliptical mask around the eye
    lctx.globalCompositeOperation = "destination-in";
    const cx = (eye.cx - x) * k;
    const cy = (eye.cy - top) * k;
    const rx = (eye.rx + padX) * k;
    const ry = (eye.ry + padY) * k;
    lctx.setTransform(1, 0, 0, ry / rx, 0, cy - (cy * ry) / rx);
    const g = lctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.9, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    lctx.fillStyle = g;
    lctx.fillRect(0, -lidCanvas.height * 4, lidCanvas.width, lidCanvas.height * 9);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(lidCanvas, x, top, w, h);
    ctx.restore();
    if (amount > 0.55) {
      ctx.save();
      ctx.strokeStyle = `rgba(30, 18, 18, ${Math.min(0.85, (amount - 0.45) * 1.6)})`;
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(eye.cx - eye.rx + 1, reach - 4);
      ctx.quadraticCurveTo(eye.cx, reach + 3, eye.cx + eye.rx - 1, reach - 4);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawMouth(m, open) {
    const d = open * m.maxOpen;
    if (d < 0.35) return;
    const { cx, y, halfW, chin } = m;
    // inner mouth
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, y + d * 0.5, halfW * 0.66, d * 0.5 + 0.6, 0, 0, Math.PI * 2);
    const inner = ctx.createLinearGradient(0, y, 0, y + d + 1);
    inner.addColorStop(0, "#3A1816");
    inner.addColorStop(1, "#5C2A24");
    ctx.fillStyle = inner;
    ctx.fill();
    ctx.clip();
    if (d > 3.5) {
      ctx.fillStyle = "rgba(228, 216, 206, .85)";
      ctx.beginPath();
      ctx.ellipse(cx, y + 0.4, halfW * 0.46, Math.min(2.8, d * 0.24), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // lower lip + jaw, shifted down and feathered at the edges
    const x0 = cx - halfW - 26;
    const w = (halfW + 26) * 2;
    const top = y + 0.5;
    const h = chin + 10 - top;
    const k = 2;
    off.width = Math.ceil(w * k);
    off.height = Math.ceil(h * k);
    octx.globalCompositeOperation = "source-over";
    octx.clearRect(0, 0, off.width, off.height);
    octx.drawImage(img, x0, top, w, h, 0, 0, off.width, off.height);
    octx.globalCompositeOperation = "destination-in";
    const gx = octx.createLinearGradient(0, 0, off.width, 0);
    gx.addColorStop(0, "rgba(0,0,0,0)");
    gx.addColorStop(0.24, "rgba(0,0,0,1)");
    gx.addColorStop(0.76, "rgba(0,0,0,1)");
    gx.addColorStop(1, "rgba(0,0,0,0)");
    octx.fillStyle = gx;
    octx.fillRect(0, 0, off.width, off.height);
    const gy = octx.createLinearGradient(0, 0, 0, off.height);
    gy.addColorStop(0, "rgba(0,0,0,1)");
    gy.addColorStop(0.72, "rgba(0,0,0,1)");
    gy.addColorStop(1, "rgba(0,0,0,0)");
    octx.fillStyle = gy;
    octx.fillRect(0, 0, off.width, off.height);
    octx.globalCompositeOperation = "source-over";
    ctx.drawImage(off, x0, top + d, w, h - d * 0.4);
  }

  function frame(now, energy = 0, mic = 0) {
    measure();
    if (!ready || !size.w) return;
    // speaking: mouth follows the voice, with a little jitter so vowels read
    const target = state.mode === "speaking" ? Math.min(1, energy * 1.15) : 0;
    state.open += (target - state.open) * (target > state.open ? 0.55 : 0.35);
    if (now > state.nextBlink) {
      state.blinkAt = now;
      state.nextBlink = now + 2400 + Math.random() * 3600;
    }
    const since = now - state.blinkAt;
    const blink = since < 170 ? 1 - Math.abs(since - 85) / 85 : 0;
    if (state.mode === "listening" && mic > 0.18 && !reduced) state.nod += 0.07;

    const v = viewRect();
    const scale = size.w / v.W;
    const breathe = reduced ? 0 : Math.sin(now * 0.0016) * 0.0035;
    const swayX = reduced ? 0 : Math.sin(now * 0.0007) * 1.4;
    const nodY = state.mode === "listening" && !reduced ? Math.sin(state.nod) * 1.6 : 0;
    const thinkY = state.mode === "thinking" && !reduced ? 1.2 : 0;
    const z = 1 + breathe;
    const dpr = size.dpr;
    const fx = v.sx + v.W / 2;
    const fy = v.sy + v.H / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const s = scale * dpr * z;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - (fx - swayX) * s, canvas.height / 2 - (fy - nodY - thinkY) * s);
    ctx.drawImage(img, 0, 0, spec.w, spec.h);
    drawMouth(spec.mouth, state.open);
    // Blinks are drawn only when the portrait ships real closed-eye artwork
    // (spec.blink === true); a canvas-painted lid reads as a mask on a 3D render.
    if (spec.blink) for (const eye of spec.eyes) drawBlink(eye, spec.lidTop, blink);
  }

  return {
    el: host,
    setMode(mode) {
      state.mode = mode;
    },
    frame,
    label(text) {
      canvas.setAttribute("aria-label", text);
    },
  };
}
