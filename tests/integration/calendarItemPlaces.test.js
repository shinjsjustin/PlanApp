'use strict';

const request = require('supertest');

const app = require('../../src/server');
const calendarDaysRepo = require('../../src/db/repositories/calendarDaysRepo');
const calendarItemsRepo = require('../../src/db/repositories/calendarItemsRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const getCalendar = (ownerId) =>
    request(app).get('/api/calendar').set('Authorization', authHeaderFor(ownerId));

describe('placeId on calendar items', () => {
    test('is the to-do place, else the sequence place, else null', async () => {
        const conn = getConn();
        const { ownerId, project, sequence } = await createFixture(conn);
        const todoPlace = await placesRepo.create(conn, { ownerId, name: 'Gym', address: '1 Main St' });
        const sequencePlace = await placesRepo.create(conn, { ownerId, name: 'Lab', address: '2 Oak Ave' });
        await sequencesRepo.setPinned(conn, [sequence.id], true);
        await sequencesRepo.update(conn, sequence.id, { placeId: sequencePlace.id });
        const day = await calendarDaysRepo.create(conn, { ownerId });

        const own = await todosRepo.create(conn, {
            projectId: project.id,
            text: 'Own',
            sequenceId: sequence.id,
        });
        await todosRepo.update(conn, own.id, { placeId: todoPlace.id });
        const inherited = await todosRepo.create(conn, {
            projectId: project.id,
            text: 'Inherited',
            sequenceId: sequence.id,
        });
        const placeless = await todosRepo.create(conn, { projectId: project.id, text: 'Placeless' });

        const book = (target, startMinutes) =>
            calendarItemsRepo.upsert(conn, { dayId: day.id, ...target, startMinutes, durationMinutes: 30 });
        await book({ todoId: own.id }, 0);
        await book({ todoId: inherited.id }, 60);
        await book({ todoId: placeless.id }, 120);
        await book({ sequenceId: sequence.id }, 180);

        const { items } = (await getCalendar(ownerId)).body.data;

        expect(items.map((item) => item.placeId)).toEqual([
            todoPlace.id,
            sequencePlace.id,
            null,
            sequencePlace.id,
        ]);
    });

    test('a sequence booking without a sequence place is null', async () => {
        const conn = getConn();
        const { ownerId, sequence } = await createFixture(conn);
        await sequencesRepo.setPinned(conn, [sequence.id], true);
        const day = await calendarDaysRepo.create(conn, { ownerId });
        await calendarItemsRepo.upsert(conn, {
            dayId: day.id,
            sequenceId: sequence.id,
            startMinutes: 0,
            durationMinutes: 30,
        });

        const { items } = (await getCalendar(ownerId)).body.data;

        expect(items.map((item) => item.placeId)).toEqual([null]);
    });
});
