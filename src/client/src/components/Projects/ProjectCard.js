import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import DeleteBubble from '../common/DeleteBubble';

// One project in the home grid. The card owns its own rename and delete
// interactions and shows their failures inline; `onRename` and `onDelete` do the
// call and are expected to reject when it fails.
//
// The card is fully expanded: title, overall to-do progress, description and the
// to-dos the user pinned are always in normal flow. The server supplies pins in
// project order; the card preserves that order rather than inventing a second
// priority model. Only Rename is hover-revealed, in `Styling/Projects.css`.

const MODES = { idle: 'idle', renaming: 'renaming', confirmingDelete: 'confirmingDelete' };

// The card is one big link: the title's `::after` is stretched over the whole of
// it in `Projects.css`, so a click anywhere lands on the way into the project.
// Two classes hold up the other half of that bargain — `RAISED` lifts a control
// back above the overlay so it keeps its own clicks, and `EDITING` withdraws the
// overlay entirely while a form is open over the card.
const RAISED = 'project-card-raised';
const EDITING = 'project-card--editing';

// Opts the card into the shared hover reveal in `Styling/DeleteBubble.css`. The
// bubble raises itself above the stretched link rather than borrowing `RAISED`,
// which would fight it for `position`.
const HAS_BUBBLE = 'has-delete-bubble';

const PinnedBlock = ({ project }) => {
    const headingId = `pinned-${project.id}`;

    if (project.pinnedTodos.length === 0) {
        return <p className="project-card-pins-empty">No pinned to-dos yet.</p>;
    }

    return (
        <div className="project-card-pins">
            <h4 className="project-card-pins-heading" id={headingId}>Pinned</h4>
            <ul aria-labelledby={headingId}>
                {project.pinnedTodos.map((todo) => (
                    <li
                        key={todo.id}
                        className={`pinned-line pinned-line--${todo.status}`}
                    >
                        <span className="project-card-pin-icon" aria-hidden="true">📌</span>
                        <span className="pinned-todo">{todo.text}</span>
                        <span className="pinned-sequence">
                            {todo.sequenceTitle ?? 'Unorganized'}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const ProjectCard = ({ project, onRename, onDelete }) => {
    const [mode, setMode] = useState(MODES.idle);
    const [draftTitle, setDraftTitle] = useState(project.title);
    const [error, setError] = useState('');
    const [isBusy, setIsBusy] = useState(false);

    const titleFieldId = `project-title-${project.id}`;
    const cardClassName = [
        'project-card',
        HAS_BUBBLE,
        mode === MODES.idle ? '' : EDITING,
    ]
        .filter(Boolean)
        .join(' ');

    const startRenaming = () => {
        setDraftTitle(project.title);
        setError('');
        setMode(MODES.renaming);
    };

    const cancel = () => {
        setError('');
        setMode(MODES.idle);
    };

    const submitRename = async (event) => {
        event.preventDefault();

        const trimmed = draftTitle.trim();
        if (!trimmed) {
            setError('A title is required.');
            return;
        }

        setError('');
        setIsBusy(true);

        try {
            await onRename(project.id, trimmed);
            setMode(MODES.idle);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsBusy(false);
        }
    };

    const confirmDelete = async () => {
        setError('');
        setIsBusy(true);

        try {
            await onDelete(project.id);
        } catch (err) {
            setError(err.message);
            setMode(MODES.idle);
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <li className={cardClassName}>
            {mode === MODES.renaming ? (
                <form className={`project-card-rename ${RAISED}`} onSubmit={submitRename} noValidate>
                    <label htmlFor={titleFieldId}>Project title</label>
                    <input
                        id={titleFieldId}
                        type="text"
                        value={draftTitle}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        autoComplete="off"
                        autoFocus
                    />
                    <div className="project-card-actions">
                        <button type="submit" disabled={isBusy}>
                            Save
                        </button>
                        <button type="button" onClick={cancel} disabled={isBusy}>
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <>
                    <div className="project-card-heading">
                        <h3 className="project-card-title">
                            <Link to={`/projects/${project.id}`}>{project.title}</Link>
                        </h3>
                    </div>

                    <p className="project-card-progress">
                        {`${project.completedTodoCount}/${project.todoCount} to-dos done`}
                    </p>

                    {project.description && (
                        <p className="project-card-description">{project.description}</p>
                    )}

                    <PinnedBlock project={project} />
                </>
            )}

            {error && (
                <p className={`field-error ${RAISED}`} role="alert">
                    {error}
                </p>
            )}

            {/* Both idle-only, like the actions row always was: while a form is
                open over the card, deleting is not one of the choices. */}
            {mode === MODES.idle && (
                <>
                    <div className={`project-card-actions project-card-hover-control ${RAISED}`}>
                        <button type="button" onClick={startRenaming}>
                            Rename
                        </button>
                    </div>

                    {/* The same inline confirmation the Delete button opened. */}
                    <DeleteBubble
                        label={`Delete “${project.title}”`}
                        onDelete={() => setMode(MODES.confirmingDelete)}
                    />
                </>
            )}

            {mode === MODES.confirmingDelete && (
                <div className={`project-card-confirm ${RAISED}`}>
                    <p>{`Delete “${project.title}”? This removes everything inside it.`}</p>
                    <div className="project-card-actions">
                        <button type="button" onClick={confirmDelete} disabled={isBusy}>
                            Yes, delete it
                        </button>
                        <button type="button" onClick={cancel} disabled={isBusy}>
                            Keep it
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
};

export default ProjectCard;
