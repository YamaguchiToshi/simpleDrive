/**
 * fullscreen.js - Cross-browser & iPadOS Safari Fullscreen Controller
 */

export class FullscreenManager {
  constructor() {
    this.btnToggle = document.getElementById('btn-fullscreen-toggle');
    this.iconEnter = document.getElementById('icon-fs-enter');
    this.iconExit = document.getElementById('icon-fs-exit');

    this.setupEvents();
    this.updateUI();
  }

  isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
  }

  async requestFullscreen() {
    const docEl = document.documentElement;
    try {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        await docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request could not be granted:', err);
    }
  }

  async exitFullscreen() {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      }
    } catch (err) {
      console.warn('Exit fullscreen error:', err);
    }
  }

  toggle() {
    if (this.isFullscreen()) {
      this.exitFullscreen();
    } else {
      this.requestFullscreen();
    }
  }

  setupEvents() {
    if (this.btnToggle) {
      this.btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }

    const onFSChange = () => {
      this.updateUI();
      // Trigger canvas resize on transition
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };

    document.addEventListener('fullscreenchange', onFSChange);
    document.addEventListener('webkitfullscreenchange', onFSChange);
    document.addEventListener('mozfullscreenchange', onFSChange);
    document.addEventListener('MSFullscreenChange', onFSChange);
  }

  updateUI() {
    const isFS = this.isFullscreen();
    if (this.iconEnter && this.iconExit) {
      if (isFS) {
        this.iconEnter.classList.add('hidden');
        this.iconExit.classList.remove('hidden');
      } else {
        this.iconEnter.classList.remove('hidden');
        this.iconExit.classList.add('hidden');
      }
    }
  }
}
