"""Resume scoring: deterministic checks plus a model critique.

Every finding is anchored to a line of the extracted text and quotes it, so
the interface can point at exactly what produced each point lost.
"""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher

from services import llm, roles
from services.resume_parser import ParsedResume

SECTIONS = {
    "summary": ["summary", "profile", "objective", "career objective", "about me", "professional summary", "profile summary"],
    "education": ["education", "academic", "academics", "academic details", "qualification", "qualifications", "educational qualification", "scholastic record"],
    "experience": ["experience", "internship", "internships", "work experience", "employment", "professional experience", "work history", "industrial training", "internship experience"],
    "projects": ["projects", "academic projects", "personal projects", "project work", "key projects", "project", "major project", "mini project"],
    "skills": ["skills", "technical skills", "skill set", "skillset", "technologies", "tech stack", "core competencies", "tools", "technical proficiency", "key skills"],
    "certifications": ["certifications", "certification", "certificates", "courses", "licenses", "online courses"],
    "achievements": ["achievements", "awards", "honors", "honours", "accomplishments", "hackathons", "awards and achievements"],
    "activities": ["extracurricular", "extra curricular activities", "extra-curricular activities", "activities", "leadership", "positions of responsibility", "volunteering", "clubs", "co-curricular activities"],
    "publications": ["publications", "research", "papers"],
    "languages": ["languages", "languages known"],
    "hobbies": ["hobbies", "interests", "hobbies and interests"],
    "declaration": ["declaration"],
    "personal": ["personal details", "personal information", "personal profile", "personal data"],
}
SECTION_LETTER = {
    "summary": "S", "education": "D", "experience": "E", "projects": "P", "skills": "K",
    "certifications": "T", "achievements": "A", "activities": "A", "publications": "A",
    "languages": "L", "hobbies": "H", "declaration": "X", "personal": "X", "header": "C", None: "G",
}

ACTION_VERBS = set("""
accelerated achieved analysed analyzed architected automated benchmarked boosted built championed coded collaborated
compiled configured consolidated constructed coordinated created cut debugged decreased defined delivered deployed
designed developed devised diagnosed directed doubled drove eliminated enabled engineered enhanced established
evaluated executed expanded experimented extracted facilitated fixed formulated founded generated grew halved headed
identified implemented improved increased initiated integrated introduced investigated launched led maintained managed
mapped measured mentored migrated modelled modeled monitored negotiated optimised optimized orchestrated organised organized
overhauled owned partnered piloted planned presented prioritised prioritized processed produced profiled programmed
prototyped published raised rebuilt reduced refactored remodeled replaced researched resolved restructured revamped
saved scaled scheduled scripted secured shipped simplified solved spearheaded standardised standardized streamlined
strengthened structured supervised surveyed synthesised synthesized taught tested tracked trained transformed translated
tuned unified upgraded validated visualised visualized won wrote
""".split())

WEAK_OPENERS = ["responsible for", "worked on", "worked in", "helped", "helped in", "assisted", "assisted in", "involved in",
                "participated in", "handled", "was part of", "part of", "did", "tasked with", "duties included", "in charge of"]
BUZZWORDS = ["hardworking", "hard working", "hard-working", "passionate", "team player", "go-getter", "self-motivated",
             "self motivated", "detail-oriented", "detail oriented", "dynamic", "synergy", "results-driven", "result oriented",
             "result-oriented", "quick learner", "fast learner", "think outside the box", "enthusiastic", "dedicated",
             "highly motivated", "dynamic individual", "seeking a challenging", "reputed organization", "reputed company",
             "challenging position", "growth of the organization"]
SOFT_SKILLS = ["communication", "teamwork", "team work", "leadership", "time management", "problem solving",
               "critical thinking", "adaptability", "creativity", "interpersonal skills", "public speaking"]
BASIC_TOOLS = ["ms office", "microsoft office", "ms word", "microsoft word", "powerpoint", "ms powerpoint", "notepad",
               "internet browsing", "typing", "windows", "email"]
PERSONAL_RE = re.compile(r"\b(date of birth|d\.o\.b|dob|father'?s name|mother'?s name|marital status|religion|caste|nationality|gender|sex\s*:|blood group|passport no)\b", re.I)
DECLARATION_RE = re.compile(r"\b(i hereby declare|hereby declare|declare that the (above|information))", re.I)
PRONOUN_RE = re.compile(r"\b(I|me|my|myself)\b")
METRIC_RE = re.compile(r"(\d+(\.\d+)?\s*(%|x|k|K|L|lakh|cr|crore|ms|s|sec|seconds|users|students|people|members|hours|hrs|days|downloads|requests|rps|qps)|₹|\$|\b\d{2,}\b)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
PHONE_RE = re.compile(r"(\+?\d[\d\s\-()]{8,}\d)")
DATE_STYLES = {
    "Mon YYYY": re.compile(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+'?\d{2,4}\b", re.I),
    "MM/YYYY": re.compile(r"\b(0?[1-9]|1[0-2])\s*[/\-.]\s*(19|20)\d{2}\b"),
}


def _heading_key(line: str) -> str | None:
    clean = re.sub(r"[^a-z &\-]", "", line.lower()).strip(" -&")
    if not clean or len(line) > 48:
        return None
    for key, names in SECTIONS.items():
        if clean in names:
            return key
    # Headings like "TECHNICAL SKILLS:" or "Projects Undertaken"
    if line.isupper() or line.endswith(":") or len(clean.split()) <= 3:
        for key, names in SECTIONS.items():
            if any(clean.startswith(n) for n in names):
                return key
    return None


def map_sections(lines: list[str]) -> tuple[list[str | None], list[dict]]:
    owner: list[str | None] = []
    found: list[dict] = []
    current = "header"
    for idx, line in enumerate(lines):
        key = _heading_key(line) if line else None
        if key:
            current = key
            found.append({"key": key, "line": idx, "heading": line})
        owner.append(current)
    return owner, found


def _is_bullet(line: str, section: str | None) -> bool:
    if line.startswith("• "):
        return True
    return section in {"experience", "projects", "achievements", "activities"} and len(line.split()) >= 7


def _strip_bullet(line: str) -> str:
    return line[2:] if line.startswith("• ") else line


# ── deterministic checks ──────────────────────────────────────────────────────

def heuristics(parsed: ParsedResume, lines: list[str], owner: list[str | None], sections: list[dict], role_family: str) -> dict:
    text = parsed.text
    keys = {s["key"] for s in sections}
    findings: list[dict] = []

    def add(line, quote, section, category, severity, title, detail, fix=""):
        findings.append({
            "line": line, "quote": quote, "section": section, "category": category, "severity": severity,
            "title": title, "detail": detail, "fix": fix, "rewrite": "", "source": "rule",
        })

    links = " ".join(parsed.links) + " " + text
    email = EMAIL_RE.search(text)
    phone = PHONE_RE.search(text)
    linkedin = re.search(r"linkedin\.com/[\w/\-%.]+", links, re.I)
    github = re.search(r"github\.com/[\w\-]+", links, re.I)

    if not email:
        add(None, "", "header", "structure", "high", "No email address", "Recruiters cannot contact you without one.", "Add a professional email at the top.")
    if not phone:
        add(None, "", "header", "structure", "high", "No phone number", "Campus drives call shortlisted students; a missing number costs interviews.", "Add a mobile number with +91.")
    if not linkedin:
        add(None, "", "header", "structure", "low", "No LinkedIn link", "Recruiters cross-check profiles before shortlisting.", "Add linkedin.com/in/your-name.")
    if not github and role_family in {"Software", "Data", "Infrastructure"}:
        add(None, "", "header", "relevance", "medium", "No GitHub link", "For this role, code you can show is the strongest evidence.", "Add github.com/your-username with two pinned projects.")

    if "education" not in keys:
        add(None, "", None, "structure", "high", "No Education section", "Every campus recruiter filters on degree, branch, year and CGPA.", "Add an Education section with degree, college, years and CGPA.")
    if "projects" not in keys and "experience" not in keys:
        add(None, "", None, "structure", "high", "No projects or experience", "Without them there is nothing to ask you about in the technical round.", "Add two projects with what you built, the stack and one result.")
    if "skills" not in keys:
        add(None, "", None, "structure", "medium", "No Skills section", "Applicant tracking systems look for a skills block to match keywords.", "Add a Skills section grouped by Languages, Frameworks, Tools.")

    bullets, verb_ok, metric_ok, weak = [], 0, 0, 0
    pronouns = buzz = long_bullets = 0
    for idx, line in enumerate(lines):
        if not line:
            continue
        section = owner[idx]
        low = line.lower()
        if PERSONAL_RE.search(line):
            add(idx, line[:120], "personal", "practice", "medium", "Personal details on the resume",
                "Date of birth, parents' names, religion or marital status add bias risk and no hiring signal.",
                "Delete this line. Keep only name, contact links and location (city).")
        if DECLARATION_RE.search(line):
            add(idx, line[:120], "declaration", "practice", "low", "Declaration statement",
                "Recruiters skip it and it costs a line you could use for a project.", "Remove the declaration and signature block.")
        for word in BUZZWORDS:
            if re.search(r"\b" + re.escape(word) + r"\b", low):
                buzz += 1
                start = low.find(word)
                add(idx, line[start:start + len(word)], section, "practice", "medium", f"“{line[start:start + len(word)]}” is a claim, not evidence",
                    "Every applicant writes this. Show it through a result instead.", "Replace with a concrete achievement.")
                break
        if PRONOUN_RE.search(_strip_bullet(line)) and section not in {"declaration", "personal"}:
            pronouns += 1
        if section == "skills":
            for soft in SOFT_SKILLS:
                if re.search(r"\b" + re.escape(soft) + r"\b", low):
                    start = low.find(soft)
                    add(idx, line[start:start + len(soft)], "skills", "relevance", "low", "Soft skill in the skills list",
                        "Listing it proves nothing; interviewers look for it in your bullets.", "Move it into a bullet that shows it, e.g. leading a team of [N].")
                    break
            if role_family in {"Software", "Data", "Infrastructure", "Hardware"}:
                for tool in BASIC_TOOLS:
                    if re.search(r"\b" + re.escape(tool) + r"\b", low):
                        start = low.find(tool)
                        add(idx, line[start:start + len(tool)], "skills", "relevance", "low", "Basic tool listed as a skill",
                            "It is assumed for every graduate and dilutes your technical keywords.", "Remove it or replace it with a tool the role uses.")
                        break
        if _is_bullet(line, section):
            body = _strip_bullet(line)
            bullets.append(idx)
            first = re.sub(r"[^a-z]", "", body.split()[0].lower()) if body.split() else ""
            if first in ACTION_VERBS:
                verb_ok += 1
            if METRIC_RE.search(body):
                metric_ok += 1
            opener = next((w for w in WEAK_OPENERS if body.lower().startswith(w)), None)
            if opener:
                weak += 1
                add(idx, body, section, "impact", "high", "Weak opener: “" + body[:len(opener)] + "”",
                    "It describes a duty, not what you achieved.", "Start with a strong verb and add a measurable result.")
            words = len(body.split())
            if words > 36:
                long_bullets += 1
                add(idx, body, section, "clarity", "low", f"Bullet runs {words} words",
                    "Recruiters skim; long bullets hide the result.", "Split it or cut to one line of 15–25 words.")

    if pronouns >= 2:
        add(None, "", None, "practice", "low", f"First-person pronouns used {pronouns} times",
            "Resumes are written in implied first person.", "Drop “I”, “my” and “me” and start lines with verbs.")

    styles = {name for name, rx in DATE_STYLES.items() if rx.search(text)}
    if len(styles) > 1:
        add(None, "", None, "practice", "low", "Mixed date formats", "Using both “Jun 2025” and “06/2025” looks careless.", "Pick one format, e.g. Jun 2025 – Aug 2025.")

    words = len(re.findall(r"\w+", text))
    if parsed.pages > 2:
        add(None, "", None, "structure", "medium", f"{parsed.pages} pages long", "For a fresher, one page is the norm; two at most.", "Cut to one page by trimming older school details and coursework.")
    elif parsed.pages == 2 and "experience" not in keys:
        add(None, "", None, "structure", "low", "Two pages without work experience", "Freshers rarely need more than one page.", "Trim to one page.")
    if words < 180 and parsed.text:
        add(None, "", None, "structure", "medium", f"Only {words} words", "There is not enough detail to judge your work.", "Add bullets describing what you built and the result.")

    if parsed.columns > 1:
        add(None, "", None, "ats", "medium", "Two-column layout", "Many applicant tracking systems read columns out of order and scramble sections.", "Use a single-column layout.")
    if parsed.images:
        add(None, "", None, "ats", "low", "Images or photo in the file", "Most private-sector recruiters in India do not need a photo, and ATS ignores images.", "Remove the photo and graphics; keep icons only if they are text.")
    if parsed.tables:
        add(None, "", None, "ats", "low", "Tables used for layout", "Tables often extract in the wrong order.", "Replace tables with plain lines.")

    # Scores
    n_b = max(len(bullets), 1)
    verb_ratio = verb_ok / n_b
    metric_ratio = metric_ok / n_b
    weak_ratio = weak / n_b
    impact = round(100 * (0.42 * verb_ratio + 0.42 * min(1, metric_ratio * 1.6) + 0.16 * (1 - weak_ratio))) if bullets else 30

    structure = 100
    for f in findings:
        if f["category"] == "structure":
            structure -= {"high": 18, "medium": 9, "low": 4}[f["severity"]]
    order = [s["key"] for s in sections]
    if "education" in order and "projects" in order and "experience" in order and order.index("education") < order.index("experience") and "experience" in keys:
        pass  # freshers often lead with education, which is fine
    structure = max(20, structure)

    ats = 100
    recognised = len(keys & {"summary", "education", "experience", "projects", "skills", "certifications", "achievements"})
    if recognised < 3:
        ats -= 18
    if len(parsed.text) < 80:
        ats = 5
    for f in findings:
        if f["category"] == "ats":
            ats -= {"high": 18, "medium": 14, "low": 7}[f["severity"]]
    if parsed.fonts > 4:
        ats -= 4
    ats = max(5, ats)

    practice = 100 - min(20, buzz * 5) - min(12, pronouns * 3) - min(12, long_bullets * 3)
    for f in findings:
        if f["category"] == "practice" and f["source"] == "rule" and "claim" not in f["title"]:
            practice -= {"high": 10, "medium": 7, "low": 4}[f["severity"]]
    practice = max(20, practice)

    return {
        "findings": findings,
        "scores": {"impact": impact, "structure": structure, "ats": ats, "practice": practice},
        "stats": {
            "words": words, "pages": parsed.pages, "bullets": len(bullets),
            "verb_ratio": round(verb_ratio, 2), "metric_ratio": round(metric_ratio, 2), "weak_openers": weak,
            "pronouns": pronouns, "buzzwords": buzz, "sections": order,
        },
        "contact": {
            "email": email.group(0) if email else None,
            "phone": phone.group(0).strip() if phone else None,
            "linkedin": linkedin.group(0) if linkedin else None,
            "github": github.group(0) if github else None,
        },
    }


# ── model calls ───────────────────────────────────────────────────────────────

EXTRACT_SYSTEM = """You convert resume text into structured JSON. Copy facts exactly; never invent.
Return ONLY a JSON object with this shape:
{"name": str|null, "email": str|null, "phone": str|null, "linkedin": str|null, "github": str|null, "location": str|null,
 "summary": str|null,
 "education": [{"institution": str, "degree": str, "year": str, "score": str}],
 "skills": [str],
 "experience": [{"company": str, "role": str, "duration": str, "bullets": [str]}],
 "projects": [{"name": str, "description": str, "tech_stack": [str], "link": str}],
 "certifications": [str], "achievements": [str]}
Rules: skills are individual items in standard spelling (e.g. "PostgreSQL", "React", "Data Structures and Algorithms").
Include skills used in projects and experience even if not in the skills section. Use "" or [] when absent."""

CRITIQUE_SYSTEM = """You are a senior campus recruiter and resume reviewer for Indian engineering graduates.
You review a resume for a specific target role. Be specific, direct and fair. No flattery, no generic advice.
Each resume line is prefixed with its number like "[12] ". Quote text EXACTLY as it appears on that line.

Return ONLY JSON:
{"verdict": "two plain sentences on how this resume reads for the role",
 "first_impression": ["three short things a recruiter notices in a six-second scan"],
 "scores": {"impact": 0-100, "clarity": 0-100, "relevance": 0-100},
 "findings": [{"line": int, "quote": "verbatim span from that line", "category": "impact|clarity|relevance|practice|grammar",
               "severity": "high|medium|low", "title": "max 8 words", "detail": "one sentence: why it hurts",
               "rewrite": "replacement for the quoted span, or empty string", "needs": ["facts the student must supply"]}],
 "strengths": [{"line": int, "quote": "verbatim span", "why": "one sentence"}],
 "missing": ["up to four things a recruiter for this role expects that are absent"]}

Rules:
- At most 10 findings, most damaging first. Prefer bullets, summary and project descriptions.
- Rewrites must keep the student's facts. NEVER invent numbers, percentages, tools, libraries, companies or results.
  Do not add technologies that are not already in the resume. For the skills line, give advice in "detail" and leave "rewrite" empty. Where a number would help,
  write a bracketed placeholder such as [N users] or [X%] and list it in "needs".
- Rewrites start with a strong past-tense verb and stay under 28 words.
- Lines listed under FLAGGED already have a rule-based issue; give them rewrites if they are in your findings.
- At most 3 strengths, only genuinely strong lines."""


def _numbered(lines: list[str]) -> str:
    return "\n".join(f"[{i}] {line}" for i, line in enumerate(lines) if line)


def llm_extract(text: str) -> dict:
    return llm.json_call(EXTRACT_SYSTEM, f"Resume text:\n\"\"\"\n{text[:14000]}\n\"\"\"", tier="fast", effort="low", temperature=0.1)


def llm_critique(lines: list[str], role_title: str, flagged: list[int]) -> dict:
    user = (
        f"Target role: {role_title}\n"
        f"FLAGGED lines: {sorted(set(flagged))[:20]}\n\n"
        f"Resume:\n{_numbered(lines)[:16000]}"
    )
    return llm.json_call(CRITIQUE_SYSTEM, user, tier="smart", effort="medium", temperature=0.2, max_tokens=9000)


# ── assembly ─────────────────────────────────────────────────────────────────

_NUM_RE = re.compile(r"(?<![\[\w])(\d[\d,.]*\s*(?:%|\+|x|k|K|ms|s)?)(?![\w\]])")


def guard_rewrite(original: str, rewrite: str, context: str = "") -> tuple[str, list[str]]:
    """Replace numbers the student never wrote with [X] placeholders."""
    if not rewrite:
        return "", []
    known = set(re.findall(r"\d+", (original or "") + " " + (context or "")))
    needs: list[str] = []

    def swap(match):
        digits = re.findall(r"\d+", match.group(1))
        if digits and all(d in known for d in digits):
            return match.group(1)
        needs.append("a real figure in place of [X]")
        return "[X]" + ("%" if match.group(1).strip().endswith("%") else "")

    guarded = _NUM_RE.sub(swap, rewrite)
    return guarded, needs[:1]

def _anchor(lines: list[str], line: int | None, quote: str) -> tuple[int | None, str]:
    quote = (quote or "").strip().strip("\"“”")
    if quote.startswith("• "):
        quote = quote[2:]
    if not quote:
        return (line if isinstance(line, int) and 0 <= line < len(lines) else None), ""
    if isinstance(line, int) and 0 <= line < len(lines) and quote.lower() in lines[line].lower():
        start = lines[line].lower().find(quote.lower())
        return line, lines[line][start:start + len(quote)]
    for idx, text in enumerate(lines):
        if quote.lower() in text.lower():
            start = text.lower().find(quote.lower())
            return idx, text[start:start + len(quote)]
    best, best_idx = 0.0, None
    for idx, text in enumerate(lines):
        if not text:
            continue
        ratio = SequenceMatcher(None, quote.lower(), text.lower()).ratio()
        if ratio > best:
            best, best_idx = ratio, idx
    if best_idx is not None and best >= 0.72:
        return best_idx, _strip_bullet(lines[best_idx])
    return None, quote


def _merge_findings(lines, owner, rule_findings, model_findings):
    merged: dict[tuple, dict] = {}
    order: list[tuple] = []

    def put(f):
        key = (f["line"], f["category"] if f["line"] is None else "L")
        if f["line"] is None:
            key = (None, f["title"])
        if key in merged:
            existing = merged[key]
            if f.get("rewrite") and not existing.get("rewrite"):
                existing["rewrite"] = f["rewrite"]
                existing["needs"] = f.get("needs", [])
                existing["detail"] = existing["detail"] or f["detail"]
            rank = {"high": 3, "medium": 2, "low": 1}
            if rank[f["severity"]] > rank[existing["severity"]]:
                existing["severity"] = f["severity"]
            return
        merged[key] = f
        order.append(key)

    for f in model_findings:
        put(f)
    for f in rule_findings:
        put(f)

    findings = [merged[k] for k in order]
    sev = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (sev[f["severity"]], f["line"] if f["line"] is not None else -1))
    counters: dict[str, int] = {}
    for f in findings:
        section = f.get("section") or (owner[f["line"]] if f["line"] is not None else None)
        f["section"] = section
        letter = SECTION_LETTER.get(section, "G")
        counters[letter] = counters.get(letter, 0) + 1
        f["id"] = f"{letter}{counters[letter]}"
    return findings


def readiness(open_items: int) -> dict:
    if open_items <= 0:
        return {"code": "CNF", "n": 0}
    if open_items <= 3:
        return {"code": "RAC", "n": open_items}
    return {"code": "WL", "n": open_items}


def analyze(parsed: ParsedResume, target_role: str | None = None) -> dict:
    lines = parsed.text.split("\n")
    owner, sections = map_sections(lines)

    # First pass: rules, using a provisional role so family-specific checks apply.
    provisional = roles.role(target_role) if target_role else None
    heur = heuristics(parsed, lines, owner, sections, provisional["family"] if provisional else "Software")
    flagged = [f["line"] for f in heur["findings"] if f["line"] is not None]

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_extract = pool.submit(llm_extract, parsed.text)
        # The critique needs a role; guess one from raw text if none chosen yet.
        role_guess = provisional or roles.role(roles.suggest_role([], parsed.text)) or roles.roles()[0]
        fut_critique = pool.submit(llm_critique, lines, role_guess["title"], flagged)
        warnings = list(parsed.warnings)
        try:
            structured = fut_extract.result()
        except llm.LLMError as exc:
            structured = {}
            warnings.append(f"Structured extraction failed: {exc}")
        try:
            critique = fut_critique.result()
        except llm.LLMError as exc:
            critique = {}
            warnings.append(f"Detailed review unavailable: {exc}")

    skills = [roles.canonical(s) for s in (structured.get("skills") or []) if isinstance(s, str) and s.strip()]
    seen, clean_skills = set(), []
    for s in skills:
        if s.lower() not in seen:
            seen.add(s.lower())
            clean_skills.append(s)
    structured["skills"] = clean_skills
    for key, value in heur["contact"].items():
        if value and not structured.get(key):
            structured[key] = value

    ranked = roles.rank_roles(clean_skills, parsed.text)
    target_id = target_role if roles.role(target_role or "") else (role_guess["id"])
    target_fit = next(r for r in ranked if r["id"] == target_id)

    model_findings = []
    for f in critique.get("findings") or []:
        if not isinstance(f, dict):
            continue
        line, quote = _anchor(lines, f.get("line"), f.get("quote", ""))
        category = f.get("category") if f.get("category") in {"impact", "clarity", "relevance", "practice", "grammar"} else "clarity"
        severity = f.get("severity") if f.get("severity") in {"high", "medium", "low"} else "medium"
        section_of = owner[line] if line is not None else None
        rewrite_text = str(f.get("rewrite") or "")
        if section_of == "skills":
            rewrite_text = ""
        rewrite_text, extra_needs = guard_rewrite(quote, rewrite_text, lines[line] if line is not None else "")
        model_findings.append({
            "line": line, "quote": quote, "section": section_of,
            "category": category, "severity": severity,
            "title": str(f.get("title") or "Needs work")[:80], "detail": str(f.get("detail") or ""),
            "fix": "", "rewrite": rewrite_text, "needs": ([str(n) for n in (f.get("needs") or [])] + extra_needs)[:4],
            "source": "review",
        })

    findings = _merge_findings(lines, owner, heur["findings"], model_findings)

    strengths = []
    for s in critique.get("strengths") or []:
        if isinstance(s, dict):
            line, quote = _anchor(lines, s.get("line"), s.get("quote", ""))
            if line is not None:
                strengths.append({"line": line, "quote": quote, "why": str(s.get("why") or "")})

    m = critique.get("scores") or {}

    def num(v, default):
        try:
            return max(0, min(100, int(v)))
        except (TypeError, ValueError):
            return default

    h = heur["scores"]
    impact = round(0.5 * h["impact"] + 0.5 * num(m.get("impact"), h["impact"]))
    relevance = round(0.6 * target_fit["fit"] + 0.4 * num(m.get("relevance"), target_fit["fit"]))
    practice = round(0.6 * h["practice"] + 0.4 * num(m.get("clarity"), h["practice"]))
    scores = {"structure": h["structure"], "impact": impact, "relevance": relevance, "ats": h["ats"], "practice": practice}
    weights = {"impact": 0.28, "relevance": 0.22, "structure": 0.18, "ats": 0.16, "practice": 0.16}
    overall = round(sum(scores[k] * w for k, w in weights.items()))

    # Share of the remaining gap each finding is worth when fixed (projected score).
    w = {"high": 4, "medium": 2, "low": 1}
    total_w = sum(w[f["severity"]] for f in findings) or 1
    gap = max(0, 100 - overall) * 0.8
    for f in findings:
        f["points"] = round(gap * w[f["severity"]] / total_w, 1)

    open_items = sum(1 for f in findings if f["severity"] in {"high", "medium"}) + sum(1 for m in target_fit["missing"] if m["weight"] >= 2)

    return {
        "version": 1,
        "lines": lines,
        "sections": sections,
        "structured": structured,
        "scores": {**scores, "overall": overall},
        "stats": heur["stats"],
        "findings": findings,
        "strengths": strengths,
        "verdict": str(critique.get("verdict") or ""),
        "first_impression": [str(x) for x in (critique.get("first_impression") or [])][:3],
        "missing": [str(x) for x in (critique.get("missing") or [])][:4],
        "roles": ranked,
        "target_role": target_id,
        "readiness": readiness(open_items),
        "layout": {"pages": parsed.pages, "columns": parsed.columns, "images": parsed.images, "tables": parsed.tables, "file_type": parsed.file_type},
        "warnings": warnings,
    }


def rescore_role(analysis_skills: list[str], text: str, role_id: str) -> dict:
    role_def = roles.role(role_id)
    if not role_def:
        raise ValueError("Unknown role")
    return roles.match_role(role_def, analysis_skills, text)


def structured_to_text(data: dict) -> str:
    """Render structured resume JSON (e.g. from the voice builder) as plain text."""
    out: list[str] = []
    if data.get("name"):
        out.append(data["name"])
    contact = " | ".join(x for x in [data.get("email"), data.get("phone"), data.get("linkedin"), data.get("github"), data.get("location")] if x)
    if contact:
        out.append(contact)
    if data.get("summary"):
        out += ["", "SUMMARY", data["summary"]]
    if data.get("education"):
        out += ["", "EDUCATION"]
        for e in data["education"]:
            out.append(" — ".join(x for x in [e.get("degree"), e.get("institution"), e.get("year"), e.get("score")] if x))
    if data.get("experience"):
        out += ["", "EXPERIENCE"]
        for e in data["experience"]:
            out.append(" — ".join(x for x in [e.get("role"), e.get("company"), e.get("duration")] if x))
            out += [f"• {b}" for b in e.get("bullets") or [] if b]
    if data.get("projects"):
        out += ["", "PROJECTS"]
        for p in data["projects"]:
            stack = ", ".join(p.get("tech_stack") or [])
            out.append(p.get("name", "") + (f" ({stack})" if stack else ""))
            if p.get("description"):
                out.append(f"• {p['description']}")
    if data.get("skills"):
        out += ["", "SKILLS", ", ".join(data["skills"])]
    if data.get("certifications"):
        out += ["", "CERTIFICATIONS"] + [f"• {c}" for c in data["certifications"]]
    if data.get("achievements"):
        out += ["", "ACHIEVEMENTS"] + [f"• {a}" for a in data["achievements"]]
    return "\n".join(out).strip()


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)
