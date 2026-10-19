import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TabBar from './TabBar';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

beforeEach(() => {
    useIsPhone.mockReturnValue(true);
    localStorage.setItem('token', 't');
});
afterEach(() => localStorage.clear());

test('phone tab bar renders on /address-book with an Address Book link to /address-book', () => {
    render(<MemoryRouter initialEntries={['/address-book']}><TabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Address Book' })).toHaveAttribute('href', '/address-book');
    expect(screen.queryByRole('link', { name: 'Places' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
});
