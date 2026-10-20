/**
 * vehicle.js - Stylized Car Mesh & Inertia-based Kinematics
 */
import * as THREE from 'three';

export class Vehicle {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;

    // Kinematic State
    this.position = new THREE.Vector3(0, 0.5, 120);
    this.heading = 0; // Yaw angle in radians
    this.pitch = 0; // Pitch angle in radians (hill slopes)
    this.quaternion = new THREE.Quaternion();
    this.speed = 0; // Current linear velocity (positive = forward, negative = reverse)
    this.gear = 'N'; // 'D', 'N', 'R'

    // Acceleration & Drag constants
    this.accelRate = 18.0;
    this.brakeRate = 26.0;
    this.naturalDrag = 3.5;
    this.reverseMaxRatio = 0.45;
    this.baseTurnRate = 2.4; // radians per sec

    // Visual Mesh Group
    this.mesh = new THREE.Group();
    this.wheels = [];
    this.frontWheelGroupL = null;
    this.frontWheelGroupR = null;
    this.chassisMesh = null;

    this.createCarMesh();
    this.scene.add(this.mesh);

    // Initial orientation
    this.updateTransform();
  }

  createCarMesh() {
    // Stylized sporty kart/car with high contrast
    // Length: ~3.8m, Width: ~2.4m, Height: ~1.4m

    // 1. Chassis Body
    const bodyGeo = new THREE.BoxGeometry(2.3, 0.8, 3.8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0984e3, // Racing Blue (vibrant, high contrast)
      roughness: 0.3,
      metalness: 0.2
    });
    this.chassisMesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.chassisMesh.position.y = 0.55;
    this.chassisMesh.castShadow = true;
    this.chassisMesh.receiveShadow = true;
    this.mesh.add(this.chassisMesh);

    // 2. Cabin / Windshield
    const cabinGeo = new THREE.BoxGeometry(1.8, 0.65, 1.8);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.1,
      metalness: 0.8
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.65, -0.2);
    cabin.castShadow = true;
    this.chassisMesh.add(cabin);

    // 3. Racing Stripe
    const stripeGeo = new THREE.BoxGeometry(0.5, 0.04, 3.82);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.41, 0);
    this.chassisMesh.add(stripe);

    // 4. Headlights (Bright Yellow - Front)
    const headlightGeo = new THREE.BoxGeometry(0.4, 0.25, 0.1);
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffa65 });
    const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
    hlLeft.position.set(0.75, 0.1, 1.91);
    this.chassisMesh.add(hlLeft);

    const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
    hlRight.position.set(-0.75, 0.1, 1.91);
    this.chassisMesh.add(hlRight);

    // 5. Taillights (Bright Red - Back)
    const taillightGeo = new THREE.BoxGeometry(0.5, 0.2, 0.1);
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
    const tlLeft = new THREE.Mesh(taillightGeo, taillightMat);
    tlLeft.position.set(0.75, 0.1, -1.91);
    this.chassisMesh.add(tlLeft);

    const tlRight = new THREE.Mesh(taillightGeo, taillightMat);
    tlRight.position.set(-0.75, 0.1, -1.91);
    this.chassisMesh.add(tlRight);

    // 6. Spoiler (Rear wing for orientation clarity)
    const wingGeo = new THREE.BoxGeometry(2.1, 0.1, 0.5);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x1e272e });
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(0, 0.7, -1.7);
    this.chassisMesh.add(wing);

    const wingPostGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
    const postL = new THREE.Mesh(wingPostGeo, wingMat);
    postL.position.set(0.8, 0.45, -1.7);
    this.chassisMesh.add(postL);
    const postR = new THREE.Mesh(wingPostGeo, wingMat);
    postR.position.set(-0.8, 0.45, -1.7);
    this.chassisMesh.add(postR);

    // 7. Wheels & Rims
    const wheelRadius = 0.45;
    const wheelWidth = 0.35;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.6, roughness: 0.2 });

    const createWheel = () => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, wheelMat);
      tire.castShadow = true;
      g.add(tire);

      // Hub rim
      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, wheelWidth + 0.02, 12);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      g.add(rim);

      return g;
    };

    const wheelX = 1.25;
    const wheelZFront = 1.2;
    const wheelZRear = -1.2;
    const wheelY = 0.45;

    // Front Left Wheel Pivot
    this.frontWheelGroupL = new THREE.Group();
    this.frontWheelGroupL.position.set(wheelX, wheelY, wheelZFront);
    const wheelFL = createWheel();
    this.frontWheelGroupL.add(wheelFL);
    this.mesh.add(this.frontWheelGroupL);
    this.wheels.push(wheelFL);

    // Front Right Wheel Pivot
    this.frontWheelGroupR = new THREE.Group();
    this.frontWheelGroupR.position.set(-wheelX, wheelY, wheelZFront);
    const wheelFR = createWheel();
    this.frontWheelGroupR.add(wheelFR);
    this.mesh.add(this.frontWheelGroupR);
    this.wheels.push(wheelFR);

    // Rear Left Wheel
    const wheelRL = createWheel();
    wheelRL.position.set(wheelX, wheelY, wheelZRear);
    this.mesh.add(wheelRL);
    this.wheels.push(wheelRL);

    // Rear Right Wheel
    const wheelRR = createWheel();
    wheelRR.position.set(-wheelX, wheelY, wheelZRear);
    this.mesh.add(wheelRR);
    this.wheels.push(wheelRR);
  }

  updatePhysics(dt, steerInput, throttleInput, isOffroad, trackInfo = null) {
    const maxSpeedSetting = this.settings.get('speedLimit');
    // Off-road reduces max speed to 60%
    const maxSpeed = isOffroad ? maxSpeedSetting * 0.6 : maxSpeedSetting;
    const maxReverseSpeed = -(maxSpeedSetting * this.reverseMaxRatio);

    // 1. Velocity Control (Electric Wheelchair Style)
    // Stick tilt angle directly commands target velocity:
    // - Forward tilt  -> Target forward speed proportional to tilt angle
    // - Backward tilt -> Target reverse speed proportional to tilt angle
    // - Neutral stick -> Target speed ZERO (Active neutral brake engages automatically)
    let targetSpeed = 0;
    if (throttleInput > 0) {
      targetSpeed = throttleInput * maxSpeed;
      this.gear = 'D';
    } else if (throttleInput < 0) {
      if (this.speed > 0.6) {
        // Forward motion active: apply firm braking down to near-standstill before reversing
        targetSpeed = 0;
        this.gear = 'D';
      } else {
        // Reverse mode: ensure sufficient minimum reverse drive so diagonal-backward (right-down, left-down) does not stall
        const reverseMagnitude = Math.max(0.20, Math.abs(throttleInput));
        targetSpeed = -reverseMagnitude * (maxSpeed * this.reverseMaxRatio);
        this.gear = 'R';
      }
    } else {
      // Neutral position (no tilt) -> Target is standstill
      targetSpeed = 0;
      if (Math.abs(this.speed) < 0.2) {
        this.gear = 'N';
      }
    }

    // 2. Drive & Active Dynamic Braking
    if (targetSpeed !== 0) {
      if (targetSpeed > 0) {
        if (this.speed < targetSpeed) {
          // Accelerate smoothly to target speed
          this.speed = Math.min(targetSpeed, this.speed + this.accelRate * dt);
        } else {
          // Smoothly ease down to lowered target speed
          this.speed = Math.max(targetSpeed, this.speed - this.brakeRate * dt);
        }
      } else {
        // Reverse motion
        if (this.speed > targetSpeed) {
          this.speed = Math.max(targetSpeed, this.speed - (this.accelRate * 0.85) * dt);
        } else {
          this.speed = Math.min(targetSpeed, this.speed + this.brakeRate * dt);
        }
      }
    } else {
      // Active Neutral Braking (Power Wheelchair: smooth, immediate safe stop)
      const brakeStep = this.brakeRate * dt;
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - brakeStep);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + brakeStep);
      }

      if (Math.abs(this.speed) < 0.05) {
        this.speed = 0;
        this.gear = 'N';
      }
    }

    // Clamp speed to limits
    this.speed = Math.max(maxReverseSpeed, Math.min(maxSpeed, this.speed));

    // 3. Steering Dynamics
    // Maneuverable at low/stopped speed (pivot turning) and stabilized against oversteer at top speed
    const speedRatio = Math.min(1.0, Math.abs(this.speed) / maxSpeedSetting);
    // Allow gentle pivot turn even when stopped/near standstill (essential for power wheelchairs)
    const pivotScale = Math.max(0.40, Math.min(1.0, Math.abs(this.speed) / 1.5));
    const stabilityDamping = 1.0 - speedRatio * 0.35;
    const steerFactor = (this.speed < 0 ? -1 : 1);

    const yawRate = -steerInput * this.baseTurnRate * pivotScale * stabilityDamping * steerFactor;
    this.heading += yawRate * dt;

    // Update quaternion from heading (Y-axis rotation)
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);

    // Compute forward motion vector
    const forward = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );

    this.position.addScaledVector(forward, this.speed * dt);

    // Track surface elevation & pitch angle along slopes
    if (trackInfo && trackInfo.point) {
      const targetY = trackInfo.point.y + 0.45;
      this.position.y += (targetY - this.position.y) * Math.min(1.0, 16.0 * dt);

      if (trackInfo.tangent) {
        const t = trackInfo.tangent;
        const forwardDotTangent = forward.x * t.x + forward.z * t.z;
        const slopeRad = Math.atan2(t.y, Math.hypot(t.x, t.z));
        const targetPitch = slopeRad * (forwardDotTangent >= 0 ? 1 : -1);
        this.pitch += (targetPitch - this.pitch) * Math.min(1.0, 8.0 * dt);
      }
    }

    this.updateTransform();

    // Wheel steering animation
    const steerAngle = -steerInput * 0.45;
    if (this.frontWheelGroupL) this.frontWheelGroupL.rotation.y = steerAngle;
    if (this.frontWheelGroupR) this.frontWheelGroupR.rotation.y = steerAngle;

    // Wheel rolling animation
    const wheelCircumference = 2 * Math.PI * 0.45;
    const wheelRot = (this.speed * dt / wheelCircumference) * (Math.PI * 2);
    for (const w of this.wheels) {
      w.rotation.x += wheelRot;
    }

    // Visual chassis subtle roll on turning and pitch on hills
    if (this.chassisMesh) {
      const targetRoll = steerInput * speedRatio * 0.08;
      this.chassisMesh.rotation.z += (targetRoll - this.chassisMesh.rotation.z) * 0.15;
      this.chassisMesh.rotation.x = this.pitch;
    }
  }

  applyDrag(drag, dt) {
    if (this.speed > 0) {
      this.speed = Math.max(0, this.speed - drag * dt);
    } else if (this.speed < 0) {
      this.speed = Math.min(0, this.speed + drag * dt);
    }
  }

  setSpawn(pos, heading) {
    this.position.copy(pos);
    this.heading = heading;
    this.pitch = 0;
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
    this.speed = 0;
    this.gear = 'N';
    this.updateTransform();
  }

  updateTransform() {
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);
  }

  getForwardVector() {
    return new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading)
    );
  }
}
