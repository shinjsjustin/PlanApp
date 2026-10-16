import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';
import { loadStylesheets } from '../../testUtils/stylesheet';
import PhoneProjectView from './PhoneProjectView';

// Layer 10 holds sequences 100 and 101; layer 20 holds 200.
const seq = (id, layerId, title, position) => ({
    id, projectId: 1, layerId, title, position, isBlocked: false, isCollapsed: false,
});
const todo = (id, sequenceId, status, position) => ({
    id, projectId: 1, sequenceId, text: `Todo ${id}`, status, position, isPinned: false,
});

const buildValue = ({ sequences, todos = [] } = {}) => ({
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: {
            10: { id: 10, projectId: 1, title: 'Learning', position: 0 },
            20: { id: 20, projectId: 1, title: 'Building', position: 1 },
        },
        sequences: Object.fromEntries(
            (sequences ?? [
                seq(100, 10, 'Aerodynamics', 0),
                seq(101, 10, 'Electronics', 1),
                seq(200, 20, 'Frame', 0),
            ]).map((s) => [s.id, s])
        ),
        todos: Object.fromEntries(todos.map((t) => [t.id, t])),
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
});

const renderView = (options) => {
    const value = buildValue(options);
    render(
        <ProjectProvider value={value}>
            <PhoneProjectView />
        </ProjectProvider>
    );
    return value;
};

const swipe = (from, to) => {
    const box = document.querySelector('.phone-sequence');
    fireEvent.touchStart(box, { touches: [{ clientX: from[0], clientY: from[1] }] });
    fireEvent.touchEnd(box, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};

const LEFT = [[300, 100], [100, 100]];
const RIGHT = [[100, 100], [300, 100]];
const UP = [[100, 400], [100, 100]];
const DOWN = [[100, 100], [100, 400]];

beforeEach(() => localStorage.clear());

describe('PhoneProjectView', () => {
    test('renders only the first sequence with layer, position and to-dos by position', () => {
        renderView({
            todos: [todo(2, 100, 'incomplete', 1), todo(1, 100, 'incomplete', 0), todo(3, 101, 'incomplete', 0)],
        });

        expect(screen.getByText('Learning')).toBeInTheDocument();
        expect(screen.getByText('Aerodynamics')).toBeInTheDocument();
        expect(screen.getByText('1 of 2')).toBeInTheDocument();
        expect(screen.queryByText('Electronics')).not.toBeInTheDocument();
        expect(screen.queryByText('Todo 3')).not.toBeInTheDocument();
        const items = within(screen.getByRole('list')).getAllByRole('listitem');
        expect(items.map((li) => li.textContent)).toEqual(['Todo 1', 'Todo 2']);
    });

    test('starts at the remembered sequence', () => {
        localStorage.setItem('planapp:lastSequence:1', '101');
        renderView();
        expect(screen.getByText('Electronics')).toBeInTheDocument();
        expect(screen.getByText('2 of 2')).toBeInTheDocument();
    });

    test('swiping left steps to the next sequence and remembers it', () => {
        renderView();
        swipe(...LEFT);
        expect(screen.getByText('Electronics')).toBeInTheDocument();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('101');
    });

    test('swiping right steps back', () => {
        localStorage.setItem('planapp:lastSequence:1', '101');
        renderView();
        swipe(...RIGHT);
        expect(screen.getByText('Aerodynamics')).toBeInTheDocument();
    });

    test.each([['up', UP], ['down', DOWN]])('swiping %s changes nothing', (_n, [from, to]) => {
        renderView();
        swipe(from, to);
        expect(screen.getByText('Aerodynamics')).toBeInTheDocument();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
    });

    test('on the top layer the down arrow names the next layer and the up arrow is disabled', () => {
        renderView();
        const down = screen.getByRole('button', { name: 'Layer below: Building' });
        expect(down).toBeEnabled();
        expect(down).toHaveTextContent('Building');
        const up = screen.getByRole('button', { name: 'No layer above' });
        expect(up).toBeDisabled();
        expect(up.querySelector('.phone-layer-arrow-name')).toBeNull();
    });

    test('tapping the down arrow shows the layer first sequence and remembers it', () => {
        renderView();
        fireEvent.click(screen.getByRole('button', { name: 'Layer below: Building' }));
        expect(screen.getByText('Frame')).toBeInTheDocument();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('200');
        expect(screen.getByRole('button', { name: 'Layer above: Learning' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'No layer below' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Layer above: Learning' }));
        expect(screen.getByText('Aerodynamics')).toBeInTheDocument();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
    });

    test('falls back to the first sequence when the shown one vanishes, and still swipes', () => {
        localStorage.setItem('planapp:lastSequence:1', '200');
        const full = buildValue();
        const { rerender } = render(
            <ProjectProvider value={full}>
                <PhoneProjectView />
            </ProjectProvider>
        );
        expect(screen.getByText('Frame')).toBeInTheDocument();

        const reloaded = buildValue({
            sequences: [seq(100, 10, 'Aerodynamics', 0), seq(101, 10, 'Electronics', 1)],
        });
        rerender(
            <ProjectProvider value={reloaded}>
                <PhoneProjectView />
            </ProjectProvider>
        );

        expect(screen.getByText('Aerodynamics')).toBeInTheDocument();
        expect(screen.queryByText('No sequences yet')).not.toBeInTheDocument();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
        swipe(...LEFT);
        expect(screen.getByText('Electronics')).toBeInTheDocument();
    });

    test('writes the shown sequence on first render', () => {
        renderView();
        expect(localStorage.getItem('planapp:lastSequence:1')).toBe('100');
    });

    test('each to-do offers a tick and an edit button; the tick sets its status', () => {
        const value = renderView({
            todos: [todo(1, 100, 'incomplete', 0), todo(2, 100, 'complete', 1)],
        });

        const buttons = within(screen.getByRole('list')).getAllByRole('button');
        expect(buttons).toHaveLength(4);
        expect(screen.getByRole('button', { name: 'Edit “Todo 1”' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit “Todo 2”' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Complete “Todo 1”/ }));
        expect(value.updateEntity).toHaveBeenCalledWith('todos', 1, {
            path: '/todos/1',
            changes: { status: 'complete' },
        });

        const done = screen.getByRole('button', { name: 'Mark “Todo 2” incomplete' });
        expect(done).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(done);
        expect(value.updateEntity).toHaveBeenCalledWith('todos', 2, {
            path: '/todos/2',
            changes: { status: 'incomplete' },
        });
    });

    test('shows No sequences yet for an empty project', () => {
        renderView({ sequences: [] });
        expect(screen.getByText('No sequences yet')).toBeInTheDocument();
    });
});

describe('ProjectPhone.css', () => {
    test('uses tokens for colours and spacing and fills the space above the tab bar', () => {
        const css = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'Styling', 'ProjectPhone.css'),
            'utf8'
        );
        expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
        expect(css).not.toMatch(/rgba?\(/i);
        expect(css).not.toMatch(/\d+px/);
        expect(css).toContain('var(--tab-bar-height)');
        expect(css).toContain('env(safe-area-inset-bottom)');

        const unload = loadStylesheets('ProjectPhone.css');
        renderView();
        expect(getComputedStyle(document.querySelector('.phone-sequence-scroll')).overflowY).toBe('auto');
        expect(getComputedStyle(document.querySelector('.phone-layer-arrow-name')).textOverflow).toBe('ellipsis');
        unload();
    });
});
