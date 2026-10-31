import React, { useEffect, useRef, useState } from 'react';

import useChores from '../../hooks/useChores';
import { groupChores } from '../../lib/choreGroups';
import FormDialog, { confirmDiscard } from '../AddressBook/FormDialog';
import ChoreForm from './ChoreForm';
import ChoreRow from './ChoreRow';
import '../Styling/Places.css';
import '../Styling/Chores.css';

const UNDO_WINDOW_MS = 10000;
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
    const undoTimer = useRef(null);

    const clearUndo = () => {
        clearTimeout(undoTimer.current);
        setLastDone(null);
    };

    useEffect(() => () => clearTimeout(undoTimer.current), []);

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
            {chores.status === 'ready' && chores.chores.length === 0 && <p>No chores yet.</p>}
            {chores.status === 'ready' && groupChores(chores.chores).map((group) => (
                <section key={group.status}>
                    <h2>{group.label}</h2>
                    <ul className="chore-list">
                        {group.chores.map((chore) => (
                            <ChoreRow
                                key={chore.id}
                                chore={chore}
                                onDone={markDone}
                                onEdit={(target) => openDialog({ chore: target })}
                            />
                        ))}
                    </ul>
                </section>
            ))}

            {dialog && (
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
                        onDirtyChange={setIsDirty}
                    />
                </FormDialog>
            )}
        </main>
    );
};

export default ChoresPage;
