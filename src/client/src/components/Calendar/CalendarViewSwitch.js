import React from 'react';

import '../Styling/Lived.css';

const VIEW_OPTIONS = [
    { view: 'lived', label: 'Lived' },
    { view: 'plan', label: 'Plan' },
];

const CalendarViewSwitch = ({ value, onChange }) => (
    <div className="lived-seg" role="group" aria-label="Calendar view">
        {VIEW_OPTIONS.map(({ view, label }) => (
            <button
                key={view}
                type="button"
                aria-pressed={value === view}
                onClick={() => onChange(view)}
            >
                {label}
            </button>
        ))}
    </div>
);

export default CalendarViewSwitch;
