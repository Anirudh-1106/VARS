// Runs JavaScript answers in an isolated worker. `input` holds stdin as a
// string; console.log writes stdout. require("fs").readFileSync(0) also works.

function fmt(value) {
  if (typeof value === "string") return value;
  try {
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}

self.onmessage = (event) => {
  const { id, code, tests } = event.data;
  const results = [];
  for (let i = 0; i < tests.length; i += 1) {
    const input = tests[i].input || "";
    const out = [];
    const err = [];
    const lines = input.split("\n");
    let ptr = 0;
    const shim = {
      log: (...a) => out.push(a.map(fmt).join(" ")),
      info: (...a) => out.push(a.map(fmt).join(" ")),
      error: (...a) => err.push(a.map(fmt).join(" ")),
      warn: (...a) => err.push(a.map(fmt).join(" ")),
    };
    const readline = () => (ptr < lines.length ? lines[ptr++] : undefined);
    const require = (name) => {
      if (name === "fs") return { readFileSync: () => input };
      throw new Error(`require("${name}") is not available here; use the global input string.`);
    };
    const process = { stdout: { write: (s) => { out.push(String(s).replace(/\n$/, "")); return true; } }, stdin: { fd: 0 } };
    const started = performance.now();
    try {
      const fn = new Function("input", "readline", "console", "print", "require", "process", `"use strict";\n${code}`);
      fn(input, readline, shim, (...a) => out.push(a.map(fmt).join(" ")), require, process);
    } catch (e) {
      err.push(e && e.stack ? String(e.stack).split("\n").slice(0, 4).join("\n") : String(e));
    }
    const result = { stdout: out.join("\n"), stderr: err.join("\n"), ms: Math.round(performance.now() - started), timeout: false, exit: err.length ? 1 : 0 };
    results.push(result);
    self.postMessage({ id, type: "progress", index: i, result });
  }
  self.postMessage({ id, type: "done", results });
};
