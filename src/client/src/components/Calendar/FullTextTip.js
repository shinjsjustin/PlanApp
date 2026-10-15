import React from 'react';
import { createPortal } from 'react-dom';

import '../Styling/Calendar.css';

const TIP_GAP_PX = 4;

/** Full text of a clipped card or ribbon, portaled out of its overflow. */
const FullTextTip = ({ isOpen, tipId, anchorRef, text }) => {
    if (!isOpen) return null;
    const rect = anchorRef.current.getBoundingClientRect();
    return createPortal(
        <div
            id={tipId}
            className="full-text-tip"
            role="tooltip"
            style={{ position: 'fixed', left: rect.left, top: rect.bottom + TIP_GAP_PX }}
        >
            {text}
        </div>,
        document.body
    );
};

export default FullTextTip;
