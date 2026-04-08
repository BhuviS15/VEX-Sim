const canvas = document.getElementById('fieldCanvas');
const ctx = canvas.getContext('2d');

// Robot State
let solid = { x: 300, y: 300, theta: 0 }; // The "Real" world
let ghost = { x: 300, y: 300, theta: 0 }; // What the sensors "see"

function update() {
    // 1. Get Inputs (This is where you'd put PID or Keyboard logic)
    let leftPower = 0;
    let rightPower = 0;

    // 2. Physics Simulation (Applying Math)
    let trackWidth = parseFloat(document.getElementById('trackWidth').value);
    let slip = parseFloat(document.getElementById('slip').value);

    // Placeholder movement logic
    // deltaTheta = (dL - dR) / trackWidth;

    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw Ghost (Transparent Blue)
    drawRobot(ghost, 'rgba(0, 100, 255, 0.5)');
    // Draw Solid (Solid Red)
    drawRobot(solid, 'red');
}

function drawRobot(robot, color) {
    ctx.save();
    ctx.translate(robot.x, robot.y);
    ctx.rotate(robot.theta);
    ctx.fillStyle = color;
    ctx.fillRect(-15, -15, 30, 30); // Draw robot body
    ctx.restore();
}

update();