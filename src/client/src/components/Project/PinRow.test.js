import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { api } from '../../lib/api';
import useProjectGraph from '../../hooks/useProjectGraph';
import { PinSelectionProvider, usePinSelectionState } from './PinSelectionContext';
import PinControls from './PinControls';
import { PinRowContent, usePinRow } from './PinRow';

jest.mock('../../lib/api', () => ({ api: { get: jest.fn(), put: jest.fn() } }));
const todos = [1, 2].map((id) => ({ id, text: `Task ${id}`, isPinned: false }));
const Row = ({ todo }) => {
    const { isSelectable, rowClassName, control } = usePinRow(todo);
    return <div data-testid={`row-${todo.id}`} className={rowClassName}>
        <PinRowContent isSelectable={isSelectable}><button>Complete {todo.text}</button></PinRowContent>
        {control}
    </div>;
};
const Harness = () => {
    const graph = useProjectGraph(1);
    const selection = usePinSelectionState(graph.setTodosPinned);
    return <PinSelectionProvider value={selection}>
        <PinControls selection={selection} />
        {Object.values(graph.state.todos).map((todo) => <Row key={todo.id} todo={todo} />)}
        {graph.state.actionError && <div role="alert">{graph.state.actionError}</div>}
    </PinSelectionProvider>;
};

test('highlights eligible rows before hover and distinguishes selection using design tokens', () => {
    const css = readFileSync(join(__dirname, '../Styling/Todos.css'), 'utf8');
    const baseline = css.match(/\.pin-select-control\s*\{([^}]+)\}/)[1];
    const selected = css.match(/\.pin-select-control\[aria-pressed='true'\]\s*\{([^}]+)\}/)[1];
    expect(baseline).toMatch(/border:\s*1px dashed var\(--color-accent\)/);
    expect(selected).toMatch(/border-style:\s*solid/);
    expect(selected).toMatch(/background:.*var\(--color-accent\)/);
});

test.each([
    ['Pin', true], ['Pin', false], ['Unpin', true], ['Unpin', false],
])('protects submitted rows and freezes selection until %s settles (success=%s)', async (operation, success) => {
    const initialTodos = todos.map((todo) => ({ ...todo, isPinned: operation === 'Unpin' }));
    api.get.mockResolvedValue({ project: { id: 1 }, layers: [], sequences: [], todos: initialTodos });
    let resolve, reject;
    api.put.mockReturnValue(new Promise((yes, no) => { resolve = yes; reject = no; }));
    render(<Harness />);
    await screen.findByText('Complete Task 1');
    fireEvent.click(screen.getByRole('button', { name: operation }));
    fireEvent.click(screen.getByRole('button', { name: `${operation} “Task 1”` }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    const submitted = screen.getByRole('button', { name: `${operation} “Task 1”` });
    expect(submitted).toBeDisabled();
    expect(submitted).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('row-1').querySelector('.todo-item-content')).toHaveAttribute('inert');
    const other = screen.getByRole('button', { name: `${operation} “Task 2”` });
    expect(other).toBeDisabled();
    fireEvent.click(other);
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => success
        ? resolve({ todos: [{ ...todos[0], isPinned: operation === 'Pin' }] })
        : reject(new Error('Pin failed')));
    if (success) {
        expect(screen.getByRole('button', { name: 'Pin' })).toBeEnabled();
        expect(screen.getByTestId('row-1').querySelector('.todo-item-content')).not.toHaveAttribute('inert');
    } else {
        expect(screen.getByRole('alert')).toHaveTextContent('Pin failed');
        expect(screen.getByRole('button', { name: `${operation} “Task 1”` })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
    }
});
