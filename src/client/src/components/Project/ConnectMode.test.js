import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { click } from '../../testUtils/interact';

import Canvas from './Canvas';

// Connect mode, driven through the real canvas (spec section 4.7).
//
// Which cards light up is a question about layer order, and jsdom can answer it
// without measuring anything: eligibility is decided by `isEligibleChild` over
// the graph, not by where the cards landed on screen. Where the resulting edge
// is actually drawn is the phase 9 Playwright flow's business.
//
// The graph helpers are spies, so everything from the dot down — the selection,
// the eligibility rule, `toggleEdge` — is the real code, and the assertions are
// on the request each gesture would send.

const AERODYNAMICS = 'Learn aerodynamics';
const ELECTRONICS = 'Learn electronics';
const ROTOR = 'Design rotor system';
const WIFI = 'Connect drone to wifi';

const layer = (id, title, position) => ({ id, projectId: 1, title, position });

const sequence = (id, layerId, title, position = 0) => ({
    id,
    projectId: 1,
    layerId,
    title,
    description: null,
    isBlocked: false,
    position,
});

// The spec's worked example: two parallel learning sequences above a design
// layer, above a build layer a skip edge could reach directly.
const LAYERS = {
    10: layer(10, 'Learning', 0),
    20: layer(20, 'Design', 1),
    30: layer(30, 'Build', 2),
};

const SEQUENCES = {
    100: sequence(100, 10, AERODYNAMICS, 0),
    101: sequence(101, 10, ELECTRONICS, 1),
    200: sequence(200, 20, ROTOR),
    300: sequence(300, 30, WIFI),
};

const renderCanvas = ({ edges = {} } = {}) => {
    const value = {
        state: {
            project: { id: 1, title: 'Build a drone' },
            layers: LAYERS,
            sequences: SEQUENCES,
            todos: {},
            edges,
        },
        createEntity: jest.fn(),
        updateEntity: jest.fn(),
        removeEntity: jest.fn(),
    };

    const rendered = render(
        <ProjectProvider value={value}>
            <Canvas />
        </ProjectProvider>
    );

    return { ...rendered, value };
};

/** The card for a sequence, found by the title it carries for exactly this. */
const cardFor = (title) => document.querySelector(`[data-sequence-title="${title}"]`);

/** How a card is presenting itself in connect mode, or null when not in it. */
const connectStateOf = (title) => cardFor(title).getAttribute('data-connect');

const dotFor = (title) =>
    screen.getByRole('button', { name: new RegExp(`connect from ${title}`, 'i') });

/**
 * The target an eligible card puts over itself. It exists only while the card
 * is eligible, so `queryBy` — its absence is the assertion for a dimmed card.
 */
const targetFor = (title) =>
    screen.queryByRole('button', { name: new RegExp(`connect to ${title}`, 'i') });

describe('connect mode', () => {
    test('gives every sequence a connector dot', () => {
        // Act
        renderCanvas();

        // Assert
        [AERODYNAMICS, ELECTRONICS, ROTOR, WIFI].forEach((title) => {
            expect(dotFor(title)).toBeInTheDocument();
        });
    });

    test('leaves every card unmarked while no dot is selected', () => {
        // Act
        renderCanvas();

        // Assert — no selection means no connect mode, so nothing dims
        expect(connectStateOf(AERODYNAMICS)).toBeNull();
        expect(connectStateOf(ROTOR)).toBeNull();
    });

    test('fills in the dot that was clicked', async () => {
        // Arrange
        renderCanvas();

        // Act
        await click(dotFor(AERODYNAMICS));

        // Assert
        expect(dotFor(AERODYNAMICS)).toHaveAttribute('aria-pressed', 'true');
        expect(dotFor(ELECTRONICS)).toHaveAttribute('aria-pressed', 'false');
    });

    test('marks only strictly lower sequences as eligible', async () => {
        // Arrange
        renderCanvas();

        // Act
        await click(dotFor(AERODYNAMICS));

        // Assert — `design` and `build` are both below `learning`; skipping a
        // layer is allowed, so `build` is offered too
        expect(cardFor(ROTOR)).toHaveClass('sequence-card--connect-eligible');
        expect(cardFor(WIFI)).toHaveClass('sequence-card--connect-eligible');
    });

    test('dims a sequence in the same layer as the selected parent', async () => {
        // Arrange — two sequences in one layer are parallel work; neither gates
        // the other, so a sibling is never a target
        renderCanvas();

        // Act
        await click(dotFor(ELECTRONICS));

        // Assert
        expect(connectStateOf(AERODYNAMICS)).toBe('dimmed');
        expect(cardFor(AERODYNAMICS)).not.toHaveClass('sequence-card--connect-eligible');
    });

    test('marks the selected parent as selected rather than dimmed', async () => {
        // Arrange
        renderCanvas();

        // Act
        await click(dotFor(AERODYNAMICS));

        // Assert
        expect(connectStateOf(AERODYNAMICS)).toBe('selected');
    });

    test('offers only what is below every selected parent', async () => {
        // Arrange
        renderCanvas();

        // Act — arm one parent in `learning` and one in `design`
        await click(dotFor(AERODYNAMICS));
        await click(dotFor(ROTOR));

        // Assert — only `build` is strictly below both
        expect(connectStateOf(WIFI)).toBe('eligible');
        expect(connectStateOf(ROTOR)).toBe('selected');
    });

    test('connects the parent to the child that was clicked', async () => {
        // Arrange
        const { value } = renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(targetFor(ROTOR));

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'edges',
            expect.objectContaining({
                path: '/projects/1/edges',
                body: { parentId: 100, childId: 200 },
            })
        );
    });

    test('connects every selected parent in one click', async () => {
        // Arrange — aerodynamics and electronics both feed the rotor design
        const { value } = renderCanvas();
        await click(dotFor(AERODYNAMICS));
        await click(dotFor(ELECTRONICS));

        // Act
        await click(targetFor(ROTOR));

        // Assert
        expect(value.createEntity).toHaveBeenCalledTimes(2);
        expect(value.createEntity.mock.calls.map(([, options]) => options.body)).toEqual([
            { parentId: 100, childId: 200 },
            { parentId: 101, childId: 200 },
        ]);
    });

    test('untethers a pair that is already connected', async () => {
        // Arrange — the same gesture removes an edge that is already there
        const { value } = renderCanvas({
            edges: { 500: { id: 500, projectId: 1, parentId: 100, childId: 200 } },
        });
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(targetFor(ROTOR));

        // Assert
        expect(value.removeEntity).toHaveBeenCalledWith(
            'edges',
            500,
            expect.objectContaining({
                path: '/projects/1/edges?parentId=100&childId=200',
            })
        );
        expect(value.createEntity).not.toHaveBeenCalled();
    });

    test('clears the selection once the connection is made', async () => {
        // Arrange
        renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(targetFor(ROTOR));

        // Assert
        expect(dotFor(AERODYNAMICS)).toHaveAttribute('aria-pressed', 'false');
        expect(connectStateOf(ROTOR)).toBeNull();
    });

    test('lets an eligible card still be collapsed without connecting it', async () => {
        // Arrange — a card is worth folding away before it is tethered, and
        // the controls on it must not double as the connect gesture
        const { value } = renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(screen.getByRole('button', { name: /collapse design rotor system/i }));

        // Assert
        expect(value.createEntity).not.toHaveBeenCalled();
        expect(connectStateOf(ROTOR)).toBe('eligible');
    });

    test('offers no target at all on a dimmed card', async () => {
        // Arrange
        const { value } = renderCanvas();
        await click(dotFor(ELECTRONICS));

        // Act
        await click(cardFor(AERODYNAMICS));

        // Assert — there is nothing to aim at, so the click lands on nothing
        expect(targetFor(AERODYNAMICS)).toBeNull();
        expect(value.createEntity).not.toHaveBeenCalled();
        expect(value.removeEntity).not.toHaveBeenCalled();
    });

    test('takes a parent back out when its dot is clicked again', async () => {
        // Arrange
        renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(dotFor(AERODYNAMICS));

        // Assert
        expect(connectStateOf(ROTOR)).toBeNull();
        expect(dotFor(AERODYNAMICS)).toHaveAttribute('aria-pressed', 'false');
    });

    test('clears the selection on Escape', async () => {
        // Arrange
        renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        fireEvent.keyDown(document, { key: 'Escape' });

        // Assert
        expect(connectStateOf(ROTOR)).toBeNull();
    });

    test('clears the selection on a click on empty canvas', async () => {
        // Arrange
        const { container } = renderCanvas();
        await click(dotFor(AERODYNAMICS));

        // Act
        await click(container.querySelector('.canvas'));

        // Assert
        expect(connectStateOf(ROTOR)).toBeNull();
    });
});
