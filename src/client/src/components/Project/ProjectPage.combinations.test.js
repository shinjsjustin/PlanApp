import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { api } from '../../lib/api';
import useIsPhone from '../../hooks/useIsPhone';

import ProjectPage from './ProjectPage';

jest.mock('../../hooks/useIsPhone');

jest.mock('../../lib/api', () => {
    const actual = jest.requireActual('../../lib/api');

    return {
        ...actual,
        api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
    };
});

const GRAPH = {
    project: { id: 7, title: 'Build a drone', description: 'Layered plan', todoCount: 0, completedTodoCount: 0 },
    layers: [],
    sequences: [],
    todos: [],
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
    api.get.mockResolvedValue(GRAPH);
});

test('desktop Project nav links to the project combinations', async () => {
    useIsPhone.mockReturnValue(false);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a drone' });
    const nav = screen.getByRole('navigation', { name: 'Project' });
    expect(within(nav).getByRole('link', { name: 'Combinations' }).getAttribute('href')).toBe('/combinations?project=7');
});

test('phone links to the project combinations right after Project thoughts', async () => {
    useIsPhone.mockReturnValue(true);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a drone' });
    const thoughts = screen.getByRole('link', { name: 'Project thoughts' });
    const link = screen.getByRole('link', { name: 'Combinations' });
    expect(link.getAttribute('href')).toBe('/combinations?project=7');
    expect(thoughts.nextElementSibling).toBe(link);
});
