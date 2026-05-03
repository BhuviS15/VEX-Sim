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
        `<div class="path-item">${i + 2}. Target (${Math.round(p.x)}, ${Math.round(p.y)})</div>`
    ).join('');
    list.innerHTML = html;
}

// 3. INTERACTION
canvas.addEventListener('mousedown', (e) => {
    if (isRunning) return;
    const rect = canvas.getBoundingClientRect();
    path.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    updatePathUI();
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    document.getElementById('ui-x').innerText = Math.round(e.clientX - rect.left);
    document.getElementById('ui-y').innerText = Math.round(e.clientY - rect.top);
});

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

function driveToTarget(targetPos, robot) {
    if (!targetPos) return { l: 0, r: 0 };
    let dx = targetPos.x - robot.x;
    let dy = targetPos.y - robot.y;
    let dist = Math.hypot(dx, dy);

    if (dist < 5) return { l: 0, r: 0 };

    let speed = Math.min(dist * 0.1, 5);
    let targetAngle = Math.atan2(dy, dx);
    let angleErr = targetAngle - robot.theta;

    while (angleErr > Math.PI) angleErr -= Math.PI * 2;
    while (angleErr < -Math.PI) angleErr += Math.PI * 2;

    let turn = angleErr * 2.0;
    return { l: speed + turn, r: speed - turn };
}

function update() {
    if (isRunning && currentWaypointIndex < path.length) {
        let target = path[currentWaypointIndex];

        // Ghost follows perfect math — always uses its own position
        let ghostPowers = driveToTarget(target, ghost);
        // Solid robot PID also targets the same waypoint but uses its own (drifted) position
        let solidPowers = driveToTarget(target, solid);

        if (Math.hypot(target.x - solid.x, target.y - solid.y) < 8) {
            currentWaypointIndex++;
        }

        const mode = document.getElementById('slipMode').value;
        const trackWidth = parseFloat(document.getElementById('trackWidth').value) || 30;

        let leftDisp, rightDisp;

        if (mode === 'constant') {
            // ── Constant Hardware Bias ──────────────────────────────────────
            leftDisp = solidPowers.l * leftMultiplier;
            rightDisp = solidPowers.r * rightMultiplier;

        } else if (mode === 'random') {
            // ── Random Jitter ───────────────────────────────────────────────
            let intensity = parseFloat(document.getElementById('slipIntensity').value);
            leftDisp = solidPowers.l * (1 + (Math.random() - 0.5) * intensity * 2);
            rightDisp = solidPowers.r * (1 + (Math.random() - 0.5) * intensity * 2);

        } else if (mode === 'encoder') {
            // ── Encoder Noise ───────────────────────────────────────────────
            // Simulates encoder ticks being miscounted; error accumulates over time.
            let noiseScale = parseFloat(document.getElementById('encoderNoise').value);
            encoderErrorL += (Math.random() - 0.5) * noiseScale;
            encoderErrorR += (Math.random() - 0.5) * noiseScale;
            // Clamp drift so it doesn't run away forever
            encoderErrorL = Math.max(-0.3, Math.min(0.3, encoderErrorL));
            encoderErrorR = Math.max(-0.3, Math.min(0.3, encoderErrorR));
            leftDisp = solidPowers.l * (1 + encoderErrorL);
            rightDisp = solidPowers.r * (1 + encoderErrorR);

        } else if (mode === 'imu') {
            // ── IMU Heading Drift ───────────────────────────────────────────
            // The robot's heading sensor drifts, causing the PID to steer wrong.
            let driftRate = parseFloat(document.getElementById('imuDriftRate').value);
            imuDriftAccum += driftRate * (Math.random() > 0.5 ? 1 : -1) * 0.5;
            // Apply the drift as a heading offset — PID steers toward wrong angle
            let driftedRobot = { x: solid.x, y: solid.y, theta: solid.theta + imuDriftAccum };
            let driftedPowers = driveToTarget(target, driftedRobot);
            leftDisp = driftedPowers.l;
            rightDisp = driftedPowers.r;

        } else if (mode === 'accel') {
            // ── Asymmetric Acceleration ─────────────────────────────────────
            // Each side has a different max acceleration rate, causing the robot
            // to swing toward the slower side on startup / sharp turns.
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

        // ── Update Solid Robot (Actual Physical Movement with error) ────────
        solid.theta += (leftDisp - rightDisp) / trackWidth;
        let dSolid = (leftDisp + rightDisp) / 2;
        solid.x += dSolid * Math.cos(solid.theta);
        solid.y += dSolid * Math.sin(solid.theta);

        // ── Update Ghost Robot (Perfect Odometry — no error) ────────────────
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

        path.forEach(p => {
            ctx.fillStyle = "#d166eb";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Ghost = Pink (perfect odometry), rendered at half opacity
    renderBot(ghost, "#ff8fb1", 0.5);
    // Solid = Blue (actual robot with error), fully opaque
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