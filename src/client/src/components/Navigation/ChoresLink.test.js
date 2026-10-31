import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChoresLink from './ChoresLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const renderLink = () => render(<MemoryRouter><ChoresLink /></MemoryRouter>);

test('renders a neon-button link to /chores on desktop', () => {
    useIsPhone.mockReturnValue(false);
    renderLink();
    const link = screen.getByRole('link', { name: 'Chores' });
    expect(link.getAttribute('href')).toBe('/chores');
    expect(link.className).toContain('neon-button');
});

test('renders nothing on a phone', () => {
    useIsPhone.mockReturnValue(true);
    const { container } = renderLink();
    expect(container).toBeEmptyDOMElement();
});
