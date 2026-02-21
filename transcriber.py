import io
import requests
from pydub import AudioSegment

SARVAM_API_KEY = "sk_flskekl8_0e7n4yyHfPri4w2u8oVrx2ol"

def transcribe_audio(audio_bytes: bytes) -> str:
    # Save raw webm to disk for inspection
    with open("debug_recording.webm", "wb") as f:
        f.write(audio_bytes)
    print(f"[DEBUG] Audio bytes received: {len(audio_bytes)}")

    # Convert webm → wav
    audio_segment = AudioSegment.from_file(io.BytesIO(audio_bytes), format="webm")
    audio_segment = audio_segment.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    
    print(f"[DEBUG] Audio duration: {len(audio_segment)}ms")
    print(f"[DEBUG] Max amplitude: {audio_segment.max}")

    wav_buffer = io.BytesIO()
    audio_segment.export(wav_buffer, format="wav")
    wav_buffer.seek(0)

    files = {
        "file": ("recording.wav", wav_buffer, "audio/wav")
    }
    data = {
        "model": "saaras:v3",
        "language_code": "ml-IN",
    }
    headers = {
        "api-subscription-key": SARVAM_API_KEY
    }

    response = requests.post(
        "https://api.sarvam.ai/speech-to-text",
        headers=headers,
        files=files,
        data=data
    )

    print(f"[SARVAM] Status: {response.status_code}")
    print(f"[SARVAM] Response: {response.text}")

    if response.status_code != 200:
        raise Exception(f"Sarvam API error {response.status_code}: {response.text}")

    result = response.json()
    transcript = result.get("transcript") or result.get("text") or result.get("transcription", "")

    if not transcript:
        raise Exception("Empty transcript — please speak clearly and try again.")

    return transcript