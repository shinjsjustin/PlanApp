import React, { createContext, useContext } from 'react';

// The to-do currently in the air, shared with everything that can be dropped on.
//
// A sequence card has to know what is being dragged before the drop happens, so
// it can say whether it would accept it (spec section 4.7). Passing that down
// through the canvas would thread a drag through every layout component; a
// context keeps the knowledge where it is used.
//
// It is deliberately separate from `ProjectContext`: this value changes on every
// lift and drop, and the graph does not.

const DragContext = createContext(null);

export const DragProvider = ({ activeTodo, children }) => (
    <DragContext.Provider value={activeTodo}>{children}</DragContext.Provider>
);

/**
 * The to-do being dragged, or null when none is.
 *
 * Null rather than a throw outside a provider, unlike `useProjectContext`: "what
 * is being dragged" has an honest answer where there is no drag machinery at
 * all, and a card rendered on its own is simply never mid-drag.
 */
export const useActiveDragTodo = () => useContext(DragContext);

export default DragContext;
