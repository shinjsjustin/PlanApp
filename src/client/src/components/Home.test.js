import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

afterEach(() => localStorage.clear());

describe('Home', () => {
    test.each([
        ['About', '/about'],
        ['Privacy', '/privacy'],
        ['Terms', '/terms'],
    ])('links %s to %s as a plain anchor', (name, href) => {
        renderHome();
        expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    });

    test('offers no Register button', () => {
        renderHome();
        expect(screen.queryByRole('button', { name: /register/i })).toBeNull();
    });

    test('wraps a ShinPlan heading and description in a main element', () => {
        renderHome();
        const main = screen.getByRole('main');
        expect(main).toContainElement(screen.getByRole('heading', { level: 1, name: 'ShinPlan' }));
        expect(main).toHaveTextContent(/projects, calendar days and people in one place/i);
    });

    test('shows no template text', () => {
        renderHome();
        expect(screen.queryByText(/New Project|Tech Stack|TODO/)).toBeNull();
    });

    test('signed out offers Login and no Projects link', () => {
        renderHome();
        expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
    });

    test('signed in offers a Projects link to /projects and no Login', () => {
        localStorage.setItem('token', 'abc');
        renderHome();
        expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
        expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
    });
});
