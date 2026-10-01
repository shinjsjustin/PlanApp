import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { api } from '../../lib/api';
import { click } from '../../testUtils/interact';

import ProjectPage from './ProjectPage';

jest.mock('../../lib/api', () => {
    const actual = jest.requireActual('../../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const SEQUENCE = {
    id: 100,
    projectId: 7,
    layerId: 10,
    title: 'Learn aerodynamics',
    description: null,
    isBlocked: false,
    isPinned: false,
    position: 0,
};
const TODO = {
    id: 1000,
    projectId: 7,
    sequenceId: 100,
    text: 'Read about lift',
    status: 'incomplete',
    isPinned: true,
    position: 0,
};
const GRAPH = {
    project: { id: 7, title: 'Build a drone', description: '', todoCount: 1, completedTodoCount: 0 },
    layers: [{ id: 10, projectId: 7, title: 'Learning', position: 0 }],
    sequences: [SEQUENCE],
    todos: [TODO],
};

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/projects/7']}>
            <Routes>
                <Route path="/projects/:id" element={<ProjectPage />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => jest.clearAllMocks());

describe('ProjectPage sequence pins', () => {
    test('pins a sequence with PUT /projects/:id/pins and leaves its to-do markers alone', async () => {
        api.get.mockResolvedValue(GRAPH);
        api.put.mockResolvedValue({ todos: [TODO], sequences: [{ ...SEQUENCE, isPinned: true }] });
        const { container } = renderPage();
        await screen.findByRole('heading', { name: 'Build a drone' });
        expect(container.querySelectorAll('.todo-pin-icon')).toHaveLength(1);

        await click(screen.getByRole('button', { name: 'Pin' }));
        await click(screen.getByRole('button', { name: 'Pin sequence “Learn aerodynamics”' }));
        await click(screen.getByRole('button', { name: 'Confirm' }));

        expect(api.put).toHaveBeenCalledTimes(1);
        expect(api.put).toHaveBeenCalledWith('/projects/7/pins', {
            todoIds: [],
            sequenceIds: [100],
            isPinned: true,
        });
        expect(container.querySelectorAll('.sequence-pin-icon')).toHaveLength(1);
        expect(container.querySelectorAll('.todo-pin-icon')).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument();
    });
});
