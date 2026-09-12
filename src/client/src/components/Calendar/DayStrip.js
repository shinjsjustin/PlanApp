import React from 'react';

import DayColumn from './DayColumn';
import { useCalendarContext } from '../../state/CalendarContext';

// The strip of days, left to right, scrolling sideways as it grows — the same
// treatment the 2026-09-07 spec gave layers, and for the same reason: columns
// that squeezed to fit would stop being readable at the fourth one.
//
// Days are already in order in the state, because the calendar keeps them as a
// list rather than keyed by id. Nothing here sorts.

const ADD_WHILE_SAVING_TITLE =
    'The day you just added is still saving. The + comes back when it lands.';

// `schedule` is what a drag in flight is previewing — the settled result of the
// gesture as it stands, computed by `lib/schedule`. It is rendered instead of the
// state so the strip shows what a release would actually save. Absent, the strip
// draws the calendar as it is, which is every render but a drag.
const DayStrip = ({ schedule = null, onOpenSource, columnFor = null }) => {
    const { state, addDay, hasUnsavedDay } = useCalendarContext();

    const shown = schedule ?? state;

    const itemsOf = (dayId) => shown.items.filter((item) => item.dayId === dayId);

    if (shown.days.length === 0) {
        return (
            <section className="calendar-strip calendar-strip--empty" aria-label="Days">
                <p>No days yet.</p>
                <p>A day is one 24-hour slab to schedule work into.</p>
                <button type="button" onClick={addDay}>
                    Add the first day
                </button>
            </section>
        );
    }

    return (
        <section className="calendar-strip" aria-label="Days">
            {shown.days.map((day, index) =>
                columnFor ? (
                    columnFor(day, index, itemsOf(day.id))
                ) : (
                    <DayColumn
                        key={day.id}
                        day={day}
                        index={index}
                        items={itemsOf(day.id)}
                        onOpenSource={onOpenSource}
                    />
                )
            )}

            {/* Disabled while any day is still waiting for its id, rather than
                left live and its click dropped. A second + before the first POST
                lands would put two days in the strip that `toBulkRequest` cannot
                tell apart, which is the interleaving `useCalendar`'s
                `hasUnsavedDay` note describes — and a button that visibly does
                nothing reads as a bug, so the `title` says which it is. The wait
                is one round trip. */}
            <button
                type="button"
                className="calendar-strip-add"
                aria-label="Add a day"
                onClick={addDay}
                disabled={hasUnsavedDay}
                title={hasUnsavedDay ? ADD_WHILE_SAVING_TITLE : undefined}
            >
                +
            </button>
        </section>
    );
};

export default DayStrip;
