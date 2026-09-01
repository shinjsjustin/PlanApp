import React, { useState } from 'react';

// The create-project form. It owns its own fields and its own error line: if the
// creation fails the dialog stays open with the typed values intact, so nothing
// has to be retyped. `onCreate` is expected to reject on failure.
const CreateProjectDialog = ({ onCreate, onCancel }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();

        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            setError('A title is required.');
            return;
        }

        setError('');
        setIsSaving(true);

        try {
            await onCreate({ title: trimmedTitle, description: description.trim() });
        } catch (err) {
            setError(err.message);
            setIsSaving(false);
        }
    };

    return (
        <div className="dialog-backdrop">
            <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-heading">
                <h2 id="create-project-heading">New project</h2>

                <form className="dialog-form" onSubmit={handleSubmit} noValidate>
                    <label htmlFor="new-project-title">Title</label>
                    <input
                        id="new-project-title"
                        type="text"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        autoFocus
                    />

                    <label htmlFor="new-project-description">Description (optional)</label>
                    <textarea
                        id="new-project-description"
                        rows={3}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                    />

                    {error && (
                        <p className="field-error" role="alert">
                            {error}
                        </p>
                    )}

                    <div className="dialog-actions">
                        <button type="submit" disabled={isSaving}>
                            {isSaving ? 'Creating…' : 'Create project'}
                        </button>
                        <button type="button" onClick={onCancel} disabled={isSaving}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProjectDialog;
