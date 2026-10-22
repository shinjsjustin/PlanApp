import React, { useState } from 'react';

import useReminderSubcategories from '../../hooks/useReminderSubcategories';
import '../Styling/Places.css';
import '../Styling/Reminders.css';

const BLANK_MESSAGE = 'Name is required';
const DELETE_MESSAGE = 'Delete this subcategory? Reminders keep their place but lose it.';

const SubcategoryManager = ({ placeId, onChanged }) => {
    const { subcategories, error, add, rename, remove } = useReminderSubcategories(placeId);
    const [newName, setNewName] = useState('');
    const [editing, setEditing] = useState(null);
    const [blankFailed, setBlankFailed] = useState(false);

    const submitAdd = async (event) => {
        event.preventDefault();
        const name = newName.trim();
        setBlankFailed(!name);
        if (!name) return;
        if (await add({ name })) setNewName('');
    };

    const submitRename = async (event) => {
        event.preventDefault();
        const name = editing.name.trim();
        setBlankFailed(!name);
        if (!name) return;
        if (!(await rename(editing.id, name))) return;
        setEditing(null);
        onChanged();
    };

    const startRename = (subcategory) => {
        setBlankFailed(false);
        setEditing({ id: subcategory.id, label: subcategory.name, name: subcategory.name });
    };

    const confirmDelete = async (subcategory) => {
        if (!window.confirm(DELETE_MESSAGE)) return;
        if (await remove(subcategory.id)) onChanged();
    };

    const message = blankFailed ? BLANK_MESSAGE : error;

    return (
        <section className="subcategory-manager">
            <h2>Subcategories</h2>
            {message && <p role="alert" className="places-error">{message}</p>}
            <ul className="subcategory-list">
                {subcategories.map((subcategory) => (
                    <li key={subcategory.id}>
                        {editing?.id === subcategory.id ? (
                            <form onSubmit={submitRename}>
                                <input
                                    className="place-input"
                                    aria-label={`Rename ${editing.label}`}
                                    value={editing.name}
                                    onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                                />
                                <button type="submit" className="neon-button">Save</button>
                                <button type="button" className="neon-button" onClick={() => setEditing(null)}>Cancel</button>
                            </form>
                        ) : (
                            <>
                                <span>{subcategory.name}</span>
                                <button type="button" className="neon-button" onClick={() => startRename(subcategory)}>Rename</button>
                                <button type="button" className="neon-button" onClick={() => confirmDelete(subcategory)}>Delete</button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            <form onSubmit={submitAdd}>
                <label>
                    New subcategory
                    <input className="place-input" value={newName} onChange={(event) => setNewName(event.target.value)} />
                </label>
                <button type="submit" className="neon-button">Add</button>
            </form>
        </section>
    );
};

export default SubcategoryManager;
