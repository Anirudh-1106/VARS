# VARS: Virtual Placement Coach

VARS gets engineering students ready for campus placements. It scores a resume line by line and shows exactly what to fix. Then it runs a realistic mock interview: a speaking interviewer asks about the student's own projects, sets a live coding problem with hidden tests, and hands over to HR. The interview ends with a detailed performance report.

It is built **privacy-first**: the server has no database and no upload folder. Resumes, recordings, code and answers are processed in memory, one request at a time, and forgotten. A student's whole session lives in their browser tab and disappears when the tab is closed, unless they export it.

## What it does

### Resume Studio
- **Upload a PDF, DOCX or TXT resume, or paste the text.** It's parsed in memory, and the parser flags layout problems that confuse applicant tracking systems: two-column layouts, photos, tables and scanned PDFs.
- **Explainable score** across Structure, Impact, Relevance, ATS-readiness and Best practice. Every finding is pinned to the exact line it quotes. The checks include India-specific issues: date of birth, parents' names, religion, the "I hereby declare" block and photos.
- **One-click rewrites that keep the student's facts.** VARS never invents numbers: wherever a metric would help, it leaves a placeholder like `[N users]` for the student to fill in with a real figure.
- **Readiness as a ticket status.** Open findings plus missing core skills give a status like `WL 9`, `RAC 3` or `CNF`, and it counts down as items are fixed.
- **Role fit for 16 campus roles**, covering software, data, infrastructure, design, business and hardware (embedded, VLSI). For each role it shows which skills matched, which are missing, what interviewers ask, free learning resources and live job-search links.
- **Job-description match**: every requirement in the JD, the resume line that proves it, and a summary tailored to that job.
- **Resume-aware chat** that answers questions about the student's own resume, streamed in real time.

### Build by voice
- Speak in English, Malayalam or both, and VARS turns it into a structured resume. Spoken changes such as "remove MS Office from skills" also work.
- A guided assistant asks only for what is missing: email, phone, links and dates.
- Polish the wording, then print a clean single-column PDF, or send the resume straight to Resume Studio for scoring.

### Mock interview
- **A two-person panel**, one interviewer for the technical round and one for HR. The voices are Indian or British English, each with a lip-synced animated face: an animated portrait (Meera Nair) or illustrated figures. Captions run throughout.
- **Technical round**: questions grounded in the resume's actual projects, internships and tools, plus fundamentals for the target role. When an answer is thin, the interviewer follows up adaptively.
- **Coding round**: 15 original problems with hidden test cases. Python and JavaScript run inside the browser (Pyodide / Web Worker); Java and C++ run on the server in a throwaway folder. After submitting, the interviewer reviews the code and asks about its complexity or edge cases.
- **HR round**: behavioural, situational and motivation questions.
- **Answer by voice or by typing**, with an optional camera self-view that never leaves the device.
- **Company styles** (service, product, startup) and **difficulty levels** (fresher, experienced intern, stretch).

### Report
- An overall readiness status and six competencies: technical depth, problem solving, coding, communication, behavioural, and resume ownership.
- Every question with its transcript, what the answer got right, what was missing, and a model answer.
- Delivery analytics from the recordings: speaking pace, filler words and long pauses.
- "Say this instead" rewrites built from the student's real background, and a three-week study plan.
- Print or save as PDF, or export a **signed report file** for the placement cell.

### Placement cell (no database)
- **Mock-drive links.** The role, rounds, difficulty and your own questions are signed into a single URL, so every student who opens it sits the same panel and cannot change the settings.
- **Cohort view.** Drop the students' exported report files into the page to see batch readiness, competency averages, the weakest skill to run a workshop on, and a CSV export. Files that were edited after export fail the signature check and are left out of the numbers.

## Privacy by construction

| Data | What happens | Stored |
|---|---|---|
| Resume file | Parsed in memory, scored, discarded | No |
| Voice recordings | Transcribed, then dropped | No |
| Interview answers | Scored one request at a time; the full interview stays in the browser tab | No |
| Python / JavaScript code | Runs in the browser | No |
| Java / C++ code | Compiled in a temp folder deleted after the run | No |
| Camera | Self-view only, never recorded or sent | No |
| Reports | Kept in the tab; signed export is the student's choice | No |

API responses are sent with `Cache-Control: no-store`, request bodies are never logged, and the "Clear this session now" control wipes the tab immediately.

## Running it

Requirements: Python 3.11+, `ffmpeg` on PATH (only needed for local Whisper), and a free Groq API key. A JDK is optional and enables Java answers; `g++` is optional and enables C++.

```bash
python -m venv venv
venv\Scripts\activate            # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env           # then put your GROQ_API_KEY in .env
python app.py
```

Open http://127.0.0.1:5000.

To run speech recognition locally on a GPU instead of the hosted API, install `requirements-local.txt` and set `VARS_STT=local` (or `auto` to fall back to it).

### Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Required. Language models and hosted Whisper. |
| `VARS_SIGNING_KEY` | Keeps drive links and report signatures valid across restarts. Set this before running a real drive. |
| `VARS_STT` | `auto`, `groq` or `local` speech recognition. |
| `VARS_TTS` | Voice engines in order: `orpheus` (Groq; accept its terms in the console first) and `edge`. When neither is available, the browser's own voice is used. |
| `VARS_NATIVE_RUNNERS` | `0` disables server-side code execution, which you should do on shared public hosting. |
| `VARS_MODELS_SMART` / `VARS_MODELS_FAST` | Ordered model fallbacks. If a hosted model is retired, the next one is used automatically. |

## How the scoring works

- **Resume score.** Rule checks cover sections, contact details, action verbs, measurable results, weak openers, buzzwords, pronouns, length, layout and personal details. They are combined with a model review of impact, clarity and relevance, and the weights are listed in `services/resume_analyzer.py`.
- **Role fit.** This is the weighted share of the role's core skills found anywhere in the resume, using the curated catalogue in `data/roles.json`. It is guidance for campus hiring, not market statistics.
- **Readiness.** The status counts open high- and medium-severity findings plus missing core skills: 0 is `CNF`, 1–3 is `RAC n`, more is `WL n`.
- **Interview.** Each answer is scored 0–10 against a rubric written when the interview is planned. Competencies are averages computed in code, so the model writes the debrief but cannot change the numbers.
- **Coding.** Test results are deterministic. Expected outputs come from reference solutions kept on the server (`tools/build_problems.py`).

## Project structure

```
app.py                  Flask routes: pages and the stateless JSON API
config.py               Environment configuration
services/
  llm.py                Model calls with fallbacks, JSON mode, streaming
  speech.py             Speech-to-text (hosted / local Whisper), interviewer voices, delivery analytics
  resume_parser.py      PDF / DOCX / TXT text and layout extraction, in memory
  resume_analyzer.py    Rule checks + model critique → anchored findings and scores
  roles.py              Role catalogue and skill matching
  coach.py              Job-description match, line rewrites, resume chat
  interview.py          Interview plan, adaptive turns, code review, report
  coding.py             Problem bank and server-side runners
  voice_resume.py       Build-by-voice extraction, edits and polishing
  signing.py            Signatures for drive links and report files
data/                   roles.json, problems.json (generated)
tools/build_problems.py Reference solutions that generate the test cases
templates/              Page shells (Jinja)
static/css/             Design system and page styles
static/js/core/         Session store, API client, UI toolkit, resume model
static/js/lib/          Avatars, speaker, recorder, code runner
static/js/pages/        One module per page
static/js/workers/      In-browser Python and JavaScript runners
```

## Limitations

- Scores are practice signals, not hiring decisions.
- Server-side code execution is meant for a local or trusted deployment; it is not a hardened sandbox.
- Speech recognition and the language models need an internet connection to the Groq API, unless local Whisper is installed.
