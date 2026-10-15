import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThoughtsLink from './ThoughtsLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const renderLink = () => render(<MemoryRouter><ThoughtsLink /></MemoryRouter>);

test('renders a neon-button link to /thoughts on desktop', () => {
    useIsPhone.mockReturnValue(false);
    renderLink();
    const link = screen.getByRole('link', { name: 'Thoughts' });
    expect(link.getAttribute('href')).toBe('/thoughts');
    expect(link.className).toContain('neon-button');
});

test('renders nothing on a phone', () => {
    useIsPhone.mockReturnValue(true);
    const { container } = renderLink();
    expect(container).toBeEmptyDOMElement();
});
