/** * 1. SIMULATION STATE & CONFIGURATION
 * solid: Represents the "real world" robot affected by friction/slip.
 * ghost: Represents the "perfect" robot (where the encoders think the robot is).
 */
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

/** * 2. UI HELPERS
 * Manages the visibility of simulation parameters and the waypoint list.
 */
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

/** * 3. INTERACTION & CONTROL
 */
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
        // FIX 3: Scale down the loss percentage by multiplying by 0.1
        // This prevents the robot from spinning out of control at 5% UI loss.
        const loss = parseFloat(document.getElementById('biasAmount').value) * 0.1;
        leftMultiplier = (side === 'L') ? (1 - loss) : 1;
        rightMultiplier = (side === 'R') ? (1 - loss) : 1;
    } else {
        leftMultiplier = 1;
        rightMultiplier = 1;
    }

    isRunning = true;
}

/** * 4. NAVIGATION & KINEMATICS (The "Brain")
 */
function driveToTarget(targetPos, robot) {
    if (!targetPos) return { l: 0, r: 0 };

    let dx = targetPos.x - robot.x;
    let dy = targetPos.y - robot.y;
    let dist = Math.hypot(dx, dy);

    if (dist < 5) return { l: 0, r: 0 };

    let targetAngle = Math.atan2(dy, dx);
    let angleErr = targetAngle - robot.theta;

    while (angleErr > Math.PI) angleErr -= Math.PI * 2;
    while (angleErr < -Math.PI) angleErr += Math.PI * 2;

    let turn = angleErr * 2.0;

    // FIX 2: Prevent curving arcs by scaling down forward speed when misaligned.
    // If the angle error is larger than ~28 degrees (0.5 rad), speed drops to 0 
    // ensuring the bot primarily turns to face the point before driving forward.
    let speed = Math.min(dist * 0.1, 5);
    speed *= Math.max(0, 1 - (Math.abs(angleErr) / 0.5));

    return { l: speed + turn, r: speed - turn };
}

function update() {
    if (isRunning && currentWaypointIndex < path.length) {
        let target = path[currentWaypointIndex];
        let powers = driveToTarget(target, solid);

        if (Math.hypot(target.x - solid.x, target.y - solid.y) < 8) {
            currentWaypointIndex++;
        }

        const mode = document.getElementById('slipMode').value;
        const trackWidth = parseFloat(document.getElementById('trackWidth').value) || 12;

        let leftDisp, rightDisp;

        if (mode === 'constant') {
            leftDisp = powers.l * leftMultiplier;
            rightDisp = powers.r * rightMultiplier;
        } else {
            let intensity = parseFloat(document.getElementById('slipIntensity').value);
            leftDisp = powers.l * (1 + (Math.random() - 0.5) * intensity * 2);
            rightDisp = powers.r * (1 + (Math.random() - 0.5) * intensity * 2);
        }

        // --- ODOMETRY MATH ---
        solid.theta += (leftDisp - rightDisp) / trackWidth;
        let dSolid = (leftDisp + rightDisp) / 2;
        solid.x += dSolid * Math.cos(solid.theta);
        solid.y += dSolid * Math.sin(solid.theta);

        ghost.theta += (powers.l - powers.r) / trackWidth;
        let dGhost = (powers.l + powers.r) / 2;
        ghost.x += dGhost * Math.cos(ghost.theta);
        ghost.y += dGhost * Math.sin(ghost.theta);
    }

    draw();
    requestAnimationFrame(update);
}

/** * 5. RENDERING
 */
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Background
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw the FIELD image if it's loaded
    if (fieldImg.complete && fieldImg.src) {
        ctx.drawImage(fieldImg, 0, 0, 600, 600);
    }

    // 3. DRAW THE PATH (Perfectly connected lines)
    if (path.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 3;
        ctx.lineJoin = "round"; // This fixes the disconnected corners
        ctx.lineCap = "round";

        // Move to start point
        ctx.moveTo(300, 300);

        // Connect every point in order
        for (let i = 0; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }

        ctx.stroke(); // Draw the entire path as one single shape

        // 4. DRAW THE WAYPOINT DOTS
        path.forEach(p => {
            ctx.beginPath();
            ctx.fillStyle = "var(--accent)";
            ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // 5. DRAW THE ROBOTS
    // We grab trackWidth here to pass it to the renderBot function
    const trackWidthInput = document.getElementById('trackWidth');
    const trackWidth = trackWidthInput ? parseFloat(trackWidthInput.value) : 12;

    // Render the Ghost (Perfect Path)
    renderBot(ghost, "#ff8fb1", 0.5, trackWidth);

    // Render the Solid (Real Path with Slip)
    renderBot(solid, "#4aa7ff", 1.0, trackWidth);
}

/**
 * Draws the robot sprite (Square with a heading indicator)
 * size is relative to trackWidth for realism.
 */
function renderBot(bot, color, alpha, trackWidth) {
    if (!bot) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bot.x, bot.y);
    ctx.rotate(bot.theta);

    // Scaling the robot visual size based on the physics track width
    const size = trackWidth * 3;
    const half = size / 2;

    // Main Body
    ctx.fillStyle = color;
    ctx.fillRect(-half, -half, size, size);

    // Forward Heading Indicator (Small white strip at the front)
    ctx.fillStyle = "white";
    ctx.fillRect(half - (size / 5), -2, size / 5, 4);

    ctx.restore();
}