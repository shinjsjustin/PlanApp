import React from 'react';
import { Link, useParams } from 'react-router-dom';

import Canvas from './Canvas';
import DragDropArea from './DragDropArea';
import UnorganizedPanel from './UnorganizedPanel';
import useProjectGraph from '../../hooks/useProjectGraph';
import useSequenceSpotlight from '../../hooks/useSequenceSpotlight';
import { PROJECT_STATUS } from '../../state/projectReducer';
import { ProjectProvider } from '../../state/ProjectContext';
import '../Styling/Project.css';
import '../Styling/SequenceCard.css';
import '../Styling/Todos.css';

// One project: the layered canvas, with the unorganized panel floating over it.
//
// The canvas is the page. It scrolls with the page and nothing inside it scrolls
// on its own, so there is one scrollbar and one place the wheel goes; the panel
// is an overlay pinned to the viewport rather than a column that would split the
// page in two.
//
// The whole graph arrives in a single request, so there is one loading state and
// one failure state for the page rather than one per collection. A failed load
// keeps a retry on screen instead of showing an empty canvas that looks like an
// empty project (spec section 5).

const ProjectPage = () => {
    const { id } = useParams();
    const graph = useProjectGraph(id);
    const { state, reload, dismissActionError } = graph;

    // Arriving from the calendar's "where did this come from?". The wait starts
    // from the graph being ready, because there is no card to flash before then.
    const highlightedSequenceId = useSequenceSpotlight(
        state.status === PROJECT_STATUS.ready
    );

    return (
        <main className="project-page">
            <header className="project-header">
                <Link to="/projects">← All projects</Link>
                {state.project && <h1>{state.project.title}</h1>}
                {state.project?.description && (
                    <p className="project-description">{state.project.description}</p>
                )}
            </header>

            {/* The toast stays mounted and toggles `hidden` rather than being
                conditionally rendered. A live region inserted into the DOM
                already holding its message is not reliably announced; one that
                is already there when the text changes is. */}
            <div className="project-toast" role="alert" hidden={!state.actionError}>
                <p>{state.actionError}</p>
                <button type="button" onClick={dismissActionError} aria-label="Dismiss error">
                    Dismiss
                </button>
            </div>

            {(state.status === PROJECT_STATUS.idle ||
                state.status === PROJECT_STATUS.loading) && (
                <p className="project-loading" role="status" aria-label="Loading project">
                    Loading project…
                </p>
            )}

            {state.status === PROJECT_STATUS.error && (
                <div className="project-error">
                    <p role="alert">{state.loadError}</p>
                    <button type="button" onClick={reload}>
                        Try again
                    </button>
                </div>
            )}

            {state.status === PROJECT_STATUS.ready && (
                <ProjectProvider value={graph}>
                    <DragDropArea>
                        <div className="project-body">
                            <UnorganizedPanel />
                            <Canvas highlightedSequenceId={highlightedSequenceId} />
                        </div>
                    </DragDropArea>
                </ProjectProvider>
            )}
        </main>
    );
};

export default ProjectPage;
