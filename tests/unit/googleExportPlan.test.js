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
                bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
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

    it('hashes equal bookings equally and a changed start differently', () => {
        const booking = { todo_id: 5, booked_sequence_id: null, text: 'Write', day_id: 1, start_minutes: 570, duration_minutes: 60 };

        const [a] = exportBodies([booking], DAYS, ZONE);
        const [b] = exportBodies([{ ...booking }], DAYS, ZONE);
        const [c] = exportBodies([{ ...booking, start_minutes: 600 }], DAYS, ZONE);

        expect(a.bodyHash).toBe(b.bodyHash);
        expect(a.bodyHash).not.toBe(c.bodyHash);
    });

    it('skips bookings on undated days', () => {
        const bookings = [
            { todo_id: 5, booked_sequence_id: null, text: 'Nope', day_id: 2, start_minutes: 60, duration_minutes: 30 },
        ];

        expect(exportBodies(bookings, DAYS, ZONE)).toEqual([]);
    });
});

describe('planExport', () => {
    it('splits into creates, updates, unchanged and deletes', () => {
        const bodies = [
            { itemKey: 'todo:1', bodyHash: 'h1', body: { summary: 'new' } },
            { itemKey: 'todo:2', bodyHash: 'h2', body: { summary: 'moved' } },
            { itemKey: 'todo:4', bodyHash: 'h4', body: { summary: 'same' } },
            { itemKey: 'todo:5', bodyHash: 'h5', body: { summary: 'never exported hash' } },
        ];
        const mappings = [
            { itemKey: 'todo:2', googleEventId: 'g2', bodyHash: 'old' },
            { itemKey: 'sequence:3', googleEventId: 'g3', bodyHash: 'h3' },
            { itemKey: 'todo:4', googleEventId: 'g4', bodyHash: 'h4' },
            { itemKey: 'todo:5', googleEventId: 'g5', bodyHash: null },
        ];

        expect(planExport(bodies, mappings)).toEqual({
            creates: [bodies[0]],
            updates: [
                { ...bodies[1], googleEventId: 'g2' },
                { ...bodies[3], googleEventId: 'g5' },
            ],
            unchanged: [{ ...bodies[2], googleEventId: 'g4' }],
            deletes: [mappings[1]],
        });
    });
});
