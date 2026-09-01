import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import SequenceCard from './SequenceCard';

// The fixture the `SequenceCard` suites share: one about the card itself —
// folding, the title, the derived status, deleting — one about the to-dos listed
// inside it, and one about the four faces of the redesign.
//
// Whether a card is folded is stored on the sequence now, not held in the card,
// so `collapse()` goes through the mutation and the harness re-renders with the
// answer — the same round trip the real canvas makes. `renderCard` returns a
// `rerenderWith` for tests that need to drive that by hand.

export const SAVE_DELAY = 400;

export const baseSequence = {
    id: 100,
    projectId: 1,
    layerId: 10,
    title: 'Learn aerodynamics',
    description: 'Lift, drag, and why a quadcopter hovers',
    isBlocked: false,
    isCollapsed: false,
    position: 0,
};

export const todo = (id, status, { completedAt = null } = {}) => ({
    id,
    projectId: 1,
    sequenceId: 100,
    text: `To-do ${id}`,
    status,
    completedAt,
    position: id,
});

export const graphValue = (sequence, todos) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: { id: 10, projectId: 1, title: 'Learning', position: 0 } },
        sequences: { [sequence.id]: sequence },
        todos: Object.fromEntries(todos.map((t) => [t.id, t])),
        edges: {},
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

export const renderCard = ({ sequence = baseSequence, todos = [], isActive = false } = {}) => {
    const value = graphValue(sequence, todos);

    const tree = (nextSequence, nextTodos) => (
        <ProjectProvider value={value}>
            <ul>
                <SequenceCard
                    sequence={nextSequence}
                    todos={nextTodos}
                    isActive={isActive}
                />
            </ul>
        </ProjectProvider>
    );

    const rendered = render(tree(sequence, todos));

    /**
     * Re-render with a changed graph — what the canvas does when a mutation
     * comes back. Tests about anything derived need it, because the card holds
     * none of it: ticking a to-do or folding a card changes the row above, and
     * the card only re-reads.
     */
    const rerenderWith = (nextSequence = sequence, nextTodos = todos) =>
        rendered.rerender(tree(nextSequence, nextTodos));

    return { ...rendered, value, rerenderWith };
};

// Named by the action rather than by the sequence: the card now also carries a
// connector dot labelled with the same title, and "the button mentioning
// aerodynamics" no longer picks out one thing.
export const expander = () =>
    screen.getByRole('button', { name: /(expand|collapse) learn aerodynamics/i });

// The same button either way — it is the card's state that decides which of
// these two names reads correctly at the call site.
//
// Folding is persisted now, so a click alone changes nothing on screen: it sends
// the patch, and the canvas re-renders the card with the new row. These do both,
// which is what the app does and what every test that folds a card wants.
export const collapse = async (rerenderWith, sequence = baseSequence) => {
    await click(expander());
    rerenderWith({ ...sequence, isCollapsed: true });
};

export const expand = async (rerenderWith, sequence = baseSequence) => {
    await click(expander());
    rerenderWith({ ...sequence, isCollapsed: false });
};

// The hover-reveal × in the card's top-right. Always rendered and always in the
// tab order — only its opacity depends on hover, which is CSS and belongs to a
// browser. Named with the kind, because a card sits inside a layer that has one
// of these too.
export const deleteBubble = () =>
    screen.getByRole('button', { name: 'Delete sequence “Learn aerodynamics”' });
