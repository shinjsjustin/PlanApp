import React, { useEffect } from 'react';

import { CATEGORIES, formatMinutes } from '../../lib/lived';
import '../Styling/Lived.css';

const LivedMomentSheet = ({ moment, onClose }) => {
    useEffect(() => {
        if (!moment) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);

        return () => document.removeEventListener('keydown', onKeyDown);
    }, [moment, onClose]);

    if (!moment) return null;

    const label = CATEGORIES.find((category) => category.key === moment.category)?.label;
    const range = `${formatMinutes(moment.startMinutes)}-${formatMinutes(moment.startMinutes + moment.durationMinutes)}`;

    return (
        <div
            className="lived-sheet"
            role="dialog"
            aria-label={moment.title}
            style={{ '--c': `var(--lived-${moment.category})` }}
        >
            <button type="button" className="lived-sheet-close" aria-label="Close" onClick={onClose}>
                ×
            </button>
            <h3>{moment.title}</h3>
            <p className="lived-sheet-meta">{range} · <b>{label}</b></p>
            {moment.detail && <p className="lived-sheet-detail">{moment.detail}</p>}
        </div>
    );
};

export default LivedMomentSheet;
