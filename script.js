// 1. STATE
const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

let isRunning = false;
let solid = { x: 300, y: 300, theta: 0 };
let ghost = { x: 300, y: 300, theta: 0 };

let path = [];
let currentWaypointIndex = 0;
let leftMultiplier = 1;
let rightMultiplier = 1;

// Background image state
let backgroundImage = null;

// Drag state for waypoint manipulation
let dragIndex = -1;
const DRAG_RADIUS = 14;
let lastMousePos = { x: -999, y: -999 };

// ── PRESETS ─────────────────────────────────────────────────────────────────
// ADD YOUR PRESET IMAGE PATHS HERE.
// Each entry needs: { label, src }
// Example: { label: "VEX V5 Override - Match", src: "images/v5_match.png" }
const PRESET_BACKGROUNDS = [
    { label: "VEX V5 Override - Match", src: "images/v5_override_match.png" },
    { label: "VEX V5 Override - Skills", src: "images/v5_override_skills.png" },
    { label: "VEX U Override - Match", src: "images/vexu_override_match.png" },
    { label: "VEX U Override - Skills", src: "images/vexu_override_skills.png" },
];
// ────────────────────────────────────────────────────────────────────────────

// Build preset <select> options from the array above
function buildPresetOptions() {
    const sel = document.getElementById('presetSelect');
    PRESET_BACKGROUNDS.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = p.label;
        sel.appendChild(opt);
    });
}

function loadPresetBackground() {
    const idx = parseInt(document.getElementById('presetSelect').value);
    if (isNaN(idx)) return;
    const img = new Image();
    img.onload = () => { backgroundImage = img; };
    img.onerror = () => { alert(`Could not load preset image: ${PRESET_BACKGROUNDS[idx].src}\nMake sure the file exists at that path.`); };
    img.src = PRESET_BACKGROUNDS[idx].src;
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => { backgroundImage = img; };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function clearBackground() {
    backgroundImage = null;
    document.getElementById('presetSelect').value = "";
    document.getElementById('bgUpload').value = "";
}

// 2. UI HELPERS
function toggleSlipUI() {
    const mode = document.getElementById('slipMode').value;
    document.getElementById('random-ui').style.display = mode === 'random' ? 'block' : 'none';
    document.getElementById('constant-ui').style.display = mode === 'constant' ? 'block' : 'none';
    document.getElementById('encoder-ui').style.display = mode === 'encoder' ? 'block' : 'none';
    document.getElementById('imu-ui').style.display = mode === 'imu' ? 'block' : 'none';
    document.getElementById('accel-ui').style.display = mode === 'accel' ? 'block' : 'none';
}

function updatePathUI() {
    const list = document.getElementById('path-list');
    let html = `<div class="path-item">1. Start (300, 300)</div>`;
    html += path.map((p, i) =>
        `<div class="path-item">${i + 2}. Waypoint (${Math.round(p.x)}, ${Math.round(p.y)})</div>`
    ).join('');
    list.innerHTML = html;
}

// 3. INTERACTION
function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('mousedown', (e) => {
    if (isRunning) return;
    const pos = getCanvasPos(e);

    // Check if clicking near an existing waypoint to drag it
    for (let i = 0; i < path.length; i++) {
        if (Math.hypot(path[i].x - pos.x, path[i].y - pos.y) < DRAG_RADIUS) {
            dragIndex = i;
            return;
        }
    }

    // Otherwise, add a new waypoint
    path.push({ x: pos.x, y: pos.y });
    updatePathUI();
});

canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasPos(e);
    lastMousePos = pos;

    document.getElementById('ui-x').innerText = Math.round(pos.x);
    document.getElementById('ui-y').innerText = Math.round(pos.y);

    // Handle dragging waypoint
    if (dragIndex >= 0) {
        path[dragIndex].x = pos.x;
        path[dragIndex].y = pos.y;
        updatePathUI();
    }

    // Cursor hint: show grab cursor near waypoints
    if (!isRunning) {
        const nearPoint = path.some(p => Math.hypot(p.x - pos.x, p.y - pos.y) < DRAG_RADIUS);
        canvas.style.cursor = nearPoint ? 'grab' : 'crosshair';
    }
});

canvas.addEventListener('mouseup', () => { dragIndex = -1; });
canvas.addEventListener('mouseleave', () => { dragIndex = -1; });

function resetRobot() {
    isRunning = false;
    solid = { x: 300, y: 300, theta: 0 };
    ghost = { x: 300, y: 300, theta: 0 };
    currentWaypointIndex = 0;
}

function clearPath() {
    path = [];
    resetRobot();
    updatePathUI();
}

function runPath() {
    if (path.length === 0) return;
    resetRobot();

    const mode = document.getElementById('slipMode').value;
    if (mode === 'constant') {
        const side = document.getElementById('biasSide').value;
        const loss = parseFloat(document.getElementById('biasAmount').value);
        leftMultiplier = (side === 'L') ? (1 - loss) : 1;
        rightMultiplier = (side === 'R') ? (1 - loss) : 1;
    } else {
        leftMultiplier = 1;
        rightMultiplier = 1;
    }

    isRunning = true;
}

// 4. PHYSICS & PID
// Persistent per-run state for stateful error modes
let encoderErrorL = 0, encoderErrorR = 0;  // cumulative encoder noise
let imuDriftAccum = 0;                       // cumulative IMU heading error
let accelStateL = 0, accelStateR = 0;        // current velocity for accel model

// ── LINE-FOLLOWING CONTROLLER ───────────────────────────────────────────────
// Computes motor powers to follow a path of line segments exactly.
// Uses two corrections simultaneously:
//   1. Heading error: steer toward the segment's direction
//   2. Cross-track error: perpendicular distance from the line
// This makes the robot hug the planned path when slip=0.
function computeMotorPowers(robot) {
    if (currentWaypointIndex >= path.length) {
        return { l: 0, r: 0 };
    }

    const target = path[currentWaypointIndex];
    const prev = currentWaypointIndex === 0 ? { x: 300, y: 300 } : path[currentWaypointIndex - 1];

    // Vector from prev to target (the segment we're following)
    const sx = target.x - prev.x;
    const sy = target.y - prev.y;
    const segLen = Math.hypot(sx, sy);

    // Vector from prev to robot's current position
    const rx = robot.x - prev.x;
    const ry = robot.y - prev.y;

    // Signed cross-track error (perpendicular distance from the line)
    // Positive means robot is to the right of the segment
    const crossTrack = (sx * ry - sy * rx) / (segLen || 1);

    // Distance remaining to target waypoint
    const distToTarget = Math.hypot(target.x - robot.x, target.y - robot.y);

    // Advance to next waypoint when close enough
    if (distToTarget < 8) {
        currentWaypointIndex++;
        return { l: 0, r: 0 };
    }

    // Speed proportional to remaining distance (slows down near waypoints)
    const speed = Math.min(distToTarget * 0.1, 5);

    // Desired heading is the direction of the segment
    const segAngle = Math.atan2(sy, sx);
    let angleErr = segAngle - robot.theta;

    // Normalize angle error to [-π, π]
    while (angleErr > Math.PI) angleErr -= Math.PI * 2;
    while (angleErr < -Math.PI) angleErr += Math.PI * 2;

    // Combined turn output: heading P-gain + cross-track P-gain
    const KH = 2.0;   // Heading proportional gain
    const KC = 0.06;  // Cross-track proportional gain
    const turn = angleErr * KH - crossTrack * KC;

    return { l: speed + turn, r: speed - turn };
}

function update() {
    if (isRunning && currentWaypointIndex < path.length) {
        let targetPos = path[currentWaypointIndex];

        // Ghost: follows perfect line-tracking math
        let ghostPowers = computeMotorPowers(ghost);
        // Solid robot uses the same controller but with perturbed outputs
        let solidPowers = computeMotorPowers(solid);

        const mode = document.getElementById('slipMode').value;
        const trackWidth = parseFloat(document.getElementById('trackWidth').value) || 30;

        let leftDisp, rightDisp;

        if (mode === 'none') {
            // ── No error ─────────────────────────────────────────────────
            leftDisp = solidPowers.l;
            rightDisp = solidPowers.r;

        } else if (mode === 'constant') {
            // ── Constant Hardware Bias ──────────────────────────────────
            leftDisp = solidPowers.l * leftMultiplier;
            rightDisp = solidPowers.r * rightMultiplier;

        } else if (mode === 'random') {
            // ── Random Jitter ───────────────────────────────────────────
            let intensity = parseFloat(document.getElementById('slipIntensity').value);
            leftDisp = solidPowers.l * (1 + (Math.random() - 0.5) * intensity * 2);
            rightDisp = solidPowers.r * (1 + (Math.random() - 0.5) * intensity * 2);

        } else if (mode === 'encoder') {
            // ── Encoder Noise ───────────────────────────────────────────
            let noiseScale = parseFloat(document.getElementById('encoderNoise').value);
            encoderErrorL += (Math.random() - 0.5) * noiseScale;
            encoderErrorR += (Math.random() - 0.5) * noiseScale;
            encoderErrorL = Math.max(-0.3, Math.min(0.3, encoderErrorL));
            encoderErrorR = Math.max(-0.3, Math.min(0.3, encoderErrorR));
            leftDisp = solidPowers.l * (1 + encoderErrorL);
            rightDisp = solidPowers.r * (1 + encoderErrorR);

        } else if (mode === 'imu') {
            // ── IMU Heading Drift ───────────────────────────────────────
            let driftRate = parseFloat(document.getElementById('imuDriftRate').value);
            imuDriftAccum += driftRate * (Math.random() > 0.5 ? 1 : -1) * 0.5;
            let driftedRobot = { x: solid.x, y: solid.y, theta: solid.theta + imuDriftAccum };
            let driftedPowers = computeMotorPowers(driftedRobot);
            leftDisp = driftedPowers.l;
            rightDisp = driftedPowers.r;

        } else if (mode === 'accel') {
            // ── Asymmetric Acceleration ─────────────────────────────────
            let accelL = parseFloat(document.getElementById('accelRateL').value);
            let accelR = parseFloat(document.getElementById('accelRateR').value);
            accelStateL += Math.max(-accelL, Math.min(accelL, solidPowers.l - accelStateL));
            accelStateR += Math.max(-accelR, Math.min(accelR, solidPowers.r - accelStateR));
            leftDisp = accelStateL;
            rightDisp = accelStateR;

        } else {
            leftDisp = solidPowers.l;
            rightDisp = solidPowers.r;
        }

        // ── Update Solid Robot (Actual Physical Movement with error) ────
        solid.theta += (leftDisp - rightDisp) / trackWidth;
        let dSolid = (leftDisp + rightDisp) / 2;
        solid.x += dSolid * Math.cos(solid.theta);
        solid.y += dSolid * Math.sin(solid.theta);

        // ── Update Ghost Robot (Perfect Odometry — no error) ────────────
        ghost.theta += (ghostPowers.l - ghostPowers.r) / trackWidth;
        let dGhost = (ghostPowers.l + ghostPowers.r) / 2;
        ghost.x += dGhost * Math.cos(ghost.theta);
        ghost.y += dGhost * Math.sin(ghost.theta);
    }

    draw();
    requestAnimationFrame(update);
}

// 5. DRAWING
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    if (backgroundImage) {
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#1e1e1e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Path lines
    if (path.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(300, 300);
        path.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);

        // Waypoint dots with hover highlight
        path.forEach((p, i) => {
            const isNearMouse = Math.hypot(p.x - lastMousePos.x, p.y - lastMousePos.y) < DRAG_RADIUS;
            ctx.fillStyle = isNearMouse ? "#f0a0ff" : "#d166eb";
            ctx.beginPath();
            ctx.arc(p.x, p.y, isNearMouse ? 6 : 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw drag hint ring when hovering
            if (isNearMouse && !isRunning) {
                ctx.strokeStyle = "rgba(209, 102, 235, 0.4)";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, DRAG_RADIUS, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
    }

    // Start position indicator
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(300, 300, 4, 0, Math.PI * 2);
    ctx.fill();

    // Ghost = Pink (actual robot with error), rendered at half opacity
    renderBot(ghost, "#ff8fb1", 1.0);
    // Solid = Blue (perfect odometry), fully opaque
    renderBot(solid, "#4aa7ff", 1.0);
}

function renderBot(bot, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bot.x, bot.y);
    ctx.rotate(bot.theta);
    ctx.fillStyle = color;
    ctx.fillRect(-18, -18, 36, 36);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(12, -3, 6, 6); // front indicator
    ctx.restore();
}

// 6. INIT
buildPresetOptions();
update();