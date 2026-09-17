'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarNotesRepo = require('../../src/db/repositories/calendarNotesRepo');
const { useTransaction, createTestUser } = require('../helpers/db');
const { authHeaderFor } = require('../helpers/auth');

const getConn = useTransaction();

/**
 * The note endpoints (design 2026-09-16, section 5). Every request runs on the
 * connection the test opened, so everything the routes write is rolled back
 * afterwards (tests/helpers/db.js).
 *
 * Two properties are asserted throughout: nothing crosses an ownership boundary,
 * and a refused write leaves nothing behind.
 */

const createWorld = async (conn, { dayCount = 2 } = {}) => {
    const ownerId = await createTestUser(conn);
    const days = [];

    for (let index = 0; index < dayCount; index += 1) {
        // eslint-disable-next-line no-await-in-loop
        days.push(await calendarDaysRepo.create(conn, { ownerId }));
    }

    return { ownerId, days };
};

const body = (overrides = {}) => ({
    text: 'on call',
    startMinutes: 540,
    durationMinutes: 60,
    ...overrides,
});

describe('GET /api/calendar/notes', () => {
    test('returns an empty list for a new user', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        // Act
        const response = await request(app)
            .get('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data.notes).toEqual([]);
    });

    test('returns only the caller’s notes, in the wire shape', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const stranger = await createWorld(conn);

        await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
        await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .get('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.body.data.notes).toHaveLength(1);
        expect(response.body.data.notes[0]).toEqual({
            id: expect.any(Number),
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });
});

describe('POST /api/calendar/notes', () => {
    test('creates a note and answers 201', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id }));

        // Assert
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });
    });

    test('trims the text', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: '  on call  ' }));

        // Assert
        expect(response.body.data.text).toBe('on call');
    });

    test('refuses a day belonging to someone else', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: stranger.days[0].id }));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarNotesRepo.listByDayId(conn, stranger.days[0].id)).toEqual([]);
    });

    test.each([
        ['an off-grid start', { startMinutes: 545 }],
        ['an off-grid duration', { durationMinutes: 45 }],
        ['a negative start', { startMinutes: -30 }],
        ['a duration below the minimum', { durationMinutes: 0 }],
        ['empty text', { text: '   ' }],
    ])('refuses %s', async (unused, override) => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, ...override }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toEqual([]);
    });

    test('refuses a note running past midnight', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, startMinutes: 1410, durationMinutes: 60 }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toEqual([]);
    });

    test('refuses the fifth overlapping note and stores nothing', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[0].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: 'the fifth' }));

        // Assert
        expect(response.status).toBe(400);
        expect(await calendarNotesRepo.listByDayId(conn, days[0].id)).toHaveLength(4);
    });

    test('allows a fifth note that does not overlap the other four', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[0].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        // Act
        const response = await request(app)
            .post('/api/calendar/notes')
            .set('Authorization', authHeaderFor(ownerId))
            .send(body({ dayId: days[0].id, text: 'later', startMinutes: 600 }));

        // Assert
        expect(response.status).toBe(201);
    });
});

describe('PATCH /api/calendar/notes/:id', () => {
    test('moves a note to another day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: days[1].id, startMinutes: 600 });

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ dayId: days[1].id, startMinutes: 600 });
    });

    test('renames a note without moving it', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'on call (swapped)' });

        // Assert
        expect(response.body.data).toMatchObject({
            text: 'on call (swapped)',
            startMinutes: 540,
            dayId: days[0].id,
        });
    });

    test('refuses an empty body', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'on call',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({});

        // Assert
        expect(response.status).toBe(400);
    });

    test('refuses another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ text: 'mine now' });

        // Assert
        expect(response.status).toBe(403);
        expect((await calendarNotesRepo.findById(conn, note.id)).text).toBe('theirs');
    });

    test('refuses a move into another user’s day', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'mine',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: stranger.days[0].id });

        // Assert
        expect(response.status).toBe(403);
        expect((await calendarNotesRepo.findById(conn, note.id)).day_id).toBe(days[0].id);
    });

    test('rolls back a move that would make a fifth overlap', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            await calendarNotesRepo.create(conn, {
                dayId: days[1].id,
                text: `note ${index}`,
                startMinutes: 540,
                durationMinutes: 60,
            });
        }

        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'the fifth',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ dayId: days[1].id });

        // Assert
        expect(response.status).toBe(400);
        expect((await calendarNotesRepo.findById(conn, note.id)).day_id).toBe(days[0].id);
        expect(await calendarNotesRepo.listByDayId(conn, days[1].id)).toHaveLength(4);
    });

    test('lets a note stay where it is when the day is already at the cap', async () => {
        // Arrange — the note being resized is one of the four, so excluding it
        // is what makes this legal. A check that counted it twice would refuse.
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const notes = [];

        for (let index = 0; index < 4; index += 1) {
            // eslint-disable-next-line no-await-in-loop
            notes.push(
                await calendarNotesRepo.create(conn, {
                    dayId: days[0].id,
                    text: `note ${index}`,
                    startMinutes: 540,
                    durationMinutes: 60,
                })
            );
        }

        // Act
        const response = await request(app)
            .patch(`/api/calendar/notes/${notes[0].id}`)
            .set('Authorization', authHeaderFor(ownerId))
            .send({ durationMinutes: 120 });

        // Assert
        expect(response.status).toBe(200);
    });
});

describe('DELETE /api/calendar/notes/:id', () => {
    test('deletes the note', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'gone',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ id: note.id });
        expect(await calendarNotesRepo.findById(conn, note.id)).toBeNull();
    });

    test('refuses another user’s note', async () => {
        // Arrange
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const stranger = await createWorld(conn);
        const note = await calendarNotesRepo.create(conn, {
            dayId: stranger.days[0].id,
            text: 'theirs',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/notes/${note.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(403);
        expect(await calendarNotesRepo.findById(conn, note.id)).not.toBeNull();
    });
});

describe('deleting a day', () => {
    test('takes its notes with it and says nothing about them', async () => {
        // Arrange
        const conn = getConn();
        const { ownerId, days } = await createWorld(conn);
        await calendarNotesRepo.create(conn, {
            dayId: days[0].id,
            text: 'context',
            startMinutes: 540,
            durationMinutes: 60,
        });

        // Act
        const response = await request(app)
            .delete(`/api/calendar/days/${days[0].id}`)
            .set('Authorization', authHeaderFor(ownerId));

        // Assert
        expect(response.status).toBe(200);
        expect(await calendarNotesRepo.listByOwner(conn, ownerId)).toEqual([]);
    });
});

describe('authentication', () => {
    test.each([
        ['get', '/api/calendar/notes'],
        ['post', '/api/calendar/notes'],
        ['patch', '/api/calendar/notes/1'],
        ['delete', '/api/calendar/notes/1'],
    ])('%s %s requires a token', async (method, path) => {
        // Act
        const response = await request(app)[method](path).send({});

        // Assert
        expect(response.status).toBe(401);
    });
});
