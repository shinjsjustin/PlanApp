import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import '../Styling/ContextMenu.css';

const ContextMenu = ({ x, y, label, items, onClose }) => {
    const menuRef = useRef(null);

    useEffect(() => {
        menuRef.current.querySelector('[role="menuitem"]').focus();
    }, []);

    useEffect(() => {
        const closeOnOutside = (event) => {
            if (!menuRef.current.contains(event.target)) onClose();
        };
        document.addEventListener('pointerdown', closeOnOutside);
        return () => document.removeEventListener('pointerdown', closeOnOutside);
    }, [onClose]);

    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            onClose();
            return;
        }
        const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const buttons = Array.from(menuRef.current.querySelectorAll('[role="menuitem"]'));
        const next = (buttons.indexOf(document.activeElement) + step + buttons.length) % buttons.length;
        buttons[next].focus();
    };

    return createPortal(
        <div
            ref={menuRef}
            className="context-menu"
            role="menu"
            aria-label={label}
            style={{ left: x, top: y }}
            onKeyDown={onKeyDown}
        >
            {items.map((item) => (
                <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    className="context-menu-item"
                    onClick={() => {
                        item.onSelect();
                        onClose();
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body
    );
};

export default ContextMenu;
