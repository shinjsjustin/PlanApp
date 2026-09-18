// Loaded automatically by react-scripts before every test file.
// Adds the jest-dom matchers (toBeInTheDocument, toBeDisabled, ...).
import '@testing-library/jest-dom';

// jsdom implements no layout and ships no `ResizeObserver`, which `@dnd-kit`
// asks for on mount. A no-op stands in so components that observe an element
// render instead of throwing; anything that genuinely depends on measurement
// provides its own rects, or is left to the Playwright flow where there is a
// real browser to measure.
if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
        observe() {}

        unobserve() {}

        disconnect() {}
    };
}
