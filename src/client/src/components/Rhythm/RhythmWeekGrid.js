import React, { useState } from 'react';

import { DAYS, anchorsByDay, gateSegments } from '../../lib/rhythmWeek';
import '../Styling/Rhythm.css';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES_PER_DAY = 1440;
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const percentOfDay = (minutes) => `${(minutes / MINUTES_PER_DAY) * 100}%`;

const RhythmWeekGrid = ({ anchors, gates, weekKey, timeZone, isPhone, onSelectAnchor, onSelectGate }) => {
    const [phoneDay, setPhoneDay] = useState(DAYS[0]);
    const byDay = anchorsByDay(anchors);
    const segments = gateSegments(gates, weekKey, timeZone);
    const shownDays = isPhone ? [phoneDay] : DAYS;

    return (
        <div className="rhythm-grid-wrap">
            {isPhone && (
                <div className="rhythm-day-picker" role="group" aria-label="Day">
                    {DAYS.map((day) => (
                        <button
                            key={day}
                            type="button"
                            className="rhythm-button"
                            aria-pressed={day === phoneDay}
                            onClick={() => setPhoneDay(day)}
                        >
                            {DAY_LABELS[day]}
                        </button>
                    ))}
                </div>
            )}
            <div className="rhythm-grid">
                <div className="rhythm-gutter">
                    {HOURS.map((hour) => (
                        <span key={hour} className="rhythm-hour" style={{ top: percentOfDay(hour * 60) }}>
                            {String(hour).padStart(2, '0')}:00
                        </span>
                    ))}
                </div>
                {shownDays.map((day) => (
                    <div key={day} className="rhythm-column">
                        <div className="rhythm-column-head">{DAY_LABELS[day]}</div>
                        <div className="rhythm-lane">
                            {HOURS.map((hour) => (
                                <div key={hour} className="rhythm-row" style={{ top: percentOfDay(hour * 60) }} />
                            ))}
                            {segments.filter((s) => s.day === day).map((s) => (
                                <button
                                    key={`${s.gate.id}-${day}`}
                                    type="button"
                                    className="rhythm-gate"
                                    aria-label={`Gate ${s.gate.title}, ${s.gate.state}`}
                                    style={{ top: percentOfDay(s.startMin), height: percentOfDay(s.endMin - s.startMin) }}
                                    onClick={() => onSelectGate(s.gate)}
                                >
                                    <span className="rhythm-gate-title">{s.gate.title}</span>
                                    {s.closes && <span className="rhythm-gate-close" aria-label="Closes here">close</span>}
                                </button>
                            ))}
                            {byDay[day].map((anchor) => (
                                <button
                                    key={anchor.id}
                                    type="button"
                                    className={`rhythm-anchor${anchor.disabled ? ' rhythm-anchor-off' : ''}`}
                                    aria-label={`${anchor.title} at ${anchor.time}${anchor.disabled ? ', off' : ''}`}
                                    style={{ top: percentOfDay(anchor.minutes) }}
                                    onClick={() => onSelectAnchor(anchor)}
                                >
                                    {anchor.title} {anchor.time}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RhythmWeekGrid;
