// Get UI elements
const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");

// Variables to manage recording
let mediaRecorder;
let audioChunks = [];

// Handle button click
recordBtn.addEventListener("click", async () => {

    // If not recording → start
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        await startRecording();
    }
    // If recording → stop
    else if (mediaRecorder.state === "recording") {
        stopRecording();
    }
});

// Start recording
async function startRecording() {
    // Ask browser for microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create MediaRecorder using the mic stream
    mediaRecorder = new MediaRecorder(stream);

    audioChunks = [];

    // Collect audio data
    mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
    };

    // When recording stops
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

        console.log("Recorded audio blob:", audioBlob);
        statusText.textContent = "Recording stopped (audio captured)";
    };

    // Start recording
    mediaRecorder.start();

    statusText.textContent = "Recording...";
    recordBtn.textContent = "⏹ Stop Recording";
}

// Stop recording
function stopRecording() {
    mediaRecorder.stop();
    recordBtn.textContent = "🎤 Start Recording";
}
