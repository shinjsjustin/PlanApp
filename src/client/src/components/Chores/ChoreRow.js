import React from 'react';

import { formatWindow } from '../../lib/choreForm';
import { lastDoneLabel } from '../../lib/choreGroups';
import '../Styling/Chores.css';

const CHIP_LABELS = { overdue: 'Overdue', due: 'Due now', upcoming: 'Coming up', never: 'Never done' };

export default function ChoreRow({ chore, isHighlighted, onDone, onEdit, onHistory }) {
    const details = [chore.area, formatWindow(chore.window), lastDoneLabel(chore)].filter(Boolean);
    const act = (handler) => () => handler(chore);

    return (
        <li id={`chore-${chore.id}`} className={isHighlighted ? 'chore-row chore-row--highlight' : 'chore-row'}>
            <div className="chore-title">
                <span>{chore.name}</span>
                <span className={`chore-chip chore-chip--${chore.status}`}>{CHIP_LABELS[chore.status]}</span>
            </div>
            <ul className="chore-details">
                {details.map((text) => <li key={text}>{text}</li>)}
            </ul>
            <div className="chore-actions">
                <button type="button" className="chore-done" onClick={act(onDone)}>Done</button>
                <button type="button" onClick={act(onEdit)}>Edit</button>
                <button type="button" onClick={act(onHistory)}>History</button>
            </div>
        </li>
    );
}
