'use strict';

const { exportBodies, planExport } = require('../../src/lib/googleExportPlan');

const ZONE = 'America/Los_Angeles';
const DAYS = [
    { id: 1, date: '2026-03-07' },
    { id: 2, date: null },
];

describe('exportBodies', () => {
    it('gives a keyed body with summary, wall-clock start and end, zone and shinplanKey for a to-do', () => {
        const bookings = [
            { todo_id: 5, booked_sequence_id: null, text: 'Write', day_id: 1, start_minutes: 570, duration_minutes: 60 },
        ];

        expect(exportBodies(bookings, DAYS, ZONE)).toEqual([
            {
                itemKey: 'todo:5',
                body: {
                    summary: 'Write',
                    start: { dateTime: '2026-03-07T09:30:00', timeZone: ZONE },
                    end: { dateTime: '2026-03-07T10:30:00', timeZone: ZONE },
                    extendedProperties: { private: { shinplanKey: 'todo:5' } },
                },
            },
        ]);
    });

    it('uses the sequence title and a sequence key for a sequence booking', () => {
        const bookings = [
            {
                todo_id: null, booked_sequence_id: 8, text: null, sequence_title: 'Launch',
                day_id: 1, start_minutes: 0, duration_minutes: 15,
            },
        ];

        const [{ itemKey, body }] = exportBodies(bookings, DAYS, ZONE);

        expect(itemKey).toBe('sequence:8');
        expect(body.summary).toBe('Launch');
        expect(body.start.dateTime).toBe('2026-03-07T00:00:00');
        expect(body.end.dateTime).toBe('2026-03-07T00:15:00');
        expect(body.extendedProperties.private.shinplanKey).toBe('sequence:8');
    });

    it('ends on the next date when a booking runs past midnight', () => {
        const bookings = [
            { todo_id: 5, booked_sequence_id: null, text: 'Late', day_id: 1, start_minutes: 1380, duration_minutes: 120 },
        ];

        const [{ body }] = exportBodies(bookings, DAYS, ZONE);

        expect(body.start.dateTime).toBe('2026-03-07T23:00:00');
        expect(body.end.dateTime).toBe('2026-03-08T01:00:00');
    });

    it('rolls month ends when a booking runs past midnight', () => {
        const bookings = [
            { todo_id: 5, booked_sequence_id: null, text: 'Late', day_id: 3, start_minutes: 1430, duration_minutes: 20 },
        ];

        const [{ body }] = exportBodies(bookings, [{ id: 3, date: '2026-02-28' }], ZONE);

        expect(body.end.dateTime).toBe('2026-03-01T00:10:00');
    });

    it('skips bookings on undated days', () => {
        const bookings = [
            { todo_id: 5, booked_sequence_id: null, text: 'Nope', day_id: 2, start_minutes: 60, duration_minutes: 30 },
        ];

        expect(exportBodies(bookings, DAYS, ZONE)).toEqual([]);
    });
});

describe('planExport', () => {
    it('splits into creates, updates and deletes', () => {
        const bodies = [
            { itemKey: 'todo:1', body: { summary: 'new' } },
            { itemKey: 'todo:2', body: { summary: 'kept' } },
        ];
        const mappings = [
            { itemKey: 'todo:2', googleEventId: 'g2' },
            { itemKey: 'sequence:3', googleEventId: 'g3' },
        ];

        expect(planExport(bodies, mappings)).toEqual({
            creates: [{ itemKey: 'todo:1', body: { summary: 'new' } }],
            updates: [{ itemKey: 'todo:2', googleEventId: 'g2', body: { summary: 'kept' } }],
            deletes: [{ itemKey: 'sequence:3', googleEventId: 'g3' }],
        });
    });
});
