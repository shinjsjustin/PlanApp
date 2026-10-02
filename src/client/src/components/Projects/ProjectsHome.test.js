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

// `GET`, `POST`, and `PATCH` all serve this card shape, which lets the grid
// drop mutation responses straight in without another request.
const aProject = (overrides = {}) => ({
    id: 1,
    title: 'Build a drone',
    description: 'Layered plan',
    todoCount: 4,
    completedTodoCount: 1,
    pinnedTodos: [{
        id: 202,
        text: 'Understand ESCs',
        status: 'incomplete',
        sequenceId: 2,
        sequenceTitle: 'Learn electronics',
        position: 0,
        isPinned: true,
    }],
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
                pinnedTodos: [],
            }),
        ]);

        // Act
        renderHome();
        await waitForLoadToFinish();

        // Assert — counted by card heading rather than by list item, since the
        // pinned rows inside a card form a list of their own.
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
                pinnedTodos: [],
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

    test('keeps the renamed card\'s pins on screen', async () => {
        // Arrange — a title change cannot alter the pins, and the card must not
        // lose them just because the grid swapped the object in.
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
        expect(screen.getByRole('list', { name: /^pinned$/i })).toHaveTextContent(
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

    test('recolors a project from the palette and replaces the card', async () => {
        api.get.mockResolvedValue([aProject()]);
        api.patch.mockResolvedValue(aProject({ color: '#980000' }));
        renderHome();
        await waitForLoadToFinish();

        await click(screen.getByRole('button', { name: 'Change color of “Build a drone”' }));
        await click(screen.getByRole('button', { name: 'red berry' }));

        expect(api.patch).toHaveBeenCalledWith('/projects/1', { color: '#980000' });
        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Build a drone' }).closest('.project-card'))
                .toHaveClass('project-card--light-text')
        );
    });

    test('shows an inline alert when recoloring fails', async () => {
        api.get.mockResolvedValue([aProject()]);
        api.patch.mockRejectedValue(new Error('Could not save color.'));
        renderHome();
        await waitForLoadToFinish();

        await click(screen.getByRole('button', { name: 'Change color of “Build a drone”' }));
        await click(screen.getByRole('button', { name: 'red berry' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not save color.');
    });

    describe('masonry layout', () => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
        const restore = (name, descriptor) => {
            if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
            else delete HTMLElement.prototype[name];
        };
        let gridWidth;
        let heightByTitle;

        beforeEach(() => {
            gridWidth = 1100;
            heightByTitle = {};
            Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
                configurable: true,
                get() {
                    return this.classList.contains('projects-grid') ? gridWidth : 0;
                },
            });
            Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
                configurable: true,
                get() {
                    return heightByTitle[this.querySelector('h3')?.textContent] ?? 0;
                },
            });
        });

        afterEach(() => {
            // jsdom may define these higher up the prototype chain, in which
            // case deleting our own override restores the inherited one.
            restore('clientWidth', originalClientWidth);
            restore('offsetHeight', originalOffsetHeight);
        });

        const cardsInDomOrder = () =>
            screen
                .getAllByRole('heading', { level: 3 })
                .map((h) => h.closest('.project-card'));

        test('places cards shortest-column first, center-out, with 16px gaps', async () => {
            heightByTitle = { A: 100, B: 300, C: 100, D: 100, E: 100 };
            api.get.mockResolvedValue(
                [5, 3, 1, 4, 2].map((id) => aProject({ id, title: 'ABCDE'[id - 1] }))
            );
            renderHome();
            await waitForLoadToFinish();

            const cards = cardsInDomOrder();
            expect(cards.map((c) => c.querySelector('h3').textContent)).toEqual(['A', 'B', 'C', 'D', 'E']);
            // Measuring lands in state after the first paint, so wait for it.
            // Column width is (1100 - 3 * 16) / 4 = 263, so the column pitch is 279.
            await waitFor(() =>
                expect(cards.map((c) => c.style.left)).toEqual(['279px', '558px', '0px', '837px', '279px'])
            );
            expect(cards.map((c) => c.style.top)).toEqual(['0px', '0px', '0px', '0px', '116px']);
            expect(document.querySelector('.projects-grid').style.height).toBe('300px');
        });

        test('stacks every card at left 0 with one column', async () => {
            gridWidth = 200;
            heightByTitle = { A: 100, B: 50, C: 70 };
            api.get.mockResolvedValue([
                aProject({ id: 1, title: 'A' }),
                aProject({ id: 2, title: 'B' }),
                aProject({ id: 3, title: 'C' }),
            ]);
            renderHome();
            await waitForLoadToFinish();

            const cards = cardsInDomOrder();
            await waitFor(() => expect(cards.map((c) => c.style.top)).toEqual(['0px', '116px', '182px']));
            expect(cards.map((c) => c.style.left)).toEqual(['0px', '0px', '0px']);
            expect(document.querySelector('.projects-grid').style.height).toBe('252px');
        });
    });

    test('appends a newly created project after the existing ones', async () => {
        api.get.mockResolvedValue([aProject({ id: 1, title: 'First' }), aProject({ id: 2, title: 'Second' })]);
        api.post.mockResolvedValue(aProject({ id: 9, title: 'Newest', pinnedTodos: [] }));
        renderHome();
        await waitForLoadToFinish();

        await click(screen.getByRole('button', { name: /new project/i }));
        await type(screen.getByLabelText(/title/i), 'Newest');
        await click(screen.getByRole('button', { name: /^create project$/i }));

        await screen.findByRole('heading', { name: 'Newest' });
        const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(titles).toEqual(['First', 'Second', 'Newest']);
    });
});
