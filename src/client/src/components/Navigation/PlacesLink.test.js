import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlacesLink from './PlacesLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const renderLink = () => render(<MemoryRouter><PlacesLink /></MemoryRouter>);

test('renders a neon-button link to /places on desktop', () => {
    useIsPhone.mockReturnValue(false);
    renderLink();
    const link = screen.getByRole('link', { name: 'Places' });
    expect(link.getAttribute('href')).toBe('/places');
    expect(link.className).toContain('neon-button');
});

test('renders nothing on a phone', () => {
    useIsPhone.mockReturnValue(true);
    const { container } = renderLink();
    expect(container).toBeEmptyDOMElement();
});
