# VEX-Sim Path Editor
VEX-Sim is a web-based autonomous path visualizer designed for VEX Robotics teams. It allows users to simulate the behavior of a robot following a PID-controlled path while accounting for real-world inaccuracies like wheel slip and mechanical drift.
Inspired by PathJerry, this tool aims to bridge the gap between theoretical path planning and actual on-field performance by integrating time-based event scheduling for motors and pneumatics, similar to the logic used in PROS and LemLib.

## Current Status: "Slip"
I am currently refining the slip mechanic. This feature simulates a robot that has a permanent mechanical bias (e.g., the left side of the drivetrain is slightly faster than the right), causing the "Actual" robot (Red) to deviate from the "Odometry" ghost (Blue) in a predictable, non-random way.
Goals:
* To simulate random slip of varying intensities
* To simulate consistent drift of varying intensities
* Customization of consistent drift (e.g. the left side of the drivetrain is stronger than the right)
* Recommendations to minimize slip

## Roadmap
The goal is to evolve this from a simple movement simulator into a full-scale autonomous sequence planner.

### Phase 1: Movement & Physics Refinement
* [X] Autonomous Path Creation: Move the robot point to point and create an autonomous path.
* [ ] Bezier Curve Support: Move beyond point-to-point straight lines to curved pathing.
* [ ] Velocity Constraints: Add the ability to set max speeds for specific path segments.
* [ ] Advanced Odometry: Implement 3-wheel or 2-wheel + IMU tracking logic to match LemLib’s internal math.

### Phase 2: Action Timeline
* [ ] Event Nodes: UI to click a point on the path and "attach" an action.
* [ ] Action Types:
  * Motor Actions: Set velocity and duration (e.g., Intake: 200rpm for 5s).
  * Pneumatic Actions: Toggle states (e.g., Left Wing: Extend).
* [ ] Time-Based Sequencing: A global timer that triggers events regardless of robot position.
* [ ] Distance-Based Sequencing: Trigger events when the robot is X inches from a waypoint.

### Phase 3: Hardware Groups & UI
* [ ] Device Manager: Define custom motor groups (e.g., "Bottom Intake", "Cata") and pneumatics in the sidebar.
* [ ] Timeline Visualizer: A bottom-bar "Gantt chart" showing when motors/pistons are active during the 15-second run.
* [ ] Export to PROS: A "Copy Code" button that generates the C++ PROS/LemLib code for the designed path and actions.

### Phase 4: Environmental Factors
* [ ] Game Elements: Toggleable overlays for different VEX seasons (e.g., High Stakes).
* [ ] Collision Detection: Basic hit-boxes for field perimeters and game objects.

## Technical Setup
The simulator is built with vanilla JavaScript and HTML5 Canvas for maximum portability and speed.

### Constants & Math
The robot's movement is calculated using a standard differential drive model:

$$d\theta = \frac{Power_L - Power_R}{TrackWidth}$$
$$dDist = \frac{Power_L + Power_R}{2}$$

### Running the Project
* Clone the repository.
* Ensure field.png (600x600px) is in the root directory for the background.
* Open index.html in any modern web browser.

“Simulate once, win every time.”

