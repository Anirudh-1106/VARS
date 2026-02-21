const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const transcriptBox = document.getElementById("transcript");

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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
        // Stop microphone tracks so they can be re-acquired next recording
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        statusText.textContent = "Transcribing...";

        // Small delay to ensure all chunks are collected
        await new Promise(resolve => setTimeout(resolve, 100));

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        console.log("Audio blob size:", audioBlob.size);

        if (audioBlob.size === 0) {
            statusText.textContent = "Error: No audio recorded.";
            return;
        }

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        try {
            const response = await fetch("/transcribe", {
                method: "POST",
                body: formData,
            });
            const data = await response.json();

            if (data.transcript) {
                transcriptBox.textContent = data.transcript;
                statusText.textContent = "Done!";
            } else {
                statusText.textContent = "Error: " + (data.error || "Unknown error");
            }
        } catch (err) {
            statusText.textContent = "Network error: " + err.message;
        }
    };

    mediaRecorder.start(100); // collect data every 100ms
    statusText.textContent = "Recording...";
    recordBtn.textContent = "⏹ Stop Recording";
}

function stopRecording() {
    mediaRecorder.requestData(); // flush remaining data before stop
    mediaRecorder.stop();
    recordBtn.textContent = "🎤 Start Recording";
}
