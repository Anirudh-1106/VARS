const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const transcriptBox = document.getElementById("transcriptBox");
const transcriptPanel = document.getElementById("transcriptPanel");
const orbStateText = document.getElementById("orbStateText");
const orbCanvas = document.getElementById("orbCanvas");

const drawCtx = orbCanvas.getContext("2d", { alpha: true });

let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let audioCtx = null;
let analyser = null;
let sourceNode = null;
let frequencyData = null;
let animationId = null;
let state = "idle";
let phase = 0;
let smoothEnergy = 0;

const STATE = {
    IDLE: "idle",
    RECORDING: "recording",
    PROCESSING: "processing"
};

function setStatus(text, statusClass) {
    statusText.textContent = text;
    statusDot.className = "status-dot " + (statusClass || "");
}

function handleStateChange(nextState) {
    state = nextState;

    if (state === STATE.RECORDING) {
        orbStateText.textContent = "Listening...";
        recordBtn.classList.add("recording");
        recordBtn.setAttribute("aria-label", "Stop recording");
    } else if (state === STATE.PROCESSING) {
        orbStateText.textContent = "Processing...";
        recordBtn.classList.remove("recording");
        recordBtn.setAttribute("aria-label", "Processing audio");
    } else {
        orbStateText.textContent = "Tap to start";
        recordBtn.classList.remove("recording");
        recordBtn.setAttribute("aria-label", "Start recording");
    }
}

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.floor(orbCanvas.clientWidth || 360);
    orbCanvas.width = Math.floor(size * dpr);
    orbCanvas.height = Math.floor(size * dpr);
    drawCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

async function initAudio() {
    const needsNewStream = !stream || stream.getTracks().every((track) => track.readyState === "ended");

    if (needsNewStream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    if (!audioCtx || audioCtx.state === "closed") {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioCtx.state === "suspended") {
        await audioCtx.resume();
    }

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.84;

    if (sourceNode) {
        try {
            sourceNode.disconnect();
        } catch (error) {
            console.warn("Source disconnect warning:", error);
        }
    }

    sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
}

function getEnergy() {
    if (state !== STATE.RECORDING || !analyser || !frequencyData) {
        return 0;
    }

    analyser.getByteFrequencyData(frequencyData);

    const limit = Math.min(frequencyData.length, 240);
    let sum = 0;
    for (let i = 0; i < limit; i += 1) {
        sum += frequencyData[i];
    }

    return (sum / limit) / 255;
}

function drawRing(cx, cy, baseRadius, energy, elapsed) {
    const points = 180;
    const arc = Math.PI * 2;
    const wobbleScale = state === STATE.RECORDING ? 12 : state === STATE.PROCESSING ? 7 : 4;
    const audioScale = state === STATE.RECORDING ? 34 : 0;
    const pulseScale = state === STATE.PROCESSING ? 7 : 3;
    const idlePulse = Math.sin(elapsed * (state === STATE.PROCESSING ? 1.1 : 2.1)) * pulseScale;

    drawCtx.beginPath();
    for (let i = 0; i <= points; i += 1) {
        const t = (i / points) * arc;
        const idx = frequencyData ? Math.floor((i / points) * frequencyData.length) : 0;
        const audio = state === STATE.RECORDING && frequencyData ? (frequencyData[idx] / 255) * audioScale : 0;
        const wobbleA = Math.sin(t * 3 + phase) * wobbleScale;
        const wobbleB = Math.sin(t * 8 - phase * 0.75) * wobbleScale * 0.36;
        const radius = baseRadius + idlePulse + wobbleA * 0.25 + wobbleB + audio * (0.35 + energy);
        const x = cx + Math.cos(t) * radius;
        const y = cy + Math.sin(t) * radius;

        if (i === 0) {
            drawCtx.moveTo(x, y);
        } else {
            const prevT = ((i - 1) / points) * arc;
            const prevIdx = frequencyData ? Math.floor(((i - 1) / points) * frequencyData.length) : 0;
            const prevAudio = state === STATE.RECORDING && frequencyData ? (frequencyData[prevIdx] / 255) * audioScale : 0;
            const prevWobbleA = Math.sin(prevT * 3 + phase) * wobbleScale;
            const prevWobbleB = Math.sin(prevT * 8 - phase * 0.75) * wobbleScale * 0.36;
            const prevRadius = baseRadius + idlePulse + prevWobbleA * 0.25 + prevWobbleB + prevAudio * (0.35 + energy);
            const px = cx + Math.cos(prevT) * prevRadius;
            const py = cy + Math.sin(prevT) * prevRadius;
            const cpx = (px + x) * 0.5;
            const cpy = (py + y) * 0.5;
            drawCtx.quadraticCurveTo(px, py, cpx, cpy);
        }
    }
    drawCtx.closePath();
}

function drawVisualizer(now) {
    const elapsed = now * 0.001;
    const size = orbCanvas.clientWidth || 360;
    const cx = size / 2;
    const cy = size / 2;

    phase += state === STATE.RECORDING ? 0.075 : state === STATE.PROCESSING ? 0.03 : 0.022;

    const energy = getEnergy();
    smoothEnergy += (energy - smoothEnergy) * 0.14;

    drawCtx.clearRect(0, 0, size, size);

    const statePulse = state === STATE.RECORDING
        ? smoothEnergy * 28
        : state === STATE.PROCESSING
            ? Math.sin(elapsed * 1.1) * 8
            : Math.sin(elapsed * 1.9) * 4;

    const baseRadius = size * 0.29 + statePulse;

    drawCtx.save();
    drawCtx.globalCompositeOperation = "lighter";

    drawRing(cx, cy, baseRadius, smoothEnergy, elapsed);
    drawCtx.strokeStyle = "rgba(0, 240, 255, 0.95)";
    drawCtx.lineWidth = 2.3;
    drawCtx.shadowColor = "rgba(0, 240, 255, 0.95)";
    drawCtx.shadowBlur = 24;
    drawCtx.stroke();

    drawRing(cx, cy, baseRadius - 8, smoothEnergy * 0.6, elapsed + 0.4);
    drawCtx.strokeStyle = "rgba(0, 190, 255, 0.45)";
    drawCtx.lineWidth = 1.4;
    drawCtx.shadowBlur = 16;
    drawCtx.stroke();

    drawRing(cx, cy, baseRadius + 8, smoothEnergy * 0.45, elapsed - 0.25);
    drawCtx.strokeStyle = "rgba(0, 255, 255, 0.26)";
    drawCtx.lineWidth = 1;
    drawCtx.shadowBlur = 12;
    drawCtx.stroke();

    drawCtx.restore();

    animationId = requestAnimationFrame(drawVisualizer);
}

async function startRecording() {
    try {
        await initAudio();

        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            handleStateChange(STATE.PROCESSING);
            setStatus("Transcribing...", "processing");

            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

            if (audioBlob.size === 0) {
                setStatus("No audio captured", "error");
                handleStateChange(STATE.IDLE);
                return;
            }

            const formData = new FormData();
            formData.append("audio", audioBlob);

            try {
                const response = await fetch("/transcribe", {
                    method: "POST",
                    body: formData
                });
                const data = await response.json();

                if (data.translation) {
                    transcriptBox.textContent = data.translation;
                    transcriptPanel.classList.add("visible");
                    setStatus("Analyzing...", "processing");

                    try {
                        const llmResponse = await fetch("/process-transcript", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ transcript: data.translation })
                        });
                        const llmData = await llmResponse.json();

                        if (llmData.error) {
                            setStatus(llmData.error, "error");
                        } else if (llmData.action === "modify") {
                            setStatus("Resume updated successfully", "done");
                            const genBtn = document.getElementById("generateBtn");
                            if (genBtn) {
                                genBtn.style.display = "inline-flex";
                            }
                        } else {
                            setStatus("Data extracted - record more or generate", "done");
                            const genBtn = document.getElementById("generateBtn");
                            if (genBtn) {
                                genBtn.style.display = "inline-flex";
                            }
                        }
                    } catch (llmError) {
                        console.error("LLM error:", llmError);
                        setStatus("Extraction error - try again", "error");
                    }
                } else {
                    setStatus("No speech detected", "error");
                }
            } catch (error) {
                console.error("Transcription error:", error);
                setStatus("Transcription error - try again", "error");
            }

            handleStateChange(STATE.IDLE);
        };

        mediaRecorder.start();
        handleStateChange(STATE.RECORDING);
        setStatus("Recording...", "recording");
    } catch (error) {
        console.error("Microphone error:", error);
        setStatus("Microphone permission denied", "error");
        handleStateChange(STATE.IDLE);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }

    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
}

recordBtn.addEventListener("click", async () => {
    if (state === STATE.RECORDING) {
        stopRecording();
    } else {
        await startRecording();
    }
});

window.addEventListener("resize", resizeCanvas, { passive: true });
window.addEventListener("beforeunload", () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
    }
    if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close();
    }
});

resizeCanvas();
handleStateChange(STATE.IDLE);
setStatus("Ready", "");
animationId = requestAnimationFrame(drawVisualizer);
