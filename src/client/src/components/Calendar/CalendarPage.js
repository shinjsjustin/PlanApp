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
    // The two hooks meet here and nowhere else: neither knows the other exists,
    // and the page is what tells the pool that a booking was ticked off — the
    // frontier has moved on, so the sequence's next step is what belongs in the
    // panel now (design section “The bubble”).
    const pool = usePool();
    const calendar = useCalendar({ onTodoCompleted: pool.refresh });

    const { state, reload, dismissActionError } = calendar;

    const isLoading =
        state.status === CALENDAR_STATUS.idle || state.status === CALENDAR_STATUS.loading;

    // Where each booked to-do went, for the pool's badges and its count. Built
    // here because the pool has no idea what a day is.
    //
    // An item can name a day the payload does not carry — the two reads behind
    // /api/calendar are not snapshotted against each other. The strip draws no
    // such item, so the pool must not claim it is booked either: it is left out
    // of the map and its to-do reads as unscheduled, which is what the next load
    // shows anyway.
    //
    // `null` until the calendar is ready: it means nothing is known about where
    // the work went, which is not the same as knowing none of it is booked. The
    // panel stays up either way (design section 10), but with no calendar behind
    // it, it drops the badges and the count rather than reporting every booked
    // to-do as unscheduled. A successful retry brings both back.
    const scheduledByTodoId =
        state.status === CALENDAR_STATUS.ready
            ? new Map(
                  state.items.flatMap((item) => {
                      const dayIndex = state.days.findIndex((day) => day.id === item.dayId);

                      return dayIndex === -1 ? [] : [[item.todoId, { dayIndex }]];
                  })
              )
            : null;

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
