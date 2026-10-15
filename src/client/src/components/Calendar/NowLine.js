import React from 'react';

import useCurrentSlot from '../../hooks/useCurrentSlot';
import { useDayGeometry } from '../../state/DayScaleContext';

// A rule across today's grid at the current slot. It owns its clock, so a
// column left open past a slot boundary or midnight stays right.
const NowLine = ({ date }) => {
    const { today, slotMinutes } = useCurrentSlot();
    const geometry = useDayGeometry();

    if (date !== today) return null;

    return (
        <div
            className="now-line"
            aria-hidden="true"
            data-minutes={slotMinutes}
            style={{ top: geometry.minutesToPx(slotMinutes) }}
        />
    );
};

export default NowLine;
