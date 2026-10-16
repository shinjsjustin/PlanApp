import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectThoughtsLink from './ProjectThoughtsLink';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useIsPhone');

const renderLink = () =>
    render(<MemoryRouter><ProjectThoughtsLink projectId="7" /></MemoryRouter>);

test.each([[false], [true]])('renders a neon-button link to the project thoughts (phone: %s)', (isPhone) => {
    useIsPhone.mockReturnValue(isPhone);
    renderLink();
    const link = screen.getByRole('link', { name: 'Project thoughts' });
    expect(link.getAttribute('href')).toBe('/projects/7/thoughts');
    expect(link.className).toContain('neon-button');
});
