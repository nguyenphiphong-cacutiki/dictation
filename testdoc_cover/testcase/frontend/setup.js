import '@testing-library/jest-dom'

// jsdom does not implement media playback; give <audio> a working play/pause
// that fires the events React components listen to.
Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value() {
    this.dispatchEvent(new window.Event('play'))
    return Promise.resolve()
  },
})
Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value() {
    this.dispatchEvent(new window.Event('pause'))
  },
})

// jsdom lacks these; components call them unconditionally.
window.HTMLElement.prototype.scrollIntoView = () => {}
if (!window.navigator.sendBeacon) {
  window.navigator.sendBeacon = () => true
}
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`
  window.URL.revokeObjectURL = () => {}
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
