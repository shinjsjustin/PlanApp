'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/remindersRepo');
const placesRepo = require('../../src/db/repositories/placesRepo');
const subcategoriesRepo = require('../../src/db/repositories/reminderSubcategoriesRepo');
const projectsRepo = require('../../src/db/repositories/projectsRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const peopleRepo = require('../../src/db/repositories/peopleRepo');

const getConn = useTransaction();

describe('remindersRepo', () => {
    it('create applies defaults and findById returns it, or null when missing', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);

        const created = await repo.create(conn, { ownerId, title: 'Call', timeZone: 'UTC' });

        expect(created).toMatchObject({
            owner_id: ownerId, title: 'Call', time_zone: 'UTC', place_id: null, subcategory_id: null,
            person_id: null, project_id: null, todo_id: null, due_date: null, due_time: null,
            alert_at: null, location_trigger: 'none', priority: 'normal', status: 'open',
            repeat_rule: 'none', repeat_every: null, repeat_weekdays: '',
            place_name: null, subcategory_name: null, person_name: null, project_title: null, todo_text: null,
        });
        expect(await repo.findById(conn, created.id)).toEqual(created);
        expect(await repo.findById(conn, 0)).toBeNull();
    });

    it('create stores links, schedule and repeat, and findById joins their names', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });
        const sub = await subcategoriesRepo.create(conn, { ownerId, placeId: place.id, name: 'Kitchen' });
        const person = await peopleRepo.create(conn, { ownerId, name: 'Ann' });
        const { id: projectId } = await projectsRepo.create(conn, { ownerId, title: 'Reno' });
        const { id: todoId } = await todosRepo.create(conn, { projectId, text: 'Buy tile' });

        const created = await repo.create(conn, {
            ownerId, title: 'Tile', placeId: place.id, subcategoryId: sub.id, personId: person.id,
            projectId, todoId, dueDate: '2026-10-05', dueTime: '09:05', timeZone: 'America/Chicago',
            alertAt: new Date(2026, 9, 5, 8, 0, 0), trigger: 'arrive', priority: 'high',
            repeatRule: 'weekly', repeatEvery: 2, repeatWeekdays: ['mon', 'wed'],
        });

        expect(created).toMatchObject({
            place_id: place.id, place_name: 'Home', subcategory_id: sub.id, subcategory_name: 'Kitchen',
            person_id: person.id, person_name: 'Ann', project_id: projectId, project_title: 'Reno',
            todo_id: todoId, todo_text: 'Buy tile', due_time: '09:05:00', time_zone: 'America/Chicago',
            location_trigger: 'arrive', priority: 'high',
            repeat_rule: 'weekly', repeat_every: 2, repeat_weekdays: 'mon,wed',
        });
        expect(created.alert_at).toEqual(new Date(2026, 9, 5, 8, 0, 0));
    });

    it('update changes only the named fields, returns the row, and null for a missing id', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, title: 'Call', timeZone: 'UTC', priority: 'high' });

        const updated = await repo.update(conn, created.id, {
            title: 'Text', status: 'done', repeatWeekdays: ['fri'], snoozedUntil: null,
        });

        expect(updated).toMatchObject({
            title: 'Text', status: 'done', repeat_weekdays: 'fri', priority: 'high', snoozed_until: null,
        });
        expect(await repo.update(conn, 0, { title: 'x' })).toBeNull();
    });

    it('remove deletes the row and reports whether it existed', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const created = await repo.create(conn, { ownerId, title: 'Call', timeZone: 'UTC' });

        expect(await repo.remove(conn, created.id)).toBe(true);
        expect(await repo.findById(conn, created.id)).toBeNull();
        expect(await repo.remove(conn, created.id)).toBe(false);
    });

    it('deleting the place leaves the reminder with place and subcategory both null', async () => {
        const conn = getConn();
        const ownerId = await createTestUser(conn);
        const place = await placesRepo.create(conn, { ownerId, name: 'Home', address: '1 Main' });
        const sub = await subcategoriesRepo.create(conn, { ownerId, placeId: place.id, name: 'Kitchen' });
        const created = await repo.create(conn, {
            ownerId, title: 'Tile', placeId: place.id, subcategoryId: sub.id, timeZone: 'UTC',
        });

        await placesRepo.remove(conn, place.id);

        expect(await repo.findById(conn, created.id)).toMatchObject({
            place_id: null, subcategory_id: null, place_name: null, subcategory_name: null,
        });
    });
});
