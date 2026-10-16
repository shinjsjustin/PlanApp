import { previousDateKey } from './dates';

test.each([
    ['2026-03-01', '2026-02-28'],
    ['2026-01-01', '2025-12-31'],
    ['2024-03-01', '2024-02-29'],
    ['2026-10-16', '2026-10-15'],
])('previousDateKey(%s) is %s', (key, expected) => {
    expect(previousDateKey(key)).toBe(expected);
});
