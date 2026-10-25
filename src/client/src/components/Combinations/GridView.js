import React from 'react';

import { axisCards, getPair, gridCells } from '../../lib/combinations';

const STATE_SYMBOL = { empty: '·', drafted: '~', done: '✓', struck: '✕' };
const MAX_NAME_CHARS = 12;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const GridView = ({ cards, pairs, mode, recipe = false, selectedKey, onOpen }) => {
    if (cards.length < 2) {
        return <p className="placeholder">Add at least two cards below to see their pairs.</p>;
    }
    const { rows, cols } = axisCards(cards);
    if (rows.length === 0 || cols.length === 0) {
        return <p className="placeholder">Add cards to both the X and Y axes to see their pairs.</p>;
    }

    const handleKeyDown = (event, key) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(key);
    };

    const renderCell = ({ row, col, kind, key }) => {
        if (kind === 'diag') return <td key={col.id} className="diag" />;
        const pair = getPair(pairs, row.id, col.id, mode);
        const isMirror = kind === 'mirror';
        const detail = `${pair.state}${pair.name ? ` · ${pair.name}` : ''}`;
        const label = isMirror
            ? `${row.name} + ${col.name} (same as ${col.name} + ${row.name}): ${detail}`
            : `${row.name} + ${col.name}: ${detail}`;
        const text = pair.name ? truncate(pair.name, MAX_NAME_CHARS) : STATE_SYMBOL[pair.state];
        return (
            <td
                key={col.id}
                className={`${isMirror ? 'lower mirror' : 'cell'} st-${pair.state}${key === selectedKey && !isMirror ? ' sel' : ''}`}
                tabIndex={0}
                role="button"
                title={label}
                aria-label={label}
                onClick={() => onOpen(key)}
                onKeyDown={(event) => handleKeyDown(event, key)}
            >
                {isMirror ? null : text}
            </td>
        );
    };

    const cells = gridCells(cards, mode, recipe);

    return (
        <>
            <div className="grid-wrap">
                <table className="grid">
                    <thead>
                        <tr>
                            <th />
                            {cols.map((c) => <th key={c.id} scope="col" title={c.name}>{c.name}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                <th scope="row" title={row.name}>{row.name}</th>
                                {cells.filter((cell) => cell.row.id === row.id).map(renderCell)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="hint">
                {recipe
                    ? 'Each cell is a recipe, including the diagonal. Click a cell to edit it.'
                    : mode === 'permutations'
                    ? 'Each cell is one pair, row then column. Click a cell to edit it.'
                    : 'Each cell above the diagonal is one pair. Click a cell to edit it.'}
            </p>
        </>
    );
};

export default GridView;
