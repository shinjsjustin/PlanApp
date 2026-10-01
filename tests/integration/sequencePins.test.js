'use strict';

const request = require('supertest');

const app = require('../../src/server');
const sequencesRepo = require('../../src/db/repositories/sequencesRepo');
const todosRepo = require('../../src/db/repositories/todosRepo');
const { authHeaderFor } = require('../helpers/auth');
const { useTransaction } = require('../helpers/db');
const { createFixture } = require('../helpers/todosFixture');

const getConn = useTransaction();

const createSequences = async (conn, layerId) => [
    await sequencesRepo.create(conn, { layerId, title: 'One' }),
    await sequencesRepo.create(conn, { layerId, title: 'Two' }),
    await sequencesRepo.create(conn, { layerId, title: 'Three' }),
];

describe('sequence pins', () => {
    test('a new sequence is not pinned', async () => {
        const conn = getConn();
        const { sequence } = await createFixture(conn);

        expect(Boolean(sequence.is_pinned)).toBe(false);
        expect(sequence.is_pinned).toBe(0);
    });

    test('setPinned pins only the named sequences and returns affectedRows', async () => {
        const conn = getConn();
        const { layer } = await createFixture(conn);
        const [one, two, three] = await createSequences(conn, layer.id);

        const affected = await sequencesRepo.setPinned(conn, [one.id, two.id], true);

        expect(affected).toBe(2);
        expect((await sequencesRepo.findById(conn, one.id)).is_pinned).toBe(1);
        expect((await sequencesRepo.findById(conn, two.id)).is_pinned).toBe(1);
        expect((await sequencesRepo.findById(conn, three.id)).is_pinned).toBe(0);
    });

    test('setPinned unpins', async () => {
        const conn = getConn();
        const { layer } = await createFixture(conn);
        const [one, two] = await createSequences(conn, layer.id);
        await sequencesRepo.setPinned(conn, [one.id, two.id], true);

        const affected = await sequencesRepo.setPinned(conn, [one.id], false);

        expect(affected).toBe(1);
        expect((await sequencesRepo.findById(conn, one.id)).is_pinned).toBe(0);
        expect((await sequencesRepo.findById(conn, two.id)).is_pinned).toBe(1);
    });

    test('setPinned with no ids writes nothing and returns 0', async () => {
        const conn = getConn();

        expect(await sequencesRepo.setPinned(conn, [], true)).toBe(0);
    });

    test('the project graph reports isPinned per sequence', async () => {
        const conn = getConn();
        const { ownerId, project, layer } = await createFixture(conn);
        const [, two] = await createSequences(conn, layer.id);
        await sequencesRepo.setPinned(conn, [two.id], true);

        const response = await request(app)
            .get(`/api/projects/${project.id}`)
            .set('Authorization', authHeaderFor(ownerId));

        expect(response.status).toBe(200);
        const flags = Object.fromEntries(
            response.body.data.sequences.map((s) => [s.title, s.isPinned])
        );
        expect(flags).toMatchObject({ One: false, Two: true, Three: false });
    });

    test('pinning a sequence leaves its to-dos unpinned', async () => {
        const conn = getConn();
        const { project, sequence } = await createFixture(conn);
        const todo = await todosRepo.create(conn, {
            projectId: project.id,
            sequenceId: sequence.id,
            text: 'Read',
        });

        await sequencesRepo.setPinned(conn, [sequence.id], true);

        const [row] = await todosRepo.findByIds(conn, [todo.id]);
        expect(row.is_pinned).toBe(0);
    });

    test('calendar_items.todo_id is nullable and sequence_id is a cascading unique FK', async () => {
        const conn = getConn();

        const [cols] = await conn.query(
            `SELECT COLUMN_NAME, IS_NULLABLE FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calendar_items'`
        );
        const nullable = Object.fromEntries(cols.map((c) => [c.COLUMN_NAME, c.IS_NULLABLE]));
        expect(nullable.todo_id).toBe('YES');
        expect(nullable.sequence_id).toBe('YES');

        const [fks] = await conn.query(
            `SELECT rc.DELETE_RULE, kcu.REFERENCED_TABLE_NAME
             FROM information_schema.REFERENTIAL_CONSTRAINTS rc
             JOIN information_schema.KEY_COLUMN_USAGE kcu
               ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
              AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
             WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND kcu.TABLE_NAME = 'calendar_items'
               AND kcu.COLUMN_NAME = 'sequence_id'`
        );
        expect(fks).toEqual([{ DELETE_RULE: 'CASCADE', REFERENCED_TABLE_NAME: 'sequences' }]);

        const [idx] = await conn.query(
            `SELECT NON_UNIQUE FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calendar_items'
               AND INDEX_NAME = 'uq_calendar_items_sequence'`
        );
        expect(idx).toEqual([{ NON_UNIQUE: 0 }]);
    });
});
