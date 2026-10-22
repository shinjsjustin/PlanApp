import React, { useRef, useState } from 'react';

import ConfirmDialog from '../Project/ConfirmDialog';

const MODE_CREATE = 'create';
const MODE_RENAME = 'rename';

// Deck select plus New, Rename and Delete. Name entry is inline: Enter saves,
// Escape cancels. A failed call keeps the input open and shows its message.
const DeckBar = ({ decks, deckId, onSelect, onCreate, onRename, onDelete, onPromote, onExport, onImport }) => {
    const fileInput = useRef(null);
    const [mode, setMode] = useState(null);
    const [name, setName] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const [message, setMessage] = useState(null);
    const openDeck = decks.find((d) => d.id === deckId);

    const startEditing = (nextMode, initial) => {
        setMessage(null);
        setName(initial);
        setMode(nextMode);
    };

    const attempt = async (action) => {
        setMessage(null);
        try {
            await action();
            return true;
        } catch (err) {
            setMessage(err.message);
            return false;
        }
    };

    const save = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const isSaved = await attempt(() => (mode === MODE_CREATE ? onCreate(trimmed) : onRename(trimmed)));
        if (isSaved) setMode(null);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            save();
        } else if (event.key === 'Escape') {
            setMode(null);
        }
    };

    const confirmDelete = async () => {
        setIsConfirming(false);
        await attempt(onDelete);
    };

    return (
        <div className="deck-controls">
            <select
                aria-label="Deck"
                value={deckId ?? ''}
                onChange={(event) => onSelect(Number(event.target.value))}
            >
                {decks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {mode && (
                <input
                    aria-label="Deck name"
                    value={name}
                    autoFocus
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={handleKeyDown}
                />
            )}
            <button type="button" onClick={() => startEditing(MODE_CREATE, '')}>New deck</button>
            <button
                type="button"
                disabled={!openDeck}
                onClick={() => startEditing(MODE_RENAME, openDeck.name)}
            >
                Rename
            </button>
            <button
                type="button"
                className="danger"
                disabled={!openDeck}
                onClick={() => setIsConfirming(true)}
            >
                Delete deck
            </button>
            <button type="button" disabled={!openDeck} onClick={() => attempt(onPromote)}>
                New deck from done pairs
            </button>
            <button type="button" disabled={!openDeck} onClick={() => attempt(onExport)}>Export JSON</button>
            <button type="button" onClick={() => fileInput.current.click()}>Import JSON</button>
            <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="Import file"
                onChange={(event) => {
                    const [file] = event.target.files;
                    event.target.value = '';
                    if (file) onImport(file);
                }}
            />
            {message && <p className="deck-error" role="alert">{message}</p>}
            {isConfirming && (
                <ConfirmDialog
                    title="Delete deck"
                    message={`Delete "${openDeck.name}" and all its cards and pairs?`}
                    confirmLabel="Delete deck"
                    onConfirm={confirmDelete}
                    onCancel={() => setIsConfirming(false)}
                />
            )}
        </div>
    );
};

export default DeckBar;
