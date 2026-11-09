"""VARS — virtual placement coach.

A stateless Flask server. It never stores resumes, recordings, code,
transcripts or reports: each request is processed in memory and forgotten.
All session state lives in the student's browser tab (sessionStorage) and
disappears when the tab is closed, unless the student exports it.
"""

from __future__ import annotations

import logging
import time

from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

import config
from services import coach, coding, interview, llm, resume_analyzer, resume_parser, roles, signing, speech, voice_resume

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("vars")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_MB * 1024 * 1024
app.config["JSON_SORT_KEYS"] = False


def asset_version() -> str:
    """Cache-busting token from the newest static file, so edits always reach the browser."""
    newest = max((f.stat().st_mtime for f in (config.BASE_DIR / "static").rglob("*") if f.is_file()), default=time.time())
    return str(int(newest))

CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
])


@app.after_request
def privacy_headers(resp: Response):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
    resp.headers["Content-Security-Policy"] = CSP
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def _api_error(exc: ApiError):
    return jsonify({"error": exc.message}), exc.status


@app.errorhandler(llm.LLMError)
def _llm_error(exc: llm.LLMError):
    return jsonify({"error": str(exc)}), 503


@app.errorhandler(speech.SpeechError)
def _speech_error(exc: speech.SpeechError):
    return jsonify({"error": str(exc)}), 503


@app.errorhandler(RequestEntityTooLarge)
def _too_large(_exc):
    return jsonify({"error": f"That file is larger than {config.MAX_UPLOAD_MB} MB."}), 413


@app.errorhandler(Exception)
def _unexpected(exc: Exception):
    if isinstance(exc, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description}), exc.code
        return exc
    log.exception("Unhandled error on %s", request.path)
    if request.path.startswith("/api/"):
        return jsonify({"error": "Something went wrong on our side. Please try again."}), 500
    return Response("Something went wrong.", status=500)


def body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Expected a JSON body.")
    return data


# ── pages ─────────────────────────────────────────────────────────────────────

PAGES = {
    "/": ("home.html", "home", "VARS"),
    "/studio": ("studio.html", "studio", "Resume Studio"),
    "/build": ("build.html", "build", "Build by voice"),
    "/interview": ("interview.html", "interview", "Mock interview"),
    "/report": ("report.html", "report", "Report"),
    "/cell": ("cell.html", "cell", "Placement cell"),
}


def _page(path: str):
    template, key, title = PAGES[path]
    return render_template(template, page=key, title=title, v=asset_version())


for _path in PAGES:
    app.add_url_rule(_path, endpoint=f"page_{PAGES[_path][1]}", view_func=lambda p=_path: _page(p))


@app.get("/resume/print")
def resume_print():
    return render_template("resume_print.html", v=asset_version())


# ── platform ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "ai": bool(config.GROQ_API_KEY),
        "stt": config.STT_BACKEND,
        "tts": [t for t in config.TTS_CHAIN if t not in speech._disabled_tts],
        "code": coding.capabilities(),
        "signing_ephemeral": config.SIGNING_KEY_EPHEMERAL,
    })


@app.get("/api/roles")
def api_roles():
    return jsonify({"note": roles.catalog()["note"], "roles": roles.public_catalog()})


# ── resume ───────────────────────────────────────────────────────────────────

def _parsed_from_request() -> tuple[resume_parser.ParsedResume, dict]:
    if request.files:
        upload = request.files.get("file")
        if upload is None:
            raise ApiError("Attach the resume as 'file'.")
        data = upload.read()
        try:
            parsed = resume_parser.parse(upload.filename or "", data)
        except resume_parser.ParseError as exc:
            raise ApiError(str(exc)) from exc
        finally:
            del data
        return parsed, {"target_role": request.form.get("target_role") or None, "file_name": upload.filename}
    payload = body()
    parsed = resume_parser.from_text(payload.get("text", ""))
    layout = payload.get("layout") or {}
    parsed.pages = int(layout.get("pages") or max(1, round(len(parsed.text.split()) / 450)))
    parsed.columns = int(layout.get("columns") or 1)
    parsed.images = int(layout.get("images") or 0)
    parsed.tables = int(layout.get("tables") or 0)
    parsed.links = [str(x) for x in (payload.get("links") or [])][:20]
    parsed.file_type = str(layout.get("file_type") or "text")
    return parsed, {"target_role": payload.get("target_role") or None, "file_name": payload.get("file_name")}


@app.post("/api/resume/analyze")
def resume_analyze():
    parsed, meta = _parsed_from_request()
    if len(parsed.text.strip()) < 40:
        raise ApiError("We could not read enough text from this resume. If it is a scanned image, paste the text instead.", 422)
    analysis = resume_analyzer.analyze(parsed, meta["target_role"])
    analysis["file_name"] = meta.get("file_name")
    analysis["links"] = parsed.links
    return jsonify(analysis)


@app.post("/api/resume/role-fit")
def resume_role_fit():
    payload = body()
    role_def = roles.role(payload.get("role", ""))
    if not role_def:
        raise ApiError("Unknown role.")
    return jsonify(roles.match_role(role_def, payload.get("skills") or [], payload.get("text") or ""))


@app.post("/api/resume/jd-match")
def resume_jd():
    payload = body()
    jd = (payload.get("jd") or "").strip()
    text = (payload.get("text") or "").strip()
    if len(jd) < 80:
        raise ApiError("Paste the full job description (at least a few lines).")
    if not text:
        raise ApiError("Upload or build a resume first.")
    return jsonify(coach.jd_match(text, jd))


@app.post("/api/resume/rewrite")
def resume_rewrite():
    payload = body()
    line = (payload.get("line") or "").strip()
    if not line:
        raise ApiError("Nothing to rewrite.")
    return jsonify(coach.rewrite(line, payload.get("role_title") or "the target role", payload.get("context") or ""))


@app.post("/api/chat")
def chat():
    payload = body()
    question = (payload.get("question") or "").strip()
    if not question:
        raise ApiError("Ask a question first.")
    messages = coach.chat_messages(
        payload.get("lines") or [], payload.get("findings") or [], payload.get("role_title") or "", payload.get("history") or [], question
    )

    @stream_with_context
    def generate():
        try:
            for delta in llm.stream(messages, tier="smart", effort="low"):
                yield delta
        except llm.LLMError as exc:
            yield f"\n\n[[error]] {exc}"

    return Response(generate(), mimetype="text/plain; charset=utf-8", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"})


# ── speech ───────────────────────────────────────────────────────────────────

@app.post("/api/speech/transcribe")
def speech_transcribe():
    upload = request.files.get("audio")
    if upload is None:
        raise ApiError("No audio received.")
    mode = "translate" if request.form.get("mode") == "translate" else "transcribe"
    audio = upload.read()
    try:
        result = speech.transcribe(audio, upload.filename or "audio.webm", mode)
    finally:
        del audio
    data = result.to_dict()
    data["delivery"] = speech.delivery_stats(result)
    if not data["text"]:
        raise ApiError("No speech was detected. Check your microphone and try again.", 422)
    return jsonify(data)


@app.post("/api/speech/tts")
def speech_tts():
    payload = body()
    try:
        mime, chunks = speech.tts(payload.get("text", ""), payload.get("persona", "meera"))
    except speech.SpeechError as exc:
        return jsonify({"error": str(exc), "fallback": "browser"}), 503
    return Response(stream_with_context(chunks), mimetype=mime, headers={"Cache-Control": "no-store"})


# ── build by voice ───────────────────────────────────────────────────────────

@app.post("/api/voice/process")
def voice_process():
    payload = body()
    transcript = (payload.get("transcript") or "").strip()
    if not transcript:
        raise ApiError("The transcript is empty.")
    return jsonify(voice_resume.process(payload.get("resume") or {}, transcript))


@app.post("/api/voice/refine")
def voice_refine():
    payload = body()
    resume = payload.get("resume") or {}
    if not voice_resume.has_content(resume):
        raise ApiError("Add some details before polishing.")
    refined = voice_resume.refine(resume)
    return jsonify({"resume": refined, "text": resume_analyzer.structured_to_text(refined), "errors": voice_resume.validate(refined)})


@app.post("/api/voice/to-text")
def voice_to_text():
    payload = body()
    return jsonify({"text": resume_analyzer.structured_to_text(payload.get("resume") or {})})


# ── interview ────────────────────────────────────────────────────────────────

@app.post("/api/interview/plan")
def interview_plan():
    payload = body()
    cfg = payload.get("config") or {}
    if cfg.get("drive") and cfg.get("drive_sig"):
        if not signing.verify(cfg["drive"], cfg["drive_sig"], "drive"):
            raise ApiError("This drive link has been altered or has expired. Ask your placement cell for a fresh link.", 403)
        drive = cfg["drive"]
        cfg.update({k: drive[k] for k in ("role", "company", "level", "counts", "coding") if k in drive})
        cfg["custom_questions"] = drive.get("questions") or []
    problems = []
    n_coding = int((cfg.get("counts") or {}).get("coding", 1) or 0)
    if n_coding:
        problems = coding.pick(cfg.get("level", "fresher"), n_coding)
        cfg["coding_title"] = problems[0]["title"] if problems else ""
    plan = interview.plan(cfg, payload.get("resume"))
    plan["problems"] = problems
    return jsonify(plan)


@app.post("/api/interview/turn")
def interview_turn():
    return jsonify(interview.turn(body()))


@app.post("/api/interview/code-review")
def interview_code_review():
    return jsonify(interview.review_code(body()))


@app.post("/api/interview/report")
def interview_report():
    payload = body()
    session = payload.get("session") or {}
    if not session.get("questions") and not session.get("coding"):
        raise ApiError("There are no answers to report on yet.")
    return jsonify(interview.report(session))


# ── code ─────────────────────────────────────────────────────────────────────

@app.get("/api/code/problems")
def code_problems():
    return jsonify({"problems": coding.summaries(), "capabilities": coding.capabilities()})


@app.get("/api/code/problem/<pid>")
def code_problem(pid: str):
    problem = coding.problem(pid)
    if not problem:
        raise ApiError("Unknown problem.", 404)
    return jsonify(problem)


@app.post("/api/code/run")
def code_run():
    payload = body()
    language = payload.get("language")
    tests = payload.get("tests") or []
    if payload.get("problem_id") and payload.get("hidden"):
        problem = coding.problem(payload["problem_id"])
        if not problem:
            raise ApiError("Unknown problem.", 404)
        tests = problem["samples"] + problem["tests"]
    try:
        return jsonify(coding.run(language, payload.get("code", ""), tests))
    except PermissionError as exc:
        raise ApiError(str(exc), 403) from exc
    except (RuntimeError, ValueError) as exc:
        raise ApiError(str(exc)) from exc


# ── signing (placement cell) ─────────────────────────────────────────────────

@app.post("/api/sign")
def sign():
    payload = body()
    kind = payload.get("kind")
    if kind not in {"report", "drive"}:
        raise ApiError("Unknown kind.")
    data = payload.get("payload")
    if not isinstance(data, dict):
        raise ApiError("Nothing to sign.")
    sig = signing.sign(data, kind)
    result = {"sig": sig, "ephemeral": config.SIGNING_KEY_EPHEMERAL}
    if kind == "drive":
        result["token"] = signing.encode_link({"d": data, "s": sig})
    return jsonify(result)


@app.post("/api/verify")
def verify():
    payload = body()
    kind = payload.get("kind")
    if kind not in {"report", "drive"}:
        raise ApiError("Unknown kind.")
    if payload.get("token"):
        try:
            decoded = signing.decode_link(payload["token"])
        except Exception as exc:
            raise ApiError("This link is damaged.") from exc
        valid = signing.verify(decoded.get("d"), decoded.get("s", ""), kind)
        return jsonify({"valid": valid, "payload": decoded.get("d") if valid else None, "sig": decoded.get("s") if valid else None})
    return jsonify({"valid": signing.verify(payload.get("payload"), payload.get("sig", ""), kind)})


if __name__ == "__main__":
    if config.SIGNING_KEY_EPHEMERAL:
        log.info("VARS_SIGNING_KEY is not set: report and drive signatures will reset when the server restarts.")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, use_reloader=False, threaded=True)
