import React, { useState } from 'react';

import useChoreLogs from '../../hooks/useChoreLogs';
import { todayKey } from '../../lib/dates';

const DEFAULT_BY = 'Justin';
const MAX_BY_LENGTH = 50;

const LogFields = ({ draft, onChange }) => (
    <>
        <label className="place-field">
            Date
            <input
                type="date"
                className="place-input"
                value={draft.on}
                max={todayKey()}
                onChange={(event) => onChange({ ...draft, on: event.target.value })}
            />
        </label>
        <label className="place-field">
            Done by
            <input
                type="text"
                className="place-input"
                value={draft.by}
                maxLength={MAX_BY_LENGTH}
                onChange={(event) => onChange({ ...draft, by: event.target.value })}
            />
        </label>
    </>
);

const isSubmittable = (draft) => draft.on !== '' && draft.by.trim() !== '';
const toFields = (draft) => ({ on: draft.on, by: draft.by.trim() });

const ChoreHistory = ({ chore, onChanged }) => {
    const { status, logs, error, add, edit, remove } = useChoreLogs(chore.id);
    const [newLog, setNewLog] = useState({ on: todayKey(), by: DEFAULT_BY });
    const [editing, setEditing] = useState(null);

    const finish = async (isDone) => {
        if (!(await isDone)) return false;
        onChanged();
        return true;
    };

    const submitAdd = (event) => {
        event.preventDefault();
        if (!isSubmittable(newLog)) return;
        finish(add(toFields(newLog)));
    };

    const save = async () => {
        if (!isSubmittable(editing.draft)) return;
        if (await finish(edit(editing.id, toFields(editing.draft)))) setEditing(null);
    };

    const confirmDelete = (log) => {
        if (!window.confirm('Delete this done-mark?')) return;
        finish(remove(log.id));
    };

    return (
        <div>
            {error && <p role="alert" className="places-error">{error}</p>}
            <form onSubmit={submitAdd}>
                <LogFields draft={newLog} onChange={setNewLog} />
                <button type="submit" className="neon-button">Add</button>
            </form>
            {status === 'loading' && <p>Loading...</p>}
            {status !== 'loading' && logs.length === 0 && <p>No done-marks yet.</p>}
            <ul className="chore-history">
                {logs.map((log) => (
                    <li key={log.id}>
                        {editing?.id === log.id ? (
                            <>
                                <LogFields
                                    draft={editing.draft}
                                    onChange={(draft) => setEditing({ ...editing, draft })}
                                />
                                <button type="button" className="neon-button" onClick={save}>Save</button>
                                <button type="button" className="neon-button" onClick={() => setEditing(null)}>Cancel</button>
                            </>
                        ) : (
                            <>
                                <span>{log.on} by {log.by}</span>
                                <button
                                    type="button"
                                    className="neon-button"
                                    onClick={() => setEditing({ id: log.id, draft: { on: log.on, by: log.by } })}
                                >
                                    Edit
                                </button>
                                <button type="button" className="neon-button" onClick={() => confirmDelete(log)}>Delete</button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ChoreHistory;
