from flask import Flask, jsonify, render_template, request, send_file, make_response
from state import ResumeState
from transcriber import transcribe_audio
import torch
import os
import uuid
import traceback
import subprocess
from transformers import pipeline
import time
import io

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

# ── Resume Routes ──

@app.route("/resume")
def resume_page():
    """Render the resume as a styled HTML page."""
    data = resume_state.get_resume_data()
    return render_template("resume.html", resume=data)


@app.route("/resume/download")
def resume_download():
    """Render resume HTML → PDF and return as file download."""
    try:
        data = resume_state.get_resume_data()
        html = render_template("resume.html", resume=data)

        # Try weasyprint first, fall back to pdfkit
        try:
            from weasyprint import HTML
            pdf_bytes = HTML(string=html, base_url=request.host_url).write_pdf()
        except ImportError:
            import pdfkit
            pdf_bytes = pdfkit.from_string(html, False, options={
                "page-size": "A4",
                "margin-top": "0mm",
                "margin-bottom": "0mm",
                "margin-left": "0mm",
                "margin-right": "0mm",
                "encoding": "UTF-8",
                "enable-local-file-access": None,
            })

        name = data.get("name") or "resume"
        filename = f"{name.replace(' ', '_')}_Resume.pdf"

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )

    except Exception as e:
        print("PDF generation error:", str(e))
        traceback.print_exc()
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500


@app.route("/edit", methods=["POST"])
def edit_section():
    """Receive a field name to edit (placeholder for future voice-edit flow)."""
    payload = request.get_json(force=True)
    field = payload.get("field")

    if not field:
        return jsonify({"error": "No field specified"}), 400

    valid_fields = list(resume_state.data.keys())
    if field not in valid_fields:
        return jsonify({"error": f"Invalid field '{field}'. Valid: {valid_fields}"}), 400

    return jsonify({
        "message": f"Ready to edit '{field}'. Use voice input to update.",
        "field": field,
        "current_value": resume_state.data.get(field),
    })


if __name__ == "__main__":
    app.run(debug=True)
