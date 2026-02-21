from flask import Flask, jsonify, render_template, request
from state import ResumeState
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


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)