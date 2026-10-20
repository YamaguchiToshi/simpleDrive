/**
 * input.js - Smart Multi-Input Controller & Visual HUD
 * Optimized for Gamepad L-stick (axes 0 & 1) without strict gp.connected filtering (Gamepad Tester parity),
 * with fallbacks for Optima Mouse Mode, Screen Touch, and Keyboard.
 */

export class InputHandler {
  constructor(settingsManager, onHornCallback = null) {
    this.settings = settingsManager;
    this.onHornCallback = onHornCallback;

    // Filtered / Deadzone applied controls [-1, 1]
    this.steer = 0;
    this.throttle = 0;

    // Raw normalized values [-1, 1]
    this.normX = 0;
    this.normY = 0;

    // Active input source for arbitration & diagnostics
    this.activeSource = 'neutral';
    this.lastInputTime = 0;

    // --- 1. L-Stick (Gamepad API) State ---
    this.lastGamepadConnected = false;
    this.prevButtonPressed = false;
    this.detectedGamepadName = '';

    // --- 2. Touch Input State ---
    this.touchOriginX = window.innerWidth / 2;
    this.touchOriginY = window.innerHeight / 2;
    this.isTouchActive = false;

    // --- 3. Mouse / Delta Input State (Optima Mouse Mode) ---
    this.prevMouseX = window.innerWidth / 2;
    this.prevMouseY = window.innerHeight / 2;
    this.mouseTargetX = 0;
    this.mouseTargetY = 0;
    this.deltaGain = 0.085;
    this.lastMouseMoveTime = 0;

    // --- 4. Keyboard Fallback State ---
    this.keysPressed = {};

    // Auto-neutral return timeout (ms)
    const initialNr = this.settings.get('neutralReturn');
    this.autoReturnToNeutral = (initialNr !== 'off');
    this.neutralTimeout = Number(initialNr) || 180;

    // HUD SVG Elements
    this.hudDeadzoneCircle = document.getElementById('hud-deadzone-circle');
    this.hudDeadzoneOuter = document.getElementById('hud-deadzone-outer');
    this.hudCrosshairX = document.getElementById('hud-crosshair-x');
    this.hudCrosshairY = document.getElementById('hud-crosshair-y');
    this.hudLabelUp = document.getElementById('hud-label-up');
    this.hudLabelDown = document.getElementById('hud-label-down');
    this.hudLabelLeft = document.getElementById('hud-label-left');
    this.hudLabelRight = document.getElementById('hud-label-right');
    this.hudVectorLine = document.getElementById('hud-vector-line');
    this.hudPointerDot = document.getElementById('hud-pointer-dot');
    this.hudCenterDot = document.getElementById('hud-center-dot');

    // Diagnostic Monitor Bar Elements
    this.monitorSource = document.getElementById('monitor-source');
    this.monitorValues = document.getElementById('monitor-values');
    this.monitorSubtext = document.getElementById('monitor-subtext');

    this.setupEvents();
    this.updateHUDLayout();
  }

  get controlRadius() {
    if (this.isTouchActive) {
      return Math.min(140, Math.min(window.innerWidth, window.innerHeight) * 0.28);
    }
    return Math.min(window.innerWidth, window.innerHeight) * 0.38;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      this.touchOriginX = cx;
      this.touchOriginY = cy;
      this.updateHUDLayout(cx, cy);
    });

    // Gamepad API Events
    window.addEventListener('gamepadconnected', (e) => {
      console.log('gamepadconnected event:', e.gamepad.id, 'axes:', e.gamepad.axes?.length);
      this.detectedGamepadName = e.gamepad.id;
      this.settings.setControllerStatus(true, e.gamepad.id);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log('gamepaddisconnected event:', e.gamepad.id);
      this.detectedGamepadName = '';
      this.settings.setControllerStatus(false);
      this.resetToNeutral();
    });

    // Pointer & Mouse Events
    const handlePointerMove = (e) => {
      if (this.isTouchActive && (e.pointerType === 'touch' || e.touches)) {
        const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
        const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
        if (clientX !== undefined && clientY !== undefined) {
          const radius = this.controlRadius;
          const dx = clientX - this.touchOriginX;
          const dy = clientY - this.touchOriginY;
          const rawX = dx / radius;
          const rawY = -dy / radius;
          const dist = Math.hypot(rawX, rawY);
          if (dist > 1.0) {
            this.normX = rawX / dist;
            this.normY = rawY / dist;
          } else {
            this.normX = rawX;
            this.normY = rawY;
          }
          this.activeSource = 'touch';
          this.lastInputTime = performance.now();
          this.processDeadzone();
          this.updateHUDVisuals(this.touchOriginX, this.touchOriginY);
        }
        return;
      }

      // Mouse Delta movement (Optima Mouse Mode)
      let dx = 0;
      let dy = 0;
      if (e.movementX !== undefined && (e.movementX !== 0 || e.movementY !== 0)) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (this.prevMouseX !== undefined) {
        dx = e.clientX - this.prevMouseX;
        dy = e.clientY - this.prevMouseY;
      }

      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      if (dx !== 0 || dy !== 0) {
        this.lastMouseMoveTime = performance.now();
        const steerSens = this.settings.get('steerSens');
        this.mouseTargetX = Math.max(-1, Math.min(1, dx * this.deltaGain * steerSens));
        this.mouseTargetY = Math.max(-1, Math.min(1, -dy * this.deltaGain));
        this.activeSource = 'mouse';
        this.lastInputTime = this.lastMouseMoveTime;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('mousemove', handlePointerMove, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      // User interaction triggers browser gamepad permissions
      this.getRawGamepads();

      // Ignore clicks on UI controls
      if (e.target && e.target.closest && (
        e.target.closest('#ui-top-bar') ||
        e.target.closest('#settings-drawer') ||
        e.target.closest('#settings-backdrop') ||
        e.target.closest('#start-prompt')
      )) {
        return;
      }

      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      if (e.pointerType === 'touch') {
        this.isTouchActive = true;
        this.touchOriginX = e.clientX;
        this.touchOriginY = e.clientY;
        this.normX = 0;
        this.normY = 0;
        this.activeSource = 'touch';
        this.processDeadzone();
        this.updateHUDLayout(this.touchOriginX, this.touchOriginY);
        this.updateHUDVisuals(this.touchOriginX, this.touchOriginY);
      }
    });

    const handlePointerEnd = (e) => {
      if (e && e.pointerType === 'touch') {
        this.isTouchActive = false;
        this.resetToNeutral();
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        this.updateHUDLayout(cx, cy);
      }
    };

    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    // Keyboard Fallback Events
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;
      if (e.code === 'Space' || e.code === 'KeyH') {
        if (this.onHornCallback) this.onHornCallback();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.isTouchActive = false;
      this.keysPressed = {};
      this.resetToNeutral();
    });
  }

  /**
   * Safely obtain all gamepad objects from the browser navigator.
   * Matches Gamepad Tester implementation without strict filtering.
   */
  getRawGamepads() {
    try {
      const getFn = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads;
      if (typeof getFn === 'function') {
        const list = getFn.call(navigator);
        if (list) {
          // Filter only null / undefined slots, preserve all real objects
          return Array.from(list).filter(gp => gp !== null && gp !== undefined);
        }
      }
    } catch (e) {
      console.warn('Error calling navigator.getGamepads():', e);
    }
    return [];
  }

  /**
   * Read L-Stick (axes[0], axes[1]) across all detected gamepads.
   */
  readAllGamepadInputs() {
    const gamepads = this.getRawGamepads();
    if (gamepads.length === 0) {
      return {
        hasGamepad: false,
        hasInput: false,
        lx: 0,
        ly: 0,
        buttonsPressed: false,
        gpName: '',
        allAxes: [],
        debugInfo: 'navigator.getGamepads() returned 0 items'
      };
    }

    let bestLx = 0;
    let bestLy = 0;
    let maxDeflection = 0;
    let anyButtonPressed = false;
    let bestB0 = false;
    let bestB1 = false;
    let primaryGamepadName = '';
    let debugAxesSnapshot = [];

    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp) continue;

      const name = gp.id || `Controller ${i}`;
      if (!primaryGamepadName) {
        primaryGamepadName = name;
      }

      const axes = gp.axes ? Array.from(gp.axes) : [];
      const buttons = gp.buttons ? Array.from(gp.buttons) : [];

      if (debugAxesSnapshot.length === 0 && axes.length > 0) {
        debugAxesSnapshot = axes.map(v => Number(v.toFixed(2)));
      }

      // --- 1. L-STICK (Primary Left Stick: axes[0] = X, axes[1] = Y) ---
      let lx = 0;
      let ly = 0;

      if (axes.length >= 2) {
        lx = axes[0] || 0;
        // Push forward is -1.0 in W3C spec; invert so forward is +1.0:
        ly = -(axes[1] || 0);
      }

      // --- 2. Secondary Stick fallback (axes[2], axes[3]) if L-stick is idle ---
      if (Math.hypot(lx, ly) < 0.05 && axes.length >= 4) {
        const altX = axes[2] || 0;
        const altY = -(axes[3] || 0);
        if (Math.hypot(altX, altY) >= 0.05) {
          lx = altX;
          ly = altY;
        }
      }

      // --- 3. D-Pad fallback ---
      if (Math.hypot(lx, ly) < 0.05 && buttons.length >= 16) {
        let dx = 0;
        let dy = 0;
        if (buttons[14]?.pressed) dx -= 1; // Left
        if (buttons[15]?.pressed) dx += 1; // Right
        if (buttons[12]?.pressed) dy += 1; // Up
        if (buttons[13]?.pressed) dy -= 1; // Down
        if (dx !== 0 || dy !== 0) {
          const d = Math.hypot(dx, dy);
          lx = dx / d;
          ly = dy / d;
        }
      }

      const deflection = Math.hypot(lx, ly);
      if (deflection > maxDeflection) {
        maxDeflection = deflection;
        bestLx = lx;
        bestLy = ly;
        primaryGamepadName = name;
      }

      // Check action buttons for Horn and diagnostics
      let isB0 = !!buttons[0]?.pressed;
      let isB1 = !!buttons[1]?.pressed;
      if (buttons.length > 0) {
        for (let b = 0; b < Math.min(6, buttons.length); b++) {
          if (buttons[b]?.pressed) {
            anyButtonPressed = true;
            break;
          }
        }
      }

      if (isB0) bestB0 = true;
      if (isB1) bestB1 = true;
    }

    const hasInput = maxDeflection > 0.04;
    return {
      hasGamepad: gamepads.length > 0,
      hasInput,
      lx: bestLx,
      ly: bestLy,
      buttonsPressed: anyButtonPressed,
      isB0: bestB0,
      isB1: bestB1,
      gpName: primaryGamepadName,
      allAxes: debugAxesSnapshot,
      debugInfo: `${gamepads.length} devices detected`
    };
  }

  readKeyboardValues() {
    let kx = 0;
    let ky = 0;
    if (this.keysPressed['ArrowLeft'] || this.keysPressed['KeyA']) kx -= 1;
    if (this.keysPressed['ArrowRight'] || this.keysPressed['KeyD']) kx += 1;
    if (this.keysPressed['ArrowUp'] || this.keysPressed['KeyW']) ky += 1;
    if (this.keysPressed['ArrowDown'] || this.keysPressed['KeyS']) ky -= 1;
    return { x: kx, y: ky, hasInput: (kx !== 0 || ky !== 0) };
  }

  update(dt) {
    const now = performance.now();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;

    // 1. Read Gamepad inputs (L-Stick)
    const gpResult = this.readAllGamepadInputs();

    // Update connection status
    if (gpResult.hasGamepad !== this.lastGamepadConnected) {
      this.lastGamepadConnected = gpResult.hasGamepad;
      this.detectedGamepadName = gpResult.gpName;
      this.settings.setControllerStatus(gpResult.hasGamepad, gpResult.gpName);
    }

    // Horn trigger on controller buttons
    if (gpResult.buttonsPressed && !this.prevButtonPressed) {
      if (this.onHornCallback) this.onHornCallback();
    }
    this.prevButtonPressed = gpResult.buttonsPressed;

    // 2. Read Keyboard
    const kbData = this.readKeyboardValues();

    // 3. PRIORITY 1: L-Stick Deflection from Game Controller
    // Use short grace period (90ms) so transient browser polling drops in diagonal-backward do not abruptly snap to neutral
    if (gpResult.hasInput) {
      this.lastLStickTime = now;
      this.lastLStickX = gpResult.lx;
      this.lastLStickY = gpResult.ly;
    }

    const isLStickActive = gpResult.hasInput || (now - (this.lastLStickTime || 0) < 90 && Math.hypot(this.lastLStickX || 0, this.lastLStickY || 0) > 0.04);

    if (isLStickActive) {
      this.activeSource = 'gamepad';
      this.lastInputTime = now;

      const lx = gpResult.hasInput ? gpResult.lx : (this.lastLStickX || 0);
      const ly = gpResult.hasInput ? gpResult.ly : (this.lastLStickY || 0);

      // Normalize L-stick vector
      const dist = Math.hypot(lx, ly);
      if (dist > 1.0) {
        this.normX = lx / dist;
        this.normY = ly / dist;
      } else {
        this.normX = lx;
        this.normY = ly;
      }

      this.processDeadzone();
      this.updateHUDVisuals(cx, cy);

    } else if (this.isTouchActive) {
      // --- PRIORITY 2: Touch Screen Drag ---
      this.activeSource = 'touch';
      this.processDeadzone();
      this.updateHUDVisuals(this.touchOriginX, this.touchOriginY);

    } else if (now - this.lastMouseMoveTime < this.neutralTimeout && (this.mouseTargetX !== 0 || this.mouseTargetY !== 0)) {
      // --- PRIORITY 3: Mouse Delta Movement (Optima Mouse Mode) ---
      this.activeSource = 'mouse';
      const lerpSpeed = Math.min(1.0, 16.0 * dt);
      this.normX += (this.mouseTargetX - this.normX) * lerpSpeed;
      this.normY += (this.mouseTargetY - this.normY) * lerpSpeed;

      this.processDeadzone();
      this.updateHUDVisuals(cx, cy);

    } else if (kbData.hasInput) {
      // --- PRIORITY 4: Keyboard ---
      this.activeSource = 'keyboard';
      this.normX = kbData.x;
      this.normY = kbData.y;
      this.processDeadzone();
      this.updateHUDVisuals(cx, cy);

    } else {
      // --- NEUTRAL / STOPPED ---
      this.lastLStickX = 0;
      this.lastLStickY = 0;
      if (Math.hypot(this.normX, this.normY) > 0.001) {
        const decay = Math.exp(-24.0 * dt);
        this.normX *= decay;
        this.normY *= decay;
        if (Math.hypot(this.normX, this.normY) < 0.02) {
          this.normX = 0;
          this.normY = 0;
        }
      }
      this.mouseTargetX = 0;
      this.mouseTargetY = 0;
      this.activeSource = 'neutral';

      this.processDeadzone();
      this.updateHUDVisuals(cx, cy);
    }

    // 4. Update Diagnostics Monitor Bar
    if (this.monitorSource && this.monitorValues) {
      if (gpResult.hasGamepad) {
        const idShort = (gpResult.gpName || 'Gamepad').slice(0, 24);
        const axesStr = gpResult.allAxes.length ? `[${gpResult.allAxes.join(',')}]` : '';

        let btnStr = '';
        if (gpResult.isB0 && gpResult.isB1) btnStr = '🔴B0+🔵B1 ';
        else if (gpResult.isB0) btnStr = '🔴B0(赤) ';
        else if (gpResult.isB1) btnStr = '🔵B1(青) ';

        if (isLStickActive) {
          this.monitorSource.textContent = '🎮 L-Stick 操作中';
        } else {
          this.monitorSource.textContent = '🎮 コントローラー接続中';
        }
        this.monitorValues.textContent = `${btnStr}L-Stick(X:${this.normX.toFixed(2)}, Y:${this.normY.toFixed(2)}) -> 操舵:${this.steer.toFixed(2)} 出力:${this.throttle.toFixed(2)}`;
        if (this.monitorSubtext) {
          this.monitorSubtext.textContent = `${idShort} 軸:${axesStr}`;
        }
      } else {
        let label = '⏹️ 中立 (停止中)';
        if (this.activeSource === 'mouse') label = '🕹️ マウス/Delta';
        if (this.activeSource === 'touch') label = '👆 画面タップ';
        if (this.activeSource === 'keyboard') label = '⌨️ キーボード';

        this.monitorSource.textContent = label;
        this.monitorValues.textContent = `X:${this.normX.toFixed(2)} Y:${this.normY.toFixed(2)} -> 操舵:${this.steer.toFixed(2)} 出力:${this.throttle.toFixed(2)}`;
        if (this.monitorSubtext) {
          this.monitorSubtext.textContent = 'コントローラー未検出 (画面クリックまたはレバーを動かしてください)';
        }
      }
    }
  }

  resetToNeutral() {
    this.normX = 0;
    this.normY = 0;
    this.mouseTargetX = 0;
    this.mouseTargetY = 0;
    this.steer = 0;
    this.throttle = 0;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.updateHUDVisuals(cx, cy);
  }

  processDeadzone() {
    const deadzoneRadius = this.settings.get('deadzoneRadius');
    const steerSens = this.settings.get('steerSens');
    const dist = Math.hypot(this.normX, this.normY);

    if (dist > deadzoneRadius) {
      const factor = (dist - deadzoneRadius) / (1.0 - deadzoneRadius);
      const rawSteer = (this.normX / dist) * factor;
      const rawThrottle = (this.normY / dist) * factor;

      this.steer = Math.max(-1, Math.min(1, rawSteer * steerSens));
      this.throttle = Math.max(-1, Math.min(1, rawThrottle));
    } else {
      this.steer = 0;
      this.throttle = 0;
    }
  }

  updateHUDLayout(originX = window.innerWidth / 2, originY = window.innerHeight / 2) {
    const cx = originX;
    const cy = originY;
    const radius = this.controlRadius;
    const deadzoneRadius = this.settings.get('deadzoneRadius');

    if (this.hudDeadzoneCircle) {
      this.hudDeadzoneCircle.setAttribute('cx', cx);
      this.hudDeadzoneCircle.setAttribute('cy', cy);
      this.hudDeadzoneCircle.setAttribute('r', radius * deadzoneRadius);
    }

    if (this.hudDeadzoneOuter) {
      this.hudDeadzoneOuter.setAttribute('cx', cx);
      this.hudDeadzoneOuter.setAttribute('cy', cy);
      this.hudDeadzoneOuter.setAttribute('r', radius);
    }

    if (this.hudCenterDot) {
      this.hudCenterDot.setAttribute('cx', cx);
      this.hudCenterDot.setAttribute('cy', cy);
    }

    if (this.hudCrosshairX) {
      this.hudCrosshairX.setAttribute('x1', cx - radius * 1.25);
      this.hudCrosshairX.setAttribute('y1', cy);
      this.hudCrosshairX.setAttribute('x2', cx + radius * 1.25);
      this.hudCrosshairX.setAttribute('y2', cy);
    }

    if (this.hudCrosshairY) {
      this.hudCrosshairY.setAttribute('x1', cx);
      this.hudCrosshairY.setAttribute('y1', cy - radius * 1.25);
      this.hudCrosshairY.setAttribute('x2', cx);
      this.hudCrosshairY.setAttribute('y2', cy + radius * 1.25);
    }

    if (this.hudLabelUp) {
      this.hudLabelUp.setAttribute('x', cx);
      this.hudLabelUp.setAttribute('y', cy - radius - 14);
    }
    if (this.hudLabelDown) {
      this.hudLabelDown.setAttribute('x', cx);
      this.hudLabelDown.setAttribute('y', cy + radius + 24);
    }
    if (this.hudLabelLeft) {
      this.hudLabelLeft.setAttribute('x', cx - radius - 16);
      this.hudLabelLeft.setAttribute('y', cy + 4);
    }
    if (this.hudLabelRight) {
      this.hudLabelRight.setAttribute('x', cx + radius + 16);
      this.hudLabelRight.setAttribute('y', cy + 4);
    }

    this.updateHUDVisuals(cx, cy);
  }

  updateHUDVisuals(originX = window.innerWidth / 2, originY = window.innerHeight / 2) {
    const cx = originX;
    const cy = originY;
    const radius = this.controlRadius;
    const deadzoneRadius = this.settings.get('deadzoneRadius');

    const px = cx + this.normX * radius;
    const py = cy - this.normY * radius;

    if (this.hudVectorLine) {
      this.hudVectorLine.setAttribute('x1', cx);
      this.hudVectorLine.setAttribute('y1', cy);
      this.hudVectorLine.setAttribute('x2', px);
      this.hudVectorLine.setAttribute('y2', py);
    }

    if (this.hudPointerDot) {
      this.hudPointerDot.setAttribute('cx', px);
      this.hudPointerDot.setAttribute('cy', py);
    }

    const dist = Math.hypot(this.normX, this.normY);
    const inDeadzone = dist <= deadzoneRadius;

    if (this.hudVectorLine) {
      this.hudVectorLine.classList.toggle('in-deadzone', inDeadzone);
    }
    if (this.hudPointerDot) {
      this.hudPointerDot.classList.toggle('in-deadzone', inDeadzone);
    }

    const activeThreshold = Math.max(deadzoneRadius, 0.18);
    if (this.hudLabelUp) this.hudLabelUp.classList.toggle('active', this.normY > activeThreshold);
    if (this.hudLabelDown) this.hudLabelDown.classList.toggle('active', this.normY < -activeThreshold);
    if (this.hudLabelLeft) this.hudLabelLeft.classList.toggle('active', this.normX < -activeThreshold);
    if (this.hudLabelRight) this.hudLabelRight.classList.toggle('active', this.normX > activeThreshold);
  }

  onSettingsChange() {
    const nr = this.settings.get('neutralReturn');
    if (nr === 'off' || nr === 0) {
      this.autoReturnToNeutral = false;
    } else {
      this.autoReturnToNeutral = true;
      this.neutralTimeout = Number(nr) || 180;
    }
    this.isTouchActive = false;
    this.resetToNeutral();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.updateHUDLayout(cx, cy);
  }
}
