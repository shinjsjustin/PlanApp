import React from 'react';

import '../Styling/Rhythm.css';

const formatInZone = (iso, timeZone) =>
    new Intl.DateTimeFormat('en-US', {
        timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(iso));

const GateCard = ({ gate, timeZone, onClose }) => (
    <aside className="rhythm-card" aria-label={`Gate ${gate.title}`}>
        <h3 className="rhythm-card-title">{gate.title}</h3>
        <p>Kind: {gate.kind}</p>
        <p>
            Window: {formatInZone(gate.opensAt, timeZone)} to {formatInZone(gate.closesAt, timeZone)}
        </p>
        <p>State: {gate.state}</p>
        {gate.hubUrl && (
            <a href={gate.hubUrl} target="_blank" rel="noopener noreferrer">
                Open in Hub
            </a>
        )}
        <button type="button" className="rhythm-button" onClick={onClose}>Close</button>
    </aside>
);

export default GateCard;
