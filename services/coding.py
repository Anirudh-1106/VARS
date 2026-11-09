"""Coding round: the problem bank and server-side runners.

Python and JavaScript normally run inside the student's browser (Pyodide and
a Web Worker), so their code never reaches the server. Java and C++ need a
compiler, so they run here when one is installed, inside a temporary folder
that is deleted as soon as the run finishes.

This is a practice tool, not a hardened sandbox: disable server runners with
VARS_NATIVE_RUNNERS=0 on shared public hosting.
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
from functools import lru_cache
from pathlib import Path

import config

TIME_LIMIT = 4.0
OUTPUT_LIMIT = 256 * 1024


@lru_cache(maxsize=1)
def _bank() -> list[dict]:
    with open(config.BASE_DIR / "data" / "problems.json", encoding="utf-8") as fh:
        return json.load(fh)["problems"]


def problem(pid: str) -> dict | None:
    return next((p for p in _bank() if p["id"] == pid), None)


def summaries() -> list[dict]:
    return [{k: p[k] for k in ("id", "title", "difficulty", "topics")} for p in _bank()]


def pick(level: str, count: int, exclude: list[str] | None = None) -> list[dict]:
    pools = {
        "fresher": [["easy"], ["medium"]],
        "intern": [["medium"], ["medium", "hard"]],
        "stretch": [["medium"], ["hard"]],
    }.get(level, [["easy"], ["medium"]])
    chosen: list[dict] = []
    exclude = set(exclude or [])
    for diffs in pools[: max(1, min(2, count))]:
        options = [p for p in _bank() if p["difficulty"] in diffs and p["id"] not in exclude and p not in chosen]
        if options:
            chosen.append(random.choice(options))
    return [{k: p[k] for k in ("id", "title", "difficulty", "topics")} for p in chosen]


def _which(*names: str) -> str | None:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


@lru_cache(maxsize=1)
def toolchains() -> dict:
    javac = _which("javac")
    java = None
    if javac:
        sibling = Path(javac).with_name("java.exe" if os.name == "nt" else "java")
        java = str(sibling) if sibling.exists() else _which("java")
    gpp = _which("g++", "clang++")
    return {"java": (javac, java) if javac and java else None, "cpp": gpp, "python": sys.executable}


def capabilities() -> dict:
    tc = toolchains()
    enabled = config.NATIVE_RUNNERS
    return {
        "python": {"browser": True, "server": enabled},
        "javascript": {"browser": True, "server": False},
        "java": {"browser": False, "server": bool(enabled and tc["java"])},
        "cpp": {"browser": False, "server": bool(enabled and tc["cpp"])},
    }


def _norm(text: str) -> str:
    return "\n".join(line.rstrip() for line in (text or "").replace("\r\n", "\n").strip().split("\n"))


def _exec(cmd: list[str], cwd: str, stdin: str) -> dict:
    start = time.perf_counter()
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, input=stdin.encode(), capture_output=True, timeout=TIME_LIMIT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        elapsed = time.perf_counter() - start
        return {
            "stdout": proc.stdout[:OUTPUT_LIMIT].decode(errors="replace"),
            "stderr": proc.stderr[:8000].decode(errors="replace"),
            "code": proc.returncode,
            "ms": round(elapsed * 1000),
            "timeout": False,
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": f"Time limit exceeded ({TIME_LIMIT:.0f}s)", "code": -1, "ms": round(TIME_LIMIT * 1000), "timeout": True}


def run(language: str, code: str, tests: list[dict]) -> dict:
    if not config.NATIVE_RUNNERS:
        raise PermissionError("Server-side code execution is turned off on this deployment.")
    tc = toolchains()
    if len(code) > 60_000:
        raise ValueError("Code is too long.")
    workdir = tempfile.mkdtemp(prefix="vars-run-")
    try:
        if language == "java":
            if not tc["java"]:
                raise RuntimeError("Java is not installed on the server.")
            javac, java = tc["java"]
            Path(workdir, "Main.java").write_text(code, encoding="utf-8")
            comp = subprocess.run([javac, "-encoding", "UTF-8", "Main.java"], cwd=workdir, capture_output=True, timeout=30,
                                  creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if comp.returncode != 0:
                return {"compile_error": comp.stderr.decode(errors="replace")[:6000], "results": []}
            cmd = [java, "-Xss64m", "-cp", workdir, "Main"]
        elif language == "cpp":
            if not tc["cpp"]:
                raise RuntimeError("A C++ compiler is not installed on the server.")
            src = Path(workdir, "main.cpp")
            src.write_text(code, encoding="utf-8")
            exe = str(Path(workdir, "main.exe" if os.name == "nt" else "main"))
            comp = subprocess.run([tc["cpp"], "-O2", "-std=c++17", str(src), "-o", exe], cwd=workdir, capture_output=True, timeout=60,
                                  creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if comp.returncode != 0:
                return {"compile_error": comp.stderr.decode(errors="replace")[:6000], "results": []}
            cmd = [exe]
        elif language == "python":
            Path(workdir, "main.py").write_text(code, encoding="utf-8")
            cmd = [tc["python"], "-I", "main.py"]
        else:
            raise ValueError("Unsupported language.")

        results = []
        for test in tests[:40]:
            out = _exec(cmd, workdir, test.get("input", ""))
            expected = test.get("output")
            passed = None if expected is None else (out["code"] == 0 and _norm(out["stdout"]) == _norm(expected))
            results.append({
                "stdout": out["stdout"][:4000], "stderr": out["stderr"][:2000], "ms": out["ms"],
                "timeout": out["timeout"], "exit": out["code"], "passed": passed,
            })
        return {"compile_error": None, "results": results}
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
