"""Build-by-voice: turn spoken transcripts into structured resume data.

Stateless: the browser sends the current resume JSON with each transcript
and receives the updated JSON back.
"""

from __future__ import annotations

import json
import re

from services import llm

EMPTY_RESUME = {
    "name": None, "email": None, "phone": None, "linkedin": None, "github": None, "location": None,
    "summary": None, "education": [], "skills": [], "experience": [], "projects": [],
    "certifications": [], "achievements": [],
}

SCHEMA = """{
  "name": string or null, "email": string or null, "phone": string or null,
  "linkedin": string or null, "github": string or null, "location": string or null,
  "summary": string or null,
  "education": [{"institution": string, "degree": string, "year": string, "score": string}],
  "skills": [string],
  "experience": [{"company": string, "role": string, "duration": string, "bullets": [string]}],
  "projects": [{"name": string, "description": string, "tech_stack": [string], "link": string}],
  "certifications": [string], "achievements": [string]
}"""

INTENT_SYSTEM = """You classify one spoken sentence for a voice resume builder.
"add": the user gives resume content (details, education, experience, skills, projects...).
"modify": the user asks to change, rephrase, reorder or delete something already in the resume.
Return ONLY JSON: {"intent": "add"} or {"intent": "modify"}"""

EXTRACT_SYSTEM = f"""You are a resume-data extraction engine. From the user's spoken transcript, extract structured resume data.
Return ONLY JSON matching exactly:
{SCHEMA}
Rules: never invent anything not in the transcript; use null for missing scalars and [] for missing lists;
keep the user's own statements for bullets without embellishing; skills are short individual items."""

MODIFY_SYSTEM = f"""You are a precise resume editor. Apply the user's spoken instruction to the CURRENT resume JSON.
Delete what they ask to delete, change what they ask to change, rephrase only what they ask to rephrase.
Never invent data. Preserve everything they did not mention. Return ONLY the full updated JSON with this schema:
{SCHEMA}"""

REFINE_SYSTEM = f"""You are a professional resume writer. Improve the wording of this resume JSON while keeping the exact schema and keys.
Strengthen the summary (two concise sentences), turn experience bullets into action-led statements, make project descriptions
clear and technical, normalise skill names, and fix grammar. Never invent data, numbers, links, dates, companies or technologies.
Where a number would help, do not make one up. Return ONLY the JSON with this schema:
{SCHEMA}"""

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4, "may": 5,
    "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def normalize_skills(skills) -> list[str]:
    out, seen = [], set()
    if not isinstance(skills, list):
        skills = []

    def add(value):
        if not isinstance(value, str):
            return
        cleaned = value.strip()
        if not cleaned or cleaned.lower() in {"none", "null", "n/a"} or cleaned.lower() in seen:
            return
        seen.add(cleaned.lower())
        out.append(cleaned)

    for item in skills:
        if isinstance(item, str):
            add(item)
        elif isinstance(item, dict):
            values = item.get("values")
            if isinstance(values, list) and values:
                for v in values:
                    add(v)
            else:
                add(item.get("name"))
    return out


def _year_month(segment: str, default_month: int):
    lowered = (segment or "").lower()
    years = re.findall(r"\b(?:19|20)\d{2}\b", lowered)
    year = int(years[-1]) if years else None
    month = next((n for label, n in MONTHS.items() if re.search(rf"\b{label}\b", lowered)), default_month)
    return year, month


def _exp_key(item: dict):
    duration = (item or {}).get("duration")
    if not isinstance(duration, str) or not duration.strip():
        return (0, 0, 0, 0, 0)
    text = duration.strip().lower()
    parts = re.split(r"\s*(?:-|–|—|to)\s*", text, maxsplit=1)
    current = any(k in text for k in ("present", "current", "now", "ongoing", "till date"))
    if len(parts) == 2:
        sy, sm = _year_month(parts[0], 1)
        ey, em = _year_month(parts[1], 12)
    else:
        sy, sm = _year_month(text, 1)
        ey, em = _year_month(text, 12)
    if current:
        ey, em = 9999, 12
    return (1 if ey is not None else 0, ey or 0, em or 0, sy or 0, sm or 0)


def sort_experience(experience) -> list[dict]:
    items = [e for e in (experience or []) if isinstance(e, dict)]
    return sorted(items, key=_exp_key, reverse=True)


def normalize_spoken_email(email: str) -> str:
    if not isinstance(email, str) or not email.strip():
        return ""
    value = email.strip()
    for pattern, repl in [
        (r"\s*\(at\)\s*", "@"), (r"\s+at\s+the\s+rate\s+of\s+", "@"), (r"\s+at\s+the\s+rate\s+", "@"),
        (r"\s+at\s+", "@"), (r"\s+dot\s+", "."), (r"\s+underscore\s+", "_"), (r"\s+dash\s+", "-"), (r"\s+", ""),
    ]:
        value = re.sub(pattern, repl, value, flags=re.I)
    return value


def _clean(data: dict) -> dict:
    out = {**EMPTY_RESUME}
    for key in out:
        if key in data:
            out[key] = data[key]
    if out.get("email"):
        out["email"] = normalize_spoken_email(out["email"])
    out["skills"] = normalize_skills(out.get("skills"))
    out["experience"] = sort_experience(out.get("experience"))
    for key in ("education", "projects", "certifications", "achievements"):
        if not isinstance(out.get(key), list):
            out[key] = []
    return out


def merge(current: dict, new: dict) -> dict:
    merged = {**EMPTY_RESUME, **(current or {})}
    for field, value in (new or {}).items():
        if field not in EMPTY_RESUME or not value:
            continue
        if isinstance(merged.get(field), list) and isinstance(value, list):
            for item in value:
                if item not in merged[field]:
                    merged[field].append(item)
        else:
            merged[field] = value
    return _clean(merged)


def has_content(data: dict) -> bool:
    return any(v for v in (data or {}).values() if v not in (None, [], ""))


def process(current: dict, transcript: str) -> dict:
    current = _clean(current or {})
    intent = "add"
    if has_content(current):
        try:
            intent = llm.json_call(INTENT_SYSTEM, transcript, tier="fast", temperature=0).get("intent", "add")
        except llm.LLMError:
            intent = "add"
    if intent == "modify":
        updated = llm.json_call(
            MODIFY_SYSTEM,
            f"CURRENT:\n{json.dumps(current, ensure_ascii=False)}\n\nINSTRUCTION:\n{transcript}",
            tier="smart", temperature=0.1,
        )
        return {"action": "modify", "resume": _clean(updated)}
    extracted = llm.json_call(EXTRACT_SYSTEM, f"Transcript:\n{transcript}", tier="smart", temperature=0.1)
    return {"action": "add", "resume": merge(current, extracted)}


def refine(current: dict) -> dict:
    current = _clean(current or {})
    try:
        refined = llm.json_call(REFINE_SYSTEM, json.dumps(current, ensure_ascii=False), tier="smart", temperature=0.3)
        refined = _clean(refined)
    except llm.LLMError:
        refined = current
    return refined


def validate(data: dict) -> list[str]:
    errors = []
    email = (data or {}).get("email")
    if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email.strip()):
        errors.append("Email must look like name@example.com.")
    phone = (data or {}).get("phone")
    if phone:
        digits = re.sub(r"\D", "", phone)
        if not re.fullmatch(r"\+?[\d\s\-()]+", phone.strip()) or not 10 <= len(digits) <= 15:
            errors.append("Phone number must have 10 to 15 digits.")
    return errors
