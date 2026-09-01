import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ApiError, api } from '../../lib/api';
import { click } from '../../testUtils/interact';

import ProjectPage from './ProjectPage';
import { SAVE_DELAY_MS } from './InlineTitle';

jest.mock('../../lib/api', () => {
    const actual = jest.requireActual('../../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    };
});

const GRAPH = {
    project: {
        id: 7,
        title: 'Build a drone',
        description: 'Layered plan',
        todoCount: 1,
        completedTodoCount: 0,
    },
    layers: [{ id: 10, projectId: 7, title: 'Learning', position: 0 }],
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
    ],
    edges: [],
    todos: [
        {
            id: 1000,
            projectId: 7,
            sequenceId: 100,
            text: 'Read about lift',
            status: 'incomplete',
            position: 0,
        },
    ],
};

/** The row the server stores for a sequence added to `GRAPH`'s only layer. */
const CREATED_SEQUENCE = {
    id: 101,
    projectId: 7,
    layerId: 10,
    title: 'Untitled sequence',
    description: null,
    isBlocked: false,
    position: 1,
};

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/projects/7']}>
            <Routes>
                <Route path="/projects/:id" element={<ProjectPage />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    jest.clearAllMocks();
});

describe('ProjectPage', () => {
    test('shows a loading state while the graph is on its way', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderPage();

        // Assert
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    test('loads the graph for the project in the URL', async () => {
        // Arrange
        api.get.mockResolvedValue(GRAPH);

        // Act
        renderPage();

        // Assert
        expect(await screen.findByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledWith('/projects/7');
    });

    test('renders the canvas and the unorganized panel once loaded', async () => {
        // Arrange
        api.get.mockResolvedValue(GRAPH);

        // Act
        renderPage();

        // Assert — layer and sequence titles are editable fields now, so they
        // are found by their value and by the region each layer labels.
        expect(await screen.findByDisplayValue('Learn aerodynamics')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Learning' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /unorganized/i })).toBeInTheDocument();
    });

    test('offers a retry instead of a blank canvas when the load fails', async () => {
        // Arrange
        api.get.mockRejectedValueOnce(new ApiError('Could not reach the server.', 0));
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
        api.get.mockResolvedValue(GRAPH);

        // Act
        await click(screen.getByRole('button', { name: /try again/i }));

        // Assert
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Build a drone' })).toBeInTheDocument()
        );
    });

    test('links back to the projects home', async () => {
        // Arrange
        api.get.mockResolvedValue(GRAPH);

        // Act
        renderPage();
        await screen.findByRole('heading', { name: 'Build a drone' });

        // Assert
        expect(screen.getByRole('link', { name: /projects/i })).toHaveAttribute(
            'href',
            '/projects'
        );
    });

    test('rolls a failed mutation back and says so, until dismissed', async () => {
        // Arrange
        api.get.mockResolvedValue(GRAPH);
        api.post.mockRejectedValue(new ApiError('The layer could not be added.', 500));

        renderPage();
        await screen.findByDisplayValue('Learn aerodynamics');

        // Act
        await click(screen.getByRole('button', { name: 'Add a layer below Learning' }));

        // Assert — the failure is on screen, and the layer it optimistically
        // added is gone again. State proves the rollback; this proves the user
        // is told (spec section 5).
        const toast = await screen.findByRole('alert');
        expect(toast).toHaveTextContent('The layer could not be added.');
        expect(screen.getAllByRole('region')).toHaveLength(GRAPH.layers.length);

        // Act — and it stays until dismissed rather than vanishing on its own.
        await click(screen.getByRole('button', { name: /dismiss/i }));

        // Assert
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    // A create is on screen under a temporary id and re-keyed to the server's
    // when it lands. Anything the user did to the card in between has to survive
    // that swap: they are working on a sequence that is visibly there, and an
    // edit that quietly evaporates is the worst kind of failure this app can
    // have (spec section 5 — no error is swallowed silently).
    describe('while a create is still in flight', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        const heldCreate = () => {
            let land;

            api.post.mockReturnValue(
                new Promise((resolve) => {
                    land = resolve;
                })
            );

            return () => act(async () => land({ ...CREATED_SEQUENCE }));
        };

        test('saves a title typed into a sequence before its create has landed', async () => {
            // Arrange — the create is held open while the title is typed into
            // the card it put on screen.
            api.get.mockResolvedValue(GRAPH);
            api.patch.mockImplementation((path, body) => Promise.resolve({ id: 101, ...body }));

            const landCreate = heldCreate();

            renderPage();
            await screen.findByDisplayValue('Learn aerodynamics');
            await click(screen.getByRole('button', { name: 'Add a sequence to Learning' }));

            const field = screen.getByDisplayValue('Untitled sequence');
            fireEvent.change(field, { target: { value: 'Design the rotor' } });
            fireEvent.keyDown(field, { key: 'Enter' });

            // Act — the server's row arrives only now, mid-edit.
            await landCreate();
            await act(async () => {
                jest.advanceTimersByTime(SAVE_DELAY_MS);
            });

            // Assert — the rename reached the row the server stored, rather than
            // being dropped with the temporary id it replaced.
            expect(api.patch).toHaveBeenCalledWith('/sequences/101', {
                title: 'Design the rotor',
            });
        });

        // There was a test here proving a card folded mid-create stayed folded
        // once the server's row arrived. It guarded local component state, and
        // folding is stored on the sequence now, so what it guarded is gone.
        //
        // Nothing replaced it, because the behaviour underneath is a gap this
        // page has always had rather than one the redesign opened: an
        // un-debounced mutation on a row whose create is still in flight is sent
        // against the temporary id, and `entityReconciled` then replaces the row
        // with the server's wholesale. `setSequenceBlocked` has done exactly this
        // since it was written; `setSequenceCollapsed` inherits it. The title
        // edit above only escapes because `InlineTitle` debounces past the
        // create. Closing it properly means holding mutations aimed at a pending
        // row until it has an id — worth doing, and bigger than a card redesign.
    });
});
