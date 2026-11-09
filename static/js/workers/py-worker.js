// Runs Python inside the browser with Pyodide (WebAssembly). Code and inputs
// never leave the student's machine.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
importScripts(PYODIDE + "pyodide.js");

let ready = null;

function init() {
  if (!ready) ready = loadPyodide({ indexURL: PYODIDE });
  return ready;
}

const HARNESS = `
import sys, io, traceback
_stdin = io.StringIO(__vars_input)
_stdout = io.StringIO()
_err = ""
_old = (sys.stdin, sys.stdout)
sys.stdin, sys.stdout = _stdin, _stdout
try:
    exec(compile(__vars_code, "main.py", "exec"), {"__name__": "__main__"})
except SystemExit:
    pass
except BaseException:
    _err = traceback.format_exc(limit=4)
finally:
    sys.stdin, sys.stdout = _old
(_stdout.getvalue()[:262144], _err[-4000:])
`;

self.onmessage = async (event) => {
  const { id, type, code, tests } = event.data;
  try {
    const py = await init();
    if (type === "init") {
      self.postMessage({ id, type: "ready" });
      return;
    }
    const results = [];
    for (let i = 0; i < tests.length; i += 1) {
      const started = performance.now();
      py.globals.set("__vars_input", tests[i].input || "");
      py.globals.set("__vars_code", code);
      const out = py.runPython(HARNESS);
      const [stdout, stderr] = out.toJs();
      out.destroy?.();
      const result = { stdout, stderr, ms: Math.round(performance.now() - started), timeout: false, exit: stderr ? 1 : 0 };
      results.push(result);
      self.postMessage({ id, type: "progress", index: i, result });
    }
    self.postMessage({ id, type: "done", results });
  } catch (err) {
    self.postMessage({ id, type: "error", message: String(err && err.message ? err.message : err) });
  }
};
