// The interviewer's voice. Neural audio comes from the server (generated per
// request, never stored); when it is unavailable the browser's own speech
// synthesis takes over. `energy` drives the avatar's mouth.

import { api } from "../core/api.js";
import { buildTimeline, visemeAt, wordVisemes } from "./lipsync.js";

export class Speaker {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.ctx = null;
    this.analyser = null;
    this.data = null;
    this.energy = 0;
    this.cache = new Map();
    this.speaking = false;
    this.useBrowser = false;
    this._synthTimer = null;
    this._stopResolve = null;
    this.timeline = null;
    this.liveWord = null;
  }

  // Current mouth shape for the avatar ("REST" when silent).
  viseme() {
    if (!this.speaking) return "REST";
    if (this.timeline && !this.audio.paused) {
      const shape = visemeAt(this.timeline, this.audio.currentTime + 0.03);
      // a scheduled vowel during real silence (a breath, a pause) closes the mouth
      if (shape !== "MBP" && shape !== "REST" && this.energy < 0.035) return "REST";
      return shape;
    }
    if (this.liveWord) {
      const { shapes, start, dur } = this.liveWord;
      const f = (performance.now() - start) / 1000 / dur;
      if (f >= 1) return "REST";
      return shapes[Math.min(shapes.length - 1, Math.floor(f * shapes.length))];
    }
    return "REST";
  }

  // Must be called from a user gesture (e.g. the Begin button).
  unlock() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.data = new Uint8Array(this.analyser.fftSize);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (window.speechSynthesis) speechSynthesis.getVoices();
  }

  key(text, persona) {
    return `${persona}|${text}`;
  }

  prefetch(text, persona) {
    if (!text || this.useBrowser) return null;
    const k = this.key(text, persona);
    if (!this.cache.has(k)) this.cache.set(k, api.tts(text, persona));
    return this.cache.get(k);
  }

  sample() {
    if (this.analyser && this.speaking && !this.audio.paused) {
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (let i = 0; i < this.data.length; i += 1) {
        const v = (this.data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.data.length);
      this.energy = this.energy * 0.45 + Math.min(1, rms * 5.5) * 0.55;
    } else if (!this._synthTimer) {
      this.energy *= 0.8;
    }
    return this.energy;
  }

  progress() {
    if (this.audio.duration && Number.isFinite(this.audio.duration)) return this.audio.currentTime / this.audio.duration;
    return this._synthProgress || 0;
  }

  async say(text, persona, hooks = {}) {
    this.stop();
    if (!text) return;
    let url = null;
    let words = [];
    this.timeline = null;
    this.liveWord = null;
    if (!this.useBrowser) {
      const res = await (this.cache.get(this.key(text, persona)) || api.tts(text, persona));
      this.cache.delete(this.key(text, persona));
      if (res) {
        url = res.url;
        words = res.words || [];
      }
    }
    if (url) {
      if (words.length) this.timeline = buildTimeline(text, words);
      this.audio.onloadedmetadata = () => {
        if (!this.timeline && Number.isFinite(this.audio.duration)) this.timeline = buildTimeline(text, [], this.audio.duration);
      };
      return new Promise((resolve) => {
        this._stopResolve = resolve;
        this.audio.src = url;
        this.speaking = true;
        hooks.onStart?.();
        const done = () => {
          this.speaking = false;
          this.audio.onended = this.audio.onerror = null;
          URL.revokeObjectURL(url);
          this._stopResolve = null;
          hooks.onEnd?.();
          resolve();
        };
        this.audio.onended = done;
        this.audio.onerror = done;
        this.audio.play().catch(done);
      });
    }
    return this.browserSay(text, persona, hooks);
  }

  browserSay(text, persona, hooks) {
    if (!window.speechSynthesis) {
      hooks.onStart?.();
      hooks.onEnd?.();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._stopResolve = resolve;
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const female = persona === "meera" || persona === "ava";
      const prefer = (v) => /en[-_]IN/i.test(v.lang) ? 3 : /en[-_]GB/i.test(v.lang) ? 2 : /^en/i.test(v.lang) ? 1 : 0;
      const pick = voices
        .filter((v) => /^en/i.test(v.lang))
        .sort((a, b) => prefer(b) - prefer(a) + (/(female|zira|heera|neerja|aria|jenny|sonia|ava)/i.test(b.name) === female ? 1 : 0) - (/(female|zira|heera|neerja|aria|jenny|sonia|ava)/i.test(a.name) === female ? 1 : 0))[0];
      if (pick) u.voice = pick;
      u.rate = 0.98;
      const words = text.split(/\s+/).length || 1;
      let spoken = 0;
      this.speaking = true;
      this._synthProgress = 0;
      this._synthTimer = setInterval(() => {
        this.energy = this.speaking ? 0.25 + Math.random() * 0.55 : 0;
      }, 90);
      u.onboundary = (e) => {
        if (e.name === "word") {
          spoken += 1;
          this._synthProgress = Math.min(1, spoken / words);
          const rest = text.slice(e.charIndex);
          const word = (rest.match(/^[\w'-]+/) || [""])[0];
          const shapes = wordVisemes(word);
          if (shapes.length) this.liveWord = { shapes, start: performance.now(), dur: Math.max(0.16, word.length * 0.068) };
        }
      };
      const done = () => {
        clearInterval(this._synthTimer);
        this._synthTimer = null;
        this.speaking = false;
        this.energy = 0;
        this._synthProgress = 1;
        this._stopResolve = null;
        hooks.onEnd?.();
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      hooks.onStart?.();
      speechSynthesis.speak(u);
    });
  }

  stop() {
    if (!this.audio.paused) this.audio.pause();
    if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel();
    clearInterval(this._synthTimer);
    this._synthTimer = null;
    this.speaking = false;
    this.energy = 0;
    if (this._stopResolve) {
      const r = this._stopResolve;
      this._stopResolve = null;
      r();
    }
  }
}
