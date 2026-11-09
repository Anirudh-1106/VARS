// Fetch helpers for the stateless API.

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function handle(res) {
  let data = null;
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    data = await res.json().catch(() => null);
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Request failed (${res.status}).`, res.status, data);
  }
  return data;
}

function networkError(err) {
  if (err instanceof ApiError) return err;
  if (err && err.name === "AbortError") return err;
  return new ApiError("Could not reach the VARS server. Is it still running?", 0);
}

export const api = {
  async get(url, opts = {}) {
    try {
      return await handle(await fetch(url, { signal: opts.signal }));
    } catch (err) {
      throw networkError(err);
    }
  },
  async post(url, body, opts = {}) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: opts.signal,
      });
      return await handle(res);
    } catch (err) {
      throw networkError(err);
    }
  },
  async upload(url, form, opts = {}) {
    try {
      return await handle(await fetch(url, { method: "POST", body: form, signal: opts.signal }));
    } catch (err) {
      throw networkError(err);
    }
  },
  // Streams plain-text deltas; resolves with the full text.
  async stream(url, body, onDelta, opts = {}) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: opts.signal,
      });
    } catch (err) {
      throw networkError(err);
    }
    if (!res.ok) await handle(res);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      full += chunk;
      const marker = full.indexOf("[[error]]");
      if (marker >= 0) {
        throw new ApiError(full.slice(marker + 9).trim() || "The answer was interrupted.");
      }
      onDelta(chunk, full);
    }
    return full;
  },
  // Returns { url, words } (an audio Blob URL plus per-word timings for
  // lip-sync), or null when the server says to use the browser voice.
  async tts(text, persona, opts = {}) {
    try {
      const res = await fetch("/api/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, persona, marks: true }),
        signal: opts.signal,
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.audio) return null;
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.mime || "audio/mpeg" }));
      return { url, words: Array.isArray(data.words) ? data.words : [] };
    } catch {
      return null;
    }
  },
};
