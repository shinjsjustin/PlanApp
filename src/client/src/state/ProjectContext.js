import React, { createContext, useContext } from 'react';

// The loaded project graph and its mutation helpers, shared with the canvas.
//
// The value is whatever `useProjectGraph` returns, so a component deep in the
// canvas reads the same state and calls the same helpers as the page itself
// without every layer in between passing them down.

const ProjectContext = createContext(null);

export const ProjectProvider = ({ value, children }) => (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
);

/**
 * Throws rather than handing back `null` when there is no provider — a canvas
 * component rendered outside the page is a wiring mistake, and reading
 * `state` off undefined further down would report it far from its cause.
 */
export const useProjectContext = () => {
    const context = useContext(ProjectContext);

    if (!context) {
        throw new Error('useProjectContext must be used inside a ProjectProvider');
    }

    return context;
};

export default ProjectContext;
