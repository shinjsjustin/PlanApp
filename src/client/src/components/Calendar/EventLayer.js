import React from 'react';

import { DAY_MINUTES } from '../../lib/schedule';
import { formatTime } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';
import useFullTextTip from '../../hooks/useFullTextTip';
import FullTextTip from './FullTextTip';

// Imported Google events are fixed: shown, never edited, dragged or resized, and
// they never block a booking, so there is nothing here to grab or drop onto.
const EventBlock = ({ event }) => {
    const tip = useFullTextTip();
    const geometry = useDayGeometry();
    // A DST fall-back day can run past midnight; draw only the part that fits.
    const drawnMinutes = Math.min(event.durationMinutes, DAY_MINUTES - event.startMinutes);

    return (
        <div
            className="calendar-event"
            aria-label={`Google event: ${event.title}`}
            style={{
                top: `${geometry.minutesToPx(event.startMinutes)}px`,
                height: `${geometry.minutesToPx(drawnMinutes)}px`,
            }}
            ref={tip.anchorRef}
            {...tip.triggerProps}
        >
            <span className="calendar-event-title">{event.title}</span>
            <span className="calendar-event-time">
                {formatTime(event.startMinutes)}–{formatTime(event.startMinutes + drawnMinutes)}
            </span>
            <FullTextTip isOpen={tip.isOpen} tipId={tip.tipId} anchorRef={tip.anchorRef} text={event.title} />
        </div>
    );
};

/** The timed Google events of one day, drawn in the bookings half behind the cards. */
const EventLayer = ({ events }) =>
    events
        .filter((event) => !event.allDay)
        .map((event) => <EventBlock key={event.id} event={event} />);

export default EventLayer;
