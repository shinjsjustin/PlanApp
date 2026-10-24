import React from 'react';

const COMBINATIONS = 'combinations';
const PERMUTATIONS = 'permutations';
const MODES = [
    { id: COMBINATIONS, label: 'Combinations' },
    { id: PERMUTATIONS, label: 'Permutations' },
];
const PLACEMENTS = [
    { label: 'X', axes: { onX: true, onY: false } },
    { label: 'Y', axes: { onX: false, onY: true } },
    { label: 'Both', axes: { onX: true, onY: true } },
];

// A missing flag counts as on.
const isOnX = (card) => card.onX !== false;
const isOnY = (card) => card.onY !== false;

const AxisTray = ({ cards, mode, setCardAxes, setMode }) => {
    // The hook already puts a refusal in its error, so the rejection is dropped here.
    const attempt = (call) => call().catch(() => {});

    const renderAxisChip = (card, axis) => {
        const axes = { onX: isOnX(card), onY: isOnY(card) };
        return (
            <li key={card.id} className="axis-chip">
                {card.name}
                <button
                    type="button"
                    aria-label={`Remove ${card.name} from ${axis}`}
                    onClick={() => attempt(() => setCardAxes(card.id, { ...axes, [`on${axis}`]: false }))}
                >
                    ×
                </button>
            </li>
        );
    };

    const renderTrayChip = (card) => (
        <li key={card.id} className="axis-chip">
            {card.name}
            {PLACEMENTS.map(({ label, axes }) => (
                <button
                    key={label}
                    type="button"
                    aria-label={`${card.name}: ${label}`}
                    onClick={() => attempt(() => setCardAxes(card.id, axes))}
                >
                    {label}
                </button>
            ))}
        </li>
    );

    const rows = [
        { label: 'X', chips: cards.filter(isOnX).map((c) => renderAxisChip(c, 'X')) },
        { label: 'Y', chips: cards.filter(isOnY).map((c) => renderAxisChip(c, 'Y')) },
        { label: 'Tray', chips: cards.filter((c) => !isOnX(c) && !isOnY(c)).map(renderTrayChip) },
    ];

    return (
        <div className="axis-tray">
            <div className="mode-toggle">
                {MODES.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={id === mode}
                        onClick={() => attempt(() => setMode(id))}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {rows.map(({ label, chips }) => (
                <div key={label} className="axis-row" role="group" aria-label={label}>
                    <span className="axis-label">{label}</span>
                    <ul>{chips}</ul>
                </div>
            ))}
        </div>
    );
};

export default AxisTray;
