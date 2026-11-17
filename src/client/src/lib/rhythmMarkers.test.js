import { markersForDate } from './rhythmMarkers';

const CHICAGO = 'America/Chicago';
const anchor = (over = {}) => ({
    id: 'wake', title: 'Wake', description: null, time: '06:30', days: 'daily', enabled: true, ...over,
});
const gate = (over = {}) => ({
    id: 'g1', title: 'Plan', kind: 'plan', state: 'open',
    opensAt: '2026-11-04T14:00:00.000Z', closesAt: '2026-11-04T18:15:00.000Z', ...over,
});
const rhythm = (over = {}) => ({ timeZone: CHICAGO, anchors: [], gates: [], ...over });

describe('markersForDate', () => {
    it('returns nothing for a null date', () => {
        expect(markersForDate(rhythm({ anchors: [anchor()] }), null, CHICAGO)).toEqual([]);
    });

    it('returns nothing for a null rhythm', () => {
        expect(markersForDate(null, '2026-11-04', CHICAGO)).toEqual([]);
    });

    it('puts a daily anchor on any date at its time', () => {
        expect(markersForDate(rhythm({ anchors: [anchor()] }), '2026-11-08', CHICAGO)).toEqual([
            { key: 'anchor:wake', kind: 'anchor', minutes: 390, title: 'Wake', time: '06:30' },
        ]);
    });

    it('skips disabled anchors', () => {
        expect(markersForDate(rhythm({ anchors: [anchor({ enabled: false })] }), '2026-11-04', CHICAGO)).toEqual([]);
    });

    it('keeps a weekday anchor only on its weekdays', () => {
        const r = rhythm({ anchors: [anchor({ days: ['mon', 'wed'] })] });

        expect(markersForDate(r, '2026-11-04', CHICAGO)).toHaveLength(1); // Wednesday
        expect(markersForDate(r, '2026-11-05', CHICAGO)).toEqual([]); // Thursday
        expect(markersForDate(r, '2026-11-09', CHICAGO)).toHaveLength(1); // Monday
        expect(markersForDate(r, '2026-11-08', CHICAGO)).toEqual([]); // Sunday
    });

    it('puts an open gate at its close minute on the closing date', () => {
        expect(markersForDate(rhythm({ gates: [gate()] }), '2026-11-04', CHICAGO)).toEqual([
            { key: 'gate:g1', kind: 'gate', minutes: 735, title: 'Plan', time: '12:15' },
        ]);
    });

    it('includes held gates but not green, assumed or rejected ones', () => {
        const gates = ['held', 'green', 'assumed', 'rejected'].map((state) => gate({ id: state, state }));

        expect(markersForDate(rhythm({ gates }), '2026-11-04', CHICAGO).map((m) => m.key)).toEqual(['gate:held']);
    });

    it('leaves a gate off the dates it only spans or closes after', () => {
        const g = gate({ opensAt: '2026-11-03T14:00:00.000Z', closesAt: '2026-11-05T18:00:00.000Z' });

        expect(markersForDate(rhythm({ gates: [g] }), '2026-11-04', CHICAGO)).toEqual([]);
        expect(markersForDate(rhythm({ gates: [g] }), '2026-11-05', CHICAGO)).toHaveLength(1);
        expect(markersForDate(rhythm({ gates: [g] }), '2026-11-03', CHICAGO)).toEqual([]);
    });

    it('reads the close in wall time after the fall-back change', () => {
        const g = gate({ opensAt: '2026-11-01T05:30:00.000Z', closesAt: '2026-11-01T09:00:00.000Z' });

        expect(markersForDate(rhythm({ gates: [g] }), '2026-11-01', CHICAGO)[0]).toMatchObject({ minutes: 180, time: '03:00' });
    });

    it('reads the close in wall time after the spring-forward change', () => {
        const g = gate({ opensAt: '2026-03-08T05:30:00.000Z', closesAt: '2026-03-08T09:00:00.000Z' });

        expect(markersForDate(rhythm({ gates: [g] }), '2026-03-08', CHICAGO)[0]).toMatchObject({ minutes: 240, time: '04:00' });
    });

    it('sorts anchors and gates together by minute', () => {
        const r = rhythm({
            anchors: [anchor({ id: 'late', title: 'Late', time: '20:00' }), anchor({ id: 'early', title: 'Early', time: '06:00' })],
            gates: [gate()],
        });

        expect(markersForDate(r, '2026-11-04', CHICAGO).map((m) => m.key)).toEqual(['anchor:early', 'gate:g1', 'anchor:late']);
    });

    it('uses the stored zone, else the browser zone', () => {
        const g = gate(); // 18:15Z
        const stored = rhythm({ gates: [g] });
        const unset = rhythm({ timeZone: null, gates: [g] });

        expect(markersForDate(stored, '2026-11-04', 'UTC')[0].time).toBe('12:15');
        expect(markersForDate(unset, '2026-11-04', 'UTC')[0].time).toBe('18:15');
    });
});
