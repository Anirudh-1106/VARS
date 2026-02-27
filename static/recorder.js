const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const transcriptBox = document.getElementById("transcriptBox");

let mediaRecorder;
let audioChunks = [];
let stream;

recordBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        await startRecording();
    } else if (mediaRecorder.state === "recording") {
        stopRecording();
    }
});

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            console.log("Chunk size:", event.data.size);
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

            console.log("Final audio size:", audioBlob.size);

            // 🔊 PLAYBACK TEST (to verify mic is working)
            const audioURL = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioURL);
            audio.controls = true;
            document.body.appendChild(audio);

            if (audioBlob.size === 0) {
                statusText.textContent = "No audio captured!";
                return;
            }

            statusText.textContent = "Processing audio...";

            const formData = new FormData();
            formData.append("audio", audioBlob);

            try {
                const response = await fetch("/transcribe", {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();
                console.log("Server response:", data);

                transcriptBox.textContent = data.translation || "No translation returned.";
                statusText.textContent = "Transcription complete!";

                // Auto-send transcript to LLM for structured extraction
                if (data.translation) {
                    statusText.textContent = "Extracting resume data...";
                    try {
                        const llmResponse = await fetch("/process-transcript", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ transcript: data.translation })
                        });
                        const llmData = await llmResponse.json();
                        console.log("LLM extraction:", llmData);

                        if (llmData.error) {
                            statusText.textContent = "Extraction failed: " + llmData.error;
                        } else {
                            statusText.textContent = "Resume data extracted! You can record more or click Generate Resume.";
                            const genBtn = document.getElementById("generateBtn");
                            if (genBtn) genBtn.style.display = "inline-block";
                        }
                    } catch (llmErr) {
                        console.error("LLM error:", llmErr);
                        statusText.textContent = "Error during extraction.";
                    }
                }
            } catch (error) {
                console.error("Error sending audio:", error);
                statusText.textContent = "Error during transcription.";
            }
        };

        mediaRecorder.start();
        statusText.textContent = "Recording...";
        recordBtn.textContent = "⏹ Stop Recording";

    } catch (error) {
        console.error("Microphone error:", error);
        statusText.textContent = "Microphone access denied.";
    }
}

function stopRecording() {
    mediaRecorder.stop();
    recordBtn.textContent = "🎤 Start Recording";

    // Stop microphone tracks
    stream.getTracks().forEach(track => track.stop());
}
