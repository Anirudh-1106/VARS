"""Mock interview engine: plan → adaptive turns → code review → report.

The server keeps no interview state. The browser sends whatever context a
step needs and stores the results itself.
"""

from __future__ import annotations

import json
import re
from statistics import mean

from services import llm, roles

COMPANY_STYLES = {
    "service": "a large IT services company running a mass campus drive: fundamentals, clarity, attitude and trainability matter most",
    "product": "a product company: depth, problem solving, trade-offs and ownership of what you built",
    "startup": "an early-stage startup: breadth, speed of learning, shipping end to end, and initiative",
}
LEVELS = {
    "fresher": "a final-year student with internships and projects; keep questions fair for a fresher",
    "intern": "a student with real internship experience; expect concrete detail",
    "stretch": "push beyond the basics like a demanding panel; ask why and how at every step",
}

PLAN_SYSTEM = """You design a realistic mock placement interview for an Indian engineering student.
You are writing the exact words two interviewers will SAY ALOUD, so keep them natural, short and spoken (no lists, no markdown).

Return ONLY JSON:
{"opening": "technical interviewer's spoken greeting: introduce yourself by name and role, put the student at ease in one line, explain the rounds briefly (max 45 words). Do not ask a question here.",
 "questions": [{"id": "t1", "round": "technical|hr", "kind": "intro|resume|fundamentals|scenario|behavioural|situational|motivation",
                "ask": "the spoken question, max 35 words, one question only",
                "grounding": "the exact resume item or role topic this comes from",
                "rubric": ["3 to 5 points a strong answer covers"],
                "probe": "what to dig into if the answer is thin"}],
 "coding_intro": "technical interviewer's spoken handover into the coding problem; mention its title (max 35 words)",
 "hr_intro": "HR interviewer's spoken self-introduction when taking over (max 35 words)",
 "closing": "HR interviewer's spoken close: thank them, say the report is ready (max 30 words)"}

Rules:
- Technical round first: question t1 is always kind "intro" (tell me about yourself, tailored).
- Resume questions must name the student's actual projects, internships or tools, and ask HOW and WHY, not just WHAT.
- Fundamentals questions cover the role's core topics at the stated level.
- HR questions (ids h1, h2...) cover behaviour (STAR-worthy), situations, motivation and culture fit for the company style. Avoid illegal or personal questions.
- Never repeat a topic. Vary openers; do not start every question with "Can you".
- Use the ids t1..tN for technical and h1..hN for HR in order."""

TURN_SYSTEM = """You are a sharp but fair interviewer in a live mock interview with an Indian engineering student.
Judge the latest answer against the rubric, then decide what you say next.

Return ONLY JSON:
{"evaluation": {"score": 0-10, "clarity": 0-10, "verdict": "strong|adequate|weak|no_answer",
                "strengths": ["specific things they got right"], "gaps": ["specific things missing or wrong"],
                "model_answer": "what a strong answer would contain, 2-4 sentences, using their real background where possible"},
 "action": "follow_up|next",
 "ack": "your brief spoken acknowledgement only: one of \"Okay.\", \"Right.\", \"Got it.\", \"Alright.\", \"Fair enough.\", \"Okay, thank you.\" -- or, ONLY if they did not know, one short sentence hinting at the idea (max 22 words)",
 "say": "exactly what you say aloud now (ack plus follow-up or next question)",
 "follow_up": "the follow-up question if action is follow_up, else empty"}

How to decide:
- follow_up when the answer is vague, misses a key rubric point, or makes a claim worth probing, AND follow-ups remain.
- next when the answer is solid, when they clearly do not know (do not interrogate), or when no follow-ups remain.
- NEVER ask a follow-up that covers the same topic as the Next question; that question is coming anyway.
- "say" starts with a brief neutral acknowledgement (max 10 words). Do NOT praise ("great answer", "excellent").
  Real interviewers say things like "Okay.", "Right, got it.", "Fair enough.", "Hmm, okay."
- If action is next and a next question is given, continue straight into it, rephrased naturally; keep its meaning.
- If action is next and no next question is given, say only the acknowledgement plus the given transition line.
- If they said they do not know, you may give a one-line hint of the idea before moving on.
- Score the content of what they said, not their English. 0 means no attempt; 5 is a pass for a fresher; 8+ is genuinely strong."""

CODE_SYSTEM = """You review a candidate's solution in a coding interview, like a senior engineer.
Return ONLY JSON:
{"scores": {"correctness": 0-10, "efficiency": 0-10, "style": 0-10},
 "complexity": {"time": "Big-O of their code", "space": "Big-O"},
 "optimal": "best known time complexity for this problem",
 "notes": ["2 to 4 specific observations about their code: approach, naming, structure, edge cases"],
 "bugs": ["concrete bugs or failing edge cases, empty if none"],
 "follow_up": "one spoken follow-up question about THIS solution (max 30 words): complexity, an edge case, or how to optimise"}
Base correctness mostly on the test results provided. Be specific; quote identifiers from their code."""

REPORT_SYSTEM = """You write the debrief after a mock placement interview, as the panel would to a student they want to help.
The numbers are already computed; do not change them. Be specific and cite question ids like (t3) or (h1).

Return ONLY JSON:
{"headline": "one sentence that captures the performance honestly",
 "summary": "3 to 4 sentences: how the interview went, what stood out, what decides the next attempt",
 "strengths": ["3 specific strengths with question ids"],
 "gaps": [{"area": "short name", "evidence": "what happened, with question id", "fix": "one concrete action"}],
 "better_answers": [{"qid": "id", "question": "the question", "you_said": "short faithful paraphrase", "say_instead": "a stronger 2-4 sentence answer the student could truthfully give tomorrow. HARD RULE: state as done ONLY what their answer or resume says they did; every improvement they did not do is phrased 'I would ...' or 'Next time I would ...'; no numbers unless they gave them"}],
 "plan": [{"week": 1, "focus": "theme", "tasks": ["2 to 4 concrete tasks"]}]}
Rules: 3 to 5 gaps, 2 to 3 better_answers for the weakest questions, a 3-week plan tied to the gaps. No generic advice like "practise more".
"area" is a short human label in sentence case (e.g. "Authentication design"), never a snake_case key.
Never invent numbers, metrics or experience the student did not mention: in examples and stronger answers use
placeholders such as [N users] or [X%] wherever a figure would go.
"say_instead" may only claim actions the student said they actually took; anything they said they would do
stays "I would ..." or becomes a stated plan. Never add tools, steps or results they did not mention.
Never attach an example to one of their projects unless they used that example in this answer."""


def _first_name(name: str | None) -> str:
    return (name or "").strip().split(" ")[0] if name else ""


def plan(config: dict, resume: dict | None) -> dict:
    role_def = roles.role(config.get("role") or "") or roles.roles()[0]
    counts = config.get("counts") or {}
    n_tech = max(0, min(10, int(counts.get("technical", 5))))
    n_hr = max(0, min(6, int(counts.get("hr", 3))))
    style = COMPANY_STYLES.get(config.get("company", "service"), COMPANY_STYLES["service"])
    level = LEVELS.get(config.get("level", "fresher"), LEVELS["fresher"])
    tech_name = config.get("tech_name", "Meera")
    hr_name = config.get("hr_name", "Arjun")
    resume_brief = json.dumps(resume or {}, ensure_ascii=False)[:9000] if resume else "No resume provided: ask about their background in general and lean on role fundamentals."
    drive_qs = [q for q in (config.get("custom_questions") or []) if isinstance(q, str) and q.strip()][:5]

    user = (
        f"Target role: {role_def['title']}\nRole summary: {role_def['summary']}\n"
        f"Core topics: {', '.join(c['skill'] for c in role_def['core'])}\nCommon interview topics: {'; '.join(role_def.get('topics', []))}\n"
        f"Company style: {style}\nCandidate level: {level}\n"
        f"Technical interviewer: {tech_name}. HR interviewer: {hr_name}.\n"
        f"Student first name: {_first_name((resume or {}).get('name')) or 'unknown'}\n"
        f"Technical questions: {n_tech} (about half from the resume, the rest fundamentals/scenarios). HR questions: {n_hr}.\n"
        f"Estimated total duration: about {round(n_tech * 3 + n_hr * 2.5 + (15 if config.get('coding_title') else 0))} minutes (use this number if you mention duration).\n"
        f"Coding problem title (for coding_intro): {config.get('coding_title') or 'none'}\n"
        + (f"Placement-cell questions to include in the right round, verbatim meaning: {json.dumps(drive_qs)}\n" if drive_qs else "")
        + f"\nRESUME JSON:\n{resume_brief}"
    )
    data = llm.json_call(PLAN_SYSTEM, user, tier="smart", effort="low", temperature=0.6, max_tokens=7000)

    questions = []
    for q in data.get("questions") or []:
        if not isinstance(q, dict) or not q.get("ask"):
            continue
        rnd = "hr" if str(q.get("round", "")).lower().startswith("hr") or str(q.get("id", "")).startswith("h") else "technical"
        questions.append({
            "id": str(q.get("id") or ""),
            "round": rnd,
            "kind": str(q.get("kind") or ("behavioural" if rnd == "hr" else "fundamentals")),
            "ask": str(q["ask"]).strip(),
            "grounding": str(q.get("grounding") or ""),
            "rubric": [str(r) for r in (q.get("rubric") or [])][:5],
            "probe": str(q.get("probe") or ""),
        })
    tech = [q for q in questions if q["round"] == "technical"][:n_tech]
    hr = [q for q in questions if q["round"] == "hr"][:n_hr]
    for i, q in enumerate(tech, 1):
        q["id"] = f"t{i}"
    for i, q in enumerate(hr, 1):
        q["id"] = f"h{i}"
    if not tech and n_tech:
        raise llm.LLMError("Could not prepare the interview questions. Please try again.")
    return {
        "opening": str(data.get("opening") or f"Hi, I'm {tech_name}. Let's begin."),
        "questions": tech + hr,
        "coding_intro": str(data.get("coding_intro") or "Let's move to a coding problem."),
        "hr_intro": str(data.get("hr_intro") or f"Hi, I'm {hr_name} from HR. I'll take it from here."),
        "closing": str(data.get("closing") or "Thank you for your time today. Your report is ready."),
        "role_title": role_def["title"],
    }


_STOP = set("a an the and or of to in on for with you your how what why did do does was were is are that this those these it at as by from me my about can could would walk through".split())


def _overlap(a: str, b: str) -> float:
    wa = {w for w in re.findall(r"[a-z0-9]+", a.lower()) if w not in _STOP}
    wb = {w for w in re.findall(r"[a-z0-9]+", b.lower()) if w not in _STOP}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / min(len(wa), len(wb))


def turn(payload: dict) -> dict:
    q = payload.get("question") or {}
    exchange = payload.get("exchange") or []
    convo = "\n".join(f"{'INTERVIEWER' if t.get('who') == 'interviewer' else 'CANDIDATE'}: {str(t.get('text', ''))[:2500]}" for t in exchange[-8:])
    remaining = max(0, int(payload.get("follow_ups_left", 0)))
    next_ask = payload.get("next_ask") or ""
    transition = payload.get("transition") or ""
    delivery = payload.get("delivery") or {}
    user = (
        f"Role: {payload.get('role_title', '')}. Level: {payload.get('level', 'fresher')}.\n"
        f"Question ({q.get('kind', '')}): {q.get('ask', '')}\nGrounding: {q.get('grounding', '')}\n"
        f"Rubric: {json.dumps(q.get('rubric') or [])}\nProbe if thin: {q.get('probe', '')}\n"
        f"Follow-ups remaining: {remaining}\n"
        f"Next question: {next_ask or 'none'}\nTransition line if no next question: {transition or 'none'}\n"
        f"Delivery (for context only): {json.dumps(delivery)}\n\nConversation so far on this question:\n{convo}"
    )
    data = llm.json_call(TURN_SYSTEM, user, tier="smart", effort="low", temperature=0.4, max_tokens=3000)
    ev = data.get("evaluation") or {}

    def clamp(v, default=0):
        try:
            return max(0, min(10, int(round(float(v)))))
        except (TypeError, ValueError):
            return default

    action = "follow_up" if data.get("action") == "follow_up" and remaining > 0 and data.get("follow_up") else "next"
    if action == "follow_up" and next_ask and _overlap(str(data.get("follow_up")), next_ask) > 0.42:
        action = "next"
    say = str(data.get("say") or "").strip()
    follow = str(data.get("follow_up") or "").strip()
    if action == "follow_up":
        # Make sure the spoken line actually asks the follow-up.
        if follow and follow[:40].lower() not in say.lower():
            say = f"{say} {follow}".strip()
    else:
        target = next_ask or transition
        if target and "?" not in say and target[:30].lower() not in say.lower():
            say = f"{say or 'Okay.'} {target}".strip()
        if not say:
            say = target or "Okay."
    return {
        "evaluation": {
            "score": clamp(ev.get("score")),
            "clarity": clamp(ev.get("clarity"), 5),
            "verdict": ev.get("verdict") if ev.get("verdict") in {"strong", "adequate", "weak", "no_answer"} else "adequate",
            "strengths": [str(s) for s in (ev.get("strengths") or [])][:4],
            "gaps": [str(s) for s in (ev.get("gaps") or [])][:4],
            "model_answer": str(ev.get("model_answer") or ""),
        },
        "action": action,
        "ack": (str(data.get("ack") or "").strip() or "Okay.")[:200],
        "say": say,
        "follow_up": str(data.get("follow_up") or "") if action == "follow_up" else "",
    }


def review_code(payload: dict) -> dict:
    problem = payload.get("problem") or {}
    results = payload.get("results") or {}
    user = (
        f"Problem: {problem.get('title', '')}\n{str(problem.get('statement', ''))[:2500]}\n"
        f"Expected best complexity hint: {problem.get('expected', '')}\n"
        f"Language: {payload.get('language', '')}\n"
        f"Tests passed: {results.get('passed', 0)} of {results.get('total', 0)}. Failures: {json.dumps(results.get('failures', [])[:3])[:1500]}\n"
        f"Time taken: {payload.get('minutes', '?')} minutes. Runs before submit: {payload.get('runs', 0)}\n\n"
        f"Code:\n```\n{str(payload.get('code', ''))[:9000]}\n```"
    )
    data = llm.json_call(CODE_SYSTEM, user, tier="smart", effort="low", temperature=0.2, max_tokens=4000)
    sc = data.get("scores") or {}

    def clamp(v):
        try:
            return max(0, min(10, int(round(float(v)))))
        except (TypeError, ValueError):
            return 0

    cx = data.get("complexity") or {}
    return {
        "scores": {k: clamp(sc.get(k)) for k in ("correctness", "efficiency", "style")},
        "complexity": {"time": str(cx.get("time") or "?"), "space": str(cx.get("space") or "?")},
        "optimal": str(data.get("optimal") or ""),
        "notes": [str(n) for n in (data.get("notes") or [])][:4],
        "bugs": [str(b) for b in (data.get("bugs") or [])][:4],
        "follow_up": str(data.get("follow_up") or "Walk me through the time complexity of your solution."),
    }


def _avg(values, default=None):
    vals = [v for v in values if isinstance(v, (int, float))]
    return mean(vals) if vals else default


def compute_scores(session: dict) -> dict:
    qs = session.get("questions") or []
    tech = [q for q in qs if q.get("round") == "technical" and q.get("evaluation")]
    hr = [q for q in qs if q.get("round") == "hr" and q.get("evaluation")]
    resume_qs = [q for q in tech if q.get("kind") in {"resume", "intro"}]
    fund = [q for q in tech if q.get("kind") in {"fundamentals", "scenario"}]
    coding = session.get("coding") or []

    def score10(items, key="score"):
        return _avg([q["evaluation"].get(key) for q in items])

    comp: dict[str, int | None] = {}
    t = score10(tech)
    comp["technical_depth"] = round(t * 10) if t is not None else None
    comp["resume_ownership"] = round(score10(resume_qs) * 10) if resume_qs else comp["technical_depth"]
    comp["behavioural"] = round(score10(hr) * 10) if hr else None

    if coding:
        parts = []
        for c in coding:
            res = c.get("results") or {}
            rate = (res.get("passed", 0) / res["total"]) if res.get("total") else 0
            rev = (c.get("review") or {}).get("scores") or {}
            quality = _avg([rev.get("correctness"), rev.get("efficiency"), rev.get("style")], 0)
            parts.append(60 * rate + 4 * quality)
        comp["coding"] = round(mean(parts))
    else:
        comp["coding"] = None

    ps_inputs = [score10(fund)] + [((c.get("review") or {}).get("scores") or {}).get("efficiency") for c in coding]
    ps = _avg([v for v in ps_inputs if v is not None])
    comp["problem_solving"] = round(ps * 10) if ps is not None else comp["technical_depth"]

    clarity = score10(tech + hr, "clarity")
    deliveries = [q.get("delivery") for q in qs if q.get("delivery")]
    delivery_score = None
    if deliveries:
        wpms = [d["wpm"] for d in deliveries if d.get("wpm")]
        secs = sum(d.get("seconds", 0) for d in deliveries) or 1
        fillers = sum(d.get("filler_total", 0) for d in deliveries)
        per_min = fillers / (secs / 60)
        pace = _avg(wpms)
        pace_score = 100 if pace and 110 <= pace <= 165 else 75 if pace and 90 <= pace <= 190 else 55 if pace else 70
        filler_score = 100 if per_min < 2 else 80 if per_min < 4 else 60 if per_min < 7 else 40
        delivery_score = round(0.5 * pace_score + 0.5 * filler_score)
    if clarity is not None:
        comp["communication"] = round(0.65 * clarity * 10 + 0.35 * (delivery_score if delivery_score is not None else clarity * 10))
    else:
        comp["communication"] = delivery_score

    weights = {"technical_depth": 0.24, "problem_solving": 0.16, "coding": 0.2, "communication": 0.16, "behavioural": 0.14, "resume_ownership": 0.10}
    present = {k: v for k, v in comp.items() if v is not None}
    total_w = sum(weights[k] for k in present) or 1
    overall = round(sum(present[k] * weights[k] for k in present) / total_w) if present else 0
    below = [k for k, v in present.items() if v < 60]
    if not below:
        status = {"code": "CNF", "n": 0}
    elif len(below) <= 2:
        status = {"code": "RAC", "n": len(below)}
    else:
        status = {"code": "WL", "n": len(below)}
    verdict = "strong_hire" if overall >= 80 else "hire" if overall >= 65 else "lean_no" if overall >= 50 else "no"
    return {"competencies": comp, "overall": overall, "status": status, "below_bar": below, "verdict": verdict, "delivery_score": delivery_score}


def report(session: dict) -> dict:
    numbers = compute_scores(session)
    qs = session.get("questions") or []
    lines = []
    for q in qs:
        answers = " / ".join(a for a in (q.get("answers") or []) if a)[:1200]
        ev = q.get("evaluation") or {}
        lines.append({
            "id": q.get("id"), "round": q.get("round"), "kind": q.get("kind"), "question": q.get("ask"),
            "answer": answers or "(no answer)", "score": ev.get("score"), "gaps": ev.get("gaps"),
        })
    coding = [
        {"title": (c.get("problem") or {}).get("title"), "passed": (c.get("results") or {}).get("passed"),
         "total": (c.get("results") or {}).get("total"), "review": c.get("review")}
        for c in (session.get("coding") or [])
    ]
    user = (
        f"Role: {session.get('role_title', '')}. Company style: {session.get('company', '')}. Level: {session.get('level', '')}.\n"
        f"Computed numbers (fixed): {json.dumps(numbers)}\n"
        f"Questions and answers:\n{json.dumps(lines, ensure_ascii=False)[:14000]}\n"
        f"Coding:\n{json.dumps(coding, ensure_ascii=False)[:3000]}\n"
        f"Resume summary: {json.dumps(session.get('resume_brief') or {}, ensure_ascii=False)[:2500]}"
    )
    try:
        data = llm.json_call(REPORT_SYSTEM, user, tier="smart", effort="medium", temperature=0.15, max_tokens=8000)
    except llm.LLMError as exc:
        data = {"headline": "Your interview is scored; the written debrief could not be generated.", "summary": str(exc)}
    # Never let the debrief invent figures the student did not say.
    from services.resume_analyzer import guard_rewrite

    spoken = " ".join(" ".join(q.get("answers") or []) for q in qs) + " " + json.dumps(session.get("resume_brief") or {})
    by_id = {str(q.get("id")): " ".join(q.get("answers") or []) for q in qs}
    brief = json.dumps(session.get("resume_brief") or {})
    for item in data.get("better_answers") or []:
        if isinstance(item, dict) and item.get("say_instead"):
            own = by_id.get(str(item.get("qid")), "") + " " + brief
            text = keep_plans_as_plans(by_id.get(str(item.get("qid")), ""), str(item["say_instead"]))
            item["say_instead"], _ = guard_rewrite(str(item.get("you_said") or ""), text, own)
    for gap in data.get("gaps") or []:
        if isinstance(gap, dict) and gap.get("fix"):
            gap["fix"], _ = guard_rewrite("", str(gap["fix"]), spoken)
    return {
        **numbers,
        "headline": str(data.get("headline") or ""),
        "summary": str(data.get("summary") or ""),
        "strengths": [str(s) for s in (data.get("strengths") or [])][:5],
        "gaps": [g for g in (data.get("gaps") or []) if isinstance(g, dict)][:5],
        "better_answers": [b for b in (data.get("better_answers") or []) if isinstance(b, dict)][:3],
        "plan": [p for p in (data.get("plan") or []) if isinstance(p, dict)][:4],
    }


_PLAN_RE = re.compile(r"\b(?:i would|i'd|i will|i'll|would|could|should|plan to|want to)\s+([^.;!?]+)", re.I)
_PLAN_WORDS = re.compile(r"\b(would|next time|i'd|plan|could|should|will)\b", re.I)


def keep_plans_as_plans(answer: str, rewrite: str) -> str:
    """If the student said they *would* do something, the rewrite may not say they did it.

    Sentences that mention a planned item without plan wording are replaced by
    one honest "Next time I would ..." line built from the student's own words.
    """
    plans = [m.group(1).strip(" ,") for m in _PLAN_RE.finditer(answer or "")]
    if not plans:
        return rewrite
    keys = {
        w.lower()
        for plan in plans
        for w in re.findall(r"[A-Za-z][A-Za-z\-]{3,}", plan)
        if w.lower() not in _STOP and w.lower() not in {"also", "more", "some", "things", "better", "maybe"}
    }
    sentences = re.split(r"(?<=[.!?])\s+", (rewrite or "").strip())
    kept, dropped = [], False
    for sentence in sentences:
        words = {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z\-]{3,}", sentence)}
        if keys & words and not _PLAN_WORDS.search(sentence):
            dropped = True
            continue
        kept.append(sentence)
    if dropped:
        kept.append(f"Next time I would {plans[0].rstrip('.')}.")
    return " ".join(kept).strip()


def sanitize_text(value: str, limit: int = 4000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]
