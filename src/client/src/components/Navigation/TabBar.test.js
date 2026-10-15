import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import TabBar from './TabBar';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const renderAt = (path) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes><Route path="*" element={<Where />} /></Routes>
            <TabBar />
        </MemoryRouter>
    );

beforeEach(() => {
    useIsPhone.mockReturnValue(true);
    localStorage.setItem('token', 't');
});
afterEach(() => localStorage.clear());

describe('TabBar', () => {
    it.each(['/projects', '/calendar'])('shows tabs and no Back on %s', (path) => {
        renderAt(path);
        expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Calendar' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    });

    it('shows Back on /projects/7', () => {
        renderAt('/projects/7');
        expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('renders nothing when not a phone', () => {
        useIsPhone.mockReturnValue(false);
        renderAt('/projects');
        expect(screen.queryByRole('navigation')).toBeNull();
    });

    it('renders nothing without a token', () => {
        localStorage.clear();
        renderAt('/projects');
        expect(screen.queryByRole('navigation')).toBeNull();
    });

    it.each(['/', '/login', '/register', '/post-register', '/access-denied'])(
        'renders nothing on %s', (path) => {
            renderAt(path);
            expect(screen.queryByRole('navigation')).toBeNull();
        }
    );

    it('Back goes to /projects when there is no in-app history', () => {
        window.history.replaceState(null, '');
        renderAt('/projects/7');
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByTestId('where')).toHaveTextContent('/projects');
        expect(screen.getByTestId('where').textContent).toBe('/projects');
    });

    it('Back steps back in history when idx > 0', () => {
        window.history.replaceState({ idx: 1 }, '');
        render(
            <MemoryRouter initialEntries={['/calendar', '/projects/7']} initialIndex={1}>
                <Routes><Route path="*" element={<Where />} /></Routes>
                <TabBar />
            </MemoryRouter>
        );
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByTestId('where').textContent).toBe('/calendar');
    });
});
