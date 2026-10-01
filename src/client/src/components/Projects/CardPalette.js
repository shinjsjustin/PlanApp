import React, { useEffect, useRef } from 'react';

import { PALETTE_ROWS } from '../../lib/cardPalette';

// A popover of card colors. Picking calls `onPick` with the hex, or null for
// Default; Escape or a mousedown outside it calls `onClose`.
const CardPalette = ({ onPick, onClose }) => {
    const ref = useRef(null);

    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') onClose();
        };
        const closeOnOutsideMouseDown = (event) => {
            if (!ref.current.contains(event.target)) onClose();
        };

        document.addEventListener('keydown', closeOnEscape);
        document.addEventListener('mousedown', closeOnOutsideMouseDown);

        return () => {
            document.removeEventListener('keydown', closeOnEscape);
            document.removeEventListener('mousedown', closeOnOutsideMouseDown);
        };
    }, [onClose]);

    return (
        <div ref={ref} className="card-palette" role="dialog" aria-label="Card color">
            <div className="card-palette-grid">
                {PALETTE_ROWS.flat().map(({ name, hex }) => (
                    <button
                        key={hex + name}
                        type="button"
                        className="card-palette-swatch"
                        style={{ background: hex }}
                        aria-label={name}
                        title={name}
                        onClick={() => onPick(hex)}
                    />
                ))}
            </div>
            <button type="button" className="card-palette-default" onClick={() => onPick(null)}>
                Default
            </button>
        </div>
    );
};

export default CardPalette;
