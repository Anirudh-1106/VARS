"""Resume coaching: job-description match, line rewrites and chat."""

from __future__ import annotations

import json
import re

from services import llm

JD_SYSTEM = """You compare a candidate's resume with a job description, the way an applicant tracking system and a recruiter would.
Return ONLY JSON:
{"role_title": "title from the JD",
 "keywords": [{"term": "skill or requirement from the JD", "importance": "must|nice", "found": true|false,
               "evidence": "short verbatim phrase from the resume that shows it, or empty"}],
 "match": 0-100,
 "summary_rewrite": "a 2-sentence summary tailored to this JD using only facts from the resume",
 "emphasise": ["up to 3 existing resume lines to move up or expand, quoted"],
 "gaps": [{"term": "missing requirement", "advice": "one honest sentence: learn it, or show adjacent evidence"}],
 "verdict": "two plain sentences"}
Rules: 10 to 20 keywords, deduplicated, concrete (tools, skills, qualifications), not soft fluff.
Never claim the candidate has something the resume does not show."""

REWRITE_SYSTEM = """You rewrite one resume line for an Indian engineering graduate targeting a specific role.
Return ONLY JSON: {"options": [{"text": "rewritten line", "style": "short label e.g. Result first"}], "needs": ["facts the student must fill in"]}
Rules: exactly 3 options, each under 28 words, start with a strong past-tense verb, keep every fact, invent nothing.
Where a number would strengthen the line, use a bracketed placeholder like [N users] or [X%]."""

CHAT_SYSTEM = """You are VARS, a placement coach talking to a student about THEIR resume.
You have their resume (line-numbered), the analysis findings and their target role below.
Answer like an experienced mentor: specific, warm but direct, practical. Quote the words of their resume lines when relevant;
never mention line numbers (the student cannot see them).
Keep answers short: under 180 words unless they ask for more. Use short paragraphs or "-" bullets; use **bold** sparingly.
Never invent experience they do not have. When suggesting numbers, use placeholders like [N].
If asked something unrelated to careers, placements, interviews or their resume, steer back politely in one line."""


def jd_match(resume_text: str, jd_text: str) -> dict:
    user = f"RESUME:\n\"\"\"\n{resume_text[:12000]}\n\"\"\"\n\nJOB DESCRIPTION:\n\"\"\"\n{jd_text[:8000]}\n\"\"\""
    data = llm.json_call(JD_SYSTEM, user, tier="smart", effort="low", temperature=0.2)
    keywords = []
    for k in data.get("keywords") or []:
        if not isinstance(k, dict) or not k.get("term"):
            continue
        term = str(k["term"])[:60]
        found = bool(k.get("found"))
        # Cross-check the model's claim against the actual text.
        literal = re.search(r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])", resume_text, re.I) is not None
        keywords.append({
            "term": term,
            "importance": "must" if k.get("importance") == "must" else "nice",
            "found": found or literal,
            "literal": literal,
            "evidence": str(k.get("evidence") or "")[:160],
        })
    must = [k for k in keywords if k["importance"] == "must"]
    weight_total = len(must) * 2 + (len(keywords) - len(must)) or 1
    weight_hit = sum(2 if k["importance"] == "must" else 1 for k in keywords if k["found"])
    computed = round(100 * weight_hit / weight_total) if keywords else 0
    return {
        "role_title": str(data.get("role_title") or "This role"),
        "keywords": keywords,
        "match": computed,
        "summary_rewrite": str(data.get("summary_rewrite") or ""),
        "emphasise": [str(x) for x in (data.get("emphasise") or [])][:3],
        "gaps": [g for g in (data.get("gaps") or []) if isinstance(g, dict)][:6],
        "verdict": str(data.get("verdict") or ""),
    }


def rewrite(line: str, role_title: str, context: str = "") -> dict:
    user = f"Target role: {role_title}\nSection context: {context[:300]}\nLine: {line[:500]}"
    data = llm.json_call(REWRITE_SYSTEM, user, tier="fast", effort="low", temperature=0.5)
    options = [o for o in (data.get("options") or []) if isinstance(o, dict) and o.get("text")][:3]
    return {"options": options, "needs": [str(n) for n in (data.get("needs") or [])][:4]}


def chat_messages(resume_lines: list[str], findings: list[dict], role_title: str, history: list[dict], question: str) -> list[dict]:
    numbered = "\n".join(f"[{i}] {l}" for i, l in enumerate(resume_lines) if l)[:12000]
    brief = [
        {"id": f.get("id"), "title": f.get("title"), "quote": f.get("quote"), "severity": f.get("severity")}
        for f in (findings or [])[:12]
    ]
    context = f"TARGET ROLE: {role_title}\n\nRESUME:\n{numbered}\n\nOPEN FINDINGS:\n{json.dumps(brief, ensure_ascii=False)}"
    messages = [{"role": "system", "content": CHAT_SYSTEM + "\n\n" + context}]
    for turn in (history or [])[-12:]:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        content = str(turn.get("content") or "")[:4000]
        if content:
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": question[:2000]})
    return messages
