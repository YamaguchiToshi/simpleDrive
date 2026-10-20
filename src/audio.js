/**
 * audio.js - Web Audio API Procedural Audio Engine
 *
 * Fully self-contained procedural synthesis:
 * - Dual-oscillator engine hum (Sawtooth + Triangle) dynamically mapped to vehicle velocity
 * - Sparkling chime pickup tone for star collection
 * - Robust cross-browser / iPadOS Safari AudioContext unlock & auto-recovery
 */

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.isInitialized = false;
    this.isUnlocked = false;
    this.lastResumeAttempt = 0;

    // Engine Audio Nodes
    this.masterGain = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.oscSaw = null;
    this.oscTri = null;

    // Smoothed audio params
    this.currentPitch = 50;

    this.setupUnlockListeners();
  }

  /**
   * Keep lightweight listeners on user-activation events so that:
   * 1. Initial touch/click/key reliably unlocks Web Audio (including iOS/iPadOS Safari silent buffer).
   * 2. If the OS suspends/interrupts AudioContext (tab switch, fullscreen transition, screen lock),
   *    the next user interaction seamlessly restores audio output.
   */
  setupUnlockListeners() {
    const handleUserGesture = () => {
      this.unlock();
    };

    const gestureEvents = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    gestureEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserGesture, { passive: true, capture: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isInitialized) {
        this.resume();
      }
    });

    window.addEventListener('focus', () => {
      if (this.isInitialized) {
        this.resume();
      }
    });
  }

  init() {
    if (this.isInitialized && this.ctx && this.ctx.state !== 'closed') return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();

      // Monitor state changes to re-apply gain if needed
      this.ctx.addEventListener('statechange', () => {
        if (this.ctx && this.ctx.state === 'running') {
          this.isUnlocked = true;
          this.syncMasterGain();
        }
      });

      // Master Gain
      this.masterGain = this.ctx.createGain();
      const initialVol = this.settings.get('soundEnabled') ? 0.35 : 0.0;
      this.masterGain.gain.setValueAtTime(initialVol, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Setup Procedural Engine Sound
      this.setupEngineSound();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio API initialization failed:', e);
    }
  }

  /**
   * Unlock AudioContext inside a valid user gesture handler.
   * Plays a 1-frame silent buffer to wake up hardware output on iOS/iPadOS WebKit.
   */
  unlock() {
    if (!this.isInitialized) {
      this.init();
    }
    if (!this.ctx) return;

    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      try {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch (e) {
        // Ignore synchronous resume errors
      }
    }

    if (!this.isUnlocked && this.ctx.state !== 'closed') {
      try {
        // Play a 1-sample silent buffer to unlock iOS/iPadOS Safari audio routing
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
        source.onended = () => {
          source.disconnect();
        };
        if (this.ctx.state === 'running') {
          this.isUnlocked = true;
        }
      } catch (e) {
        // Ignore silent buffer errors
      }
    }
  }

  resume() {
    if (!this.isInitialized) {
      this.init();
    }
    if (!this.ctx || this.ctx.state === 'closed') return Promise.resolve();

    // Handle both 'suspended' and iOS Safari 'interrupted' states
    if (this.ctx.state !== 'running') {
      const now = performance.now();
      if (now - this.lastResumeAttempt > 250) {
        this.lastResumeAttempt = now;
        try {
          const p = this.ctx.resume();
          if (p && typeof p.then === 'function') {
            return p.catch(() => {});
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    return Promise.resolve();
  }

  syncMasterGain() {
    if (!this.masterGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = this.settings.get('soundEnabled') ? 0.35 : 0.0;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setTargetAtTime(target, t, 0.04);
  }

  setupEngineSound() {
    const t = this.ctx.currentTime;

    // Lowpass filter for smooth, warm hum
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(320, t);
    this.engineFilter.Q.setValueAtTime(2.0, t);

    // Engine gain node
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.08, t);

    // Sawtooth oscillator (adds harmonic rumble)
    this.oscSaw = this.ctx.createOscillator();
    this.oscSaw.type = 'sawtooth';
    this.oscSaw.frequency.setValueAtTime(50, t);

    // Triangle oscillator (fundamental warm body)
    this.oscTri = this.ctx.createOscillator();
    this.oscTri.type = 'triangle';
    this.oscTri.frequency.setValueAtTime(50, t);

    // Gains for blending
    const gainSaw = this.ctx.createGain();
    gainSaw.gain.setValueAtTime(0.35, t);
    const gainTri = this.ctx.createGain();
    gainTri.gain.setValueAtTime(0.65, t);

    this.oscSaw.connect(gainSaw);
    this.oscTri.connect(gainTri);

    gainSaw.connect(this.engineFilter);
    gainTri.connect(this.engineFilter);

    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.oscSaw.start(t);
    this.oscTri.start(t);
  }

  updateEngine(speed, maxSpeed, throttle) {
    if (!this.settings.get('soundEnabled')) return;

    if (!this.isInitialized) {
      if (Math.abs(speed) > 0.1 || Math.abs(throttle) > 0.01) {
        this.init();
      } else {
        return;
      }
    }

    if (!this.ctx) return;

    // Avoid piling up automation events when context is not running
    if (this.ctx.state !== 'running') {
      if (Math.abs(speed) > 0.1 || Math.abs(throttle) > 0.01) {
        this.resume();
      }
      return;
    }

    const t = this.ctx.currentTime;
    const absSpeed = Math.abs(speed);
    const speedRatio = Math.min(1.0, absSpeed / Math.max(1, maxSpeed));

    // Base pitch from idling 50Hz to 160Hz top speed, with throttle load kick
    const throttleBoost = Math.max(0, throttle) * 18;
    const targetPitch = 50 + (speedRatio * 110) + throttleBoost;

    // Smooth lerp to prevent harsh acoustic jumps
    this.currentPitch += (targetPitch - this.currentPitch) * 0.12;

    this.oscSaw.frequency.setTargetAtTime(this.currentPitch, t, 0.05);
    this.oscTri.frequency.setTargetAtTime(this.currentPitch * 0.5, t, 0.05); // sub-octave rumble

    // Filter cut-off opens up with speed
    const cutoff = 280 + (speedRatio * 520) + (throttleBoost * 8);
    this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.06);

    // Gain modulates slightly with throttle
    const targetVol = 0.07 + (speedRatio * 0.08) + (Math.abs(throttle) * 0.04);
    this.engineGain.gain.setTargetAtTime(targetVol, t, 0.06);
  }

  playStarPickupChime() {
    if (!this.settings.get('soundEnabled')) return;
    if (!this.isInitialized) this.init();
    if (!this.ctx) return;

    const triggerChime = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;

      // Sparkling 3-note ascending harmonic chime (C6, E6, G6)
      const notes = [1046.5, 1318.5, 1567.98];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startT = t + idx * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startT);

        // Fast attack and musical exponential decay
        gain.gain.setValueAtTime(0.001, startT);
        gain.gain.linearRampToValueAtTime(0.25, startT + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startT + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };

        osc.start(startT);
        osc.stop(startT + 0.52);
      });
    };

    if (this.ctx.state === 'running') {
      triggerChime();
    } else {
      this.resume().then(triggerChime);
    }
  }

  playHorn() {
    if (!this.settings.get('soundEnabled')) return;
    if (!this.isInitialized) this.init();
    if (!this.ctx) return;

    const triggerHorn = () => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;

      // Friendly dual-tone horn (F4 349.2Hz + A4 440Hz)
      const freqs = [349.23, 440.0];
      freqs.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        // Fast punch and decay
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.20, t + 0.02);
        gain.gain.setValueAtTime(0.20, t + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };

        osc.start(t);
        osc.stop(t + 0.34);
      });
    };

    if (this.ctx.state === 'running') {
      triggerHorn();
    } else {
      this.resume().then(triggerHorn);
    }
  }

  setSoundEnabled(enabled) {
    if (enabled && !this.isInitialized) {
      this.init();
    }
    if (enabled) {
      this.unlock();
    }
    this.syncMasterGain();
  }
}
