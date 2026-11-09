// Chooses where code runs: Python and JavaScript in browser workers, Java and
// C++ on the server's throwaway runner. Enforces per-test time limits by
// terminating stuck workers.

import { api } from "../core/api.js";

export const LANGS = {
  python: { label: "Python 3", mode: "python", ext: "py" },
  javascript: { label: "JavaScript", mode: "javascript", ext: "js" },
  java: { label: "Java 17", mode: "text/x-java", ext: "java" },
  cpp: { label: "C++17", mode: "text/x-c++src", ext: "cpp" },
};

export const STARTERS = {
  python: `import sys
input = sys.stdin.readline


def main():
    # Read the input, e.g.:
    # n, t = map(int, input().split())
    # values = list(map(int, input().split()))
    pass


main()
`,
  javascript: `// \`input\` holds everything from standard input as one string.
const data = input.trim().split(/\\s+/);
let pos = 0;
const next = () => data[pos++];

// Write your solution. console.log(...) prints to standard output.
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        StringTokenizer st = new StringTokenizer(br.readLine());
        // int n = Integer.parseInt(st.nextToken());

    }
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    // int n; cin >> n;

    return 0;
}
`,
};

const TIME_LIMIT = { python: 8000, javascript: 4000 };

export function normalise(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").trim().split("\n").map((l) => l.trimEnd()).join("\n");
}

export class CodeRunner {
  constructor(capabilities) {
    this.caps = capabilities || {};
    this.workers = {};
    this.pyReady = null;
  }

  available(lang) {
    const c = this.caps[lang];
    return !!(c && (c.browser || c.server));
  }

  worker(lang) {
    if (!this.workers[lang]) {
      const url = lang === "python" ? "/static/js/workers/py-worker.js" : "/static/js/workers/js-worker.js";
      this.workers[lang] = new Worker(url);
    }
    return this.workers[lang];
  }

  kill(lang) {
    this.workers[lang]?.terminate();
    delete this.workers[lang];
    if (lang === "python") this.pyReady = null;
  }

  preloadPython() {
    if (this.pyReady) return this.pyReady;
    const w = this.worker("python");
    this.pyReady = new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const onMsg = (e) => {
        if (e.data.id !== id) return;
        w.removeEventListener("message", onMsg);
        if (e.data.type === "ready") resolve(true);
        else reject(new Error(e.data.message || "Python failed to load"));
      };
      w.addEventListener("message", onMsg);
      w.postMessage({ id, type: "init" });
    });
    this.pyReady.catch(() => { this.pyReady = null; });
    return this.pyReady;
  }

  async runBrowser(lang, code, tests, onProgress) {
    if (lang === "python") await this.preloadPython();
    const w = this.worker(lang);
    const id = Math.random().toString(36).slice(2);
    const limit = TIME_LIMIT[lang];
    return new Promise((resolve) => {
      const results = [];
      let timer = null;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          w.removeEventListener("message", onMsg);
          this.kill(lang);
          while (results.length < tests.length) {
            results.push({ stdout: "", stderr: `Time limit exceeded (${limit / 1000}s)`, ms: limit, timeout: true, exit: -1 });
          }
          resolve(results);
        }, limit + (lang === "python" && results.length === 0 ? 1500 : 0));
      };
      const onMsg = (e) => {
        if (e.data.id !== id) return;
        if (e.data.type === "progress") {
          results[e.data.index] = e.data.result;
          onProgress?.(e.data.index, e.data.result);
          arm();
        } else if (e.data.type === "done") {
          clearTimeout(timer);
          w.removeEventListener("message", onMsg);
          resolve(e.data.results);
        } else if (e.data.type === "error") {
          clearTimeout(timer);
          w.removeEventListener("message", onMsg);
          resolve(tests.map(() => ({ stdout: "", stderr: e.data.message, ms: 0, timeout: false, exit: 1 })));
        }
      };
      w.addEventListener("message", onMsg);
      arm();
      w.postMessage({ id, type: "run", code, tests: tests.map((t) => ({ input: t.input })) });
    });
  }

  // tests: [{input, output}] → [{...result, passed}]
  async run(lang, code, tests, opts = {}) {
    let raw;
    let compileError = null;
    if (lang === "python" || lang === "javascript") {
      if (lang === "python" && !this.caps.python?.browser && this.caps.python?.server) {
        const res = await api.post("/api/code/run", { language: lang, code, tests });
        raw = res.results;
      } else {
        try {
          raw = await this.runBrowser(lang, code, tests, opts.onProgress);
        } catch (err) {
          if (lang === "python" && this.caps.python?.server) {
            const res = await api.post("/api/code/run", { language: lang, code, tests });
            raw = res.results;
          } else throw err;
        }
      }
    } else {
      const body = opts.problemId && opts.hidden ? { language: lang, code, problem_id: opts.problemId, hidden: true } : { language: lang, code, tests };
      const res = await api.post("/api/code/run", body);
      compileError = res.compile_error;
      raw = res.results;
    }
    if (compileError) return { compileError, results: [] };
    const results = tests.map((t, i) => {
      const r = raw[i] || { stdout: "", stderr: "No result", ms: 0, exit: 1 };
      const passed = r.passed !== undefined && r.passed !== null ? r.passed : !r.timeout && normalise(r.stdout) === normalise(t.output);
      return { ...r, passed, expected: t.output, input: t.input };
    });
    return { compileError: null, results };
  }
}
