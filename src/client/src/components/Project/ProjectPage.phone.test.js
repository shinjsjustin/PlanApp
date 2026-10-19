import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ApiError, api } from '../../lib/api';

import ProjectPage from './ProjectPage';

jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => true }));

jest.mock('../../lib/api', () => {
    const actual = jest.requireActual('../../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const GRAPH = {
    project: { id: 7, title: 'Build a drone', description: 'Layered plan', todoCount: 1, completedTodoCount: 0 },
    layers: [{ id: 10, projectId: 7, title: 'Learning', position: 0 }],
    sequences: [
        { id: 100, projectId: 7, layerId: 10, title: 'Learn aerodynamics', description: null, isBlocked: false, position: 0 },
    ],
    todos: [
        { id: 1000, projectId: 7, sequenceId: 100, text: 'Read about lift', status: 'incomplete', position: 0 },
    ],
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
    window.localStorage.clear();
});

describe('ProjectPage on a phone', () => {
    test('renders the title and the phone view without desktop editing parts', async () => {
        api.get.mockResolvedValue(GRAPH);

        const { container } = renderPage();

        expect(await screen.findByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(container.querySelector('main')).toHaveClass('project-page--phone');
        expect(screen.getByRole('heading', { name: 'Learn aerodynamics' })).toBeInTheDocument();
        expect(screen.getByText('Read about lift')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Learning' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Unorganized' })).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Unorganized to-dos' })).not.toBeInTheDocument();
        expect(screen.queryByText('Layered plan')).not.toBeInTheDocument();
        expect(screen.queryByDisplayValue('Layered plan')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: '← All projects' })).not.toBeInTheDocument();
    });

    test('shows the loading state', () => {
        api.get.mockReturnValue(new Promise(() => {}));

        renderPage();

        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    test('shows the error state with a retry', async () => {
        api.get.mockRejectedValue(new ApiError('Could not reach the server.', 0));

        renderPage();

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
});
