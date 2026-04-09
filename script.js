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

const fieldImg = new Image();
fieldImg.src = 'field.png';

// 2. UI HELPERS
function toggleSlipUI() {
    const mode = document.getElementById('slipMode').value;
    document.getElementById('random-ui').style.display = mode === 'random' ? 'block' : 'none';
    document.getElementById('constant-ui').style.display = mode === 'constant' ? 'block' : 'none';
}

function updatePathUI() {
    const list = document.getElementById('path-list');
    let html = `<div class="path-item">1. Start (300, 300)</div>`;
    html += path.map((p, i) => `<div class="path-item">${i + 2}. Target (${Math.round(p.x)}, ${Math.round(p.y)})</div>`).join('');
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

    // Prepare Constant Bias if selected
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
function driveToTarget(targetPos, robot) {
    if (!targetPos) return { l: 0, r: 0 };
    let dx = targetPos.x - robot.x;
    let dy = targetPos.y - robot.y;
    let dist = Math.hypot(dx, dy);

    if (dist < 5) return { l: 0, r: 0 };

    let speed = Math.min(dist * 0.1, 5); // Linear P
    let targetAngle = Math.atan2(dy, dx);
    let angleErr = targetAngle - robot.theta;

    while (angleErr > Math.PI) angleErr -= Math.PI * 2;
    while (angleErr < -Math.PI) angleErr += Math.PI * 2;

    let turn = angleErr * 2.0; // Angular P
    return { l: speed + turn, r: speed - turn };
}

function update() {
    if (isRunning && currentWaypointIndex < path.length) {
        let target = path[currentWaypointIndex];
        let powers = driveToTarget(target, solid);

        // Check if reached waypoint
        if (Math.hypot(target.x - solid.x, target.y - solid.y) < 8) {
            currentWaypointIndex++;
        }

        const mode = document.getElementById('slipMode').value;
        const trackWidth = parseFloat(document.getElementById('trackWidth').value) || 12;

        let leftDisp, rightDisp;

        if (mode === 'constant') {
            // Constant hardware bias
            leftDisp = powers.l * leftMultiplier;
            rightDisp = powers.r * rightMultiplier;
        } else {
            // Random jitter intensity
            let intensity = parseFloat(document.getElementById('slipIntensity').value);
            leftDisp = powers.l * (1 + (Math.random() - 0.5) * intensity * 2);
            rightDisp = powers.r * (1 + (Math.random() - 0.5) * intensity * 2);
        }

        // Update Solid Robot (Actual Physical Movement)
        solid.theta += (leftDisp - rightDisp) / trackWidth;
        let dSolid = (leftDisp + rightDisp) / 2;
        solid.x += dSolid * Math.cos(solid.theta);
        solid.y += dSolid * Math.sin(solid.theta);

        // Update Ghost Robot (Perfect Sensor Math)
        ghost.theta += (powers.l - powers.r) / trackWidth;
        let dGhost = (powers.l + powers.r) / 2;
        ghost.x += dGhost * Math.cos(ghost.theta);
        ghost.y += dGhost * Math.sin(ghost.theta);
    }

    draw();
    requestAnimationFrame(update);
}

// 5. DRAWING
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Simple Background
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Path (Straight Lines)
    if (path.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.moveTo(300, 300);
        path.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        path.forEach(p => {
            ctx.fillStyle = "var(--accent)";
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        });
    }

    renderBot(ghost, "#ff8fb1", 0.5); // Pink Ghost
    renderBot(solid, "#4aa7ff", 1.0); // Blue Solid
}

function renderBot(bot, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bot.x, bot.y);
    ctx.rotate(bot.theta);
    ctx.fillStyle = color;
    ctx.fillRect(-18, -18, 36, 36);
    ctx.fillStyle = "white"; // Front
    ctx.fillRect(12, -2, 6, 4);
    ctx.restore();
}

update();