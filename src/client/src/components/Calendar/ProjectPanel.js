import React from 'react';

import ProjectAccordionCard from './ProjectAccordionCard';
import { POOL_STATUS } from '../../hooks/usePool';

// The right panel: every project, with the work it says can be started now.
//
// Its own loading and failure states rather than the page's. The calendar and
// the pool are separate requests and either can fail alone; a calendar you cannot
// schedule into is still worth reading (design section 10).
//
// `scheduledByTodoId` maps a to-do id to where it was booked. It comes from the
// calendar rather than from here, because the pool has no idea what a day is —
// and is `null` while the calendar has not loaded, meaning unknown rather than
// none.

const ProjectPanel = ({ pool, scheduledByTodoId, dragFor = null, overlay = null }) => (
    <section className="calendar-panel" aria-label="Projects">
        {overlay}

        {/* A re-read that failed behind the rows. Mounted permanently and
            toggling `hidden` for the same reason the calendar's toast is: a live
            region inserted into the DOM already holding its message is not
            reliably announced; one that is already there when the text changes
            is. The rows below it are the last thing the server actually said,
            and they stay. */}
        <div className="pool-notice" role="alert" hidden={!pool.refreshError}>
            {pool.refreshError}
        </div>

        {pool.status === POOL_STATUS.loading && (
            <p className="pool-loading" role="status" aria-label="Loading projects…">
                Loading projects…
            </p>
        )}

        {pool.status === POOL_STATUS.error && (
            <div className="pool-error">
                <p role="alert">{pool.loadError}</p>
                <button type="button" onClick={pool.reload}>
                    Try again
                </button>
            </div>
        )}

        {pool.status === POOL_STATUS.ready &&
            (pool.projects.length === 0 ? (
                <p className="pool-empty">No projects yet.</p>
            ) : (
                <ul className="pool-cards">
                    {pool.projects.map((project) => (
                        <ProjectAccordionCard
                            key={project.id}
                            project={project}
                            scheduledByTodoId={scheduledByTodoId}
                            dragFor={dragFor}
                        />
                    ))}
                </ul>
            ))}
    </section>
);

export default ProjectPanel;
