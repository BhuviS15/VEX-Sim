// 1. SETUP & VARIABLES
const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

let solid = { x: 300, y: 300, theta: 0 }; // The Real Robot
let ghost = { x: 300, y: 300, theta: 0 }; // The Sensor Data
let target = null;
let path = [];
let currentWaypointIndex = 0;
let leftBias = 1;
let rightBias = 1;

// Load Field Image (Optional - ensure you have field.png in your folder)
const fieldImg = new Image();
fieldImg.src = 'field.png';

// 2. USER INTERACTION
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    target = { x: mouseX, y: mouseY };
    path.push({ ...target });
    updatePathUI();
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    document.getElementById('ui-x').innerText = Math.round(e.clientX - rect.left);
    document.getElementById('ui-y').innerText = Math.round(e.clientY - rect.top);
});

function updatePathUI() {
    const list = document.getElementById('path-list');
    if (list) {
        list.innerHTML = path.map((p, i) =>
            `<div class="path-item">${i + 1}. Target (${Math.round(p.x)}, ${Math.round(p.y)})</div>`
        ).join('');
    }
}

function updateSlipUI(val) {
    // Updates the text next to the slider
    document.getElementById('slip-val').innerText = val;
}

function resetRobot() {
    isRunning = false;
    solid = { x: 300, y: 300, theta: 0 };
    ghost = { x: 300, y: 300, theta: 0 };
    currentWaypointIndex = 0;
    draw();
}

function runPath() {
    if (path.length === 0) return;

    // Reset positions
    solid = { x: 300, y: 300, theta: 0 };
    ghost = { x: 300, y: 300, theta: 0 };

    // Generate a fixed bias just in case the user wants "Consistent" mode
    let slipIntensity = parseFloat(document.getElementById('slip').value) || 0;
    leftBias = 1 + ((Math.random() - 0.5) * 2 * slipIntensity);
    rightBias = 1 + ((Math.random() - 0.5) * 2 * slipIntensity);

    currentWaypointIndex = 0;
    isRunning = true;
}

// 3. MATH & PID LOGIC
function driveToTarget(targetPos, robot) {
    if (!targetPos) return { l: 0, r: 0 };

    let dx = targetPos.x - robot.x;
    let dy = targetPos.y - robot.y;
    let distanceError = Math.sqrt(dx * dx + dy * dy);

    // Stop if we are within 5 pixels of target
    if (distanceError < 5) return { l: 0, r: 0 };

    // 1. Linear Speed (P-Controller)
    let kP_dist = 0.1;
    let speed = distanceError * kP_dist;
    speed = Math.min(speed, 5); // Cap max speed

    // 2. Heading/Angular (P-Controller)
    let targetAngle = Math.atan2(dy, dx);
    let angleError = targetAngle - robot.theta;

    // Normalize angle error to keep it between -PI and PI
    while (angleError > Math.PI) angleError -= Math.PI * 2;
    while (angleError < -Math.PI) angleError += Math.PI * 2;

    let kP_turn = 3.0;
    let turn = angleError * kP_turn;

    return {
        l: speed + turn,
        r: speed - turn
    };
}

// 4. THE MAIN LOOP (Physics & Logic)
let isRunning = false;

function update() {
    // 1. Logic & Physics (Only runs if 'isRunning' is true and there is a path)
    if (isRunning && path.length > 0 && currentWaypointIndex < path.length) {
        let currentTarget = path[currentWaypointIndex];
        let powers = driveToTarget(currentTarget, solid);

        // Check if we arrived at the current waypoint (Threshold: 7 pixels)
        let dx = currentTarget.x - solid.x;
        let dy = currentTarget.y - solid.y;
        if (Math.sqrt(dx * dx + dy * dy) < 7) {
            currentWaypointIndex++;
        }

        // Get Configuration from UI
        let trackWidth = parseFloat(document.getElementById('trackWidth').value) || 12;
        let slipIntensity = parseFloat(document.getElementById('slip').value) || 0;
        let isConsistent = document.getElementById('isConsistent').checked;

        let leftActual, rightActual;

        if (isConsistent) {
            // Use the fixed bias generated at the start of the run
            leftActual = powers.l * leftBias;
            rightActual = powers.r * rightBias;
        } else {
            // Generate new random noise every single frame (the "jittery" slip)
            let leftDrift = 1 + ((Math.random() - 0.5) * 2 * slipIntensity);
            let rightDrift = 1 + ((Math.random() - 0.5) * 2 * slipIntensity);
            leftActual = powers.l * leftDrift;
            rightActual = powers.r * rightDrift;
        }

        let dThetaSolid = (leftActual - rightActual) / trackWidth;
        let dDistSolid = (leftActual + rightActual) / 2;
        solid.theta += dThetaSolid;
        solid.x += dDistSolid * Math.cos(solid.theta);
        solid.y += dDistSolid * Math.sin(solid.theta);

        // Ghost Robot (The "Ideal" Robot/Internal Odometry)
        // This follows the theoretical code exactly with 0 slip.
        let dThetaGhost = (powers.l - powers.r) / trackWidth;
        let dDistGhost = (powers.l + powers.r) / 2;
        ghost.theta += dThetaGhost;
        ghost.x += dDistGhost * Math.cos(ghost.theta);
        ghost.y += dDistGhost * Math.sin(ghost.theta);
    }

    // 2. Rendering (Always runs so the screen stays alive)
    draw();

    // 3. Loop
    requestAnimationFrame(update);
}

// 5. DRAWING
function drawRobot(robot, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(robot.x, robot.y);
    ctx.rotate(robot.theta);

    // Chassis (Size: 36x36)
    ctx.fillStyle = color;
    ctx.fillRect(-18, -18, 36, 36);

    // Heading Indicator (White rectangle at the front)
    ctx.fillStyle = "white";
    ctx.fillRect(10, -5, 8, 10);
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    if (fieldImg.complete && fieldImg.width > 0) {
        ctx.drawImage(fieldImg, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = "#1e1e1e"; // Darker background for visibility
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Path Lines
    if (path.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.setLineDash([5, 5]);
        ctx.moveTo(300, 300); // Start position
        path.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw the Robots
    drawRobot(ghost, '#007bff', 0.5); // Blue (Sensor/Ghost)
    drawRobot(solid, '#eb4034', 1.0); // Red (Actual/Solid)
}

// Start the loop immediately so we can see the robot at the start
update();