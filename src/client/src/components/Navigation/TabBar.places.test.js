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

test('phone tab bar renders on /places with a Places link to /places', () => {
    render(<MemoryRouter initialEntries={['/places']}><TabBar /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Places' })).toHaveAttribute('href', '/places');
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
});
