const recordBtn = document.getElementById("recordBtn");
const statusText = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const transcriptBox = document.getElementById("transcriptBox");
const transcriptPanel = document.getElementById("transcriptPanel");
const orbStateText = document.getElementById("orbStateText");
const orbCanvas = document.getElementById("orbCanvas");
const reviewPanel = document.getElementById("reviewPanel");
const reviewTranscript = document.getElementById("reviewTranscript");
const confirmTranscriptBtn = document.getElementById("confirmTranscriptBtn");
const retryTranscriptBtn = document.getElementById("retryTranscriptBtn");
const cancelReviewBtn = document.getElementById("cancelReviewBtn");
const missingPanel = document.getElementById("missingPanel");
const missingStep = document.getElementById("missingStep");
const missingProgressFill = document.getElementById("missingProgressFill");
const missingQuestionText = document.getElementById("missingQuestionText");
const missingHintText = document.getElementById("missingHintText");
const missingAnswerInput = document.getElementById("missingAnswerInput");
const missingErrorText = document.getElementById("missingErrorText");
const missingBackBtn = document.getElementById("missingBackBtn");
const missingSkipBtn = document.getElementById("missingSkipBtn");
const missingNextBtn = document.getElementById("missingNextBtn");

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
let pendingTranscript = "";
let workingResumeData = null;
let missingQuestions = [];
let missingIndex = 0;

const STATE = {
    IDLE: "idle",
    RECORDING: "recording",
    PROCESSING: "processing"
};

function setStatus(text, statusClass) {
    statusText.textContent = text;
    statusDot.className = "status-dot " + (statusClass || "");
}

function toggleReviewPanel(show) {
    if (!reviewPanel) {
        return;
    }

    reviewPanel.classList.toggle("visible", show);
}

function setReviewButtonsDisabled(disabled) {
    [confirmTranscriptBtn, retryTranscriptBtn, cancelReviewBtn].forEach((btn) => {
        if (btn) {
            btn.disabled = disabled;
        }
    });
}

function hasText(value) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().toLowerCase() !== "none";
}

function toggleMissingPanel(show) {
    if (!missingPanel) {
        return;
    }

    missingPanel.classList.toggle("visible", show);
}

function setMissingButtonsDisabled(disabled) {
    [missingBackBtn, missingSkipBtn, missingNextBtn].forEach((btn) => {
        if (btn) {
            btn.disabled = disabled;
        }
    });
}

function getPathValue(obj, path) {
    return path.split(".").reduce((acc, key) => {
        if (acc == null) {
            return undefined;
        }

        if (/^\d+$/.test(key)) {
            return acc[Number(key)];
        }
        return acc[key];
    }, obj);
}

function setPathValue(obj, path, value) {
    const keys = path.split(".");
    let target = obj;

    for (let i = 0; i < keys.length - 1; i += 1) {
        const key = /^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i];
        const nextKey = keys[i + 1];
        const shouldBeArray = /^\d+$/.test(nextKey);

        if (target[key] == null) {
            target[key] = shouldBeArray ? [] : {};
        }

        target = target[key];
    }

    const lastKey = /^\d+$/.test(keys[keys.length - 1]) ? Number(keys[keys.length - 1]) : keys[keys.length - 1];
    target[lastKey] = value;
}

function buildMissingQuestions(data) {
    const questions = [];

    if (!hasText(data?.name)) {
        questions.push({
            key: "name",
            path: "name",
            question: "What is your full name?",
            hint: "Use the name you want on the resume.",
            placeholder: "Example: Ananya Raj",
            validate: (value) => hasText(value) || "Name is required."
        });
    }

    if (!hasText(data?.email)) {
        questions.push({
            key: "email",
            path: "email",
            question: "What is your email address?",
            hint: "Recruiters use this as your primary contact.",
            placeholder: "Example: name@example.com",
            validate: (value) => {
                if (!hasText(value)) {
                    return "Email is required.";
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailRegex.test(value.trim()) || "Enter a valid email address.";
            }
        });
    }

    if (!hasText(data?.phone)) {
        questions.push({
            key: "phone",
            path: "phone",
            question: "What is your phone number?",
            hint: "Include country code if needed.",
            placeholder: "Example: +91 98765 43210",
            validate: (value) => {
                if (!hasText(value)) {
                    return "Phone number is required.";
                }
                const digits = value.replace(/\D/g, "");
                return digits.length >= 7 || "Enter a valid phone number.";
            }
        });
    }

    const experienceList = Array.isArray(data?.experience) ? data.experience : [];
    experienceList.forEach((item, idx) => {
        const role = hasText(item?.role) ? item.role.trim() : "this role";
        const company = hasText(item?.company) ? item.company.trim() : "this company";
        const label = `${role} at ${company}`;

        if (!hasText(item?.duration) && (hasText(item?.role) || hasText(item?.company))) {
            questions.push({
                key: `experience-${idx}-duration`,
                path: `experience.${idx}.duration`,
                question: `What is the date range for ${label}?`,
                hint: "Format: Jun 2021 - Aug 2023",
                placeholder: "Example: Jun 2021 - Aug 2023",
                validate: (value) => hasText(value) || "Please add a duration or skip."
            });
        }
    });

    return questions;
}

function renderMissingQuestion() {
    if (!missingQuestions.length) {
        return;
    }

    const total = missingQuestions.length;
    const current = missingQuestions[missingIndex];
    const answer = getPathValue(workingResumeData, current.path);

    missingStep.textContent = `Question ${missingIndex + 1} of ${total}`;
    missingProgressFill.style.width = `${((missingIndex + 1) / total) * 100}%`;
    missingQuestionText.textContent = current.question;
    missingHintText.textContent = current.hint;
    missingAnswerInput.placeholder = current.placeholder || "Type your answer";
    missingAnswerInput.value = hasText(answer) ? answer : "";
    missingErrorText.textContent = "";
    missingBackBtn.disabled = missingIndex === 0;
    missingNextBtn.textContent = missingIndex === total - 1 ? "Save & Finish" : "Next";

    missingAnswerInput.focus();
}

function openMissingAssistant(data) {
    workingResumeData = JSON.parse(JSON.stringify(data || {}));
    missingQuestions = buildMissingQuestions(workingResumeData);
    missingIndex = 0;

    if (!missingQuestions.length) {
        toggleMissingPanel(false);
        setStatus("Data extracted - record more or generate", "done");
        const genBtn = document.getElementById("generateBtn");
        if (genBtn) {
            genBtn.style.display = "inline-flex";
        }
        return;
    }

    toggleMissingPanel(true);
    setStatus("Please fill missing details", "processing");
    renderMissingQuestion();
}

async function saveMissingDetails() {
    setMissingButtonsDisabled(true);
    setStatus("Saving details...", "processing");

    try {
        const response = await fetch("/save-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(workingResumeData)
        });
        const data = await response.json();

        if (!response.ok || data.error) {
            setStatus(data.error || "Unable to save details", "error");
            setMissingButtonsDisabled(false);
            return;
        }

        toggleMissingPanel(false);
        setStatus("Details updated. Resume is ready", "done");
        const genBtn = document.getElementById("generateBtn");
        if (genBtn) {
            genBtn.style.display = "inline-flex";
        }
    } catch (error) {
        console.error("Save details error:", error);
        setStatus("Unable to save details", "error");
        setMissingButtonsDisabled(false);
    }
}

async function onMissingNext() {
    const current = missingQuestions[missingIndex];
    const value = missingAnswerInput.value.trim();

    const validation = current.validate(value);
    if (validation !== true) {
        missingErrorText.textContent = validation;
        return;
    }

    setPathValue(workingResumeData, current.path, value);

    if (missingIndex === missingQuestions.length - 1) {
        await saveMissingDetails();
        return;
    }

    missingIndex += 1;
    renderMissingQuestion();
}

function onMissingSkip() {
    missingErrorText.textContent = "";

    if (missingIndex === missingQuestions.length - 1) {
        saveMissingDetails();
        return;
    }

    missingIndex += 1;
    renderMissingQuestion();
}

function onMissingBack() {
    if (missingIndex === 0) {
        return;
    }

    missingIndex -= 1;
    renderMissingQuestion();
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
        toggleMissingPanel(false);
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
                    pendingTranscript = data.translation;
                    reviewTranscript.value = data.translation;
                    toggleReviewPanel(true);
                    setReviewButtonsDisabled(false);
                    setStatus("Review transcript", "done");
                    transcriptPanel.classList.remove("visible");
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

async function processConfirmedTranscript() {
    const transcript = reviewTranscript.value.trim();

    if (!transcript) {
        setStatus("Transcript is empty", "error");
        return;
    }

    pendingTranscript = transcript;
    handleStateChange(STATE.PROCESSING);
    setStatus("Analyzing...", "processing");
    setReviewButtonsDisabled(true);

    try {
        const llmResponse = await fetch("/process-transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript })
        });
        const llmData = await llmResponse.json();

        transcriptBox.textContent = transcript;
        transcriptPanel.classList.add("visible");

        if (llmData.error) {
            setStatus(llmData.error, "error");
        } else if (llmData.action === "modify") {
            setStatus("Resume updated successfully", "done");
            const genBtn = document.getElementById("generateBtn");
            if (genBtn) {
                genBtn.style.display = "inline-flex";
            }
            toggleReviewPanel(false);
        } else {
            toggleReviewPanel(false);
            openMissingAssistant(llmData.data || {});
        }
    } catch (llmError) {
        console.error("LLM error:", llmError);
        setStatus("Extraction error - try again", "error");
        setReviewButtonsDisabled(false);
    }

    handleStateChange(STATE.IDLE);
}

recordBtn.addEventListener("click", async () => {
    if (state === STATE.RECORDING) {
        stopRecording();
    } else {
        await startRecording();
    }
});

confirmTranscriptBtn.addEventListener("click", async () => {
    confirmTranscriptBtn.textContent = "Processing...";
    await processConfirmedTranscript();
    confirmTranscriptBtn.textContent = "Confirm & Process";
});

retryTranscriptBtn.addEventListener("click", async () => {
    toggleReviewPanel(false);
    toggleMissingPanel(false);
    transcriptPanel.classList.remove("visible");
    pendingTranscript = "";
    reviewTranscript.value = "";
    setStatus("Recording...", "recording");
    await startRecording();
});

cancelReviewBtn.addEventListener("click", () => {
    toggleReviewPanel(false);
    pendingTranscript = "";
    reviewTranscript.value = "";
    setStatus("Ready", "");
    handleStateChange(STATE.IDLE);
});

missingNextBtn.addEventListener("click", async () => {
    await onMissingNext();
});

missingSkipBtn.addEventListener("click", () => {
    onMissingSkip();
});

missingBackBtn.addEventListener("click", () => {
    onMissingBack();
});

missingAnswerInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        await onMissingNext();
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
toggleReviewPanel(false);
toggleMissingPanel(false);
animationId = requestAnimationFrame(drawVisualizer);
