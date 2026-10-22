import React from 'react';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import ProjectsHome from './ProjectsHome';
import { api } from '../../lib/api';

jest.mock('../../hooks/useIsPhone', () => ({ __esModule: true, default: () => false }));

jest.mock('../../lib/api', () => ({
    api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    ApiError: class ApiError extends Error {},
}));

test('header actions link to Combinations without a project filter', async () => {
    api.get.mockResolvedValue([]);
    render(<ProjectsHome />, { wrapper: MemoryRouter });
    await waitForElementToBeRemoved(() => screen.queryByRole('status', { name: /loading/i }));
    expect(screen.getByRole('link', { name: 'Combinations' }).getAttribute('href')).toBe('/combinations');
});
