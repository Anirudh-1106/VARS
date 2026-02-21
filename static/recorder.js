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
