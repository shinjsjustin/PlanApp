import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import DeleteBubble from '../common/DeleteBubble';

// One project in the home grid. The card owns its own rename and delete
// interactions and shows their failures inline; `onRename` and `onDelete` do the
// call and are expected to reject when it fails.
//
// At rest the card is the project's name and nothing else. Hovering it — or
// tabbing to its title — drops a panel down holding the overall to-do progress,
// the description, and the ready frontier: what can be started right now (spec
// section 4.8). The frontier itself is computed server-side, in
// `src/lib/frontier.js`; the card only renders what `GET /api/projects` hands it.
//
// The reveal is entirely CSS, in `Styling/Projects.css`. Nothing here knows
// whether the panel is open, because nothing here needs to: it holds no
// controls, and it stays in the accessibility tree whether it is showing or
// not — collapsed with `opacity`, deliberately not with `visibility`, which
// would take it out of the reading order along with the screen.

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

/**
 * What a frontier line says after the sequence's name.
 *
 * A ready sequence without a next to-do is two different situations, and calling
 * both of them "No to-dos yet" would say something false about the second:
 *   - it holds nothing at all — an empty sequence, waiting to be filled in;
 *   - it holds outstanding work and every piece of it is blocked, so there is
 *     nothing here to pick up even though the sequence itself is ready.
 * `isStalled` is what tells them apart; see `toFrontierEntry` in
 * `src/lib/serializers.js`, which is where the distinction is drawn.
 */
const nextStepOf = (entry) => {
    if (entry.nextTodo) return entry.nextTodo.text;

    return entry.isStalled ? 'Everything left here is blocked' : 'No to-dos yet';
};

/**
 * The body of the card: the ready frontier, or why there is nothing in it.
 *
 * An empty frontier has three quite different meanings, and running them
 * together would be the one thing this page exists to avoid:
 *   - no sequences at all — the project has not been planned yet;
 *   - sequences, none of them blocked, all of them complete — the project is
 *     done;
 *   - sequences, but everything still open is blocked, or waiting behind
 *     something blocked — the project is stuck, not finished.
 * `sequenceCount` and `blockedSequenceCount` are what tell the three apart:
 * no sequences beats everything else, then any blocked sequence beats
 * "complete", so a stuck project never reads as a finished one.
 */
const FrontierBlock = ({ project }) => {
    const headingId = `ready-now-${project.id}`;

    if (project.frontier.length === 0) {
        if (project.sequenceCount === 0) {
            return (
                <p className="project-card-unplanned">
                    No sequences yet — open the project to plan the first layer of work.
                </p>
            );
        }

        if (project.blockedSequenceCount > 0) {
            return (
                <p className="project-card-blocked">
                    Nothing can be started: what's left is blocked, or waiting on something
                    blocked.
                </p>
            );
        }

        return <p className="project-card-complete">Every sequence is complete. Nothing left to start.</p>;
    }

    return (
        <div className="project-card-frontier">
            <h4 className="project-card-frontier-heading" id={headingId}>
                Ready now
            </h4>
            <ul aria-labelledby={headingId}>
                {project.frontier.map((entry) => (
                    <li key={entry.sequenceId} className="frontier-line">
                        <span className="frontier-sequence">{entry.sequenceTitle}</span>
                        <span className="frontier-todo">{nextStepOf(entry)}</span>
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

                    {/* Everything but the name. A grid of twenty projects is a
                        list of names to choose from; the detail is what you want
                        about the one you are pointing at, not about all twenty
                        at once.

                        It stays in the DOM and in the accessibility tree
                        throughout — the collapse is visual density, not
                        information hiding, so nothing here is `hidden` and the
                        CSS is careful to keep it that way. Nothing in it is
                        interactive, which is what lets the whole panel be part
                        of the way into the project. */}
                    <div className="project-card-reveal">
                        {/* The panel is part of the card, so a click on it goes
                            where a click on the card face goes. The title's
                            stretched `::after` cannot reach here — it is
                            `inset: 0` on the card, and the panel hangs below
                            that box — so the panel carries the same hit area of
                            its own. Out of the reading order and out of the
                            accessibility tree: the title link already says where
                            this goes, and a second link saying it again is noise
                            to anyone not using a pointer. */}
                        <Link
                            className="project-card-reveal-link"
                            to={`/projects/${project.id}`}
                            tabIndex={-1}
                            aria-hidden="true"
                        />

                        <p className="project-card-progress">
                            {`${project.completedTodoCount}/${project.todoCount} to-dos done`}
                        </p>

                        {project.description && (
                            <p className="project-card-description">{project.description}</p>
                        )}

                        <FrontierBlock project={project} />
                    </div>
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
                    <div className={`project-card-actions ${RAISED}`}>
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
