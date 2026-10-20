/**
 * settings.js - Accessibility & Driving Configuration State
 */

const STORAGE_KEY = 'simpleDrive_settings';

const DEFAULT_SETTINGS = {
  speedLimit: 22, // 12, 22, 32
  deadzoneRadius: 0.15, // 0.08 - 0.35
  steerSens: 1.0, // 0.6, 1.0, 1.4
  assistLevel: 'mild', // 'off', 'mild', 'strong'
  neutralReturn: 180, // 'off', 100, 180, 260
  inputMode: 'gamepad', // 'gamepad' (Optima Joystick/Controller), 'joystick' (Mouse/Delta), or 'touch'
  soundEnabled: true
};

export class SettingsManager {
  constructor(onChangeCallback) {
    this.onChange = onChangeCallback;
    this.settings = this.loadSettings();
    this.initUI();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        // Normalize legacy inputMode values
        if (parsed.inputMode === 'delta') parsed.inputMode = 'joystick';
        if (parsed.inputMode === 'position') parsed.inputMode = 'touch';
        if (!['gamepad', 'joystick', 'touch'].includes(parsed.inputMode)) {
          parsed.inputMode = 'gamepad';
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not load settings from localStorage', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Could not save settings to localStorage', e);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    if (this.onChange) {
      this.onChange(key, value, this.settings);
    }
  }

  initUI() {
    // Drawer open / close
    const btnOpen = document.getElementById('btn-settings-open');
    const btnClose = document.getElementById('btn-settings-close');
    const btnDone = document.getElementById('btn-settings-done');
    const drawer = document.getElementById('settings-drawer');
    const backdrop = document.getElementById('settings-backdrop');

    const openDrawer = () => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
      backdrop.classList.remove('hidden');
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      backdrop.classList.add('hidden');
    };

    if (btnOpen) btnOpen.addEventListener('click', openDrawer);
    if (btnClose) btnClose.addEventListener('click', closeDrawer);
    if (btnDone) btnDone.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    // Segmented Buttons
    const segmentButtons = document.querySelectorAll('.segment-btn');
    segmentButtons.forEach(btn => {
      const setting = btn.getAttribute('data-setting');
      const valStr = btn.getAttribute('data-value');
      const currentVal = this.settings[setting];

      // Initial active state
      if (String(currentVal) === String(valStr)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }

      btn.addEventListener('click', () => {
        const parent = btn.parentElement;
        parent.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        let parsedVal = valStr;
        if (!isNaN(Number(valStr))) {
          parsedVal = Number(valStr);
        }
        this.set(setting, parsedVal);
      });
    });

    // Deadzone slider
    const deadzoneSlider = document.getElementById('input-deadzone');
    const deadzoneLabel = document.getElementById('deadzone-value-label');
    if (deadzoneSlider && deadzoneLabel) {
      deadzoneSlider.value = this.settings.deadzoneRadius;
      deadzoneLabel.textContent = Number(this.settings.deadzoneRadius).toFixed(2);

      deadzoneSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        deadzoneLabel.textContent = val.toFixed(2);
        this.set('deadzoneRadius', val);
      });
    }

    // Sound toggle in top bar
    const btnSound = document.getElementById('btn-sound-toggle');
    const iconOn = document.getElementById('sound-icon-on');
    const iconOff = document.getElementById('sound-icon-off');

    const updateSoundUI = () => {
      if (this.settings.soundEnabled) {
        iconOn.classList.remove('hidden');
        iconOff.classList.add('hidden');
      } else {
        iconOn.classList.add('hidden');
        iconOff.classList.remove('hidden');
      }
    };
    updateSoundUI();

    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const next = !this.settings.soundEnabled;
        this.set('soundEnabled', next);
        updateSoundUI();
      });
    }

    // Input Mode Toggle Button in top bar
    const btnModeToggle = document.getElementById('btn-mode-toggle');
    const iconGamepad = document.getElementById('mode-icon-gamepad');
    const iconJoy = document.getElementById('mode-icon-joystick');
    const iconTouch = document.getElementById('mode-icon-touch');
    const lblMode = document.getElementById('mode-text-label');

    this.updateModeUI = () => {
      const mode = this.settings.inputMode;
      if (iconGamepad && iconJoy && iconTouch && lblMode) {
        iconGamepad.classList.add('hidden');
        iconJoy.classList.add('hidden');
        iconTouch.classList.add('hidden');

        if (mode === 'gamepad') {
          iconGamepad.classList.remove('hidden');
          lblMode.textContent = 'コントローラー';
        } else if (mode === 'joystick') {
          iconJoy.classList.remove('hidden');
          lblMode.textContent = 'マウス/Delta';
        } else {
          iconTouch.classList.remove('hidden');
          lblMode.textContent = '画面タップ';
        }
      }

      // Sync drawer segmented buttons
      document.querySelectorAll('.segment-btn[data-setting="inputMode"]').forEach(btn => {
        const val = btn.getAttribute('data-value');
        if (val === this.settings.inputMode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    };
    this.updateModeUI();

    if (btnModeToggle) {
      btnModeToggle.addEventListener('click', () => {
        // Cycle: gamepad -> joystick -> touch -> gamepad
        const cycle = ['gamepad', 'joystick', 'touch'];
        const currentIdx = cycle.indexOf(this.settings.inputMode);
        const nextMode = cycle[(currentIdx + 1) % cycle.length];
        this.set('inputMode', nextMode);
        this.updateModeUI();
      });
    }
  }

  setControllerStatus(connected, deviceName = '') {
    const badge = document.getElementById('gamepad-status-badge');
    const badgeLabel = document.getElementById('gamepad-badge-label');
    const statusText = document.getElementById('controller-status-text');
    const detailsRow = document.getElementById('controller-details-row');
    const nameEl = document.getElementById('controller-device-name');

    if (connected) {
      if (badge) badge.classList.remove('hidden');
      if (badgeLabel) badgeLabel.textContent = '🎮 コントローラー接続中';
      if (statusText) {
        statusText.textContent = '接続中 (認識完了)';
        statusText.className = 'status-connected';
      }
      if (detailsRow) detailsRow.classList.remove('hidden');
      if (nameEl) nameEl.textContent = deviceName || 'Optima Joystick / Gamepad';
    } else {
      if (badge) badge.classList.add('hidden');
      if (statusText) {
        statusText.textContent = '未検出 (スティックを動かしてください)';
        statusText.className = 'status-disconnected';
      }
      if (detailsRow) detailsRow.classList.add('hidden');
    }
  }
}
