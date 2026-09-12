import React from 'react';
import { render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { clear, click, type } from '../../testUtils/interact';

import ProjectsHome from './ProjectsHome';
import { api } from '../../lib/api';

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    ApiError: class ApiError extends Error {},
}));

// The shape `GET /api/projects` serves, frontier and all. `POST` and `PATCH`
// answer in the same shape, which is what lets the grid drop their responses
// straight in — see `src/lib/projectsFrontier.js`.
const aProject = (overrides = {}) => ({
    id: 1,
    title: 'Build a drone',
    description: 'Layered plan',
    todoCount: 4,
    completedTodoCount: 1,
    sequenceCount: 5,
    frontier: [
        {
            sequenceId: 2,
            sequenceTitle: 'Learn electronics',
            nextTodo: { id: 202, text: 'Understand ESCs' },
        },
    ],
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
});

// The cards link through to their project page, so the grid needs a router.
const renderHome = () => render(<ProjectsHome />, { wrapper: MemoryRouter });

const waitForLoadToFinish = () =>
    waitForElementToBeRemoved(() => screen.queryByRole('status', { name: /loading/i }));

describe('ProjectsHome', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    test('shows a loading state while the projects are being fetched', async () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderHome();

        // Assert
        expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
    });

    test('prompts for a first project when the list is empty', async () => {
        // Arrange
        api.get.mockResolvedValue([]);

        // Act
        renderHome();
        await waitForLoadToFinish();

        // Assert
        expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /create your first project/i })
        ).toBeInTheDocument();
    });

    test('renders a card per project with its to-do progress', async () => {
        // Arrange
        api.get.mockResolvedValue([
            aProject(),
            aProject({
                id: 2,
                title: 'Write the spec',
                todoCount: 0,
                completedTodoCount: 0,
                sequenceCount: 0,
                frontier: [],
            }),
        ]);

        // Act
        renderHome();
        await waitForLoadToFinish();

        // Assert — counted by card heading rather than by list item, since the
        // frontier inside a card is a list of its own.
        expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
        expect(screen.getByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(screen.getByText('1/4 to-dos done')).toBeInTheDocument();
        expect(screen.getByText('0/0 to-dos done')).toBeInTheDocument();
        expect(screen.queryByText(/no projects yet/i)).not.toBeInTheDocument();
    });

    test('shows the failure and retries the load when asked', async () => {
        // Arrange
        api.get
            .mockRejectedValueOnce(new Error('Could not reach the server.'))
            .mockResolvedValueOnce([aProject()]);

        // Act
        renderHome();
        const alert = await screen.findByRole('alert');

        // Assert
        expect(alert).toHaveTextContent('Could not reach the server.');

        // Act
        await click(screen.getByRole('button', { name: /try again/i }));

        // Assert
        expect(await screen.findByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('adds a created project to the grid without a reload', async () => {
        // Arrange
        api.get.mockResolvedValue([]);
        api.post.mockResolvedValue(
            aProject({
                id: 7,
                title: 'Fresh project',
                todoCount: 0,
                completedTodoCount: 0,
                sequenceCount: 0,
                frontier: [],
            })
        );
        renderHome();
        await waitForLoadToFinish();

        // Act
        await click(screen.getByRole('button', { name: /create your first project/i }));
        await type(screen.getByLabelText(/title/i), 'Fresh project');
        await click(screen.getByRole('button', { name: /^create project$/i }));

        // Assert
        expect(api.post).toHaveBeenCalledWith('/projects', {
            title: 'Fresh project',
            description: '',
        });
        expect(await screen.findByRole('heading', { name: 'Fresh project' })).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    test('renames a project in place', async () => {
        // Arrange
        api.get.mockResolvedValue([aProject()]);
        api.patch.mockResolvedValue(aProject({ title: 'Build a better drone' }));
        renderHome();
        await waitForLoadToFinish();

        // Act
        await click(screen.getByRole('button', { name: /rename/i }));
        const field = screen.getByLabelText(/project title/i);
        await clear(field);
        await type(field, 'Build a better drone');
        await click(screen.getByRole('button', { name: /^save$/i }));

        // Assert
        expect(api.patch).toHaveBeenCalledWith('/projects/1', { title: 'Build a better drone' });
        expect(
            await screen.findByRole('heading', { name: 'Build a better drone' })
        ).toBeInTheDocument();
    });

    test('keeps the renamed card\'s frontier on screen', async () => {
        // Arrange — a title change cannot alter what is ready, and the card must
        // not lose the frontier just because the grid swapped the object in.
        api.get.mockResolvedValue([aProject()]);
        api.patch.mockResolvedValue(aProject({ title: 'Build a better drone' }));
        renderHome();
        await waitForLoadToFinish();

        // Act
        await click(screen.getByRole('button', { name: /rename/i }));
        const field = screen.getByLabelText(/project title/i);
        await clear(field);
        await type(field, 'Build a better drone');
        await click(screen.getByRole('button', { name: /^save$/i }));

        // Assert
        await screen.findByRole('heading', { name: 'Build a better drone' });
        expect(screen.getByRole('list', { name: /ready now/i })).toHaveTextContent(
            'Learn electronics'
        );
    });

    test('removes a deleted project from the grid', async () => {
        // Arrange
        api.get.mockResolvedValue([aProject()]);
        api.delete.mockResolvedValue({ id: 1 });
        renderHome();
        await waitForLoadToFinish();

        // Act — the card's hover-reveal ×, then the inline confirmation it opens.
        await click(screen.getByRole('button', { name: 'Delete “Build a drone”' }));
        await click(screen.getByRole('button', { name: /yes, delete it/i }));

        // Assert
        expect(api.delete).toHaveBeenCalledWith('/projects/1');
        await waitFor(() =>
            expect(screen.queryByRole('heading', { name: 'Build a drone' })).not.toBeInTheDocument()
        );
        expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
    });

    test('offers a link through to the calendar', async () => {
        // Arrange
        api.get.mockResolvedValue([aProject()]);

        // Act
        renderHome();
        await waitForLoadToFinish();

        // Assert
        expect(screen.getByRole('link', { name: /calendar/i })).toHaveAttribute(
            'href',
            '/calendar'
        );
    });

    test('keeps the calendar reachable while the projects are still loading', async () => {
        // Arrange — a slow or failing load must not strand the user on this page,
        // so the calendar link does not wait on the grid the way "New project" does.
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderHome();

        // Assert
        expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument();
    });
});
