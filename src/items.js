/**
 * items.js - Collectible Spinning Stars with Wide Hitboxes & Respawn
 */
import * as THREE from 'three';

export class ItemManager {
  constructor(scene, track, audioManager, onScoreUpdate) {
    this.scene = scene;
    this.track = track;
    this.audio = audioManager;
    this.onScoreUpdate = onScoreUpdate;

    this.score = 0;
    this.items = [];
    this.hitRadius = 3.6; // Forgiving, wide AT hitbox
    this.respawnDuration = 8.0; // 8 seconds respawn

    this.starGeometry = this.createStarGeometry();
    this.starMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd32a,
      emissive: 0xffa801,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.1
    });

    this.spawnItemsAlongTrack();
  }

  createStarGeometry() {
    // Extruded 5-pointed star shape
    const pts = 5;
    const outerR = 1.2;
    const innerR = 0.55;
    const shape = new THREE.Shape();

    for (let i = 0; i < pts * 2; i++) {
      const angle = (i * Math.PI) / pts - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();

    const extrudeSettings = {
      depth: 0.4,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.1
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center();
    return geo;
  }

  spawnItemsAlongTrack() {
    // Distribute 14 collectible stars along the circuit
    const starCount = 14;
    for (let i = 0; i < starCount; i++) {
      const u = (i + 0.5) / starCount;
      const pt = this.track.curve.getPointAt(u);
      const tangent = this.track.curve.getTangentAt(u).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Slight natural alternating offset within road boundaries
      const offset = (Math.sin(i * 3.7) * (this.track.roadWidth * 0.22));
      const pos = new THREE.Vector3().copy(pt).addScaledVector(side, offset);
      pos.y = pt.y + 1.4; // Floating height relative to track elevation

      const mesh = new THREE.Mesh(this.starGeometry, this.starMaterial);
      mesh.position.copy(pos);
      mesh.castShadow = true;
      this.scene.add(mesh);

      this.items.push({
        mesh: mesh,
        basePos: pos.clone(),
        collected: false,
        respawnTimer: 0,
        bobPhase: i * 0.8
      });
    }
  }

  update(dt, carPosition) {
    const time = performance.now() * 0.001;

    for (const item of this.items) {
      if (item.collected) {
        item.respawnTimer -= dt;
        if (item.respawnTimer <= 0) {
          // Respawn star
          item.collected = false;
          item.mesh.visible = true;
          item.mesh.scale.set(0, 0, 0); // Scale up animation on respawn
        }
      } else {
        // Star scale-in animation if just respawned
        if (item.mesh.scale.x < 1.0) {
          const s = Math.min(1.0, item.mesh.scale.x + dt * 3.0);
          item.mesh.scale.set(s, s, s);
        }

        // Idle floating bob & spin
        item.mesh.rotation.y += 2.0 * dt;
        item.mesh.position.y = item.basePos.y + Math.sin(time * 3.0 + item.bobPhase) * 0.25;

        // Hitbox collision check with vehicle
        const dx = carPosition.x - item.mesh.position.x;
        const dz = carPosition.z - item.mesh.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < this.hitRadius) {
          this.collectItem(item);
        }
      }
    }
  }

  collectItem(item) {
    item.collected = true;
    item.mesh.visible = false;
    item.respawnTimer = this.respawnDuration;

    this.score += 1;
    if (this.onScoreUpdate) {
      this.onScoreUpdate(this.score);
    }

    if (this.audio) {
      this.audio.playStarPickupChime();
    }
  }
}
