from flask import Flask, jsonify, render_template, request
from state import ResumeState
from services.llm_service import extract_resume_data, refine_resume_data
import torch
import os
import uuid
import traceback
import subprocess
from transformers import pipeline
import time

app = Flask(__name__)
resume_state = ResumeState()

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Lazy-loaded Whisper model
whisper_asr = None


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
    """Accept a transcript, extract structured resume data via LLM, and update state."""
    payload = request.get_json(force=True)
    transcript = payload.get("transcript")

    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400

    try:
        extracted = extract_resume_data(transcript)
        resume_state.update(extracted)
        return jsonify({
            "message": "Resume data extracted and saved.",
            "data": resume_state.get_resume_data(),
        })
    except ValueError as e:
        return jsonify({"error": f"Extraction failed: {e}"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/generate-resume")
def generate_resume():
    """Refine resume data via LLM and render the final resume page."""
    try:
        raw_data = resume_state.get_resume_data()
        refined = refine_resume_data(raw_data)
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
    resume_state.update(payload, replace_lists=True)
    return jsonify({"message": "Resume saved.", "data": resume_state.get_resume_data()})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)