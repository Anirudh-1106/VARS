// Microphone capture with a live level meter. The stream stays open for the
// whole interview so the browser asks for permission once; each answer is a
// separate MediaRecorder run. Audio is only ever sent for transcription and
// is not kept anywhere.

export class Recorder {
  constructor() {
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.rec = null;
    this.chunks = [];
    this.startedAt = 0;
  }

  async open() {
    if (this.stream && this.stream.getAudioTracks().some((t) => t.readyState === "live")) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.ctx = this.ctx && this.ctx.state !== "closed" ? this.ctx : new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    src.connect(this.analyser);
    this.data = new Uint8Array(this.analyser.fftSize);
  }

  level() {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i += 1) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 3.2);
  }

  get recording() {
    return this.rec && this.rec.state === "recording";
  }

  async start() {
    await this.open();
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.startedAt = performance.now();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state !== "recording") return resolve(null);
      this.rec.onstop = () => {
        const type = this.rec.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        resolve({ blob, seconds: (performance.now() - this.startedAt) / 1000, ext: type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm" });
      };
      this.rec.stop();
    });
  }

  cancel() {
    if (this.rec && this.rec.state === "recording") {
      this.rec.onstop = null;
      this.rec.stop();
    }
    this.chunks = [];
  }

  close() {
    this.cancel();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ctx && this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
  }
}

// Dot-matrix level meter: a row of dots lit by the current level.
export function levelDots(count = 24) {
  const el = document.createElement("div");
  el.className = "level-dots";
  el.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i += 1) el.append(document.createElement("i"));
  let smooth = 0;
  el.set = (level) => {
    smooth = smooth * 0.6 + level * 0.4;
    const lit = Math.round(smooth * count);
    [...el.children].forEach((dot, i) => dot.classList.toggle("on", i < lit));
  };
  return el;
}
