# VARS - Voice-based AI Resume System

VARS is a voice-first web app that converts spoken career information into a structured, editable resume.

Instead of filling long forms manually, users can speak naturally, review transcript output, fill missing details, and generate a professional resume quickly.

## What Problem This Solves

Building a good resume is often slow and repetitive:

- Users struggle to structure raw thoughts into resume-ready sections.
- Important details are frequently missed in first drafts.
- Manual writing/editing takes significant time.

VARS solves this by combining speech input + AI extraction + guided follow-up questions into one streamlined workflow.

## What the App Does

1. Records user speech from the browser.
2. Transcribes and translates speech into English text.
3. Lets the user review and edit transcript before processing.
4. Extracts structured resume data (summary, skills, experience, projects, etc.).
5. Detects missing critical details and asks targeted follow-up questions.
6. Supports text and voice answers for those follow-up questions.
7. Generates a polished resume preview and export-ready output.

## Key Features

- Orb-style audio-reactive voice UI
- Real-time recording state transitions (idle/listening/processing)
- Transcript review and confirmation step
- Missing-details assistant with step-by-step questions
- Optional voice answers for follow-up questions
- AI-assisted extraction and refinement pipeline
- Experience sorting by recency (latest roles first)
- Editable resume preview and save support

## Typical User Flow

1. Record spoken input.
2. Review and confirm transcript.
3. App extracts resume data.
4. Fill missing fields (name, contact, dates, links, etc.).
5. Generate and review resume.
6. Export/download final version.

## Tech Stack

- Backend: Flask (Python)
- Speech model: Whisper Large-v3
- LLM processing: Groq LLaMA integration
- Frontend: HTML, CSS, JavaScript (no external UI library)
- Audio: Web Audio API + MediaRecorder

## Project Structure

- `app.py` - Flask routes, orchestration, and data normalization
- `state.py` - In-memory resume state management
- `services/llm_service.py` - intent classification, extraction, and refinement
- `templates/index.html` - main app UI
- `templates/resume.html` - generated resume preview template
- `static/recorder.js` - recording/transcription/review/follow-up flow

## Local Setup

1. Create and activate a Python environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set required environment variables (for Groq/API keys).
4. Run the app:

```bash
python app.py
```

5. Open the local URL printed by Flask.

## Current Focus

This project focuses on making resume creation faster, guided, and less error-prone through voice and AI assistance.