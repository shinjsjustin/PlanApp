'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/peopleRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');

const getConn = useTransaction();

describe('peopleRepo', () => {
    it('create returns the row with defaults and findById returns it, or null when missing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await repo.create(conn, { ownerId, name: 'Ann' });

        expect(created).toMatchObject({
            owner_id: ownerId, name: 'Ann', company: null, role: null, emails: [], phones: [],
            contact_groups: '', notes: null, place_id: null, place_name: null, place_address: null,
            leemac_client_id: null, leemac_client_name: null,
        });
        expect(await repo.findById(conn, created.id)).toEqual(created);
        expect(await repo.findById(conn, 0)).toBeNull();
    });

    it('create stores emails, phones, groups and linked place, and the row carries place name and address', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });

        const created = await repo.create(conn, {
            ownerId, name: 'Bo', company: 'Acme', role: 'CTO', notes: 'n',
            emails: ['a@x.com', 'b@x.com'], phones: [{ label: 'cell', number: '555' }],
            groups: ['family', 'church'], placeId: place.id, leemacClientId: 'c5', leemacClientName: 'Acme Inc',
        });

        expect(created).toMatchObject({
            company: 'Acme', role: 'CTO', notes: 'n',
            emails: ['a@x.com', 'b@x.com'], phones: [{ label: 'cell', number: '555' }],
            contact_groups: 'family,church', place_id: place.id, place_name: 'Home', place_address: '1 Main',
            leemac_client_id: 'c5', leemac_client_name: 'Acme Inc',
        });
    });

    it('listByOwner returns only that owner\'s people by name with id as tie-break, with place data', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const otherId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });
        const zed = await repo.create(conn, { ownerId, name: 'Zed' });
        const a1 = await repo.create(conn, { ownerId, name: 'Alpha', placeId: place.id });
        const a2 = await repo.create(conn, { ownerId, name: 'Alpha' });
        await repo.create(conn, { ownerId: otherId, name: 'Aardvark' });

        const rows = await repo.listByOwner(conn, ownerId);

        expect(rows.map((r) => r.id)).toEqual([a1.id, a2.id, zed.id]);
        expect(rows[0]).toMatchObject({ place_name: 'Home', place_address: '1 Main' });
        expect(rows[1]).toMatchObject({ place_name: null, place_address: null });
    });

    it('update changes only the given fields, re-encodes lists, and returns null for a missing id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, name: 'Old', company: 'Co', groups: ['friend'] });

        const updated = await repo.update(conn, created.id, {
            name: 'New', emails: ['n@x.com'], phones: [{ label: 'w', number: '1' }], groups: ['supplier', 'other'],
        });

        expect(updated).toMatchObject({
            name: 'New', company: 'Co', emails: ['n@x.com'], phones: [{ label: 'w', number: '1' }],
            contact_groups: 'supplier,other',
        });
        expect(await repo.update(conn, 0, { name: 'n' })).toBeNull();
    });

    it('update can link and unlink a place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });
        const created = await repo.create(conn, { ownerId, name: 'Ann' });

        const linked = await repo.update(conn, created.id, { placeId: place.id });
        const unlinked = await repo.update(conn, created.id, { placeId: null });

        expect(linked).toMatchObject({ place_id: place.id, place_name: 'Home' });
        expect(unlinked).toMatchObject({ place_id: null, place_name: null });
    });

    it('remove returns true for a deleted row and false for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, name: 'Gone' });

        expect(await repo.remove(conn, created.id)).toBe(true);
        expect(await repo.findById(conn, created.id)).toBeNull();
        expect(await repo.remove(conn, created.id)).toBe(false);
    });

    it('deleting a place leaves its people with place null', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });
        const person = await repo.create(conn, { ownerId, name: 'Ann', placeId: place.id });

        await placesRepo.remove(conn, place.id);

        expect(await repo.findById(conn, person.id)).toMatchObject({
            place_id: null, place_name: null, place_address: null,
        });
    });
});
