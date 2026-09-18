import React from 'react';

import { SLOTS_PER_DAY, hourLabels } from '../../lib/scheduleGeometry';
import { useDayGeometry } from '../../state/DayScaleContext';

// The backdrop of one day: an hour gutter down the side and a half-hour rule
// across it, exactly one day tall — at whatever scale the window gave it.
//
// Purely decorative, and marked so. The grid is not a set of drop targets — a
// column is one droppable and the minute is worked out from where the pointer
// actually is (Task 25), which is both 48 fewer droppables per day and the only
// way a drop can land on a boundary the eye can see. Announcing 48 empty
// gridlines to a screen reader would be noise.
//
// Bookings are rendered as children, positioned absolutely over this.

const DayGrid = ({ children }) => {
    const geometry = useDayGeometry();

    return (
        <div className="day-grid" style={{ height: `${geometry.dayHeightPx}px` }}>
            <div className="day-grid-gutter" aria-hidden="true">
                {hourLabels().map(({ minutes, label }) => (
                    <div
                        key={minutes}
                        className="day-grid-hour"
                        style={{ top: `${geometry.minutesToPx(minutes)}px` }}
                    >
                        {label}
                    </div>
                ))}
            </div>

            <div className="day-grid-rules" aria-hidden="true">
                {Array.from({ length: SLOTS_PER_DAY }, (unused, slot) => (
                    <div
                        key={slot}
                        className={`day-grid-slot${slot % 2 === 0 ? ' day-grid-slot--hour' : ''}`}
                    />
                ))}
            </div>

            {children}
        </div>
    );
};

export default DayGrid;
