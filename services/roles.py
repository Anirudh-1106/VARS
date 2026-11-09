"""Role catalogue and deterministic skill matching.

Fit is computed from the resume itself (skills list plus full text) against
each role's weighted core skills, so every percentage can be explained by
listing which skills matched and which are missing.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache

import config

ALIASES = {
    "js": "JavaScript", "javascript": "JavaScript", "es6": "JavaScript",
    "ts": "TypeScript", "typescript": "TypeScript",
    "node": "Node.js", "nodejs": "Node.js", "node.js": "Node.js",
    "reactjs": "React", "react.js": "React", "react js": "React",
    "nextjs": "Next.js", "next js": "Next.js",
    "vuejs": "Vue", "vue.js": "Vue", "angularjs": "Angular",
    "expressjs": "Express", "express.js": "Express",
    "postgres": "PostgreSQL", "postgresql": "PostgreSQL",
    "mongo": "MongoDB", "mongodb": "MongoDB",
    "k8s": "Kubernetes",
    "ml": "Machine Learning", "dl": "Deep Learning",
    "dsa": "Data Structures and Algorithms",
    "oops": "OOP", "oop": "OOP", "object oriented programming": "OOP", "object-oriented programming": "OOP",
    "cpp": "C++", "c plus plus": "C++",
    "golang": "Go",
    "amazon web services": "AWS", "gcp": "Google Cloud", "google cloud platform": "Google Cloud",
    "sklearn": "scikit-learn", "scikit learn": "scikit-learn",
    "tensorflow": "TensorFlow", "pytorch": "PyTorch",
    "restful": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs",
    "html5": "HTML", "css3": "CSS",
    "tailwind": "Tailwind CSS", "tailwindcss": "Tailwind CSS",
    "ci/cd": "CI/CD", "cicd": "CI/CD",
    "ms excel": "Excel", "microsoft excel": "Excel",
    "powerbi": "Power BI", "power-bi": "Power BI",
    "spring": "Spring", "springboot": "Spring Boot",
    "os": "Operating Systems", "cn": "Computer Networks",
    "nlp": "NLP", "cv": "Computer Vision",
}

# Short tokens that are too ambiguous to find in free text.
_TEXT_UNSAFE = {"C", "R", "Go", "OS", "ML", "API", "Auth", "Layout", "Cloud", "Android", "Spring", "Express", "Containers", "Testing"}


@lru_cache(maxsize=1)
def catalog() -> dict:
    with open(config.BASE_DIR / "data" / "roles.json", encoding="utf-8") as fh:
        return json.load(fh)


def roles() -> list[dict]:
    return catalog()["roles"]


def role(role_id: str) -> dict | None:
    return next((r for r in roles() if r["id"] == role_id), None)


def canonical(skill: str) -> str:
    value = re.sub(r"\s+", " ", (skill or "").strip())
    return ALIASES.get(value.lower(), value)


def _norm(value: str) -> str:
    return re.sub(r"[^a-z0-9+#/.]", "", value.lower())


def _in_text(term: str, text: str) -> bool:
    if term in _TEXT_UNSAFE or len(term) <= 2:
        return False
    pattern = r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])"
    return re.search(pattern, text, re.I) is not None


def match_role(role_def: dict, skills: list[str], text: str) -> dict:
    owned = {_norm(canonical(s)) for s in skills if s}
    matched, missing = [], []
    got = total = 0
    for item in role_def["core"]:
        total += item["weight"]
        hit = None
        for alias in item["any"]:
            if _norm(canonical(alias)) in owned or _norm(alias) in owned:
                hit = alias
                break
        if hit is None:
            for alias in item["any"]:
                if _in_text(alias, text):
                    hit = alias
                    break
        if hit:
            got += item["weight"]
            matched.append({"skill": item["skill"], "via": hit, "weight": item["weight"]})
        else:
            missing.append({"skill": item["skill"], "examples": item["any"][:4], "weight": item["weight"]})
    fit = round(100 * got / total) if total else 0
    missing.sort(key=lambda m: -m["weight"])
    return {
        "id": role_def["id"],
        "title": role_def["title"],
        "family": role_def["family"],
        "fit": fit,
        "matched": matched,
        "missing": missing,
    }


def rank_roles(skills: list[str], text: str) -> list[dict]:
    ranked = [match_role(r, skills, text) for r in roles()]
    ranked.sort(key=lambda r: (-r["fit"], len(r["missing"])))
    return ranked


def suggest_role(skills: list[str], text: str) -> str:
    ranked = rank_roles(skills, text)
    return ranked[0]["id"] if ranked else "sde-service"


def public_catalog() -> list[dict]:
    """Catalogue fields the browser needs (no matching internals)."""
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "family": r["family"],
            "summary": r["summary"],
            "core": [{"skill": c["skill"], "examples": c["any"][:4], "weight": c["weight"]} for c in r["core"]],
            "plus": r.get("plus", []),
            "often_asked": r.get("often_asked", []),
            "topics": r.get("topics", []),
            "resources": r.get("resources", []),
        }
        for r in roles()
    ]
