/**
 * track.js - Closed-loop Circuit & Scenery with CatmullRomCurve3
 */
import * as THREE from 'three';

export class Track {
  constructor(scene) {
    this.scene = scene;
    this.roadWidth = 16.0; // 5-6x car width (approx 2.6m wide car)
    this.curve = null;
    this.sampleCount = 300;
    this.samples = []; // Precomputed samples along the curve for fast lookup

    this.createCurve();
    this.createRoadMesh();
    this.createGround();
    this.createScenery();
  }

  createCurve() {
    // Dynamic circuit with gentle rolling hills, technical left-right S-curves,
    // and wide sweeping turns. No hairpin turns; generous turning radius for AT joysticks.
    const points = [
      new THREE.Vector3(0, 0, 150),       // 0: Start / Finish straight (flat)
      new THREE.Vector3(70, 0, 150),      // 1: Straightaway with great visibility
      new THREE.Vector3(140, 1.5, 120),   // 2: Sweeping right curve entering the hill ascent
      new THREE.Vector3(180, 4.0, 60),    // 3: Uphill climb (+4.0m) with wide right curve
      new THREE.Vector3(160, 6.5, -10),   // 4: Crest approach, sweeping into technical chicane
      new THREE.Vector3(100, 8.0, -30),   // 5: Peak of the hill (+8.0m)! Gentle left turn
      new THREE.Vector3(40, 6.5, -20),    // 6: Hill crest S-curve transitioning to right
      new THREE.Vector3(0, 4.5, -60),     // 7: Downhill descent sweeping through valley
      new THREE.Vector3(20, 2.5, -120),   // 8: Gentle right sweep at lower elevation
      new THREE.Vector3(70, 1.0, -160),   // 9: Valley straight
      new THREE.Vector3(40, 0.5, -200),   // 10: Deep valley wide left sweeper
      new THREE.Vector3(-40, 1.5, -210),  // 11: Gentle ascent into secondary undulating hill
      new THREE.Vector3(-120, 3.0, -170), // 12: Secondary hill climb (+3.0m)
      new THREE.Vector3(-170, 5.0, -110), // 13: Secondary crest (+5.0m) with sweeping left arc
      new THREE.Vector3(-180, 4.5, -40),  // 14: Downhill left arc with wide road clearance
      new THREE.Vector3(-140, 2.5, 30),   // 15: Smooth transition down to home plateau
      new THREE.Vector3(-100, 1.0, 90),   // 16: Gentle right curve aligning to start straight
      new THREE.Vector3(-40, 0.0, 140),   // 17: Final approach to start/finish line
    ];

    this.curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');

    // Precompute sample points along the curve
    this.samples = [];
    for (let i = 0; i < this.sampleCount; i++) {
      const u = i / this.sampleCount;
      const point = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();
      this.samples.push({ u, point, tangent });
    }
  }

  createRoadMesh() {
    const numPoints = this.sampleCount;
    const halfWidth = this.roadWidth / 2;
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Buffers for asphalt, curbs, center dashed lines, and grassy embankments
    const roadVertices = [];
    const roadIndices = [];
    const roadUvs = [];

    const curbLeftVertices = [];
    const curbRightVertices = [];
    const curbIndices = [];

    const centerLineVertices = [];
    const centerLineIndices = [];

    const embankmentVertices = [];
    const embankmentIndices = [];

    const curbWidth = 1.0;
    const centerLineWidth = 0.4;
    const embankmentWidth = 14.0; // Smooth slope rolling down to ground level

    for (let i = 0; i <= numPoints; i++) {
      const u = (i % numPoints) / numPoints;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();

      // Perpendicular lateral vector on horizontal plane
      const side = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
      // True road surface normal taking hill inclination into account
      const surfaceNorm = new THREE.Vector3().crossVectors(side, tangent).normalize();

      // Road outer edges (offset along surface normal to eliminate z-fighting)
      const leftEdge = new THREE.Vector3().copy(pt).addScaledVector(side, halfWidth).addScaledVector(surfaceNorm, 0.06);
      const rightEdge = new THREE.Vector3().copy(pt).addScaledVector(side, -halfWidth).addScaledVector(surfaceNorm, 0.06);

      roadVertices.push(leftEdge.x, leftEdge.y, leftEdge.z);
      roadVertices.push(rightEdge.x, rightEdge.y, rightEdge.z);
      roadUvs.push(0, u * 50);
      roadUvs.push(1, u * 50);

      // Curbs (outer red & white stripes)
      const curbLeftOuter = new THREE.Vector3().copy(leftEdge).addScaledVector(side, curbWidth).addScaledVector(surfaceNorm, 0.02);
      const curbRightOuter = new THREE.Vector3().copy(rightEdge).addScaledVector(side, -curbWidth).addScaledVector(surfaceNorm, 0.02);

      curbLeftVertices.push(curbLeftOuter.x, curbLeftOuter.y, curbLeftOuter.z);
      curbLeftVertices.push(leftEdge.x, leftEdge.y + 0.01, leftEdge.z);

      curbRightVertices.push(rightEdge.x, rightEdge.y + 0.01, rightEdge.z);
      curbRightVertices.push(curbRightOuter.x, curbRightOuter.y, curbRightOuter.z);

      // Center dashed lines
      const cLeft = new THREE.Vector3().copy(pt).addScaledVector(side, centerLineWidth / 2).addScaledVector(surfaceNorm, 0.08);
      const cRight = new THREE.Vector3().copy(pt).addScaledVector(side, -centerLineWidth / 2).addScaledVector(surfaceNorm, 0.08);

      centerLineVertices.push(cLeft.x, cLeft.y, cLeft.z);
      centerLineVertices.push(cRight.x, cRight.y, cRight.z);

      // Grassy Embankment slopes connecting elevated hill roads seamlessly down to ground
      const embLeftOuter = new THREE.Vector3().copy(leftEdge).addScaledVector(side, embankmentWidth);
      embLeftOuter.y = Math.max(0, embLeftOuter.y * 0.15 - 0.1); // gently tapers to flat ground
      const embRightOuter = new THREE.Vector3().copy(rightEdge).addScaledVector(side, -embankmentWidth);
      embRightOuter.y = Math.max(0, embRightOuter.y * 0.15 - 0.1);

      embankmentVertices.push(embLeftOuter.x, embLeftOuter.y, embLeftOuter.z);
      embankmentVertices.push(curbLeftOuter.x, curbLeftOuter.y, curbLeftOuter.z);
      embankmentVertices.push(curbRightOuter.x, curbRightOuter.y, curbRightOuter.z);
      embankmentVertices.push(embRightOuter.x, embRightOuter.y, embRightOuter.z);

      if (i < numPoints) {
        const r1 = i * 2;
        const r2 = (i + 1) * 2;

        // Road triangles
        roadIndices.push(r1, r2, r1 + 1);
        roadIndices.push(r1 + 1, r2, r2 + 1);

        // Curbs triangles
        curbIndices.push(r1, r2, r1 + 1);
        curbIndices.push(r1 + 1, r2, r2 + 1);

        // Center line triangles (dashed effect)
        if (i % 4 < 2) {
          centerLineIndices.push(r1, r2, r1 + 1);
          centerLineIndices.push(r1 + 1, r2, r2 + 1);
        }

        // Embankment triangles (Left slope and Right slope)
        const e1 = i * 4;
        const e2 = (i + 1) * 4;
        // Left slope: [embLeftOuter -> curbLeftOuter]
        embankmentIndices.push(e1, e2, e1 + 1);
        embankmentIndices.push(e1 + 1, e2, e2 + 1);
        // Right slope: [curbRightOuter -> embRightOuter]
        embankmentIndices.push(e1 + 2, e2 + 2, e1 + 3);
        embankmentIndices.push(e1 + 3, e2 + 2, e2 + 3);
      }
    }

    // 1. Main Asphalt Surface
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x2b303a,
      roughness: 0.85,
      metalness: 0.05
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    // 2. Curbs (Red and White alternating stripes)
    const curbGeoL = new THREE.BufferGeometry();
    curbGeoL.setAttribute('position', new THREE.Float32BufferAttribute(curbLeftVertices, 3));
    curbGeoL.setIndex(curbIndices);
    curbGeoL.computeVertexNormals();

    const curbGeoR = new THREE.BufferGeometry();
    curbGeoR.setAttribute('position', new THREE.Float32BufferAttribute(curbRightVertices, 3));
    curbGeoR.setIndex(curbIndices);
    curbGeoR.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      color: 0xe84118,
      roughness: 0.7
    });
    const curbMeshL = new THREE.Mesh(curbGeoL, curbMat);
    const curbMeshR = new THREE.Mesh(curbGeoR, curbMat);
    curbMeshL.receiveShadow = true;
    curbMeshR.receiveShadow = true;
    this.scene.add(curbMeshL);
    this.scene.add(curbMeshR);

    // 3. Center Dashed Line
    const centerGeo = new THREE.BufferGeometry();
    centerGeo.setAttribute('position', new THREE.Float32BufferAttribute(centerLineVertices, 3));
    centerGeo.setIndex(centerLineIndices);
    centerGeo.computeVertexNormals();

    const centerMat = new THREE.MeshBasicMaterial({
      color: 0xf5f6fa
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    this.scene.add(centerMesh);

    // 4. Grassy Embankment (Rolling Hill Shoulders)
    const embGeo = new THREE.BufferGeometry();
    embGeo.setAttribute('position', new THREE.Float32BufferAttribute(embankmentVertices, 3));
    embGeo.setIndex(embankmentIndices);
    embGeo.computeVertexNormals();

    const embMat = new THREE.MeshStandardMaterial({
      color: 0x388e3c, // Rich hill green
      roughness: 0.9,
      metalness: 0.0
    });
    const embMesh = new THREE.Mesh(embGeo, embMat);
    embMesh.receiveShadow = true;
    this.scene.add(embMesh);

    // 5. Start / Finish Line Banner
    this.createStartBanner();
  }

  createStartBanner() {
    const startPoint = this.curve.getPointAt(0);
    const startTangent = this.curve.getTangentAt(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(startTangent, up).normalize();

    // Checkered strip across the road
    const stripGeo = new THREE.PlaneGeometry(this.roadWidth, 2.5);
    const stripMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.copy(startPoint).add(new THREE.Vector3(0, 0.12, 0));
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.atan2(startTangent.x, startTangent.z);
    this.scene.add(strip);

    // Overhead Arch Posts
    const archH = 8.0;
    const postGeo = new THREE.CylinderGeometry(0.3, 0.3, archH);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x34495e });

    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.copy(startPoint).addScaledVector(side, this.roadWidth / 2 + 1.5);
    postL.position.y = startPoint.y + archH / 2;
    this.scene.add(postL);

    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.copy(startPoint).addScaledVector(side, -(this.roadWidth / 2 + 1.5));
    postR.position.y = startPoint.y + archH / 2;
    this.scene.add(postR);

    // Crossbar
    const barGeo = new THREE.BoxGeometry(this.roadWidth + 3.5, 1.2, 0.6);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.copy(startPoint);
    bar.position.y = startPoint.y + archH;
    bar.rotation.y = Math.atan2(side.x, side.z);
    this.scene.add(bar);
  }

  createGround() {
    // Vast grass field with high-contrast vibrant green
    const groundGeo = new THREE.PlaneGeometry(700, 700, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x44bd32,
      roughness: 0.95,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  createScenery() {
    // Low-poly stylized trees and decorative roadside markers
    const treeTrunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.5, 6);
    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x795548 });

    const treeFoliageGeo = new THREE.ConeGeometry(2.2, 4.5, 6);
    const treeFoliageMat1 = new THREE.MeshStandardMaterial({ color: 0x27ae60, roughness: 0.8 });
    const treeFoliageMat2 = new THREE.MeshStandardMaterial({ color: 0x2ecc71, roughness: 0.8 });

    // Distant background mountain ridge (placed far outside course perimeter, >= 100m away)
    // Ensures ZERO overlap with the circuit road while creating majestic vistas
    const mountainGeo = new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.95 });

    const farMountains = [
      { x: 300, z: 200, r: 85, h: 32 },
      { x: -300, z: 180, r: 90, h: 35 },
      { x: -320, z: -240, r: 95, h: 38 },
      { x: 310, z: -250, r: 85, h: 34 },
      { x: 0, z: 340, r: 100, h: 36 },
      { x: 0, z: -350, r: 100, h: 35 },
      { x: 340, z: 0, r: 90, h: 32 },
      { x: -340, z: 0, r: 90, h: 32 },
    ];

    farMountains.forEach(m => {
      const mountain = new THREE.Mesh(mountainGeo, mountainMat);
      mountain.scale.set(m.r, m.h, m.r);
      mountain.position.set(m.x, -0.2, m.z);
      mountain.receiveShadow = true;
      this.scene.add(mountain);
    });

    // Roadside guide bollards along the curbs to highlight slope undulations & upcoming curves
    const postCount = 60;
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8);
    const postMatWhite = new THREE.MeshBasicMaterial({ color: 0xf5f6fa });
    const postMatRed = new THREE.MeshBasicMaterial({ color: 0xe84118 });
    const postCapGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.2, 8);

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < postCount; i++) {
      const u = i / postCount;
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Place posts on both left and right curb outer borders
      const postOffset = this.roadWidth / 2 + 1.2;

      [-postOffset, postOffset].forEach(offset => {
        const postPos = new THREE.Vector3().copy(pt).addScaledVector(side, offset);
        postPos.y = pt.y + 0.45; // elevated cleanly above road surface

        const postGroup = new THREE.Group();
        const base = new THREE.Mesh(postGeo, postMatWhite);
        postGroup.add(base);

        const cap = new THREE.Mesh(postCapGeo, postMatRed);
        cap.position.y = 0.35;
        postGroup.add(cap);

        postGroup.position.copy(postPos);
        this.scene.add(postGroup);
      });
    }

    // Place trees safely off-road beyond the embankment slope
    const count = 90;

    for (let i = 0; i < count; i++) {
      const u = (i / count);
      const pt = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Alternate left and right side beyond the embankment slope
      const isLeft = i % 2 === 0;
      const offset = (this.roadWidth / 2 + 16.0) + (Math.sin(i * 13) * 8.0);
      const treePos = new THREE.Vector3().copy(pt).addScaledVector(side, isLeft ? offset : -offset);

      // Height tapers down to flat ground depending on distance
      treePos.y = Math.max(0, pt.y * 0.15);

      const treeGroup = new THREE.Group();

      const trunk = new THREE.Mesh(treeTrunkGeo, treeTrunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      const foliage = new THREE.Mesh(treeFoliageGeo, (i % 3 === 0) ? treeFoliageMat2 : treeFoliageMat1);
      foliage.position.y = 4.2;
      foliage.castShadow = true;
      treeGroup.add(foliage);

      const scale = 0.85 + Math.abs(Math.sin(i * 7)) * 0.45;
      treeGroup.scale.set(scale, scale, scale);
      treeGroup.position.copy(treePos);

      this.scene.add(treeGroup);
    }
  }

  /**
   * Find the closest point and tangent on the course center line.
   * Uses fast discrete lookup followed by segment projection.
   */
  getClosestTrackInfo(carPosition) {
    let minSqDist = Infinity;
    let closestIndex = 0;

    // Step 1: coarse grid search over precomputed samples
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      const dx = s.point.x - carPosition.x;
      const dz = s.point.z - carPosition.z;
      const sqDist = dx * dx + dz * dz;
      if (sqDist < minSqDist) {
        minSqDist = sqDist;
        closestIndex = i;
      }
    }

    // Step 2: refine within neighbor segment
    const prevIndex = (closestIndex - 1 + this.samples.length) % this.samples.length;
    const nextIndex = (closestIndex + 1) % this.samples.length;

    const p0 = this.samples[prevIndex].point;
    const p1 = this.samples[closestIndex].point;
    const p2 = this.samples[nextIndex].point;

    // Project onto segments [p0, p1] and [p1, p2]
    const proj1 = this.projectOnSegment(carPosition, p0, p1);
    const proj2 = this.projectOnSegment(carPosition, p1, p2);

    const d1 = carPosition.distanceTo(proj1.point);
    const d2 = carPosition.distanceTo(proj2.point);

    let bestPoint = proj1.point;
    let bestU = (this.samples[prevIndex].u + proj1.t * (this.samples[closestIndex].u - this.samples[prevIndex].u + (this.samples[closestIndex].u < this.samples[prevIndex].u ? 1 : 0))) % 1.0;
    let distance = d1;

    if (d2 < d1) {
      bestPoint = proj2.point;
      bestU = (this.samples[closestIndex].u + proj2.t * (this.samples[nextIndex].u - this.samples[closestIndex].u + (this.samples[nextIndex].u < this.samples[closestIndex].u ? 1 : 0))) % 1.0;
      distance = d2;
    }

    const tangent = this.curve.getTangentAt(bestU).normalize();
    const isOffroad = distance > (this.roadWidth / 2);

    return {
      point: bestPoint,
      tangent: tangent,
      distance: distance,
      isOffroad: isOffroad,
      u: bestU
    };
  }

  getStartTransform() {
    const pt = this.curve.getPointAt(0);
    const tangent = this.curve.getTangentAt(0).normalize();
    const heading = Math.atan2(tangent.x, tangent.z);
    return {
      position: new THREE.Vector3(pt.x, pt.y + 0.45, pt.z),
      heading: heading
    };
  }

  projectOnSegment(p, a, b) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const abLenSq = ab.lengthSq();
    if (abLenSq < 1e-6) return { point: a.clone(), t: 0 };

    let t = ap.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));
    const point = new THREE.Vector3().copy(a).addScaledVector(ab, t);
    return { point, t };
  }
}
