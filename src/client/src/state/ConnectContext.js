import React, { createContext, useContext } from 'react';

// Connect mode, shared with every card and dot on the canvas (spec section 4.7).
//
// Whether a card is a target depends on the whole selection, not on the card, so
// each one has to be able to ask. Passing that down would thread connect mode
// through every layout component between the canvas and the cards; a context
// keeps the knowledge where it is used, exactly as `DragContext` does for the
// to-do currently in the air.
//
// The value is assembled by `Canvas`, which is the one place holding both the
// selection and the layers the eligibility rule needs.

const ConnectContext = createContext(null);

export const ConnectProvider = ({ value, children }) => (
    <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>
);

/**
 * How connect mode currently sees things:
 *
 *   `isConnecting`      is anything armed at all
 *   `isSelected(id)`    is this sequence one of the armed parents
 *   `stateOf(sequence)` 'selected' | 'eligible' | 'dimmed', or null when the
 *                       canvas is not in connect mode and nothing should change
 *   `toggleParent(id)`  arm or disarm a parent — what a connector dot does
 *   `connectTo(seq)`    tether or untether every armed parent, then disarm
 *
 * Null outside a provider rather than a throw, like `useActiveDragTodo`: "is
 * anything being connected" has an honest answer where there is no canvas, and
 * a card rendered on its own is simply never in connect mode.
 */
export const useConnectMode = () => useContext(ConnectContext);

export default ConnectContext;
