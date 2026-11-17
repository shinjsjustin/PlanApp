'use strict';

const pool = require('../../src/db/db');
const { assertTestDatabase } = require('../helpers/db');

const INSTANT = 'datetime(3)';
const owner = { name: 'owner_id', type: 'int unsigned', nullable: false };

const gateAndAnchorCommon = [
    owner,
    { name: 'external_id', type: 'varchar(64)', nullable: false },
    { name: 'created_at', type: INSTANT, nullable: false },
    { name: 'updated_at', type: INSTANT, nullable: false },
    { name: 'updated_by', type: "enum('bourne','justin')", nullable: false },
];

const TABLES = {
    rhythm_settings: [
        owner,
        { name: 'time_zone', type: 'varchar(64)', nullable: false },
        { name: 'updated_at', type: INSTANT, nullable: false },
    ],
    rhythm_anchors: [
        { name: 'id', type: 'int unsigned', nullable: false },
        ...gateAndAnchorCommon,
        { name: 'title', type: 'varchar(100)', nullable: false },
        { name: 'description', type: 'varchar(200)', nullable: true },
        { name: 'at_minutes', type: 'smallint unsigned', nullable: false },
        { name: 'weekdays', type: 'tinyint unsigned', nullable: false },
        { name: 'enabled', type: 'tinyint(1)', nullable: false, default: '1' },
    ],
    rhythm_gates: [
        { name: 'id', type: 'int unsigned', nullable: false },
        ...gateAndAnchorCommon,
        { name: 'title', type: 'varchar(150)', nullable: false },
        { name: 'kind', type: "enum('game_plan','plan','problem_phase','content')", nullable: false },
        { name: 'opens_at', type: INSTANT, nullable: false },
        { name: 'closes_at', type: INSTANT, nullable: false },
        { name: 'state', type: "enum('open','held','green','assumed','rejected')", nullable: false },
        { name: 'hub_url', type: 'varchar(500)', nullable: true },
    ],
    rhythm_deletions: [
        { name: 'id', type: 'int unsigned', nullable: false },
        owner,
        { name: 'item_kind', type: "enum('anchor','gate')", nullable: false },
        { name: 'external_id', type: 'varchar(64)', nullable: false },
        { name: 'deleted_at', type: INSTANT, nullable: false },
        { name: 'deleted_by', type: "enum('bourne','justin')", nullable: false },
    ],
};

const UNIQUES = {
    rhythm_anchors: ['owner_id', 'external_id'],
    rhythm_gates: ['owner_id', 'external_id'],
    rhythm_deletions: ['owner_id', 'item_kind', 'external_id'],
};

const UPDATED_INDEXES = ['rhythm_anchors', 'rhythm_gates'];

const query = async (sql, params) => (await pool.query(sql, params))[0];

const columnsOf = (table) =>
    query(
        `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
                COLUMN_DEFAULT AS dflt, COLUMN_KEY AS ckey
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          ORDER BY ORDINAL_POSITION`,
        [table]
    );

// Index name -> { unique, columns in order }.
const indexesOf = async (table) => {
    const rows = await query(
        `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS col
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
          ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [table]
    );
    const byName = {};
    rows.forEach((r) => {
        byName[r.name] = byName[r.name] || { unique: !r.nonUnique, columns: [] };
        byName[r.name].columns.push(r.col);
    });
    return Object.values(byName);
};

describe('rhythm schema on the test database', () => {
    beforeAll(() => assertTestDatabase());
    afterAll(() => pool.end());

    describe.each(Object.entries(TABLES))('%s', (table, expected) => {
        it('has exactly the named columns with their types and nullability', async () => {
            const cols = await columnsOf(table);
            expect(cols.map((c) => c.name).sort()).toEqual(expected.map((c) => c.name).sort());
            expected.forEach((want) => {
                const got = cols.find((c) => c.name === want.name);
                expect({ name: got.name, type: got.type, nullable: got.nullable === 'YES' }).toEqual({
                    name: want.name,
                    type: want.type,
                    nullable: want.nullable,
                });
                if (want.default) expect(got.dflt).toBe(want.default);
            });
        });

        it('cascades from users on owner_id', async () => {
            const fks = await query(
                `SELECT k.COLUMN_NAME AS col, k.REFERENCED_TABLE_NAME AS ref, r.DELETE_RULE AS rule
                   FROM information_schema.KEY_COLUMN_USAGE k
                   JOIN information_schema.REFERENTIAL_CONSTRAINTS r
                     ON r.CONSTRAINT_SCHEMA = k.TABLE_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
                  WHERE k.TABLE_SCHEMA = DATABASE() AND k.TABLE_NAME = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
                [table]
            );
            expect(fks.map((f) => ({ col: f.col, ref: f.ref, rule: f.rule }))).toEqual([
                { col: 'owner_id', ref: 'users', rule: 'CASCADE' },
            ]);
        });
    });

    it('keys rhythm_settings by owner_id', async () => {
        const idx = await indexesOf('rhythm_settings');
        expect(idx).toContainEqual({ unique: true, columns: ['owner_id'] });
    });

    it.each(Object.entries(UNIQUES))('%s has its unique key', async (table, columns) => {
        expect(await indexesOf(table)).toContainEqual({ unique: true, columns });
    });

    it.each(UPDATED_INDEXES)('%s has a key on (owner_id, updated_at)', async (table) => {
        expect(await indexesOf(table)).toContainEqual({ unique: false, columns: ['owner_id', 'updated_at'] });
    });

    it('defaults enabled to 1 on a new anchor', async () => {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [u] = await conn.query(
                "INSERT INTO users (name, email, password) VALUES ('t', CONCAT('rhythm-', UUID(), '@x.test'), 'x')"
            );
            await conn.query(
                `INSERT INTO rhythm_anchors (owner_id, external_id, title, at_minutes, weekdays, created_at, updated_at, updated_by)
                 VALUES (?, 'a1', 'Wake', 420, 127, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), 'bourne')`,
                [u.insertId]
            );
            const [rows] = await conn.query('SELECT enabled FROM rhythm_anchors WHERE owner_id = ?', [u.insertId]);
            expect(rows[0].enabled).toBe(1);
        } finally {
            await conn.rollback();
            conn.release();
        }
    });
});
