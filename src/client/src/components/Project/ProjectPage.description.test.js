import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ProjectPage from './ProjectPage';
import { ApiError, api } from '../../lib/api';

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useParams: () => ({ id: '7' }),
}));
jest.mock('../../lib/api', () => ({
    ...jest.requireActual('../../lib/api'),
    api: { get: jest.fn(), patch: jest.fn() },
}));

const GRAPH = {
    project: { id: 7, title: 'Project', description: 'Stored' },
    layers: [], sequences: [], todos: [],
};
const field = () => screen.getByRole('textbox', { name: 'Project description' });
const load = async () => {
    render(<MemoryRouter><ProjectPage /></MemoryRouter>);
    await act(async () => {});
};
const blurDraft = (value) => {
    fireEvent.change(field(), { target: { value } });
    fireEvent.blur(field());
};
const flushSave = () => act(async () => jest.runOnlyPendingTimers());

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    api.get.mockResolvedValue(GRAPH);
});
afterEach(() => jest.useRealTimers());

test.each([
    ['  First\n\nSecond  ', 'First\n\nSecond'],
    [' \n  ', null],
])('PATCH normalizes %j and retains the saved value on reload', async (draft, description) => {
    api.patch.mockResolvedValue({ ...GRAPH.project, description, pinnedTodos: [] });
    const { unmount } = render(<MemoryRouter><ProjectPage /></MemoryRouter>);
    await act(async () => {});

    blurDraft(draft);
    expect(api.patch).not.toHaveBeenCalled();
    await flushSave();

    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('/projects/7', { description });
    expect(field()).toHaveValue(description || '');
    unmount();
    api.get.mockResolvedValue({ ...GRAPH, project: { ...GRAPH.project, description } });
    await load();
    expect(field()).toHaveValue(description || '');
});

test('flushes a blurred description when route navigation unmounts the project page', async () => {
    api.patch.mockResolvedValue({ ...GRAPH.project, description: 'Draft', pinnedTodos: [] });
    render(
        <MemoryRouter initialEntries={['/projects/7']}>
            <Routes>
                <Route path="/projects/:id" element={<ProjectPage />} />
                <Route path="/projects" element={<p>Projects home</p>} />
            </Routes>
        </MemoryRouter>
    );
    await act(async () => {});

    blurDraft('Draft');
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: '← All projects' }));

    expect(await screen.findByText('Projects home')).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.patch).toHaveBeenCalledWith('/projects/7', { description: 'Draft' });
});

test('optimistically updates then rolls back and shows the existing toast on PATCH failure', async () => {
    let rejectPatch;
    api.patch.mockReturnValue(new Promise((resolve, reject) => { rejectPatch = reject; }));
    await load();

    blurDraft('  Optimistic\ntext  ');
    await flushSave();
    expect(field()).toHaveValue('Optimistic\ntext');
    await act(async () => rejectPatch(new ApiError('Description could not be saved.', 500)));

    expect(field()).toHaveValue('Stored');
    expect(screen.getByRole('alert')).toHaveTextContent('Description could not be saved.');
});
