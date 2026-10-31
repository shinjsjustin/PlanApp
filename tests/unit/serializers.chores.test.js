'use strict';

const { toChore, toChoreLog } = require('../../src/lib/serializers');

const row = {
    id: 4, owner_id: 9, name: 'Vacuum', area: 'Living room', window_min: 7, window_max: 14,
    notes: 'Under the sofa', archived_at: null,
    created_at: new Date('2026-10-01T10:00:00Z'), updated_at: new Date('2026-10-02T10:00:00Z'),
    last_done_on: '2026-10-24', last_done_by: 'Ann',
};

describe('toChore', () => {
    it('maps a done chore with its due status and hides owner_id', () => {
        expect(toChore(row, '2026-10-31')).toEqual({
            id: 4, name: 'Vacuum', area: 'Living room', window: { min: 7, max: 14 },
            notes: 'Under the sofa', archived: false, archivedAt: null,
            lastDone: { on: '2026-10-24', by: 'Ann' },
            createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z',
            status: 'due', daysSince: 7, urgency: 0.5, dueFrom: '2026-10-31', dueBy: '2026-11-07',
        });
    });

    it('maps a never-done archived chore with null lastDone and an ISO archivedAt', () => {
        const chore = toChore(
            { ...row, area: null, notes: null, last_done_on: null, last_done_by: null, archived_at: new Date('2026-10-05T00:00:00Z') },
            '2026-10-31'
        );

        expect(chore).toMatchObject({
            area: null, notes: null, archived: true, archivedAt: '2026-10-05T00:00:00.000Z',
            lastDone: null, status: 'never', daysSince: null, urgency: null, dueFrom: null, dueBy: null,
        });
    });
});

describe('toChoreLog', () => {
    it('maps a log row', () => {
        expect(
            toChoreLog({ id: 1, chore_id: 4, done_on: '2026-10-24', done_by: 'Ann', created_at: new Date('2026-10-24T08:00:00Z'), updated_at: new Date() })
        ).toEqual({ id: 1, choreId: 4, on: '2026-10-24', by: 'Ann', createdAt: '2026-10-24T08:00:00.000Z' });
    });
});
