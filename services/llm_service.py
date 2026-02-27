"""
LLM Service – Groq LLaMA integration for resume extraction & refinement.
"""

import json
import os

from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

_MODEL = "llama-3.1-8b-instant"

_llm = ChatGroq(
    model=_MODEL,
    api_key=os.environ.get("GROQ_API_KEY"),
    temperature=0.2,
)

# ── Prompt Templates ──────────────────────────────────────────────────────────

_INTENT_PROMPT = """\
You are an intent classifier for a voice-based resume builder.

The user has spoken a sentence (transcribed below). Decide whether the user is:

1. **"add"** – Providing resume content (e.g. personal details, experience,
   skills, education, projects, or any information to be added to the resume).
2. **"modify"** – Asking to change, update, edit, rephrase, or delete something
   that already exists in the resume (e.g. "remove the second point in
   experience", "change my name to John", "delete Python from skills",
   "rewrite the summary", "make the first project description shorter").

Return ONLY a JSON object with one key:

{{"intent": "add"}}   OR   {{"intent": "modify"}}

No extra text, no markdown fences.

Transcript:
\"\"\"
{transcript}
\"\"\"
"""

_MODIFICATION_PROMPT = """\
You are an intelligent resume editor.

Below is the user's CURRENT resume data in JSON, followed by an INSTRUCTION
spoken by the user describing what they want to change, update, or delete.

Apply the instruction precisely:
- If the user asks to delete/remove something, remove it from the data.
- If the user asks to change/update/modify something, update that field.
- If the user asks to rephrase or rewrite something, improve only that part.
- Do NOT invent new data that the user did not mention.
- Preserve every field and entry that the user did NOT mention.

Return ONLY the full updated resume JSON (same schema as input) – no markdown
fences, no explanation, no extra text.

Current Resume JSON:
\"\"\"
{data}
\"\"\"

User Instruction:
\"\"\"
{instruction}
\"\"\"
"""

_EXTRACTION_PROMPT = """\
You are a resume-data extraction engine.

Given the following transcript spoken by a user, extract structured resume data
and return **ONLY** valid JSON – no markdown fences, no explanation, no extra text.

The JSON MUST match this schema exactly:

{{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "linkedin": string or null,
  "github": string or null,
  "summary": string or null,
  "education": [
    {{ "institution": string, "degree": string, "year": string }}
  ],
  "skills": [string],
  "experience": [
    {{
      "company": string,
      "role": string,
      "duration": string,
      "bullets": [string]
    }}
  ],
  "projects": [
    {{
      "name": string,
      "description": string,
      "tech_stack": [string]
    }}
  ]
}}

Rules:
- Return ONLY valid JSON.
- Do NOT hallucinate or invent any information not present in the transcript.
- If a field is not mentioned, use null for scalars or an empty list for arrays.
- For experience bullets, capture the user's own statements; do not embellish.

Transcript:
\"\"\"
{transcript}
\"\"\"
"""

_REFINEMENT_PROMPT = """\
You are a professional resume writer.

Below is structured resume data in JSON format. Your job is to **improve the
wording professionally** while keeping the EXACT same JSON structure and keys.

Improvements to make:
- Strengthen the summary to be concise and impactful.
- Convert experience bullets into strong, action-oriented statements
  (start with power verbs, quantify where possible).
- Improve project descriptions to sound professional and technical.
- Polish skill names to standard industry terms.
- Fix any grammar or spelling issues.

Rules:
- Do NOT invent new data, links, dates, companies, or technologies.
- Do NOT add or remove any JSON keys.
- Return ONLY valid JSON – no markdown fences, no explanation, no extra text.
- Maintain the EXACT same JSON schema as the input.

Input JSON:
\"\"\"
{data}
\"\"\"
"""


# ── Helper ────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    """Strip markdown fences (if any) and parse JSON."""
    cleaned = text.strip()

    # Remove ```json ... ``` wrappers if LLM still adds them
    if cleaned.startswith("```"):
        first_newline = cleaned.index("\n")
        cleaned = cleaned[first_newline + 1 :]
    if cleaned.endswith("```"):
        cleaned = cleaned[: -3]

    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {exc}\nRaw output:\n{cleaned}")


# ── Public API ────────────────────────────────────────────────────────────────

def classify_intent(transcript: str) -> str:
    """Classify whether the user wants to ADD content or MODIFY existing data."""
    prompt = _INTENT_PROMPT.format(transcript=transcript)
    response = _llm.invoke(prompt)
    result = _parse_json(response.content)
    intent = result.get("intent", "add").lower()
    return intent if intent in ("add", "modify") else "add"


def extract_resume_data(transcript: str) -> dict:
    """Stage 1 – extract structured resume data from a raw transcript."""
    prompt = _EXTRACTION_PROMPT.format(transcript=transcript)
    response = _llm.invoke(prompt)
    return _parse_json(response.content)


def modify_resume_data(current_data: dict, instruction: str) -> dict:
    """Apply a user's spoken modification instruction to existing resume data."""
    prompt = _MODIFICATION_PROMPT.format(
        data=json.dumps(current_data, indent=2),
        instruction=instruction,
    )
    response = _llm.invoke(prompt)
    return _parse_json(response.content)


def refine_resume_data(data: dict) -> dict:
    """Stage 2 – professionally refine existing resume data."""
    prompt = _REFINEMENT_PROMPT.format(data=json.dumps(data, indent=2))
    response = _llm.invoke(prompt)
    return _parse_json(response.content)
