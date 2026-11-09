// Video persona: a still of the opening frame while idle or listening, and
// real talking footage while the voice plays. Each new utterance restarts the
// footage from its first frame, which matches the still, so speech starts
// without a jump; the footage is a forward-then-reverse loop, so long answers
// never hit a hard cut. A short hold stops the face flickering back to idle in
// the brief gap between two spoken parts (an acknowledgement, then a question).

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const HOLD_MS = 380;

export function createVideoAvatar(spec, onFail) {
  const host = document.createElement("div");
  host.className = "video-avatar";
  const frame = document.createElement("div");
  frame.className = "va-frame";
  const still = new Image();
  still.className = "va-still";
  still.alt = "";
  still.decoding = "async";
  still.src = spec.poster;
  const talk = document.createElement("video");
  talk.className = "va-talk";
  talk.muted = true;
  talk.defaultMuted = true;
  talk.loop = true;
  talk.playsInline = true;
  talk.preload = "auto";
  talk.setAttribute("muted", "");
  talk.setAttribute("playsinline", "");
  talk.setAttribute("aria-hidden", "true");
  // VP9 WebM first (plays in every Chromium build), H.264 MP4 as the fallback.
  const sources = [[spec.talkWebm, "video/webm"], [spec.talk, "video/mp4"]].filter(([src]) => src);
  for (const [src, type] of sources) {
    const el = document.createElement("source");
    el.src = src;
    el.type = type;
    talk.append(el);
  }
  frame.append(still, talk);
  host.append(frame);

  const state = { mode: "idle", active: false, lastSpeak: -1e9, nod: 0, failed: false, small: null };

  const fail = () => {
    if (state.failed) return;
    state.failed = true;
    onFail?.();
  };
  talk.addEventListener("error", fail);
  // With <source> children the error fires on the last source, not the video.
  talk.querySelector("source:last-of-type")?.addEventListener("error", fail);

  function show() {
    host.classList.add("talking");
  }

  function setActive(on) {
    if (on === state.active || state.failed) return;
    state.active = on;
    if (on) {
      let shown = false;
      const reveal = () => {
        if (!shown && state.active) {
          shown = true;
          show();
        }
      };
      try {
        talk.currentTime = 0;
      } catch {}
      talk.addEventListener("seeked", reveal, { once: true });
      setTimeout(reveal, 90);
      talk.play().catch(() => {});
    } else {
      host.classList.remove("talking");
      setTimeout(() => {
        if (!state.active) talk.pause();
      }, 400);
    }
  }

  return {
    el: host,
    setMode(mode) {
      state.mode = mode;
    },
    label(text) {
      host.setAttribute("role", "img");
      host.setAttribute("aria-label", text);
    },
    frame(now, energy = 0, mic = 0) {
      if (state.small === null || (now | 0) % 30 === 0) {
        const r = host.getBoundingClientRect();
        if (r.width) {
          const small = Math.min(r.width, r.height) < 200;
          if (small !== state.small) {
            state.small = small;
            host.classList.toggle("small", small);
          }
        }
      }
      if (state.mode === "speaking") state.lastSpeak = now;
      setActive(!reduced && now - state.lastSpeak < HOLD_MS);
      if (reduced) return;
      if (state.mode === "listening" && mic > 0.18) state.nod += 0.07;
      const nodY = state.mode === "listening" ? Math.sin(state.nod) * 1.4 : 0;
      const breathe = 1 + Math.sin(now * 0.0016) * 0.004;
      frame.style.transform = `translateY(${nodY.toFixed(2)}px) scale(${breathe.toFixed(4)})`;
    },
  };
}
