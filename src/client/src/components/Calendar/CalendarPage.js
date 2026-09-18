import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import CalendarDragArea from './CalendarDragArea';
import ProjectPanel from './ProjectPanel';
import useCalendar from '../../hooks/useCalendar';
import useCalendarNotes from '../../hooks/useCalendarNotes';
import usePool from '../../hooks/usePool';
import { CALENDAR_STATUS } from '../../state/calendarReducer';
import { CalendarProvider } from '../../state/CalendarContext';
import '../Styling/Calendar.css';

// The calendar: a strip of day columns on the left, the pool of startable work
// on the right (design section 8).
//
// Two requests, two failure states. The calendar and the pool are loaded
// separately and each reports its own trouble in its own panel, because a
// calendar you cannot schedule into is still worth reading and a pool you cannot
// drag from is still worth seeing. So the panel is rendered whatever the
// calendar's status is, and reports the pool's own status inside itself; only
// the strip waits on the calendar, because there is nothing to draw without it.
//
// A failed calendar load keeps a retry on screen rather than rendering an empty
// strip, which would be indistinguishable from a calendar with no days in it.

const CalendarPage = () => {
    const navigate = useNavigate();

    // The two hooks meet here and nowhere else: neither knows the other exists,
    // and the page is what tells the pool that a booking was ticked off — the
    // frontier has moved on, so the sequence's next step is what belongs in the
    // panel now (design section “The bubble”).
    const pool = usePool();
    const notes = useCalendarNotes();
    const calendar = useCalendar({
        onTodoCompleted: pool.refresh,
        // The server has already destroyed them through the schema's cascade
        // (design 2026-09-16, decision 9); this only drops the rows this tab is
        // still holding. On success only, so a rolled-back deletion brings the
        // column back with its notes intact.
        onDayDeleted: notes.pruneDay,
    });

    const { state, reload, dismissActionError } = calendar;

    // One alert region for three hooks. Two live regions stacked above the strip
    // would be noise on a page that raises an error roughly never, and the
    // calendar's own message is the more urgent of the two when both are set.
    const actionError = state.actionError ?? notes.state.actionError;

    const dismissError = useCallback(() => {
        if (state.actionError) dismissActionError();
        else notes.dismissActionError();
    }, [dismissActionError, notes, state.actionError]);

    // Which cards are open has to outlive the ready/error branch: the panel is
    // rendered on both sides of it, so a retry remounts it. Held here, where
    // nothing remounts, a failed load that succeeds on retry comes back with the
    // same cards the user left open.
    const [expandedProjectIds, setExpandedProjectIds] = useState(() => new Set());

    const toggleProject = useCallback((projectId) => {
        setExpandedProjectIds((open) => {
            const next = new Set(open);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next; // a new Set every time; never mutate the old one
        });
    }, []);

    /**
     * "Where did this come from?" — the project, and the sequence within it.
     *
     * Both are read off the booking itself rather than looked up in the pool: a
     * completed to-do has left the frontier and is no longer in the pool, and it
     * is exactly then that a user is most likely to ask.
     *
     * A booking whose to-do has since been returned to the unorganized panel has
     * no sequence to point at, so it simply arrives at the project.
     */
    const openSource = useCallback(
        (item) =>
            navigate(
                item.sequenceId
                    ? `/projects/${item.projectId}?sequence=${item.sequenceId}`
                    : `/projects/${item.projectId}`
            ),
        [navigate]
    );

    const isLoading =
        state.status === CALENDAR_STATUS.idle || state.status === CALENDAR_STATUS.loading;

    return (
        <main className="calendar-page">
            <header className="calendar-header">
                <h1>Calendar</h1>
                <Link to="/projects">← All projects</Link>
            </header>

            {/* Stays mounted and toggles `hidden` rather than being conditionally
                rendered: a live region inserted into the DOM already holding its
                message is not reliably announced; one that is already there when
                the text changes is. */}
            <div className="calendar-toast" role="alert" hidden={!actionError}>
                <p>{actionError}</p>
                <button type="button" onClick={dismissError} aria-label="Dismiss error">
                    Dismiss
                </button>
            </div>

            {/* Where each booked to-do went is the drag area's to say, not this
                page's: during a drag the answer is the preview, and only the one
                place that computes it knows that. So the ready branch hands over
                both panels whole.

                Until then there is no calendar to ask, and `null` says exactly
                that — nothing is known about where the work went, which is not
                the same as knowing none of it is booked. The panel stays up
                either way (design section 10), but with no calendar behind it, it
                drops the badges and the count rather than reporting every booked
                to-do as unscheduled. A successful retry brings both back. */}
            {state.status === CALENDAR_STATUS.ready ? (
                <CalendarProvider value={calendar}>
                    <CalendarDragArea
                        pool={pool}
                        notes={notes}
                        onOpenSource={openSource}
                        expandedProjectIds={expandedProjectIds}
                        onToggleProject={toggleProject}
                    />
                </CalendarProvider>
            ) : (
                <div className="calendar-body">
                    {isLoading && (
                        <p
                            className="calendar-loading"
                            role="status"
                            aria-label="Loading calendar…"
                        >
                            Loading calendar…
                        </p>
                    )}

                    {state.status === CALENDAR_STATUS.error && (
                        <div className="calendar-error">
                            <p role="alert">{state.loadError}</p>
                            <button type="button" onClick={reload}>
                                Try again
                            </button>
                        </div>
                    )}

                    <ProjectPanel
                        pool={pool}
                        scheduledByTodoId={null}
                        expandedProjectIds={expandedProjectIds}
                        onToggleProject={toggleProject}
                    />
                </div>
            )}
        </main>
    );
};

export default CalendarPage;
