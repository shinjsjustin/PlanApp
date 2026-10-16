import React, { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import GoogleConnectButton from './GoogleConnectButton';
import CalendarDragArea from './CalendarDragArea';
import PhoneCalendarView from './PhoneCalendarView';
import ProjectPanel from './ProjectPanel';
import ThoughtsLink from '../Navigation/ThoughtsLink';
import PlacesLink from '../Navigation/PlacesLink';
import useCalendar from '../../hooks/useCalendar';
import useCalendarEvents from '../../hooks/useCalendarEvents';
import useCalendarExport from '../../hooks/useCalendarExport';
import useCalendarNotes from '../../hooks/useCalendarNotes';
import { PlaceOptionsProvider } from '../../hooks/usePlaceOptions';
import useIsPhone from '../../hooks/useIsPhone';
import usePool from '../../hooks/usePool';
import { todayKey } from '../../lib/dates';
import { CALENDAR_STATUS } from '../../state/calendarReducer';
import { CalendarProvider } from '../../state/CalendarContext';
import '../Styling/Calendar.css';
import '../Styling/CalendarPhone.css';

// The calendar: a strip of day columns on the left, the pool of pinned work on
// the right (design section 8).
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
//
// The header also carries the Google connect control, which loads its own status.

const CalendarPage = () => {
    const navigate = useNavigate();
    const isPhone = useIsPhone();

    // The two hooks meet here and nowhere else: neither knows the other exists,
    // and the page is what tells the pool that a booking was ticked off, so the
    // same pinned row can refresh into its completed state.
    const pool = usePool();
    const notes = useCalendarNotes();
    const events = useCalendarEvents();
    const exporter = useCalendarExport();
    const calendar = useCalendar({
        onTodoCompleted: pool.refresh,
        // The server has already destroyed them through the schema's cascade
        // (design 2026-09-16, decision 9); this only drops the rows this tab is
        // still holding. On success only, so a rolled-back deletion brings the
        // column back with its notes intact.
        onDayDeleted: notes.pruneDay,
    });

    const { state, reload, dismissActionError, clearPastDays, hasUnsavedDay } = calendar;

    // One alert region for three hooks. Two live regions stacked above the strip
    // would be noise on a page that raises an error roughly never, and the
    // calendar's own message is the more urgent of the two when both are set.
    const actionError = state.actionError ?? notes.state.actionError ?? events.error ?? exporter.error;

    const dismissError = useCallback(() => {
        if (state.actionError) dismissActionError();
        else if (notes.state.actionError) notes.dismissActionError();
        else if (events.error) events.dismissError();
        else exporter.dismissError();
    }, [dismissActionError, notes, events, exporter, state.actionError]);

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
     * Both are read off the booking itself rather than looked up in the pool:
     * bookings remain useful even after their to-do is unpinned, and that is
     * exactly when a user may need to find its source.
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

    const isReady = state.status === CALENDAR_STATUS.ready;
    const hasDatedDay = state.days.some((day) => day.date);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const today = todayKey();
    const hasPastDay = state.days.some((day) => day.date && day.date < today);

    const headerControls = (
        <>
                {isReady && (
                    <button
                        type="button"
                        className="neon-button"
                        onClick={clearPastDays}
                        disabled={hasUnsavedDay || !hasPastDay}
                    >
                        Clear past days
                    </button>
                )}
                {isReady && (
                    <button
                        type="button"
                        className="neon-button"
                        onClick={events.importAll}
                        disabled={events.isImporting || !hasDatedDay}
                    >
                        Import Google events
                    </button>
                )}
                {isReady && (
                    <button
                        type="button"
                        className="neon-button"
                        onClick={exporter.exportAll}
                        disabled={exporter.isExporting || !hasDatedDay || hasUnsavedDay}
                    >
                        Export to Google
                    </button>
                )}
                <GoogleConnectButton />
        </>
    );

    return (
        <main className={isPhone ? 'calendar-page calendar-page--phone' : 'calendar-page'}>
            <header className="calendar-header">
                <h1>Calendar</h1>
                {!isPhone && (
                    <Link className="neon-button" to="/projects">← All projects</Link>
                )}
                <ThoughtsLink />
                <PlacesLink />
                {isPhone ? (
                    isReady && (
                    <>
                        <button
                            type="button"
                            className="neon-button"
                            aria-expanded={isMoreOpen}
                            onClick={() => setIsMoreOpen((open) => !open)}
                        >
                            More
                        </button>
                        {isMoreOpen && <div className="calendar-header-more">{headerControls}</div>}
                    </>
                    )
                ) : (
                    headerControls
                )}
                {/* Apart from the alert toast below, which is for action errors:
                    this one stays until a retry succeeds. */}
                {events.loadError && (
                    <div className="calendar-events-notice" role="status">
                        <span>{events.loadError}</span>
                        <button type="button" onClick={events.reload}>
                            Retry Google events
                        </button>
                    </div>
                )}
                {exporter.summary && (
                    <p className="calendar-export-summary" role="status">
                        {`Exported: ${exporter.summary.created} new, ${exporter.summary.updated} moved, ${exporter.summary.deleted} removed`}
                    </p>
                )}
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
                    <PlaceOptionsProvider>
                        {isPhone ? (
                            <PhoneCalendarView notes={notes} events={events} onOpenSource={openSource} />
                        ) : (
                            <CalendarDragArea
                                pool={pool}
                                notes={notes}
                                events={events}
                                onOpenSource={openSource}
                                expandedProjectIds={expandedProjectIds}
                                onToggleProject={toggleProject}
                            />
                        )}
                    </PlaceOptionsProvider>
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

                    {!isPhone && (
                        <ProjectPanel
                            pool={pool}
                            scheduledByTodoId={null}
                            scheduledBySequenceId={null}
                            onOpenSource={openSource}
                            expandedProjectIds={expandedProjectIds}
                            onToggleProject={toggleProject}
                        />
                    )}
                </div>
            )}
        </main>
    );
};

export default CalendarPage;
