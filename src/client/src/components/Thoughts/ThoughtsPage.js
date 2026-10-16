import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import PlacesLink from '../Navigation/PlacesLink';
import useIsPhone from '../../hooks/useIsPhone';
import useThoughts from '../../hooks/useThoughts';
import '../Styling/Thoughts.css';

const CLEAR_CONFIRMATION = 'Delete every thought?';

// Enter saves for speed; Shift+Enter keeps a newline.
const saveOnEnter = (onSave) => (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    onSave();
};

const ThoughtItem = ({ thought, onEdit, onRemove }) => {
    const [draft, setDraft] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const isEditing = draft !== null;

    const save = async () => {
        if (!draft.trim() || isSaving) return;
        setIsSaving(true);
        const didSave = await onEdit(thought.id, draft);
        setIsSaving(false);
        if (didSave) setDraft(null);
    };

    return (
        <li className="thought-item">
            {isEditing ? (
                <>
                    <textarea
                        className="thought-input"
                        aria-label="Edit thought"
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={saveOnEnter(save)}
                        autoFocus
                    />
                    <div className="thought-actions">
                        <button type="button" className="neon-button" onClick={save} disabled={!draft.trim() || isSaving}>Save</button>
                        <button type="button" className="neon-button" onClick={() => setDraft(null)}>Cancel</button>
                    </div>
                </>
            ) : (
                <>
                    <p className="thought-text">{thought.text}</p>
                    <time className="thought-time" dateTime={thought.createdAt}>
                        {new Date(thought.createdAt).toLocaleString()}
                    </time>
                    <div className="thought-actions">
                        <button type="button" className="neon-button" onClick={() => setDraft(thought.text)}>Edit</button>
                        <button type="button" className="neon-button" onClick={() => onRemove(thought.id)}>Delete</button>
                    </div>
                </>
            )}
        </li>
    );
};

const ThoughtsPage = () => {
    const isPhone = useIsPhone();
    const { status, thoughts, error, add, edit, remove, clearAll } = useThoughts();
    const [text, setText] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const save = async () => {
        if (!text.trim() || isSaving) return;
        setIsSaving(true);
        const didSave = await add(text);
        setIsSaving(false);
        if (didSave) setText('');
    };

    const confirmClear = () => {
        if (window.confirm(CLEAR_CONFIRMATION)) clearAll();
    };

    return (
        <main className={isPhone ? 'thoughts-page thoughts-page--phone' : 'thoughts-page'}>
            <header className="thoughts-header">
                <h1>Thoughts</h1>
                {!isPhone && (
                    <>
                        <Link className="neon-button" to="/projects">Projects</Link>
                        <Link className="neon-button" to="/calendar">Calendar</Link>
                        <PlacesLink />
                    </>
                )}
            </header>

            {error && <p role="alert" className="thoughts-error">{error}</p>}

            <section className="thought-new">
                <textarea
                    className="thought-input"
                    aria-label="New thought"
                    placeholder="What's on your mind?"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={saveOnEnter(save)}
                    autoFocus
                />
                <button type="button" className="neon-button" onClick={save} disabled={!text.trim() || isSaving}>Save</button>
            </section>

            {status === 'loading' ? (
                <p>Loading thoughts…</p>
            ) : (
                <>
                    <ul className="thought-list">
                        {thoughts.map((thought) => (
                            <ThoughtItem key={thought.id} thought={thought} onEdit={edit} onRemove={remove} />
                        ))}
                    </ul>
                    {thoughts.length > 0 && (
                        <button type="button" className="neon-button thoughts-clear" onClick={confirmClear}>Clear all</button>
                    )}
                </>
            )}
        </main>
    );
};

export default ThoughtsPage;
