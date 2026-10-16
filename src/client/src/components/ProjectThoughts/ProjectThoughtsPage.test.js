import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProjectThoughtsPage from './ProjectThoughtsPage';
import useProjectThoughts from '../../hooks/useProjectThoughts';
import useIsPhone from '../../hooks/useIsPhone';

jest.mock('../../hooks/useProjectThoughts');
jest.mock('../../hooks/useIsPhone');

let hook;

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/projects/7/thoughts']}>
            <Routes>
                <Route path="/projects/:id/thoughts" element={<ProjectThoughtsPage />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    hook = {
        status: 'ready',
        text: 'my ideas',
        projectTitle: 'Garden',
        updatedAt: null,
        saveState: 'saved',
        error: null,
        setText: jest.fn(),
        reload: jest.fn(),
    };
    useProjectThoughts.mockImplementation(() => hook);
    useIsPhone.mockReturnValue(false);
});

describe('ProjectThoughtsPage', () => {
    test('loads thoughts for the id in the url', () => {
        renderPage();
        expect(useProjectThoughts).toHaveBeenCalledWith('7');
    });

    test('shows back link, heading, project title and the text', () => {
        renderPage();
        expect(screen.getByRole('link', { name: '← Back to project' })).toHaveAttribute('href', '/projects/7');
        expect(screen.getByRole('heading', { name: 'Thoughts' })).toBeInTheDocument();
        expect(screen.getByText('Garden')).toBeInTheDocument();
        const box = screen.getByRole('textbox', { name: 'Project thoughts' });
        expect(box).toHaveValue('my ideas');
        expect(box).toHaveAttribute('maxlength', '20000');
        expect(box).toHaveAttribute('placeholder', 'Ideas, wishes and fixes for this project…');
    });

    test('typing calls setText', () => {
        renderPage();
        userEvent.type(screen.getByRole('textbox', { name: 'Project thoughts' }), 'x');
        expect(hook.setText).toHaveBeenCalledWith('my ideasx');
    });

    test.each([
        ['saving', null, 'Saving…'],
        ['saved', null, 'Saved'],
        ['unsaved', null, 'Not saved'],
        ['error', 'Network down', 'Not saved'],
    ])('status line for %s', (saveState, error, label) => {
        hook = { ...hook, saveState, error };
        renderPage();
        const line = screen.getByRole('status');
        expect(line).toHaveTextContent(label);
        if (error) expect(line).toHaveTextContent(error);
        else expect(line.textContent).toBe(label);
    });

    test('conflict shows an alert, keeps the text, and Reload calls reload', () => {
        hook = { ...hook, saveState: 'conflict', error: 'Version mismatch' };
        renderPage();
        expect(screen.getByRole('alert')).toHaveTextContent(
            'These thoughts changed somewhere else. Copy anything you need, then reload.'
        );
        expect(screen.getByRole('textbox', { name: 'Project thoughts' })).toHaveValue('my ideas');
        userEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(hook.reload).toHaveBeenCalledTimes(1);
    });

    test('no alert or Reload without a conflict', () => {
        renderPage();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
    });

    test('shows loading text and no textarea while loading', () => {
        hook = { ...hook, status: 'loading' };
        renderPage();
        expect(screen.getByText('Loading thoughts…')).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    test('load failure shows the error and Try again calls reload', () => {
        hook = { ...hook, status: 'error', error: 'Could not load' };
        renderPage();
        expect(screen.getByText('Could not load')).toBeInTheDocument();
        userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(hook.reload).toHaveBeenCalledTimes(1);
    });

    test('adds the phone modifier on a phone', () => {
        useIsPhone.mockReturnValue(true);
        const { container } = renderPage();
        expect(container.querySelector('main')).toHaveClass('project-thoughts-page--phone');
    });
});
