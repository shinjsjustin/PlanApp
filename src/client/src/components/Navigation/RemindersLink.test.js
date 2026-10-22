import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RemindersLink from './RemindersLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const renderLink = () => render(<MemoryRouter><RemindersLink /></MemoryRouter>);

test('renders a neon-button link to /reminders on desktop', () => {
    useIsPhone.mockReturnValue(false);
    renderLink();
    const link = screen.getByRole('link', { name: 'Reminders' });
    expect(link.getAttribute('href')).toBe('/reminders');
    expect(link.className).toContain('neon-button');
});

test('renders nothing on a phone', () => {
    useIsPhone.mockReturnValue(true);
    const { container } = renderLink();
    expect(container).toBeEmptyDOMElement();
});
