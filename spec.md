# Specification: Joystick Driving Simulator for iPad (Three.js)

## 1. Project Overview
A single-page, web-based 3D driving simulator built with Three.js, optimized for joystick-style pointing devices connected to an iPad (operating via mouse pointer input).
The screen center acts as neutral (idle/straight). Tilting up maps to forward acceleration, and tilting left/right controls steering.
The track-return assist is engineered to eliminate abrupt snaps or motion sickness, utilizing soft centripetal forces and gentle slerp alignments suitable for assistive technology (AT) contexts.

---

## 2. Input Mapping & Normalization

### 2.1 Coordinate System
- Origin: Viewport center (0, 0)
- Normalized screen coordinates:
  - X-axis: -1.0 (full left) to +1.0 (full right)
  - Y-axis: -1.0 (full bottom / reverse & brake) to +1.0 (full top / full throttle)

### 2.2 Deadzone & Filtering
To absorb involuntary muscle contractions, tremors, or stick rest drift:
```javascript
const dist = Math.hypot(normX, normY);
let steer = 0;
let throttle = 0;

if (dist > deadzoneRadius) {
  const factor = (dist - deadzoneRadius) / (1.0 - deadzoneRadius);
  steer = (normX / dist) * factor;
  throttle = (normY / dist) * factor;
}
```

---

## 3. Vehicle Dynamics & Soft Assist Engine

### 3.1 Kinematics
- Inertia-based motion with drag/air resistance (smooth coasting down to neutral stop).
- Speed-dependent turning rate: maneuverable at low-to-medium speeds, stabilized against oversteer at top speed.
- Auto-reverse engagement when pulling down below deadzone at low forward speeds.

### 3.2 Anti-Peeky Course Assist (Smooth Soft Assist)
Strictly avoid hard position snaps or instant yaw adjustments:
1. Off-road Detection: Calculate distance from spline curve center line. Flag off-road when distance exceeds half road-width.
2. Speed Damping: Cap maximum speed to 60% and introduce moderate surface drag on grass without abrupt braking.
3. Soft Centripetal Force:
   - Apply a mild translation force toward the nearest track center line:
     F_assist = (P_track - P_car) * k_push (k_push approx 0.03 - 0.05)
4. Gentle Heading Alignment:
   - Align vehicle heading to the track forward tangent via quaternion.slerp with a low frame step (alpha approx 0.02 - 0.03).
   - Ensure the user's manual steering authority is maintained at all times.

---

## 4. Track & Environment Design
- Closed-loop circuit generated via THREE.CatmullRomCurve3 with gentle turns (no sharp hairpin corners).
- Broad road profile (5–6x car width) allowing forgiving driving lines.
- High-contrast visual separation between tarmac, grass verge, and stylized car body.
- Collectible items (spinning stars) with wide hitboxes positioned along the course (respawn interval: 8 seconds).

---

## 5. Audio & Visual HUD (Self-Contained)
- Web Audio API Synthesis:
  - Procedural engine hum using dual oscillators (Sawtooth/Triangle) with pitch mapped dynamically to vehicle velocity.
  - Procedural chime pickup tone (sine wave frequency sweep).
  - Fully self-contained; zero external audio asset dependencies.
- Visual Vector HUD:
  - Center ring depicting the deadzone boundary.
  - Visual tracking dot and vector indicator displaying current joystick tilt relative to neutral.

---

## 6. Accessibility & Settings Panel
Configurable overlay drawer with real-time tuning:
- Speed Limit: Slow (12) / Normal (22) / Fast (32)
- Deadzone Radius: Slider (0.10 - 0.35, default 0.20)
- Steering Sensitivity: Low (0.6) / Medium (1.0) / High (1.4)
- Soft Assist Level: Off / Mild (default) / Strong

---

## 7. Implementation Tasks for Antigravity (agy)

```yaml
tasks:
  - id: setup-environment
    description: "Initialize Three.js scene, camera follower, simple stylized car mesh, and a smooth wide loop track using CatmullRomCurve3."

  - id: normalized-input-handling
    description: "Implement screen-centered pointer tracking, deadzone calculation, and on-screen visual HUD showing neutral ring and input vector."

  - id: vehicle-movement-model
    description: "Implement smooth inertia-based vehicle physics with acceleration, deceleration drag, and speed-scaled steering."

  - id: anti-peeky-track-assist
    description: "Implement soft off-road handling: apply gentle center-seeking force vector and gradual slerp heading alignment without abrupt snapping."

  - id: procedural-audio-and-items
    description: "Integrate Web Audio API synthesized engine pitch and pickup chimes, along with large-hitbox collectible stars."

  - id: accessibility-ui
    description: "Build an accessible modal/drawer for real-time tweaking of speed limits, deadzone radius, and assist intensity."
```
