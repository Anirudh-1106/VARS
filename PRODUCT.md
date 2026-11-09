# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Students and early-career candidates** preparing for campus placements and first jobs (primarily Indian engineering colleges: Malayalam/English speakers, +91 numbers, service- and product-company drives). They arrive with a resume (PDF/DOCX) or none at all, a target role, and anxiety about technical, coding and HR rounds. They use it alone, on a laptop, often the night before a drive.
- **Placement cells (TPOs / training coordinators)** who run mock drives for batches of students and need a read on cohort readiness — without the platform holding any student data.

## Product Purpose

VARS is a virtual placement coach. It turns a resume into an objective, explainable quality score with concrete fixes, maps the candidate's skills to roles, answers resume-specific questions in chat, and then runs a realistic mock interview — resume-driven technical questions, role fundamentals, a live coding challenge with automated test execution, and an HR round — conducted by a speaking interviewer avatar. It ends with a detailed performance report and an upskilling plan.

Success: a student walks into a real interview having already answered the questions their own resume invites, knowing their weak areas, with a resume that survives a recruiter's six-second scan.

## Positioning

- **Zero retention by construction.** The server is stateless: resumes, audio, code and transcripts are processed in memory and discarded per request. Everything a session produces lives only in the browser tab and disappears when it closes, unless the student explicitly exports it.
- **Resume-grounded, not generic.** Every question, score and suggestion cites the candidate's own resume lines.
- **Institution features without a database.** Mock-drive configurations travel as links; reports travel as signed files the student chooses to hand over; cohort analytics run entirely in the coordinator's browser.
- **Voice-first, multilingual entry.** Students without a resume can build one by speaking (Malayalam or English).

## Operating Context

- Flask backend, vanilla HTML/CSS/JS frontend (no build step). Groq-hosted LLMs (gpt-oss family) and Whisper; optional local Whisper large-v3 on GPU; neural TTS via Groq Orpheus → Edge neural voices → browser speech as fallbacks.
- Runs both on a local demo laptop and on public hosting. Python/JavaScript coding answers execute in the browser; Java/C++ execute server-side only when a compiler exists, in throwaway temp folders.
- Used in a quiet room with a mic (and optionally a webcam that never leaves the device). Sessions are 15–40 minutes.

## Capabilities and Constraints

- Resume Studio: upload PDF/DOCX/TXT or paste text → parse → score (structure, impact, relevance, ATS-readiness, best practices) with line-level findings and rewrites; role fit and skill gaps; JD match; streaming resume-aware chat.
- Voice builder: speak → transcript review → structured resume → guided missing-detail questions → editable resume preview/PDF.
- Interview: setup (role, company type, difficulty, rounds, interviewer) → technical, coding, HR rounds with adaptive follow-ups → report with per-question evaluation, delivery analytics (pace, filler words), competency profile and a study plan.
- Placement cell: mock-drive links (config in URL), signed report export, client-side cohort dashboard from dropped report files.
- **Must never** persist user documents, audio, code or transcripts on the server or in server logs. No accounts, no database.
- Terminology: "round" (Technical / Coding / HR), "drive" (a placement drive), "TPO" / "placement cell".

## Brand Commitments

- Name: **VARS** (originally "Voice-based AI Resume System"; now the placement coach platform).
- No third-party AI vendor names in product UI copy or the repository's public-facing text beyond required technical setup notes.

## Evidence on Hand

- No testimonials, user counts, placement statistics, partner institutions or market-demand numbers exist. None may be fabricated; role/skill guidance must be framed as curated guidance, not market data.

## Product Principles

1. **Specific over encouraging.** Feedback quotes the student's own words and says exactly what to change. No empty praise, no generic tips.
2. **The student owns the data.** Nothing outlives the tab without an explicit export; say so plainly where it matters.
3. **Realism builds confidence.** The interview should feel like a real panel: pacing, follow-ups, silence, a timer — not a quiz.
4. **Every score is explainable.** A number always comes with the evidence that produced it.
5. **Works on a mid-range laptop and a flaky campus network.** Degrade gracefully (voice → text, neural voice → browser voice, server runner → in-browser).

## Accessibility & Inclusion

- Every voice interaction has a typed alternative; captions are always available for the interviewer.
- Non-native English speakers are the norm: plain language, no idioms in UI copy, tolerant speech handling.
- WCAG 2.2 AA contrast and full keyboard operation; respect reduced-motion for avatar and orb animation.
