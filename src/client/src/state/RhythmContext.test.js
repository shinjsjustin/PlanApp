import React from 'react';
import { renderHook } from '@testing-library/react';

import { RhythmProvider, useRhythmMarkers } from './RhythmContext';

const READY = {
    status: 'ready',
    timeZone: 'America/Chicago',
    anchors: [{ id: 'wake', title: 'Wake', description: null, time: '06:30', days: 'daily', enabled: true }],
    gates: [],
};
const WAKE = { key: 'anchor:wake', kind: 'anchor', minutes: 390, title: 'Wake', time: '06:30' };

const inProvider = (value) => ({ children }) => <RhythmProvider value={value}>{children}</RhythmProvider>;

describe('useRhythmMarkers', () => {
    test('returns an empty list outside a provider', () => {
        const { result } = renderHook(() => useRhythmMarkers('2026-11-04'));

        expect(result.current).toEqual([]);
    });

    test.each(['loading', 'error'])('returns an empty list while the rhythm is %s', (status) => {
        const { result } = renderHook(() => useRhythmMarkers('2026-11-04'), {
            wrapper: inProvider({ ...READY, status }),
        });

        expect(result.current).toEqual([]);
    });

    test('returns the markers for the date once ready', () => {
        const { result } = renderHook(() => useRhythmMarkers('2026-11-04'), { wrapper: inProvider(READY) });

        expect(result.current).toEqual([WAKE]);
    });

    test('returns the same empty array every time while not ready', () => {
        const first = renderHook(() => useRhythmMarkers('2026-11-04')).result.current;
        const second = renderHook(() => useRhythmMarkers('2026-11-05')).result.current;

        expect(second).toBe(first);
    });

    test('keeps the same markers array across rerenders with the same inputs', () => {
        const { result, rerender } = renderHook(() => useRhythmMarkers('2026-11-04'), { wrapper: inProvider(READY) });
        const first = result.current;

        rerender();

        expect(result.current).toBe(first);
    });
});
