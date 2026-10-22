import React from 'react';

import { getPair, pairKey } from '../../lib/combinations';

const STATE_SYMBOL = { empty: '·', drafted: '~', done: '✓', struck: '✕' };
const MAX_NAME_CHARS = 12;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const GridView = ({ cards, pairs, selectedKey, onOpen }) => {
    if (cards.length < 2) {
        return <p className="placeholder">Add at least two cards below to see their pairs.</p>;
    }

    const handleKeyDown = (event, key) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(key);
    };

    const renderCell = (row, col, i, j) => {
        if (i === j) return <td key={col.id} className="diag" />;
        if (i > j) return <td key={col.id} className="lower" />;
        const key = pairKey(row.id, col.id);
        const pair = getPair(pairs, row.id, col.id);
        const label = `${row.name} + ${col.name}: ${pair.state}${pair.name ? ` · ${pair.name}` : ''}`;
        const text = pair.name ? truncate(pair.name, MAX_NAME_CHARS) : STATE_SYMBOL[pair.state];
        return (
            <td
                key={col.id}
                className={`cell st-${pair.state}${key === selectedKey ? ' sel' : ''}`}
                tabIndex={0}
                role="button"
                title={label}
                aria-label={label}
                onClick={() => onOpen(key)}
                onKeyDown={(event) => handleKeyDown(event, key)}
            >
                {text}
            </td>
        );
    };

    return (
        <>
            <div className="grid-wrap">
                <table className="grid">
                    <thead>
                        <tr>
                            <th />
                            {cards.map((c) => <th key={c.id} scope="col" title={c.name}>{c.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {cards.map((row, i) => (
                            <tr key={row.id}>
                                <th scope="row" title={row.name}>{row.name}</th>
                                {cards.map((col, j) => renderCell(row, col, i, j))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="hint">Each cell above the diagonal is one pair. Click a cell to edit it.</p>
        </>
    );
};

export default GridView;
