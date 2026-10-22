import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CombinationsLink from './CombinationsLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

test.each([
    [false, undefined, '/combinations'],
    [true, undefined, '/combinations'],
    [false, '7', '/combinations?project=7'],
    [true, '7', '/combinations?project=7'],
])('renders a neon-button link (phone: %s, projectId: %s)', (isPhone, projectId, href) => {
    useIsPhone.mockReturnValue(isPhone);
    render(<MemoryRouter><CombinationsLink projectId={projectId} /></MemoryRouter>);
    const link = screen.getByRole('link', { name: 'Combinations' });
    expect(link.getAttribute('href')).toBe(href);
    expect(link.className).toContain('neon-button');
});
