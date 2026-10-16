'use strict';

const { toPlace } = require('../../src/lib/serializers');

describe('toPlace', () => {
    const row = {
        id: 4, owner_id: 9, name: 'Acme', address: '2 Elm', kind: 'client',
        notes: 'ring bell', visit_minutes: 90, is_default_start: 1,
        created_at: new Date(), updated_at: new Date(),
    };

    test('maps the row to the wire shape and drops the owner', () => {
        expect(toPlace(row)).toEqual({
            id: 4, name: 'Acme', address: '2 Elm', kind: 'client',
            notes: 'ring bell', visitMinutes: 90, isDefaultStart: true,
        });
    });

    test('turns a 0 flag into false and keeps null fields null', () => {
        expect(toPlace({ ...row, is_default_start: 0, notes: null, visit_minutes: null })).toMatchObject({
            isDefaultStart: false, notes: null, visitMinutes: null,
        });
    });
});
