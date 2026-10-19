'use strict';

const request = require('supertest');

const app = require('../../src/server');
const peopleRepo = require('../../src/db/repositories/peopleRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const mk = (conn, ownerId, name, extra = {}) => peopleRepo.create(conn, { ownerId, name, ...extra });
const mkPlace = (conn, ownerId, name) => placesRepo.create(conn, { ownerId, name, address: `${name} St` });
const as = (userId) => ({ Authorization: authHeaderFor(userId) });

describe('GET /api/people', () => {
    test('returns only the caller’s people in the wire shape', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Home');
        const ann = await mk(conn, ownerId, 'Ann', { emails: ['a@x.com'], groups: ['family'], placeId: place.id });
        await mk(conn, strangerId, 'Theirs');

        const response = await request(app).get('/api/people').set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            people: [
                {
                    id: ann.id,
                    name: 'Ann',
                    company: null,
                    role: null,
                    emails: ['a@x.com'],
                    phones: [],
                    groups: ['family'],
                    notes: null,
                    place: { id: place.id, name: 'Home', address: 'Home St' },
                    leemacClientId: null,
                    leemacClientName: null,
                },
            ],
        });
    });
});

describe('GET /api/people/:id', () => {
    test('answers one person', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Bob');

        const response = await request(app).get(`/api/people/${person.id}`).set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: person.id, name: 'Bob' });
    });

    test('answers 403 for a stranger’s person', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Bob');

        expect((await request(app).get(`/api/people/${person.id}`).set(as(strangerId))).status).toBe(403);
    });

    test('answers 404 for a missing person', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await request(app).get('/api/people/987654321').set(as(ownerId))).status).toBe(404);
    });
});

describe('POST /api/people', () => {
    test('needs only a name, trims, and answers 201', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const response = await request(app).post('/api/people').set(as(ownerId)).send({ name: '  Cy ' });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ name: 'Cy', emails: [], phones: [], groups: [], place: null });
        expect(await peopleRepo.listByOwner(conn, ownerId)).toHaveLength(1);
    });

    test('stores every field, trimmed', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'Office');

        const response = await request(app)
            .post('/api/people')
            .set(as(ownerId))
            .send({
                name: 'Di',
                company: ' Acme ',
                role: ' CEO ',
                emails: [' d@x.com '],
                phones: [{ label: ' cell ', number: ' 555 ' }, { label: '', number: '666' }],
                groups: ['client_contact', 'church'],
                notes: 'hi',
                placeId: place.id,
                leemacClientId: '123',
                leemacClientName: 'Client One',
            });

        expect(response.status).toBe(201);
        expect(response.body.data).toEqual({
            id: expect.any(Number),
            name: 'Di',
            company: 'Acme',
            role: 'CEO',
            emails: ['d@x.com'],
            phones: [{ label: 'cell', number: '555' }, { label: '', number: '666' }],
            groups: ['client_contact', 'church'],
            notes: 'hi',
            place: { id: place.id, name: 'Office', address: 'Office St' },
            leemacClientId: 123,
            leemacClientName: 'Client One',
        });
    });

    test('accepts an email already on another person', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'First', { emails: ['same@x.com'] });

        const response = await request(app)
            .post('/api/people')
            .set(as(ownerId))
            .send({ name: 'Second', emails: ['same@x.com'] });

        expect(response.status).toBe(201);
    });

    test('answers 403 for a stranger’s place and 404 for a missing one', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const theirs = await mkPlace(conn, strangerId, 'Theirs');

        const forbidden = await request(app).post('/api/people').set(as(ownerId)).send({ name: 'n', placeId: theirs.id });
        const missing = await request(app).post('/api/people').set(as(ownerId)).send({ name: 'n', placeId: 987654321 });

        expect(forbidden.status).toBe(403);
        expect(missing.status).toBe(404);
        expect(await peopleRepo.listByOwner(conn, ownerId)).toEqual([]);
    });

    const tooMany = (n, make) => Array.from({ length: n }, (_, i) => make(i));
    test.each([
        ['missing name', {}],
        ['blank name', { name: '  ' }],
        ['long name', { name: 'a'.repeat(256) }],
        ['long company', { name: 'n', company: 'a'.repeat(256) }],
        ['unknown group', { name: 'n', groups: ['enemy'] }],
        ['duplicate groups', { name: 'n', groups: ['family', 'family'] }],
        ['bad email', { name: 'n', emails: ['nope'] }],
        ['long email', { name: 'n', emails: [`${'a'.repeat(250)}@x.com`] }],
        ['11 emails', { name: 'n', emails: tooMany(11, (i) => `a${i}@x.com`) }],
        ['blank phone number', { name: 'n', phones: [{ label: '', number: ' ' }] }],
        ['long phone label', { name: 'n', phones: [{ label: 'a'.repeat(41), number: '1' }] }],
        ['11 phones', { name: 'n', phones: tooMany(11, (i) => ({ label: '', number: `${i + 1}` })) }],
        ['long notes', { name: 'n', notes: 'a'.repeat(5001) }],
        ['zero placeId', { name: 'n', placeId: 0 }],
        ['non-numeric leemacClientId', { name: 'n', leemacClientId: 'c1' }],
    ])('answers 400 and stores nothing for %s', async (_label, payload) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const response = await request(app).post('/api/people').set(as(ownerId)).send(payload);

        expect(response.status).toBe(400);
        expect(await peopleRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('PATCH /api/people/:id', () => {
    const patch = (userId, id, body) => request(app).patch(`/api/people/${id}`).set(as(userId)).send(body);

    test('changes only the sent fields', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Old', { company: 'Co', emails: ['o@x.com'], groups: ['friend'] });

        const response = await patch(ownerId, person.id, { name: ' New ', company: null });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: person.id, name: 'New', company: null, emails: ['o@x.com'], groups: ['friend'] });
        expect(await peopleRepo.findById(conn, person.id)).toMatchObject({ name: 'New', company: null });
    });

    test('links and unlinks a place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await mkPlace(conn, ownerId, 'P');
        const person = await mk(conn, ownerId, 'Pat');

        const linked = await patch(ownerId, person.id, { placeId: place.id });
        const unlinked = await patch(ownerId, person.id, { placeId: null });

        expect(linked.body.data.place).toEqual({ id: place.id, name: 'P', address: 'P St' });
        expect(unlinked.body.data.place).toBeNull();
    });

    test('answers 403 for a stranger’s place and changes nothing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const theirs = await mkPlace(conn, strangerId, 'T');
        const person = await mk(conn, ownerId, 'Pat');

        const response = await patch(ownerId, person.id, { name: 'x', placeId: theirs.id });

        expect(response.status).toBe(403);
        expect(await peopleRepo.findById(conn, person.id)).toEqual(person);
    });

    test('answers 404 for a missing place', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Pat');

        expect((await patch(ownerId, person.id, { placeId: 987654321 })).status).toBe(404);
    });

    test.each([
        ['an empty body', {}],
        ['blank name', { name: ' ' }],
        ['bad email', { emails: ['nope'] }],
        ['bad group', { groups: ['enemy'] }],
        ['bad phone', { phones: [{ label: '', number: '' }] }],
    ])('answers 400 and changes nothing for %s', async (_label, body) => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Keep');

        const response = await patch(ownerId, person.id, body);

        expect(response.status).toBe(400);
        expect(await peopleRepo.findById(conn, person.id)).toEqual(person);
    });

    test('answers 403 for a stranger’s person and changes nothing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Mine');

        expect((await patch(strangerId, person.id, { name: 'stolen' })).status).toBe(403);
        expect(await peopleRepo.findById(conn, person.id)).toEqual(person);
    });

    test('answers 404 for a missing person', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await patch(ownerId, 987654321, { name: 'x' })).status).toBe(404);
    });
});

describe('DELETE /api/people/:id', () => {
    test('removes only that person and returns its id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const gone = await mk(conn, ownerId, 'Gone');
        const stays = await mk(conn, ownerId, 'Stays');

        const response = await request(app).delete(`/api/people/${gone.id}`).set(as(ownerId));

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: gone.id });
        expect((await peopleRepo.listByOwner(conn, ownerId)).map((r) => r.id)).toEqual([stays.id]);
    });

    test('answers 403 for a stranger’s person and keeps it', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        const person = await mk(conn, ownerId, 'Mine');

        expect((await request(app).delete(`/api/people/${person.id}`).set(as(strangerId))).status).toBe(403);
        expect(await peopleRepo.findById(conn, person.id)).toEqual(person);
    });

    test('answers 404 for a missing person', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await request(app).delete('/api/people/987654321').set(as(ownerId))).status).toBe(404);
    });
});

describe('auth', () => {
    test.each([
        ['get', '/api/people'],
        ['get', '/api/people/1'],
        ['post', '/api/people'],
        ['patch', '/api/people/1'],
        ['delete', '/api/people/1'],
    ])('answers 401 without a token on %s %s', async (method, url) => {
        expect((await request(app)[method](url)).status).toBe(401);
    });
});
