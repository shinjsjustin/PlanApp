'use strict';

const { toPerson } = require('../../src/lib/serializers');

describe('toPerson', () => {
    const row = {
        id: 3, owner_id: 9, name: 'Ann', company: 'Acme', role: 'CEO',
        emails: ['a@x.com'], phones: [{ label: 'cell', number: '555' }],
        contact_groups: 'family,client_contact', notes: 'hi',
        place_id: 4, place_name: 'Home', place_address: '1 Main',
        leemac_client_id: 7, leemac_client_name: 'Acme Inc',
        created_at: new Date(), updated_at: new Date(),
    };

    test('maps the row to the wire shape and drops the owner', () => {
        expect(toPerson(row)).toEqual({
            id: 3, name: 'Ann', company: 'Acme', role: 'CEO',
            emails: ['a@x.com'], phones: [{ label: 'cell', number: '555' }],
            groups: ['family', 'client_contact'], notes: 'hi',
            place: { id: 4, name: 'Home', address: '1 Main' },
            leemacClientId: 7, leemacClientName: 'Acme Inc',
        });
    });

    test('gives an empty array for an empty SET and null place when unlinked', () => {
        expect(toPerson({ ...row, contact_groups: '', place_id: null, place_name: null, place_address: null }))
            .toMatchObject({ groups: [], place: null });
    });

    test('parses emails and phones that arrive as JSON strings', () => {
        const out = toPerson({
            ...row,
            emails: '["b@x.com"]',
            phones: '[{"label":"home","number":"1"}]',
        });
        expect(out.emails).toEqual(['b@x.com']);
        expect(out.phones).toEqual([{ label: 'home', number: '1' }]);
    });

    test('keeps null optional fields null', () => {
        expect(toPerson({
            ...row, company: undefined, role: undefined, notes: undefined,
            leemac_client_id: undefined, leemac_client_name: undefined,
        })).toMatchObject({
            company: null, role: null, notes: null, leemacClientId: null, leemacClientName: null,
        });
    });
});
