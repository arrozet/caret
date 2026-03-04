/**
 * Vitest setup file for the frontend.
 * Extends matchers with @testing-library/jest-dom (e.g., toBeInTheDocument)
 * and provides necessary browser API mocks for jsdom.
 */
import "@testing-library/jest-dom/vitest";

/**
 * Mock window.matchMedia for jsdom (not implemented natively).
 * Defaults to light mode (prefers-color-scheme: light).
 */
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

/**
 * Mock Element.prototype.scrollIntoView for jsdom.
 * jsdom does not implement layout, so scrollIntoView is not available.
 */
Element.prototype.scrollIntoView = () => {};
