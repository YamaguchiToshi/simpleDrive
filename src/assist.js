/**
 * assist.js - Anti-Peeky Smooth Course Assist Engine
 *
 * Implements gentle soft centripetal forces and gradual slerp heading alignment,
 * preserving user steering authority while preventing motion sickness and abrupt snapping.
 */
import * as THREE from 'three';

export class CourseAssist {
  constructor(track, vehicle, settings) {
    this.track = track;
    this.vehicle = vehicle;
    this.settings = settings;

    // Temporary math objects to avoid garbage collection
    this.targetQuat = new THREE.Quaternion();
    this.targetDir = new THREE.Vector3();
    this.carDir = new THREE.Vector3();
  }

  update(dt, steerInput) {
    const assistLevel = this.settings.get('assistLevel');
    if (assistLevel === 'off') {
      const trackInfo = this.track.getClosestTrackInfo(this.vehicle.position);
      return { isOffroad: trackInfo.isOffroad, distance: trackInfo.distance, trackInfo: trackInfo };
    }

    // Configurable parameters based on assist level
    let kPush = 0.035;
    let slerpAlpha = 0.025;

    if (assistLevel === 'strong') {
      kPush = 0.065;
      slerpAlpha = 0.045;
    }

    // 1. Query nearest track point and tangent
    const trackInfo = this.track.getClosestTrackInfo(this.vehicle.position);
    const halfWidth = this.track.roadWidth / 2;
    const distToCenter = trackInfo.distance;
    const isOffroad = trackInfo.isOffroad;

    // 2. Soft Centripetal Translation Force
    // Engage force as vehicle approaches verge (> 75% half road width) or goes offroad
    const vergeThreshold = halfWidth * 0.75;
    if (distToCenter > vergeThreshold) {
      // Smooth fade-in of the assist force to prevent sudden jolts
      const vergeFactor = Math.min(1.0, (distToCenter - vergeThreshold) / (halfWidth * 0.5));
      const effectiveKPush = kPush * vergeFactor;

      // Vector toward track center point P_track - P_car
      const deltaX = trackInfo.point.x - this.vehicle.position.x;
      const deltaZ = trackInfo.point.z - this.vehicle.position.z;

      // Mild translational displacement scaled smoothly by dt
      const pushX = deltaX * effectiveKPush * (dt * 60);
      const pushZ = deltaZ * effectiveKPush * (dt * 60);

      this.vehicle.position.x += pushX;
      this.vehicle.position.z += pushZ;
    }

    // 3. Gentle Heading Alignment via Quaternion Slerp
    // Only apply if moving forward (speed > 1.5) and not overriding with strong steer
    const forwardSpeed = this.vehicle.speed;
    if (forwardSpeed > 1.5 && (distToCenter > vergeThreshold || isOffroad)) {
      // Track tangent forward direction
      const tangent = trackInfo.tangent;
      this.targetDir.set(tangent.x, 0, tangent.z).normalize();

      // Current car forward direction
      const carForward = this.vehicle.getForwardVector();

      // Ensure we align with the natural forward flow of the circuit
      // Target rotation angle from tangent vector
      const targetHeading = Math.atan2(this.targetDir.x, this.targetDir.z);
      this.targetQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetHeading);

      // Preserve manual steering authority:
      // If user is actively steering, drastically dampen slerp alignment
      const steerInterference = Math.abs(steerInput);
      const userAuthorityWeight = Math.max(0.15, 1.0 - (steerInterference * 0.8));

      // Gradual slerp step
      const stepAlpha = Math.min(1.0, slerpAlpha * userAuthorityWeight * (dt * 60));
      this.vehicle.quaternion.slerp(this.targetQuat, stepAlpha);

      // Extract new yaw angle from slerped quaternion to keep kinematics heading in sync
      const euler = new THREE.Euler().setFromQuaternion(this.vehicle.quaternion, 'YXZ');
      this.vehicle.heading = euler.y;
    }

    return {
      isOffroad: isOffroad,
      distance: distToCenter,
      trackInfo: trackInfo
    };
  }
}
