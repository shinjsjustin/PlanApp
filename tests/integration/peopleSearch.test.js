'use strict';

const request = require('supertest');

const app = require('../../src/server');
const peopleRepo = require('../../src/db/repositories/peopleRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

const mk = (conn, ownerId, name, extra = {}) => peopleRepo.create(conn, { ownerId, name, ...extra });
const names = (response) => response.body.data.people.map((person) => person.name);
const search = (userId, query) => request(app).get('/api/people').query(query).set('Authorization', authHeaderFor(userId));

describe('GET /api/people search', () => {
    test('q matches name or company as a case-insensitive substring', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'Annabel');
        await mk(conn, ownerId, 'Zed', { company: 'Banner Co' });
        await mk(conn, ownerId, 'Carl', { company: 'Other' });

        expect(names(await search(ownerId, { q: 'ANN' }))).toEqual(['Annabel', 'Zed']);
    });

    test('percent, underscore and backslash in q match literally', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, '50% off');
        await mk(conn, ownerId, 'a_b');
        await mk(conn, ownerId, 'axb');
        await mk(conn, ownerId, 'c\\d');
        await mk(conn, ownerId, 'plain');

        expect(names(await search(ownerId, { q: '%' }))).toEqual(['50% off']);
        expect(names(await search(ownerId, { q: 'a_b' }))).toEqual(['a_b']);
        expect(names(await search(ownerId, { q: '\\' }))).toEqual(['c\\d']);
    });

    test('empty or blank q means no filter', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'A');
        await mk(conn, ownerId, 'B');

        expect(names(await search(ownerId, { q: '  ' }))).toEqual(['A', 'B']);
    });

    test('q longer than 255 characters is 400', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await search(ownerId, { q: 'x'.repeat(256) })).status).toBe(400);
    });

    test('group keeps people in that group and combines with q', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        await mk(conn, ownerId, 'Ann', { groups: ['family', 'church'] });
        await mk(conn, ownerId, 'Amy', { groups: ['friend'] });
        await mk(conn, ownerId, 'Bob', { groups: ['church'] });

        expect(names(await search(ownerId, { group: 'church' }))).toEqual(['Ann', 'Bob']);
        expect(names(await search(ownerId, { group: 'church', q: 'a' }))).toEqual(['Ann']);
    });

    test('an unknown group is 400', async () => {
        const ownerId = await createTestUser(getConn());

        expect((await search(ownerId, { group: 'nope' })).status).toBe(400);
    });

    test('search never leaks another owner’s people', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const strangerId = await createTestUser(conn);
        await mk(conn, strangerId, 'Ann');

        expect(names(await search(ownerId, { q: 'ann' }))).toEqual([]);
    });
});
