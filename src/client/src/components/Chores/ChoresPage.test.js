import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

import ChoresPage from './ChoresPage';
import useChores from '../../hooks/useChores';

jest.mock('../../hooks/useChores');
jest.mock('./ChoreHistory', () => ({ chore, onChanged }) => (
    <button type="button" onClick={onChanged}>{`history of ${chore.name}`}</button>
));
jest.mock('./ChoreForm', () => ({ chore, onSubmit, onCancel, onArchive, saveFailed }) => (
    <div>
        <p>{chore ? `form for ${chore.name}` : 'blank form'}</p>
        {saveFailed && <p>save failed</p>}
        <button type="button" onClick={() => onSubmit({ name: 'Saved' })}>Save</button>
        <button type="button" onClick={onCancel}>Cancel form</button>
        {onArchive && <button type="button" onClick={onArchive}>Archive form</button>}
    </div>
));

const chore = (id, name, status) => ({ id, name, status, area: null, window: { min: 7, max: 14 }, lastDone: null });
const UNDO_MS = 10000;

let hook;
let pending;

const flush = () => act(async () => {});
const tapDone = async (index = 0) => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Done' })[index]);
    await flush();
};

beforeEach(() => {
    jest.useFakeTimers();
    pending = null;
    hook = {
        status: 'ready', error: null,
        chores: [chore(1, 'Clean bathrooms', 'overdue'), chore(2, 'Dust', 'upcoming'), chore(3, 'Mop', 'never')],
        add: jest.fn().mockResolvedValue(true), edit: jest.fn().mockResolvedValue(true),
        markDone: jest.fn(async (id) => (pending ? pending : { id: 100 + id })),
        undo: jest.fn().mockResolvedValue(true), reload: jest.fn(),
        archived: [], archive: jest.fn().mockResolvedValue(true), restore: jest.fn(), seed: jest.fn(),
    };
    useChores.mockImplementation(() => hook);
});

afterEach(() => jest.useRealTimers());

describe('ChoresPage', () => {
    test('shows heading, New chore button and no status group headings', () => {
        render(<ChoresPage />);
        expect(screen.getByRole('heading', { level: 1, name: 'Chores' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'New chore' })).toBeInTheDocument();
        expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
    });

    describe('schedule', () => {
        const dated = (id, name, status, dueFrom, dueBy) => ({ ...chore(id, name, status), dueFrom, dueBy });
        const cardNames = (container) => Array.from(container.querySelectorAll('ul.chore-grid > li .chore-title > span:first-child'))
            .map((el) => el.textContent);
        let scrollIntoView;

        beforeEach(() => {
            jest.setSystemTime(new Date(2026, 9, 20, 12));
            scrollIntoView = jest.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
            hook.chores = [
                dated(1, 'Later', 'upcoming', '2026-10-28', '2026-11-02'),
                dated(2, 'Late', 'overdue', '2026-10-10', '2026-10-15'),
                dated(3, 'Soon', 'due', '2026-10-18', '2026-10-22'),
                chore(4, 'Never', 'never'),
            ];
        });

        afterEach(() => { delete Element.prototype.scrollIntoView; });

        test('renders the timeline, then four filters with All pressed, then cards in due order', () => {
            const { container } = render(<ChoresPage />);
            const timeline = container.querySelector('.chore-timeline');
            const filters = container.querySelector('.chores-filter');
            const grid = container.querySelector('ul.chore-grid');
            expect(timeline.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            expect(filters.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
            const buttons = Array.from(filters.querySelectorAll('button'));
            expect(buttons.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
                ['All', 'true'], ['Due within 3 days', 'false'], ['Overdue', 'false'], ['Never done', 'false'],
            ]);
            expect(cardNames(container)).toEqual(['Late', 'Soon', 'Later', 'Never']);
        });

        test.each([
            ['Due within 3 days', ['Soon']],
            ['Overdue', ['Late']],
            ['Never done', ['Never']],
        ])('the %s filter shows only matching cards', (label, names) => {
            const { container } = render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: label, pressed: false }));
            expect(cardNames(container)).toEqual(names);
            expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
        });

        test('an empty filter says No chores match.', () => {
            hook.chores = [dated(3, 'Soon', 'due', '2026-10-18', '2026-10-22')];
            render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
            expect(screen.getByText('No chores match.')).toBeInTheDocument();
        });

        test('the filter resets to All on a new visit', () => {
            const first = render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
            first.unmount();
            render(<ChoresPage />);
            expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        });

        test('tapping a timeline row scrolls its visible card to centre and highlights it for 2 seconds', () => {
            const { container } = render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: /Soon/, hidden: false, selector: '.chore-timeline-row' }));
            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
            expect(scrollIntoView.mock.instances[0].id).toBe('chore-3');
            expect(container.querySelector('#chore-3')).toHaveClass('chore-row--highlight');
            act(() => { jest.advanceTimersByTime(1999); });
            expect(container.querySelector('#chore-3')).toHaveClass('chore-row--highlight');
            act(() => { jest.advanceTimersByTime(1); });
            expect(container.querySelector('#chore-3')).not.toHaveClass('chore-row--highlight');
        });

        test('tapping a row whose card is filtered out switches to All first', () => {
            const { container } = render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: 'Overdue' }));
            expect(container.querySelector('#chore-3')).toBeNull();
            fireEvent.click(screen.getByRole('button', { name: /Soon/, selector: '.chore-timeline-row' }));
            expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
            expect(scrollIntoView.mock.instances[0].id).toBe('chore-3');
            expect(container.querySelector('#chore-3')).toHaveClass('chore-row--highlight');
        });

        test('unmounting clears the highlight timer', () => {
            const { unmount } = render(<ChoresPage />);
            fireEvent.click(screen.getByRole('button', { name: /Soon/, selector: '.chore-timeline-row' }));
            unmount();
            expect(jest.getTimerCount()).toBe(0);
        });
    });

    test('shows No chores yet. when the list is empty', () => {
        hook.chores = [];
        render(<ChoresPage />);
        expect(screen.getByText('No chores yet.')).toBeInTheDocument();
    });

    test('shows loading text and the error alert', () => {
        hook.status = 'loading';
        hook.error = 'Boom';
        render(<ChoresPage />);
        expect(screen.getByText('Loading chores...')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    });

    test('Done by offers Justin, Jacklin and Other and defaults to Justin', async () => {
        render(<ChoresPage />);
        const select = screen.getByLabelText('Done by');
        expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['Justin', 'Jacklin', 'Other']);
        expect(select).toHaveValue('Justin');
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Justin');
    });

    test('Done uses the chosen person', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Jacklin' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Jacklin');
    });

    test('Other reveals a 50 char name field whose trimmed value is used', async () => {
        render(<ChoresPage />);
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Other' } });
        const input = screen.getByLabelText('Name');
        expect(input).toHaveAttribute('maxLength', '50');
        fireEvent.change(input, { target: { value: '  Grandma ' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Grandma');
    });

    test('Other with a blank name falls back to Justin', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Other' } });
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
        await tapDone();
        expect(hook.markDone).toHaveBeenCalledWith(1, 'Justin');
    });

    test('a successful Done shows an Undo bar that calls undo and clears', async () => {
        render(<ChoresPage />);
        fireEvent.change(screen.getByLabelText('Done by'), { target: { value: 'Jacklin' } });
        await tapDone();
        expect(screen.getByRole('status')).toHaveTextContent('Done: Clean bathrooms by Jacklin');
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(hook.undo).toHaveBeenCalledWith(1, 101);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    test('a failed Done shows no Undo bar', async () => {
        hook.markDone.mockResolvedValue(null);
        render(<ChoresPage />);
        await tapDone();
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    });

    test('Undo disappears after 10 seconds, not before', async () => {
        render(<ChoresPage />);
        await tapDone();
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1); });
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
        act(() => { jest.advanceTimersByTime(1); });
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    });

    test('the next Done replaces the Undo bar and restarts the timer', async () => {
        render(<ChoresPage />);
        await tapDone(0);
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1000); });
        hook.markDone.mockResolvedValueOnce(null);
        await tapDone(1);
        expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
        await tapDone(1);
        expect(screen.getByRole('status')).toHaveTextContent('Done: Dust');
        act(() => { jest.advanceTimersByTime(UNDO_MS - 1); });
        expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    });

    test('New chore opens the form and closes it after a successful add', async () => {
        render(<ChoresPage />);
        fireEvent.click(screen.getByRole('button', { name: 'New chore' }));
        expect(screen.getByText('blank form')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await flush();
        expect(hook.add).toHaveBeenCalledWith({ name: 'Saved' });
        expect(screen.queryByText('blank form')).not.toBeInTheDocument();
    });

    test('Edit submits through edit and a failure keeps the dialog with the error', async () => {
        hook.edit.mockResolvedValue(false);
        hook.error = 'Name taken';
        render(<ChoresPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
        expect(screen.getByText('form for Clean bathrooms')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await flush();
        expect(hook.edit).toHaveBeenCalledWith(1, { name: 'Saved' });
        expect(screen.getByText('form for Clean bathrooms')).toBeInTheDocument();
        expect(screen.getByText('save failed')).toBeInTheDocument();
        expect(screen.getAllByText('Name taken').length).toBeGreaterThan(1);
    });

    test('History opens a dialog titled with the chore name whose onChanged reloads', () => {
        render(<ChoresPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'History' })[0]);
        expect(screen.getByText('History: Clean bathrooms')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'history of Clean bathrooms' }));
        expect(hook.reload).toHaveBeenCalledTimes(1);
    });

    test('Archive is offered only when editing and archives after confirmation', async () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ChoresPage />);
        fireEvent.click(screen.getByRole('button', { name: 'New chore' }));
        expect(screen.queryByRole('button', { name: 'Archive form' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel form' }));
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Archive form' }));
        await flush();
        expect(confirm).toHaveBeenCalledWith('Archive this chore?');
        expect(hook.archive).toHaveBeenCalledWith(2);
        expect(screen.queryByText('form for Dust')).not.toBeInTheDocument();
        confirm.mockRestore();
    });

    test('declining the archive confirmation does nothing', async () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
        render(<ChoresPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Archive form' }));
        await flush();
        expect(hook.archive).not.toHaveBeenCalled();
        expect(screen.getByText('form for Dust')).toBeInTheDocument();
        confirm.mockRestore();
    });

    test('a failed archive keeps the dialog open', async () => {
        const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
        hook.archive.mockResolvedValue(false);
        render(<ChoresPage />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
        fireEvent.click(screen.getByRole('button', { name: 'Archive form' }));
        await flush();
        expect(screen.getByText('form for Dust')).toBeInTheDocument();
        confirm.mockRestore();
    });

    test('archived chores list with Restore buttons only when non-empty', () => {
        const { container, unmount } = render(<ChoresPage />);
        expect(container.querySelector('.chores-archived')).toBeNull();
        unmount();
        hook.archived = [chore(7, 'Old gutters', 'never'), chore(8, 'Old fridge', 'never')];
        const view = render(<ChoresPage />);
        const section = view.container.querySelector('.chores-archived');
        expect(section.querySelector('h2')).toHaveTextContent('Archived');
        expect(section).toHaveTextContent('Old gutters');
        fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[1]);
        expect(hook.restore).toHaveBeenCalledWith(8);
    });

    test('Load starter chores shows only when empty and calls seed', () => {
        const { unmount } = render(<ChoresPage />);
        expect(screen.queryByRole('button', { name: 'Load starter chores' })).not.toBeInTheDocument();
        unmount();
        hook.chores = [];
        render(<ChoresPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Load starter chores' }));
        expect(hook.seed).toHaveBeenCalledTimes(1);
    });
});
