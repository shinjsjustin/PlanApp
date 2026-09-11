import React from 'react';
import { Link } from 'react-router-dom';

import DayStrip from './DayStrip';
import ProjectPanel from './ProjectPanel';
import useCalendar from '../../hooks/useCalendar';
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
    const calendar = useCalendar();
    const pool = usePool();

    const { state, reload, dismissActionError } = calendar;

    const isLoading =
        state.status === CALENDAR_STATUS.idle || state.status === CALENDAR_STATUS.loading;

    // Where each booked to-do went, for the pool's badges and its count. Built
    // here because the pool has no idea what a day is.
    const scheduledByTodoId = new Map(
        state.items.map((item) => [
            item.todoId,
            { dayIndex: state.days.findIndex((day) => day.id === item.dayId) },
        ])
    );

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
            <div className="calendar-toast" role="alert" hidden={!state.actionError}>
                <p>{state.actionError}</p>
                <button type="button" onClick={dismissActionError} aria-label="Dismiss error">
                    Dismiss
                </button>
            </div>

            <div className="calendar-body">
                {isLoading && (
                    <p className="calendar-loading" role="status" aria-label="Loading calendar…">
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

                {state.status === CALENDAR_STATUS.ready && (
                    <CalendarProvider value={calendar}>
                        <DayStrip />
                    </CalendarProvider>
                )}

                <ProjectPanel pool={pool} scheduledByTodoId={scheduledByTodoId} />
            </div>
        </main>
    );
};

export default CalendarPage;
