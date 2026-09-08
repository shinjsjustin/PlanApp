import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ApiError, api } from '../../lib/api';
import { DROP_TARGET, resolveSequencePlacement, resolveTodoPlacement } from '../../lib/dragDrop';
import { click } from '../../testUtils/interact';

import ProjectPage from './ProjectPage';
import { detectCollisions } from './DragDropArea';

// Drag-and-drop as the page wires it up (spec section 4.7).
//
// jsdom has no layout, so none of this asserts where anything landed on screen —
// that is the phase 9 Playwright flow's job. What is asserted here is the wiring
// the pointer never touches: that every to-do carries a handle, that the
// keyboard sensor on that handle reaches the move endpoint, that a card which
// will not accept the to-do in flight says so, and that a rejected move puts the
// list back the way it was.

jest.mock('../../lib/api', () => {
    const actual = jest.requireActual('../../lib/api');

    return {
        ...actual,
        api: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            put: jest.fn(),
            delete: jest.fn(),
        },
    };
});

const GRAPH = {
    project: {
        id: 7,
        title: 'Build a drone',
        description: null,
        todoCount: 3,
        completedTodoCount: 0,
    },
    layers: [
        { id: 10, projectId: 7, title: 'Learning', position: 0 },
        { id: 20, projectId: 7, title: 'Design', position: 1 },
    ],
    sequences: [
        {
            id: 100,
            projectId: 7,
            layerId: 10,
            title: 'Learn aerodynamics',
            description: null,
            isBlocked: false,
            position: 0,
        },
        {
            id: 200,
            projectId: 7,
            layerId: 20,
            title: 'Design rotor system',
            description: null,
            isBlocked: false,
            position: 0,
        },
    ],
    edges: [],
    todos: [
        {
            id: 1000,
            projectId: 7,
            sequenceId: null,
            text: 'Buy propellers',
            status: 'incomplete',
            position: 0,
        },
        {
            id: 1001,
            projectId: 7,
            sequenceId: 100,
            text: 'Read about lift',
            status: 'incomplete',
            position: 0,
        },
        {
            id: 1002,
            projectId: 7,
            sequenceId: 100,
            text: 'Read about drag',
            status: 'incomplete',
            position: 1,
        },
    ],
};

const renderPage = async () => {
    api.get.mockResolvedValue(GRAPH);

    const rendered = render(
        <MemoryRouter initialEntries={['/projects/7']}>
            <Routes>
                <Route path="/projects/:id" element={<ProjectPage />} />
            </Routes>
        </MemoryRouter>
    );

    await screen.findByRole('heading', { name: 'Build a drone' });

    return rendered;
};

/**
 * jsdom lays nothing out, so every rect it reports is zero and the keyboard
 * sensor has no geometry to step through. Stacking the rows of an expanded card
 * gives it the layout a browser would have provided.
 *
 * The spotlight band is one of those rows: since the redesign the first
 * outstanding to-do is drawn there rather than in the list, and it is sortable
 * like any other, so the sensor needs a rect for it too. `querySelectorAll`
 * returns them in document order, which is the order they are stacked in.
 *
 * This is not an assertion about pixels — nothing below checks a coordinate. It
 * is the floor the library needs before its own logic can run at all, and where
 * the real geometry matters the phase 9 Playwright flow measures it for real.
 */
const ROW_HEIGHT_PX = 40;
const BAND_HEIGHT_PX = 72;
const GAP_HEIGHT_PX = 4;
const ROW_WIDTH_PX = 200;

const heightOf = (row) => {
    if (row.classList.contains('drop-zone')) return GAP_HEIGHT_PX;
    if (row.classList.contains('sequence-spotlight')) return BAND_HEIGHT_PX;

    return ROW_HEIGHT_PX;
};

const layOutRows = () => {
    let top = 0;

    document
        .querySelectorAll('.drop-zone, .todo-item, .sequence-spotlight')
        .forEach((row) => {
        const height = heightOf(row);
        const rect = {
            x: 0,
            y: top,
            top,
            left: 0,
            bottom: top + height,
            right: ROW_WIDTH_PX,
            width: ROW_WIDTH_PX,
            height,
            toJSON: () => rect,
        };

        row.getBoundingClientRect = () => rect;
        top += height;
    });
};

const dragHandleFor = (text) => screen.getByRole('button', { name: `Drag “${text}”` });

/**
 * `@dnd-kit` attaches the keyboard sensor's own key handler a tick after the
 * lift, and re-measures between steps, so each keystroke is followed by a flush
 * rather than fired back to back.
 */
const settle = () =>
    act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

/** `@dnd-kit` matches on `code`, which for the space bar is not its `key`. */
const CODES = { ' ': 'Space' };

const press = async (handle, key) => {
    fireEvent.keyDown(handle, { key, code: CODES[key] ?? key });
    await settle();
};

/** A whole keyboard drag: lift on Space, step with the arrows, drop on Space. */
const keyboardDrag = async (handle, steps) => {
    layOutRows();
    handle.focus();

    await press(handle, ' ');

    for (const key of steps) {
        // eslint-disable-next-line no-await-in-loop
        await press(handle, key);
    }

    await press(handle, ' ');
};

const todoTexts = (listLabel) =>
    Array.from(
        screen.getByRole('list', { name: listLabel }).querySelectorAll('.todo-item-text')
    ).map((node) => node.textContent);

/**
 * A card's outstanding to-dos top to bottom, across the two places the redesign
 * draws them: the next step in its band, then the rest under THEN. One stored
 * list read two ways, so this is what "the order" means on screen now.
 */
const cardTodoTexts = (title) => {
    const card = document.querySelector(`[data-sequence-title="${title}"]`);
    const spotlight = card.querySelector('.sequence-spotlight-text');

    return [
        ...(spotlight ? [spotlight.textContent] : []),
        ...todoTexts(`To-dos in ${title}`),
    ];
};

const cardsMarked = (state) =>
    Array.from(document.querySelectorAll(`[data-drop="${state}"]`)).map(
        (node) => node.dataset.sequenceTitle
    );

beforeEach(() => {
    jest.clearAllMocks();
});

describe('drag handles', () => {
    test('gives a to-do waiting in the unorganized panel one', async () => {
        // Arrange & Act
        await renderPage();

        // Assert
        expect(dragHandleFor('Buy propellers')).toBeInTheDocument();
    });

    test('gives a to-do inside a sequence one', async () => {
        // Act — sequence cards render open, so its to-dos are already listed.
        await renderPage();

        // Assert — the one under THEN.
        expect(dragHandleFor('Read about drag')).toBeInTheDocument();
    });

    // The next step is an incomplete to-do and dragging reorders those, so the
    // band carries a handle as well: otherwise the first row on every card
    // would be the one nobody could move.
    test('gives the to-do in the spotlight one too', async () => {
        // Act
        await renderPage();

        // Assert
        expect(dragHandleFor('Read about lift')).toBeInTheDocument();
    });

    /**
     * The pointer sensor is configured with a distance constraint so a plain
     * click is never read as a drag. Keeping the handle separate from the status
     * control and the menu is the other half of that: neither of those is inside
     * anything carrying drag listeners.
     */
    test('leaves the status control clickable rather than swallowing it', async () => {
        // Arrange
        await renderPage();
        api.patch.mockResolvedValue({ ...GRAPH.todos[0], status: 'complete' });

        // Act
        await click(
            screen.getByRole('button', {
                name: 'Complete “Buy propellers” (Incomplete)',
            })
        );

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/todos/1000', { status: 'complete' });
    });
});

describe('a keyboard drag', () => {
    test('reaches the move endpoint when a to-do is reordered in its sequence', async () => {
        // Arrange
        await renderPage();
        api.put.mockResolvedValue({ ...GRAPH.todos[1], position: 1 });

        // Act — lift "Read about lift" and put it down one place lower.
        await keyboardDrag(dragHandleFor('Read about lift'), ['ArrowDown']);

        // Assert
        await waitFor(() =>
            expect(api.put).toHaveBeenCalledWith('/todos/1001/move', {
                sequenceId: 100,
                position: 1,
            })
        );
        expect(cardTodoTexts('Learn aerodynamics')).toEqual([
            'Read about drag',
            'Read about lift',
        ]);
    });

    test('puts the list back in its original order when the move is rejected', async () => {
        // Arrange
        await renderPage();
        api.put.mockRejectedValue(new ApiError('position: out of range', 400));

        // Act
        await keyboardDrag(dragHandleFor('Read about lift'), ['ArrowDown']);

        // Assert
        await waitFor(() =>
            expect(screen.getByRole('alert')).toHaveTextContent('position: out of range')
        );
        expect(cardTodoTexts('Learn aerodynamics')).toEqual([
            'Read about lift',
            'Read about drag',
        ]);
    });
});

/**
 * Spec section 2: a to-do already filed in a sequence cannot be dragged to
 * another one. The card it cannot join says so while the drag is in flight,
 * rather than accepting the drop and quietly doing nothing with it.
 */
describe('while a filed to-do is in flight', () => {
    test('marks its own sequence eligible and every other one not', async () => {
        // Arrange
        await renderPage();
        const handle = dragHandleFor('Read about lift');

        // Act — lift it, and leave it in the air.
        handle.focus();
        await press(handle, ' ');

        // Assert
        await waitFor(() => expect(cardsMarked('ineligible')).toEqual(['Design rotor system']));
        expect(cardsMarked('eligible')).toEqual(['Learn aerodynamics']);
    });

    test('marks nothing at all when no drag is in flight', async () => {
        // Arrange & Act
        await renderPage();

        // Assert
        expect(cardsMarked('eligible')).toEqual([]);
        expect(cardsMarked('ineligible')).toEqual([]);
    });
});

describe('while a loose to-do is in flight', () => {
    test('marks every sequence eligible, because any of them may take it', async () => {
        // Arrange
        await renderPage();
        const handle = dragHandleFor('Buy propellers');

        // Act
        handle.focus();
        await press(handle, ' ');

        // Assert
        await waitFor(() =>
            expect(cardsMarked('eligible')).toEqual([
                'Learn aerodynamics',
                'Design rotor system',
            ])
        );
        expect(cardsMarked('ineligible')).toEqual([]);
    });
});

/**
 * Which droppable a drop lands on, with the two drags sharing one `DndContext`.
 *
 * Everything above runs through the keyboard sensor, which steps between the
 * droppables of one list and so never puts a card and a to-do row in contention.
 * A pointer does, because the droppables of the two drags are physically nested:
 * a to-do row sits inside the card that is itself a slot in a layer. `@dnd-kit`
 * ranks candidates by distance and knows nothing of the difference, so a nested
 * to-do row would win a sequence drag outright and a card would win a to-do let
 * go on its header — and either drop then resolves to nothing, silently.
 *
 * Rects are supplied here rather than measured, because jsdom reports zero for
 * all of them; they are the geometry a browser would have given, laid out the
 * way the card really is. What is asserted is not a coordinate but the placement
 * the winning droppable resolves to, which is what the drop handler sends.
 */
describe('collision detection with both drags in one context', () => {
    const rectOf = ({ top, left, width, height }) => ({
        top,
        left,
        bottom: top + height,
        right: left + width,
        width,
        height,
    });

    // One layer holding one open card, laid out the way the card renders: a
    // header band with no droppable of its own, then the body, then a to-do row
    // inside it.
    const LAYER_RECT = rectOf({ top: 0, left: 0, width: 400, height: 300 });
    const CARD_RECT = rectOf({ top: 0, left: 0, width: 200, height: 200 });
    const CARD_BODY_RECT = rectOf({ top: 80, left: 0, width: 200, height: 120 });
    const TODO_ROW_RECT = rectOf({ top: 100, left: 0, width: 200, height: 40 });

    const DROPPABLES = [
        { id: 'layer-10', dropTarget: { kind: DROP_TARGET.append, layerId: 10 }, rect: LAYER_RECT },
        {
            id: 'seq-100',
            dropTarget: { kind: DROP_TARGET.item, layerId: 10, index: 0 },
            rect: CARD_RECT,
        },
        {
            id: 'sequence-100',
            dropTarget: { kind: DROP_TARGET.append, sequenceId: 100 },
            rect: CARD_BODY_RECT,
        },
        {
            id: 1001,
            dropTarget: { kind: DROP_TARGET.item, sequenceId: 100, index: 0 },
            rect: TODO_ROW_RECT,
        },
    ];

    const collisionArgs = ({ activeData, pointer }) => ({
        active: { data: { current: activeData } },
        collisionRect: rectOf({ top: pointer.y, left: pointer.x, width: 0, height: 0 }),
        droppableContainers: DROPPABLES.map(({ id, dropTarget }) => ({
            id,
            data: { current: { dropTarget } },
        })),
        droppableRects: new Map(DROPPABLES.map(({ id, rect }) => [id, rect])),
        pointerCoordinates: pointer,
    });

    /** The target the winning droppable carries, which is all the drop reads. */
    const winningTarget = (args) => {
        const [winner] = detectCollisions(args);

        return winner ? winner.data.droppableContainer.data.current.dropTarget : null;
    };

    const SEQUENCES = [
        { id: 100, layerId: 10, position: 0 },
        { id: 200, layerId: 20, position: 0 },
    ];
    const TODOS = [
        { id: 1000, sequenceId: null, position: 0 },
        { id: 1001, sequenceId: 100, position: 0 },
    ];

    test('lands a sequence dropped over a to-do row on the card holding it', () => {
        // Arrange — a card from another layer, let go over the to-do row inside
        // an open card. Cards render open by default, so this is the ordinary
        // way one card is dropped onto another.
        const args = collisionArgs({
            activeData: { sequenceId: 200 },
            pointer: { x: 100, y: 120 },
        });

        // Act
        const target = winningTarget(args);

        // Assert — spec section 9: the card dropped on gives up its place.
        expect(
            resolveSequencePlacement({
                activeSequence: SEQUENCES[1],
                target,
                sequences: SEQUENCES,
            })
        ).toEqual({ layerId: 10, position: 0 });
    });

    test('files a to-do dropped on a card header into that card', () => {
        // Arrange — the header is the one band of an open card that carries no
        // to-do droppable of its own, so the card's own slot is what a to-do
        // would otherwise collide with there.
        const args = collisionArgs({
            activeData: { todoId: 1000 },
            pointer: { x: 100, y: 40 },
        });

        // Act
        const target = winningTarget(args);

        // Assert
        expect(
            resolveTodoPlacement({ activeTodo: TODOS[0], target, todos: TODOS })
        ).toEqual({ sequenceId: 100, position: 0 });
    });
});
