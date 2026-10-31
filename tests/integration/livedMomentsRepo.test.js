'use strict';

const { useTransaction, createTestUser } = require('../helpers/db');
const repo = require('../../src/db/repositories/livedMomentsRepo');

const getConn = useTransaction();

const moment = (overrides = {}) => ({
    startMinutes: 480,
    durationMinutes: 30,
    title: 'Walk',
    category: 'move',
    detail: null,
    chatTicks: [],
    ...overrides,
});

describe('livedMomentsRepo', () => {
    let ownerId;
    let otherId;

    beforeEach(async () => {
        ownerId = await createTestUser(getConn());
        otherId = await createTestUser(getConn());
    });

    describe('replaceDay', () => {
        it('inserts moments and returns them ordered by start_minutes then id', async () => {
            const rows = await repo.replaceDay(getConn(), ownerId, '2026-10-30', [
                moment({ startMinutes: 600, title: 'B' }),
                moment({ startMinutes: 60, title: 'A' }),
                moment({ startMinutes: 600, title: 'C' }),
            ]);

            expect(rows.map((r) => r.title)).toEqual(['A', 'B', 'C']);
            expect(rows[0].lived_on).toBe('2026-10-30');
            expect(rows[0].owner_id).toBe(ownerId);
        });

        it('returns chat_ticks as an array and keeps detail', async () => {
            const [row] = await repo.replaceDay(getConn(), ownerId, '2026-10-30', [
                moment({ chatTicks: [1, 5, 9], detail: 'by the river' }),
            ]);

            expect(row.chat_ticks).toEqual([1, 5, 9]);
            expect(row.detail).toBe('by the river');
        });

        it('replaces the previous moments of that day only', async () => {
            await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment({ title: 'Old' })]);
            await repo.replaceDay(getConn(), ownerId, '2026-10-31', [moment({ title: 'Next' })]);

            const rows = await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment({ title: 'New' })]);

            expect(rows.map((r) => r.title)).toEqual(['New']);
            const next = await repo.listRange(getConn(), ownerId, '2026-10-31', '2026-10-31');
            expect(next.map((r) => r.title)).toEqual(['Next']);
        });

        it('clears the day and returns an empty list when given no moments', async () => {
            await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment()]);

            const rows = await repo.replaceDay(getConn(), ownerId, '2026-10-30', []);

            expect(rows).toEqual([]);
            expect(await repo.listRange(getConn(), ownerId, '2026-10-30', '2026-10-30')).toEqual([]);
        });

        it('never touches another user on the same date', async () => {
            await repo.replaceDay(getConn(), otherId, '2026-10-30', [moment({ title: 'Theirs' })]);

            await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment({ title: 'Mine' })]);

            const theirs = await repo.listRange(getConn(), otherId, '2026-10-30', '2026-10-30');
            expect(theirs.map((r) => r.title)).toEqual(['Theirs']);
        });
    });

    describe('listRange', () => {
        it('returns rows within the inclusive range ordered by day, start, id', async () => {
            await repo.replaceDay(getConn(), ownerId, '2026-10-29', [moment({ title: 'before' })]);
            await repo.replaceDay(getConn(), ownerId, '2026-10-31', [
                moment({ startMinutes: 100, title: 'd3b' }),
                moment({ startMinutes: 50, title: 'd3a' }),
            ]);
            await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment({ title: 'd2' })]);
            await repo.replaceDay(getConn(), ownerId, '2026-11-01', [moment({ title: 'after' })]);

            const rows = await repo.listRange(getConn(), ownerId, '2026-10-30', '2026-10-31');

            expect(rows.map((r) => r.title)).toEqual(['d2', 'd3a', 'd3b']);
            expect(Array.isArray(rows[0].chat_ticks)).toBe(true);
        });

        it('excludes other users', async () => {
            await repo.replaceDay(getConn(), otherId, '2026-10-30', [moment()]);

            expect(await repo.listRange(getConn(), ownerId, '2026-10-01', '2026-10-31')).toEqual([]);
        });
    });

    describe('clearDay', () => {
        it('deletes only that owner day and returns the count', async () => {
            await repo.replaceDay(getConn(), ownerId, '2026-10-30', [moment(), moment({ startMinutes: 900 })]);
            await repo.replaceDay(getConn(), ownerId, '2026-10-31', [moment()]);
            await repo.replaceDay(getConn(), otherId, '2026-10-30', [moment()]);

            const count = await repo.clearDay(getConn(), ownerId, '2026-10-30');

            expect(count).toBe(2);
            expect(await repo.listRange(getConn(), ownerId, '2026-10-30', '2026-10-30')).toEqual([]);
            expect(await repo.listRange(getConn(), ownerId, '2026-10-31', '2026-10-31')).toHaveLength(1);
            expect(await repo.listRange(getConn(), otherId, '2026-10-30', '2026-10-30')).toHaveLength(1);
        });

        it('returns 0 when the day is empty', async () => {
            expect(await repo.clearDay(getConn(), ownerId, '2026-10-30')).toBe(0);
        });
    });
});
