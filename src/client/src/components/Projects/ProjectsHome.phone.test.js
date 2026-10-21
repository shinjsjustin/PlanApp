import React from 'react';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProjectsHome from './ProjectsHome';
import { api } from '../../lib/api';

jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => true }));

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    ApiError: class ApiError extends Error {},
}));

describe('ProjectsHome on a phone', () => {
    test('hides the calendar link, which the tab bar covers, and keeps New project', async () => {
        api.get.mockResolvedValue([
            {
                id: 1,
                title: 'Build a drone',
                description: 'Layered plan',
                todoCount: 0,
                completedTodoCount: 0,
                datedSequences: [],
                createdAt: '2026-08-27T10:00:00.000Z',
                updatedAt: '2026-08-27T10:00:00.000Z',
            },
        ]);

        render(<ProjectsHome />, { wrapper: MemoryRouter });
        await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: /loading/i }));

        expect(screen.queryByRole('link', { name: /calendar/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
    });

    test('renders no delete bubble on project cards', async () => {
        api.get.mockResolvedValue([
            {
                id: 1,
                title: 'Build a drone',
                description: 'Layered plan',
                todoCount: 0,
                completedTodoCount: 0,
                datedSequences: [],
                createdAt: '2026-08-27T10:00:00.000Z',
                updatedAt: '2026-08-27T10:00:00.000Z',
            },
        ]);

        render(<ProjectsHome />, { wrapper: MemoryRouter });
        await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: /loading/i }));

        expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
    });
});
