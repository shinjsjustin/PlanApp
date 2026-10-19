import React from 'react';

import PanelSequenceRow from './PanelSequenceRow';
import { POOL_STATUS } from '../../hooks/usePool';
import { dayLabel, todayKey } from '../../lib/dates';

// The right panel: Justin's dated sequences, one group per day, each sequence a
// block with its to-dos inside.
//
// Its own loading and failure states rather than the page's. The calendar and
// the pool are separate requests and either can fail alone; a calendar you cannot
// schedule into is still worth reading (design section 10).
//
// `scheduledByTodoId` maps a to-do id to where it was booked. It comes from the
// calendar rather than from here, because the pool has no idea what a day is —
// and is `null` while the calendar has not loaded, meaning unknown rather than
// none.

const ProjectPanel = ({
    pool,
    scheduledByTodoId,
    scheduledBySequenceId = null,
    onOpenSource = null,
    dragFor = null,
    overlay = null,
    today = todayKey(),
}) => (
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
            (pool.days.length === 0 ? (
                <p className="pool-empty">No dated sequences ahead.</p>
            ) : (
                pool.days.map((day) => (
                    <div key={day.date} className="pool-day">
                        <h3 className="pool-day-heading">
                            {day.date === today ? 'Today' : dayLabel(day.date)}
                        </h3>
                        <ul className="pool-day-sequences">
                            {day.sequences.map((sequence) => (
                                <PanelSequenceRow
                                    key={sequence.sequenceId}
                                    item={sequence}
                                    scheduled={scheduledBySequenceId?.get(sequence.sequenceId) ?? null}
                                    scheduledByTodoId={scheduledByTodoId}
                                    dragFor={dragFor}
                                    onOpenSource={onOpenSource}
                                />
                            ))}
                        </ul>
                    </div>
                ))
            ))}
    </section>
);

export default ProjectPanel;
