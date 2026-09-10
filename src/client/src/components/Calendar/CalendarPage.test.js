import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import CalendarPage from './CalendarPage';
import { api } from '../../lib/api';

jest.mock('../../lib/api');

const renderPage = () => render(<CalendarPage />, { wrapper: MemoryRouter });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('CalendarPage', () => {
    test('shows a loading state before anything arrives', () => {
        // Arrange
        api.get.mockReturnValue(new Promise(() => {}));

        // Act
        renderPage();

        // Assert
        expect(screen.getByLabelText('Loading calendar…')).toBeInTheDocument();
    });

    test('offers a retry when the calendar fails to load', async () => {
        // Arrange — an empty strip and a failed load must not look alike
        api.get.mockRejectedValue(new Error('Could not reach the server.'));

        // Act
        renderPage();

        // Assert
        expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    test('retrying asks again', async () => {
        // Arrange
        api.get.mockRejectedValue(new Error('Offline'));
        renderPage();
        await screen.findByRole('button', { name: 'Try again' });
        api.get.mockResolvedValue({ days: [], items: [] });

        // Act
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

        // Assert
        await waitFor(() => expect(screen.queryByText('Offline')).not.toBeInTheDocument());
    });

    test('renders the two panels once loaded', async () => {
        // Arrange
        api.get.mockImplementation((path) =>
            path === '/calendar' ? Promise.resolve({ days: [], items: [] }) : Promise.resolve([])
        );

        // Act
        renderPage();

        // Assert
        expect(await screen.findByRole('region', { name: 'Days' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Projects' })).toBeInTheDocument();
    });
});
