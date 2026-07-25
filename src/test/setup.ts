import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement ResizeObserver, which the chart library's responsive
 * container subscribes to on mount. Stub it so charts can render under test.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/**
 * jsdom reports every element as zero sized, so the responsive container would
 * render nothing at all. Give it a deterministic box so chart children mount.
 */
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  value: 800,
});
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  value: 300,
});
