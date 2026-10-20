import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

const renderHome = () => render(<MemoryRouter><Home /></MemoryRouter>);

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
});
