import React from 'react';
import { Link, useParams } from 'react-router-dom';

import useIsPhone from '../../hooks/useIsPhone';
import useProjectThoughts from '../../hooks/useProjectThoughts';
import '../Styling/ProjectThoughts.css';

const MAX_LENGTH = 20000;
const CONFLICT_MESSAGE = 'These thoughts changed somewhere else. Copy anything you need, then reload.';

const statusLabel = (saveState) => {
    if (saveState === 'saving') return 'Saving…';
    if (saveState === 'saved') return 'Saved';
    return 'Not saved';
};

const ProjectThoughtsPage = () => {
    const { id } = useParams();
    const isPhone = useIsPhone();
    const { status, text, projectTitle, saveState, error, setText, reload } = useProjectThoughts(id);

    const className = isPhone
        ? 'project-thoughts-page project-thoughts-page--phone'
        : 'project-thoughts-page';

    return (
        <main className={className}>
            <header className="project-thoughts-header">
                <Link className="neon-button" to={`/projects/${id}`}>← Back to project</Link>
                <h1>Thoughts</h1>
                <p className="project-thoughts-title">{projectTitle}</p>
            </header>

            {status === 'loading' && <p>Loading thoughts…</p>}

            {status === 'error' && (
                <div>
                    <p role="alert" className="project-thoughts-error">{error}</p>
                    <button type="button" className="neon-button" onClick={reload}>Try again</button>
                </div>
            )}

            {status === 'ready' && (
                <>
                    {saveState === 'conflict' && (
                        <div role="alert" className="project-thoughts-error">
                            <p>{CONFLICT_MESSAGE}</p>
                            <button type="button" className="neon-button" onClick={reload}>Reload</button>
                        </div>
                    )}
                    <textarea
                        className="project-thoughts-input"
                        aria-label="Project thoughts"
                        placeholder="Ideas, wishes and fixes for this project…"
                        maxLength={MAX_LENGTH}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                    />
                    <p role="status" className="project-thoughts-status">
                        {statusLabel(saveState)}
                        {error && saveState === 'error' ? ` ${error}` : ''}
                    </p>
                </>
            )}
        </main>
    );
};

export default ProjectThoughtsPage;
