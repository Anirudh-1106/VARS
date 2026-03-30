from flask import Flask, jsonify, render_template, request
from state import ResumeState
from services.llm_service import classify_intent, extract_resume_data, modify_resume_data, refine_resume_data
import torch
import os
import uuid
import traceback
import subprocess
from transformers import pipeline
import time
import random
import re

app = Flask(__name__)
resume_state = ResumeState()

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Lazy-loaded Whisper model
whisper_asr = None

FALLBACK_SKILLS = [
    "Python",
    "Java",
    "C++",
    "SQL",
    "Git",
    "REST APIs",
    "Problem Solving",
    "Team Collaboration",
    "Communication",
    "Time Management",
]

MONTH_INDEX = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def normalize_skills(skills):
    """Return a clean list of plain skill names, with fallback values if missing."""
    normalized = []
    seen = set()

    if not isinstance(skills, list):
        skills = []

    def add_skill(value):
        if not isinstance(value, str):
            return
        cleaned = value.strip()
        if not cleaned:
            return
        lowered = cleaned.lower()
        if lowered in {"none", "null", "n/a"}:
            return
        if lowered in seen:
            return
        seen.add(lowered)
        normalized.append(cleaned)

    for item in skills:
        if isinstance(item, str):
            add_skill(item)
            continue

        if isinstance(item, dict):
            values = item.get("values")
            if isinstance(values, list) and values:
                for value in values:
                    add_skill(value)
            else:
                add_skill(item.get("name"))

    if not normalized:
        count = min(6, len(FALLBACK_SKILLS))
        normalized = random.sample(FALLBACK_SKILLS, count)

    return normalized


def _parse_year_month(segment: str, default_month: int):
    if not isinstance(segment, str):
        return None, default_month

    lowered = segment.lower()
    years = re.findall(r"\b(?:19|20)\d{2}\b", lowered)
    year = int(years[-1]) if years else None

    month = None
    for label, number in MONTH_INDEX.items():
        if re.search(rf"\b{label}\b", lowered):
            month = number
            break

    return year, month if month is not None else default_month


def _experience_sort_key(experience_item: dict):
    duration = (experience_item or {}).get("duration")
    if not isinstance(duration, str) or not duration.strip():
        return (0, 0, 0, 0, 0)

    text = duration.strip().lower()
    parts = re.split(r"\s*(?:-|–|—|to)\s*", text, maxsplit=1)

    present_keywords = {"present", "current", "now", "ongoing", "till now", "till date"}
    is_current = any(keyword in text for keyword in present_keywords)

    if len(parts) == 2:
        start_year, start_month = _parse_year_month(parts[0], 1)
        end_year, end_month = _parse_year_month(parts[1], 12)
    else:
        start_year, start_month = _parse_year_month(text, 1)
        end_year, end_month = _parse_year_month(text, 12)

    if is_current:
        end_year, end_month = 9999, 12

    has_date = 1 if end_year is not None else 0
    return (
        has_date,
        end_year or 0,
        end_month or 0,
        start_year or 0,
        start_month or 0,
    )


def normalize_experience_order(experience):
    """Sort experience entries by most recent duration first."""
    if not isinstance(experience, list):
        return []

    normalized = [item for item in experience if isinstance(item, dict)]
    return sorted(normalized, key=_experience_sort_key, reverse=True)


def get_model():
    global whisper_asr

    if whisper_asr is None:
        print("=" * 50)
        print("Loading Whisper Large-v3 model...")

        if torch.cuda.is_available():
            print("GPU:", torch.cuda.get_device_name(0))
            device = 0
        else:
            print("Using CPU (slower)")
            device = -1

        whisper_asr = pipeline(
            "automatic-speech-recognition",
            model="openai/whisper-large-v3",
            device=device,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
        )

        print("Model loaded successfully!")
        print("=" * 50)

    return whisper_asr


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/transcribe", methods=["POST"])
def transcribe_audio():
    try:
        if "audio" not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        audio_file = request.files["audio"]

        filename = f"{uuid.uuid4()}.webm"
        file_path = os.path.join(UPLOAD_FOLDER, filename)
        audio_file.save(file_path)

        print(f"\nProcessing: {filename} ({os.path.getsize(file_path)} bytes)")

        # Convert WEBM → WAV (16kHz mono PCM)
        wav_path = file_path.replace(".webm", ".wav")

        subprocess.run([
            "ffmpeg", "-y", "-i", file_path,
            "-ar", "16000",
            "-ac", "1",
            "-acodec", "pcm_s16le",
            wav_path
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if not os.path.exists(wav_path):
            return jsonify({"error": "Audio conversion failed"}), 500

        print("Converted to WAV. Starting translation (Malayalam → English)...")

        model = get_model()

        start_time = time.time()

        result = model(
            wav_path,
            return_timestamps=True,   # Required for long audio
            generate_kwargs={
                "language": "ml",     # Source language: Malayalam
                "task": "translate"   # Translate to English
            }
        )

        end_time = time.time()
        print(f"Inference time: {end_time - start_time:.2f} seconds")

        translation = result.get("text", "").strip()

        print("English Translation:", translation)

        # Cleanup temporary files
        os.remove(file_path)
        os.remove(wav_path)

        if not translation:
            return jsonify({"error": "No speech detected"}), 400

        return jsonify({
            "translation": translation,
            "source_language": "ml"
        })

    except Exception as e:
        print("ERROR:", str(e))
        traceback.print_exc()
        return jsonify({"error": "Transcription failed"}), 500


@app.route("/process-transcript", methods=["POST"])
def process_transcript():
    """Accept a transcript, classify intent, and either add or modify resume data."""
    payload = request.get_json(force=True)
    transcript = payload.get("transcript")

    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400

    try:
        intent = classify_intent(transcript)
        print(f"Intent detected: {intent}")

        if intent == "modify":
            current_data = resume_state.get_resume_data()
            # Only allow modify if there is existing data
            has_data = any(
                v for v in current_data.values()
                if v is not None and v != []
            )
            if not has_data:
                return jsonify({
                    "error": "Nothing to modify yet. Please add resume content first."
                }), 400

            updated = modify_resume_data(current_data, transcript)
            updated["skills"] = normalize_skills(updated.get("skills", []))
            updated["experience"] = normalize_experience_order(updated.get("experience", []))
            resume_state.update(updated, replace_lists=True)
            return jsonify({
                "message": "Resume updated as per your instruction.",
                "action": "modify",
                "data": resume_state.get_resume_data(),
            })
        else:
            extracted = extract_resume_data(transcript)
            extracted["skills"] = normalize_skills(extracted.get("skills", []))
            extracted["experience"] = normalize_experience_order(extracted.get("experience", []))
            resume_state.update(extracted)
            return jsonify({
                "message": "Resume data extracted and saved.",
                "action": "add",
                "data": resume_state.get_resume_data(),
            })

    except ValueError as e:
        return jsonify({"error": f"Processing failed: {e}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/generate-resume")
def generate_resume():
    """Refine resume data via LLM and render the final resume page."""
    try:
        raw_data = resume_state.get_resume_data()
        try:
            refined = refine_resume_data(raw_data)
        except ValueError as refine_error:
            print(f"Refinement warning: {refine_error}")
            refined = raw_data
        refined["skills"] = normalize_skills(refined.get("skills", []))
        refined["experience"] = normalize_experience_order(refined.get("experience", []))
        resume_state.update(refined, replace_lists=True)
        return render_template("resume.html", resume=resume_state.get_resume_data())
    except ValueError as e:
        return jsonify({"error": f"Refinement failed: {e}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/save-resume", methods=["POST"])
def save_resume():
    """Save manually edited resume data from the frontend."""
    payload = request.get_json(force=True)
    if not payload:
        return jsonify({"error": "No data provided"}), 400
    payload["experience"] = normalize_experience_order(payload.get("experience", []))
    resume_state.update(payload, replace_lists=True)
    return jsonify({"message": "Resume saved.", "data": resume_state.get_resume_data()})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)