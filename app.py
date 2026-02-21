from flask import Flask, jsonify, render_template, request
from state import ResumeState
from transcriber import transcribe_audio

app = Flask(__name__)
resume_state = ResumeState()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/state", methods=["GET"])
def get_missing():
    return jsonify({"missing_fields": resume_state.missing_fields()})

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()

    try:
        text = transcribe_audio(audio_bytes)
        return jsonify({"transcript": text})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
