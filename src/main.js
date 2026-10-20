/**
 * main.js - Application Entry Point, Render Loop & Systems Coordination
 */
import * as THREE from 'three';
import { SettingsManager } from './settings.js';
import { InputHandler } from './input.js';
import { Track } from './track.js';
import { Vehicle } from './vehicle.js';
import { CourseAssist } from './assist.js';
import { ItemManager } from './items.js';
import { AudioManager } from './audio.js';
import { FullscreenManager } from './fullscreen.js';

class SimulatorApp {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.speedDisplay = document.getElementById('speed-display');
    this.gearDisplay = document.getElementById('gear-display');
    this.starCountDisplay = document.getElementById('star-count');
    this.offroadBanner = document.getElementById('offroad-banner');
    this.startPrompt = document.getElementById('start-prompt');
    this.btnStart = document.getElementById('btn-start');
    this.hornToast = document.getElementById('horn-toast');
    this.hornTimer = null;

    // 1. Core Systems Initialization
    this.settings = new SettingsManager((key, val) => this.onSettingChanged(key, val));
    this.audio = new AudioManager(this.settings);
    this.fullscreen = new FullscreenManager();
    this.input = new InputHandler(this.settings, () => this.triggerHorn());

    // 2. Three.js Scene Setup
    this.setupScene();

    // 3. World Entities
    this.track = new Track(this.scene);
    this.vehicle = new Vehicle(this.scene, this.settings);
    const spawn = this.track.getStartTransform();
    this.vehicle.setSpawn(spawn.position, spawn.heading);

    this.assist = new CourseAssist(this.track, this.vehicle, this.settings);

    this.items = new ItemManager(this.scene, this.track, this.audio, (score) => {
      if (this.starCountDisplay) this.starCountDisplay.textContent = score;
    });

    // Follower Camera State
    this.cameraPos = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.initFollowerCamera();

    // Loop & Timing
    this.clock = new THREE.Clock();
    this.isGameRunning = false;

    this.setupEvents();
    this.animate();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x82ccdd); // Friendly bright sky blue
    this.scene.fog = new THREE.Fog(0x82ccdd, 120, 320);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.5, 500);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // Lighting
    const ambientLight = new THREE.HemisphereLight(0xffffff, 0x44bd32, 0.7);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(60, 100, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 250;
    const shadowD = 80;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    this.scene.add(sunLight);
  }

  initFollowerCamera() {
    const carPos = this.vehicle.position;
    const forward = this.vehicle.getForwardVector();
    this.cameraPos.copy(carPos).addScaledVector(forward, -10).add(new THREE.Vector3(0, 5, 0));
    this.cameraTarget.copy(carPos).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.position.copy(this.cameraPos);
    this.camera.lookAt(this.cameraTarget);
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    const startGame = () => {
      this.audio.unlock();
      if (!this.isGameRunning) {
        this.isGameRunning = true;
        if (this.startPrompt) {
          this.startPrompt.classList.add('dismissed');
        }
        // Delay fullscreen request slightly so it does not interrupt Web Audio unlock on Safari/WebKit
        setTimeout(() => {
          this.fullscreen.requestFullscreen();
        }, 60);
      }
    };

    if (this.btnStart) {
      this.btnStart.addEventListener('click', startGame);
      this.btnStart.addEventListener('pointerup', startGame);
    }

    if (this.startPrompt) {
      this.startPrompt.addEventListener('click', startGame);
      this.startPrompt.addEventListener('pointerup', startGame);
    }

    window.addEventListener('keydown', () => {
      if (!this.isGameRunning) {
        startGame();
      }
    });
  }

  onSettingChanged(key, val) {
    if (key === 'soundEnabled') {
      this.audio.setSoundEnabled(val);
    }
    this.input.onSettingsChange();
  }

  triggerHorn() {
    this.audio.playHorn();
    if (this.hornToast) {
      this.hornToast.classList.remove('hidden');
      clearTimeout(this.hornTimer);
      this.hornTimer = setTimeout(() => {
        if (this.hornToast) this.hornToast.classList.add('hidden');
      }, 700);
    }
  }

  updateFollowerCamera(dt) {
    const carPos = this.vehicle.position;
    const forward = this.vehicle.getForwardVector();

    // Target camera position: elevated and behind vehicle along orientation
    const desiredPos = new THREE.Vector3()
      .copy(carPos)
      .addScaledVector(forward, -9.5)
      .add(new THREE.Vector3(0, 4.4, 0));

    // Smooth camera damping (motion sickness prevention)
    const posLerpFactor = Math.min(1.0, 5.5 * dt);
    this.cameraPos.lerp(desiredPos, posLerpFactor);
    this.camera.position.copy(this.cameraPos);

    // Target look point: slightly ahead of the car
    const desiredTarget = new THREE.Vector3()
      .copy(carPos)
      .addScaledVector(forward, 2.5)
      .add(new THREE.Vector3(0, 1.2, 0));

    const targetLerpFactor = Math.min(1.0, 7.5 * dt);
    this.cameraTarget.lerp(desiredTarget, targetLerpFactor);
    this.camera.lookAt(this.cameraTarget);
  }

  updateHUD() {
    // Speed display in km/h (conversion factor for game scale)
    const speedKmh = Math.round(Math.abs(this.vehicle.speed) * 3.6);
    if (this.speedDisplay) {
      this.speedDisplay.textContent = speedKmh;
    }

    // Gear indicator
    if (this.gearDisplay) {
      this.gearDisplay.textContent = this.vehicle.gear;
      this.gearDisplay.className = `gear-badge gear-${this.vehicle.gear}`;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.08); // Cap dt to avoid large physics steps on tab switch

    // 0. Update Input (auto-center spring when joystick released to neutral)
    this.input.update(dt);

    const steer = this.input.steer;
    const throttle = this.input.throttle;

    if (!this.isGameRunning && (Math.abs(steer) > 0.01 || Math.abs(throttle) > 0.01)) {
      this.isGameRunning = true;
      this.audio.resume();
      if (this.startPrompt) {
        this.startPrompt.classList.add('dismissed');
      }
    }

    // 1. Anti-Peeky Track Assist (Pre-evaluation & Soft Forces)
    const assistResult = this.assist.update(dt, steer);
    const isOffroad = assistResult.isOffroad;

    // 2. Vehicle Dynamics Update
    this.vehicle.updatePhysics(dt, steer, throttle, isOffroad, assistResult.trackInfo);

    // 3. Collectibles Update
    this.items.update(dt, this.vehicle.position);

    // 4. Off-road Banner Indicator
    if (this.offroadBanner) {
      if (isOffroad && this.settings.get('assistLevel') !== 'off') {
        this.offroadBanner.classList.remove('hidden');
      } else {
        this.offroadBanner.classList.add('hidden');
      }
    }

    // 5. Follower Camera
    this.updateFollowerCamera(dt);

    // 6. HUD update
    this.updateHUD();

    // 7. Audio synthesis
    const maxSpeed = this.settings.get('speedLimit');
    this.audio.updateEngine(this.vehicle.speed, maxSpeed, throttle);

    // 8. Render
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate simulator once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  new SimulatorApp();
});
