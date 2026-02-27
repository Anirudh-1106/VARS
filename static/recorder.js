const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const transcriptBox = document.getElementById("transcriptBox");
const transcriptPanel = document.getElementById("transcriptPanel");
const micLabel = document.getElementById("micLabel");
const timerEl = document.getElementById("timer");
const waveformEl = document.getElementById("waveform");
const waveCanvas = document.getElementById("waveCanvas");

let mediaRecorder;
let audioChunks = [];
let stream;
let timerInterval;
let seconds = 0;
let audioCtx, analyser, dataArray, animationId;

recordBtn.addEventListener("click", async () => {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        await startRecording();
    } else if (mediaRecorder.state === "recording") {
        stopRecording();
    }
});

// ── Timer helpers ──
function startTimer() {
    seconds = 0;
    timerEl.classList.add("visible");
    timerEl.textContent = "00:00";
    timerInterval = setInterval(() => {
        seconds++;
        const m = String(Math.floor(seconds / 60)).padStart(2, "0");
        const s = String(seconds % 60).padStart(2, "0");
        timerEl.textContent = `${m}:${s}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerEl.classList.remove("visible");
}

// ── Waveform visualizer ──
function startWaveform(mediaStream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    waveformEl.classList.add("visible");
    waveCanvas.width = waveCanvas.offsetWidth * 2;
    waveCanvas.height = waveCanvas.offsetHeight * 2;
    drawWaveform();
}

function drawWaveform() {
    animationId = requestAnimationFrame(drawWaveform);
    analyser.getByteFrequencyData(dataArray);
    const ctx = waveCanvas.getContext("2d");
    const W = waveCanvas.width;
    const H = waveCanvas.height;
    ctx.clearRect(0, 0, W, H);

    const bars = 48;
    const gap = 4;
    const barW = (W - gap * bars) / bars;

    for (let i = 0; i < bars; i++) {
        const idx = Math.floor((i / bars) * dataArray.length);
        const val = dataArray[idx] / 255;
        const barH = Math.max(4, val * H * 0.85);
        const x = i * (barW + gap);
        const y = (H - barH) / 2;

        ctx.fillStyle = `rgba(37, 99, 235, ${0.35 + val * 0.65})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 3);
        ctx.fill();
    }
}

function stopWaveform() {
    cancelAnimationFrame(animationId);
    waveformEl.classList.remove("visible");
    if (audioCtx) audioCtx.close();
}

// ── Status helpers ──
function setStatus(text, state) {
    statusText.textContent = text;
    statusDot.className = "status-dot " + (state || "");
}

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            stopTimer();
            stopWaveform();

            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

            if (audioBlob.size === 0) {
                setStatus("No audio captured", "error");
                micLabel.textContent = "Tap to start recording";
                return;
            }

            setStatus("Transcribing audio…", "processing");
            micLabel.textContent = "Processing";

            const formData = new FormData();
            formData.append("audio", audioBlob);

            try {
                const response = await fetch("/transcribe", {
                    method: "POST",
                    body: formData
                });

                const data = await response.json();
                console.log("Server response:", data);

                if (data.translation) {
                    transcriptBox.textContent = data.translation;
                    transcriptPanel.classList.add("visible");
                } else {
                    transcriptBox.textContent = "No translation returned.";
                    transcriptPanel.classList.add("visible");
                }

                // Auto-send transcript to LLM for structured extraction
                if (data.translation) {
                    setStatus("AI is analyzing…", "processing");
                    try {
                        const llmResponse = await fetch("/process-transcript", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ transcript: data.translation })
                        });
                        const llmData = await llmResponse.json();
                        console.log("LLM result:", llmData);

                        if (llmData.error) {
                            setStatus(llmData.error, "error");
                        } else if (llmData.action === "modify") {
                            setStatus("Resume updated successfully", "done");
                            const genBtn = document.getElementById("generateBtn");
                            if (genBtn) genBtn.style.display = "inline-flex";
                        } else {
                            setStatus("Data extracted — record more or generate", "done");
                            const genBtn = document.getElementById("generateBtn");
                            if (genBtn) genBtn.style.display = "inline-flex";
                        }
                    } catch (llmErr) {
                        console.error("LLM error:", llmErr);
                        setStatus("Extraction error — try again", "error");
                    }
                } else {
                    setStatus("No speech detected", "error");
                }
            } catch (error) {
                console.error("Error sending audio:", error);
                setStatus("Transcription error — try again", "error");
            }

            micLabel.textContent = "Tap to start recording";
        };

        mediaRecorder.start();
        setStatus("Recording…", "recording");
        recordBtn.textContent = "⏹";
        recordBtn.classList.add("recording");
        micLabel.textContent = "Tap to stop";
        startTimer();
        startWaveform(stream);

    } catch (error) {
        console.error("Microphone error:", error);
        setStatus("Microphone access denied", "error");
    }
}

function stopRecording() {
    mediaRecorder.stop();
    recordBtn.textContent = "🎤";
    recordBtn.classList.remove("recording");
    stream.getTracks().forEach(track => track.stop());
}
