'use strict';

const { firstRow, buildAssignments } = require('./sql');

/**
 * Data access for `reminders`. Rows carry the names of the linked place,
 * subcategory, person, project and to-do (null when unlinked). Links are
 * ON DELETE SET NULL, so a row outlives anything it points at.
 * `repeat_weekdays` is a SET, so the weekday list is joined on the way in.
 */

// Instants are stored as UTC wall time. Formatting in SQL and converting in JS keeps the pool's
// local time zone out of both directions.
const utcInstant = (column) => `DATE_FORMAT(r.${column}, '%Y-%m-%dT%H:%i:%sZ') AS ${column}`;

const SELECT_SQL = `SELECT r.*, ${utcInstant('alert_at')}, ${utcInstant('snoozed_until')}, pl.name AS place_name, rs.name AS subcategory_name,
        pe.name AS person_name, pr.title AS project_title, t.text AS todo_text
     FROM reminders r
     LEFT JOIN places pl ON pl.id = r.place_id
     LEFT JOIN reminder_subcategories rs ON rs.id = r.subcategory_id
     LEFT JOIN people pe ON pe.id = r.person_id
     LEFT JOIN projects pr ON pr.id = r.project_id
     LEFT JOIN todos t ON t.id = r.todo_id`;

const UPDATABLE_COLUMNS = {
    title: 'title',
    placeId: 'place_id',
    subcategoryId: 'subcategory_id',
    personId: 'person_id',
    projectId: 'project_id',
    todoId: 'todo_id',
    dueDate: 'due_date',
    dueTime: 'due_time',
    timeZone: 'time_zone',
    alertAt: 'alert_at',
    trigger: 'location_trigger',
    priority: 'priority',
    status: 'status',
    snoozedUntil: 'snoozed_until',
    closedAt: 'closed_at',
    repeatRule: 'repeat_rule',
    repeatEvery: 'repeat_every',
    repeatWeekdays: 'repeat_weekdays',
};

const toUtcWallTime = (value) =>
    value instanceof Date ? value.toISOString().slice(0, 19).replace('T', ' ') : value;

const encodeWeekdays = (value) => (Array.isArray(value) ? value.join(',') : value);

const findById = async (conn, id) => {
    const [rows] = await conn.execute(`${SELECT_SQL} WHERE r.id = ?`, [id]);

    return firstRow(rows) ?? null;
};

const create = async (
    conn,
    {
        ownerId,
        title,
        placeId = null,
        subcategoryId = null,
        personId = null,
        projectId = null,
        todoId = null,
        dueDate = null,
        dueTime = null,
        timeZone,
        alertAt = null,
        trigger = 'none',
        priority = 'normal',
        repeatRule = 'none',
        repeatEvery = null,
        repeatWeekdays = [],
    }
) => {
    const [result] = await conn.execute(
        `INSERT INTO reminders
            (owner_id, title, place_id, subcategory_id, person_id, project_id, todo_id, due_date,
             due_time, time_zone, alert_at, location_trigger, priority, repeat_rule, repeat_every,
             repeat_weekdays)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            ownerId,
            title,
            placeId,
            subcategoryId,
            personId,
            projectId,
            todoId,
            dueDate,
            dueTime,
            timeZone,
            toUtcWallTime(alertAt),
            trigger,
            priority,
            repeatRule,
            repeatEvery,
            encodeWeekdays(repeatWeekdays),
        ]
    );

    return findById(conn, result.insertId);
};

/** Changes the given fields and returns the row, or null when there was no such reminder. */
const update = async (conn, id, patch) => {
    const { clause, values } = buildAssignments(
        {
            ...patch,
            alertAt: toUtcWallTime(patch.alertAt),
            snoozedUntil: toUtcWallTime(patch.snoozedUntil),
            repeatWeekdays: encodeWeekdays(patch.repeatWeekdays),
        },
        UPDATABLE_COLUMNS
    );
    const [result] = await conn.execute(`UPDATE reminders SET ${clause} WHERE id = ?`, [...values, id]);
    if (result.affectedRows === 0) return null;

    return findById(conn, id);
};

const DUE_ORDER = 'r.due_date IS NULL, r.due_date, r.due_time';
const PLACE_ORDER = 'pl.name IS NULL, pl.name';

// Fixed ORDER BY strings keyed by sort name; input never reaches the SQL text.
const ORDERS = {
    due: `${DUE_ORDER}, r.id`,
    place: `${PLACE_ORDER}, ${DUE_ORDER}, r.id`,
    subcategory: `${PLACE_ORDER}, rs.name IS NULL, rs.name, ${DUE_ORDER}, r.id`,
    created: 'r.created_at DESC, r.id DESC',
};

const STATUS_FILTERS = {
    open: "r.status = 'open'",
    history: "r.status IN ('done', 'dismissed')",
    all: '1 = 1',
};

/** placeId is an id, 'none' for reminders without a place, or undefined for any. */
const listByOwner = async (conn, ownerId, { placeId, status = 'open', sort = 'due' } = {}) => {
    const conditions = ['r.owner_id = ?', STATUS_FILTERS[status]];
    const params = [ownerId];
    if (placeId === 'none') conditions.push('r.place_id IS NULL');
    else if (placeId !== undefined) {
        conditions.push('r.place_id = ?');
        params.push(placeId);
    }

    const [rows] = await conn.execute(
        `${SELECT_SQL} WHERE ${conditions.join(' AND ')} ORDER BY ${ORDERS[sort]}`,
        params
    );

    return rows;
};

const remove = async (conn, id) => {
    const [result] = await conn.execute('DELETE FROM reminders WHERE id = ?', [id]);

    return result.affectedRows > 0;
};

module.exports = { create, findById, listByOwner, remove, update };
