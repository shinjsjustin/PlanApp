import React, { useEffect, useRef, useState } from 'react';

import useChores from '../../hooks/useChores';
import { todayKey } from '../../lib/dates';
import { FILTERS, filterChores, orderChores } from '../../lib/choreSchedule';
import FormDialog, { confirmDiscard } from '../AddressBook/FormDialog';
import ChoreForm from './ChoreForm';
import ChoreHistory from './ChoreHistory';
import ChoreRow from './ChoreRow';
import ChoreTimeline from './ChoreTimeline';
import '../Styling/Places.css';
import '../Styling/Chores.css';

const UNDO_WINDOW_MS = 10000;
const HIGHLIGHT_MS = 2000;
const ALL = 'all';
const DEFAULT_PERSON = 'Justin';
const OTHER = 'Other';
const PEOPLE = [DEFAULT_PERSON, 'Jacklin', OTHER];
const MAX_NAME_LENGTH = 50;

const ChoresPage = () => {
    const chores = useChores();
    const [dialog, setDialog] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [saveFailed, setSaveFailed] = useState(false);
    const [person, setPerson] = useState(DEFAULT_PERSON);
    const [otherName, setOtherName] = useState('');
    const [lastDone, setLastDone] = useState(null);
    const [filterId, setFilterId] = useState(ALL);
    const [focus, setFocus] = useState(null);
    const undoTimer = useRef(null);
    const highlightTimer = useRef(null);
    const today = todayKey();
    const ordered = orderChores(chores.chores);
    const visible = filterChores(ordered, filterId, today);

    const clearUndo = () => {
        clearTimeout(undoTimer.current);
        setLastDone(null);
    };

    useEffect(() => () => {
        clearTimeout(undoTimer.current);
        clearTimeout(highlightTimer.current);
    }, []);

    useEffect(() => {
        if (!focus) return;
        document.getElementById(`chore-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focus]);

    const selectChore = (chore) => {
        if (!visible.some((c) => c.id === chore.id)) setFilterId(ALL);
        clearTimeout(highlightTimer.current);
        setFocus({ id: chore.id });
        highlightTimer.current = setTimeout(() => setFocus(null), HIGHLIGHT_MS);
    };

    const closeDialog = () => {
        setDialog(null);
        setIsDirty(false);
        setSaveFailed(false);
    };

    const openDialog = (next) => {
        setDialog(next);
        setIsDirty(false);
        setSaveFailed(false);
    };

    const submitForm = async (fields) => {
        const didSucceed = await (dialog.chore ? chores.edit(dialog.chore.id, fields) : chores.add(fields));
        if (didSucceed) closeDialog();
        else setSaveFailed(true);
    };

    const archiveChore = async () => {
        if (!window.confirm('Archive this chore?')) return;
        if (await chores.archive(dialog.chore.id)) closeDialog();
    };

    const requestCancel = () => {
        if (confirmDiscard(isDirty)) closeDialog();
    };

    const doneBy = () => (person === OTHER ? otherName.trim() || DEFAULT_PERSON : person);

    const markDone = async (chore) => {
        clearUndo();
        const by = doneBy();
        const log = await chores.markDone(chore.id, by);
        if (!log) return;
        setLastDone({ chore, log, by });
        undoTimer.current = setTimeout(() => setLastDone(null), UNDO_WINDOW_MS);
    };

    const undo = () => {
        chores.undo(lastDone.chore.id, lastDone.log.id);
        clearUndo();
    };

    return (
        <main className="chores-page">
            <header className="places-header">
                <h1>Chores</h1>
                <button type="button" className="neon-button" onClick={() => openDialog({ chore: null })}>
                    New chore
                </button>
            </header>

            {chores.error && <p role="alert" className="places-error">{chores.error}</p>}

            <div className="chores-done-by">
                <label>
                    Done by
                    <select className="place-input" value={person} onChange={(event) => setPerson(event.target.value)}>
                        {PEOPLE.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                </label>
                {person === OTHER && (
                    <label>
                        Name
                        <input
                            className="place-input"
                            type="text"
                            maxLength={MAX_NAME_LENGTH}
                            value={otherName}
                            onChange={(event) => setOtherName(event.target.value)}
                        />
                    </label>
                )}
            </div>

            {lastDone && (
                <div role="status" className="chores-undo">
                    <span>{`Done: ${lastDone.chore.name} by ${lastDone.by}`}</span>
                    <button type="button" onClick={undo}>Undo</button>
                </div>
            )}

            {chores.status === 'loading' && <p>Loading chores...</p>}
            {chores.status === 'ready' && chores.chores.length === 0 && (
                <>
                    <p>No chores yet.</p>
                    <button type="button" className="neon-button" onClick={chores.seed}>Load starter chores</button>
                </>
            )}
            {chores.status === 'ready' && chores.chores.length > 0 && (
                <>
                    <ChoreTimeline chores={ordered} today={today} onSelect={selectChore} />
                    <div className="chores-filter">
                        {FILTERS.map(({ id, label }) => (
                            <button key={id} type="button" aria-pressed={filterId === id} onClick={() => setFilterId(id)}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {visible.length === 0 && <p>No chores match.</p>}
                    <ul className="chore-grid">
                        {visible.map((chore) => (
                            <ChoreRow
                                key={chore.id}
                                chore={chore}
                                isHighlighted={focus?.id === chore.id}
                                onDone={markDone}
                                onEdit={(target) => openDialog({ chore: target })}
                                onHistory={(target) => openDialog({ chore: target, isHistory: true })}
                            />
                        ))}
                    </ul>
                </>
            )}

            {chores.archived.length > 0 && (
                <section className="chores-archived">
                    <h2>Archived</h2>
                    <ul className="chore-list">
                        {chores.archived.map((chore) => (
                            <li key={chore.id}>
                                <span>{chore.name}</span>
                                <button type="button" onClick={() => chores.restore(chore.id)}>Restore</button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {dialog && dialog.isHistory && (
                <FormDialog title={`History: ${dialog.chore.name}`} isDirty={false} onClose={closeDialog}>
                    <ChoreHistory chore={dialog.chore} onChanged={chores.reload} />
                </FormDialog>
            )}

            {dialog && !dialog.isHistory && (
                <FormDialog
                    title={dialog.chore ? 'Edit chore' : 'New chore'}
                    isDirty={isDirty}
                    error={saveFailed ? chores.error : null}
                    onClose={closeDialog}
                >
                    <ChoreForm
                        chore={dialog.chore}
                        saveFailed={saveFailed}
                        onSubmit={submitForm}
                        onCancel={requestCancel}
                        onArchive={dialog.chore ? archiveChore : undefined}
                        onDirtyChange={setIsDirty}
                    />
                </FormDialog>
            )}
        </main>
    );
};

export default ChoresPage;
