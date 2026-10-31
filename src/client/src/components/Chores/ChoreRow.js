import React from 'react';

import { formatWindow } from '../../lib/choreForm';
import { lastDoneLabel } from '../../lib/choreGroups';
import '../Styling/Chores.css';

export default function ChoreRow({ chore, onDone, onEdit, onHistory }) {
    const details = [chore.area, formatWindow(chore.window), lastDoneLabel(chore)].filter(Boolean);
    const act = (handler) => () => handler(chore);

    return (
        <li className="chore-row">
            <div className="chore-title">
                <span>{chore.name}</span>
                {chore.status === 'overdue' && <span className="chore-badge chore-badge--overdue">Overdue</span>}
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
