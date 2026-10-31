import React from 'react';

import { dayLabel } from '../../lib/dates';
import { livedTodayKey, weekBarSegments } from '../../lib/lived';
import '../Styling/Lived.css';

const HOUR_MARKS = [
    { label: '06', left: 0 },
    { label: '12', left: 33.333 },
    { label: '18', left: 66.667 },
    { label: '24', left: 100 },
];
const NO_MOMENTS = [];

const LivedWeekStrip = ({ days, momentsByDate, selected, onSelect }) => {
    const today = livedTodayKey();

    return (
        <div className="lived-shape">
            {days.map((day) => {
                // Days that haven't happened yet have nothing to show.
                const segments = day > today ? NO_MOMENTS : weekBarSegments(momentsByDate[day] ?? NO_MOMENTS);

                return (
                    <button
                        key={day}
                        type="button"
                        className="lived-shape-row"
                        aria-pressed={day === selected}
                        onClick={() => onSelect(day)}
                    >
                        <span className="lived-shape-day">{dayLabel(day)}</span>
                        <span className="lived-shape-bar">
                            {segments.map((segment) => (
                                <i
                                    key={segment.id}
                                    className={segment.category === 'drive' ? 'lived-shape-drive' : undefined}
                                    style={{
                                        '--c': `var(--lived-${segment.category})`,
                                        left: `${segment.left}%`,
                                        width: `${segment.width}%`,
                                    }}
                                />
                            ))}
                        </span>
                    </button>
                );
            })}
            <div className="lived-shape-hours">
                {HOUR_MARKS.map((mark) => (
                    <span key={mark.label} style={{ left: `${mark.left}%` }}>{mark.label}</span>
                ))}
            </div>
        </div>
    );
};

export default LivedWeekStrip;
