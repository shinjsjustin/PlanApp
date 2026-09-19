import { screen, within } from '@testing-library/react';

import { click, type } from '../../testUtils/interact';
import { baseSequence, collapse, renderCard } from './sequenceCardHarness';

// The to-dos inside an open card: every outstanding item uses one sortable row
// in stored position order, while finished work stays in the DONE group. The
// split is lifecycle-only, so a pin changes emphasis without moving a row or
// replacing the status it already carries.

const filed = (
    id,
    {
        text = `To-do ${id}`,
        position = 0,
        sequenceId = 100,
        status = 'incomplete',
        completedAt = null,
        isPinned = false,
    } = {}
) => ({
    id,
    projectId: 1,
    sequenceId,
    text,
    status,
    completedAt,
    position,
    isPinned,
});

const outstandingTexts = () =>
    within(screen.getByRole('list', { name: /to-dos in learn aerodynamics/i }))
        .getAllByRole('listitem')
        .map((item) => item.querySelector('.todo-item-text')?.textContent)
        .filter(Boolean);

const doneTexts = () =>
    [...document.querySelectorAll('.sequence-done-text')].map((node) => node.textContent);

describe('SequenceCard to-dos', () => {
    test('renders every outstanding to-do through the same row in position order', () => {
        // Act — deliberately supplied out of order.
        renderCard({
            todos: [
                filed(3, { text: 'Third', position: 2 }),
                filed(1, { text: 'First', position: 0 }),
                filed(2, { text: 'Second', position: 1 }),
            ],
        });

        // Assert
        expect(outstandingTexts()).toEqual(['First', 'Second', 'Third']);
        expect(document.querySelectorAll('.todo-item')).toHaveLength(3);
    });

    test('renders no frontier labels around the outstanding list', () => {
        // Act
        renderCard({ todos: [filed(1), filed(2, { position: 1 })] });

        // Assert
        expect(screen.queryByText('NEXT STEP')).not.toBeInTheDocument();
        expect(screen.queryByText('NEXT')).not.toBeInTheDocument();
        expect(screen.queryByText('THEN')).not.toBeInTheDocument();
    });

    test('emphasizes the row matching the top pinned to-do id', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { position: 0 }),
                filed(2, { position: 1, isPinned: true }),
                filed(3, { position: 2, isPinned: true }),
            ],
        });

        // Assert
        expect(screen.getByText('To-do 2').closest('.todo-item')).toHaveClass(
            'todo-row--top-pinned'
        );
        expect(screen.getByText('To-do 3').closest('.todo-item')).not.toHaveClass(
            'todo-row--top-pinned'
        );
    });

    test('keeps blocked styling alongside top-pin emphasis', () => {
        // Act
        renderCard({ todos: [filed(1, { status: 'blocked', isPinned: true })] });

        // Assert
        expect(screen.getByText('To-do 1').closest('.todo-item')).toHaveClass(
            'todo-item--blocked',
            'todo-row--top-pinned'
        );
    });

    test('keeps a complete top pin crossed out and emphasized in DONE', () => {
        // Act
        renderCard({
            todos: [filed(1, { status: 'complete', isPinned: true })],
        });

        // Assert
        const text = screen.getByText('To-do 1');
        expect(text).toHaveClass('sequence-done-text');
        expect(text.closest('.sequence-done-item')).toHaveClass('todo-row--top-pinned');
        expect(text.closest('.sequence-done-item')).toContainElement(
            document.querySelector('.todo-pin-icon')
        );
    });

    test('leaves out to-dos belonging elsewhere', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { text: 'Mine', position: 0 }),
                filed(2, { text: 'Mine too', position: 1 }),
                filed(3, { text: 'Another sequence', sequenceId: 101 }),
                filed(4, { text: 'Loose', sequenceId: null }),
            ],
        });

        // Assert
        expect(outstandingTexts()).toEqual(['Mine', 'Mine too']);
    });

    test('takes the to-dos out of sight when the card is folded', async () => {
        // Arrange
        const { rerenderWith } = renderCard({
            todos: [filed(1, { text: 'Read about lift' })],
        });

        // Act
        await collapse(rerenderWith);

        // Assert — the sortable list itself is gone.
        expect(
            screen.queryByRole('list', { name: /to-dos in learn aerodynamics/i })
        ).not.toBeInTheDocument();
    });

    // -- Completing ---------------------------------------------------------

    test('completes an outstanding to-do from its circle', async () => {
        // Arrange
        const { value } = renderCard({ todos: [filed(1, { text: 'Read about lift' })] });

        // Act
        await click(screen.getByRole('button', { name: /complete “read about lift”/i }));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1,
            expect.objectContaining({ path: '/todos/1', changes: { status: 'complete' } })
        );
    });

    test('keeps the remaining outstanding list uniform once the first is done', () => {
        // Arrange — the same list, with the first already ticked.
        renderCard({
            todos: [
                filed(1, { text: 'First', position: 0, status: 'complete' }),
                filed(2, { text: 'Second', position: 1 }),
            ],
        });

        // Assert
        expect(outstandingTexts()).toEqual(['Second']);
    });

    // -- The DONE group -----------------------------------------------------

    test('collects finished to-dos into the DONE group, out of the main flow', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { text: 'Done one', position: 0, status: 'complete' }),
                filed(2, { text: 'Still to do', position: 1 }),
            ],
        });

        // Assert
        expect(doneTexts()).toEqual(['Done one']);
        expect(outstandingTexts()).not.toContain('Done one');
    });

    test('counts them in the group heading', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { position: 0, status: 'complete' }),
                filed(2, { position: 1, status: 'complete' }),
                filed(3, { position: 2 }),
            ],
        });

        // Assert
        expect(screen.getByText('DONE · 2')).toBeInTheDocument();
    });

    test('renders no DONE group when nothing is finished', () => {
        // Act
        renderCard({ todos: [filed(1)] });

        // Assert
        expect(document.querySelector('.sequence-done')).toBeNull();
    });

    // A card that has been worked for a week should not be mostly history, so a
    // long group arrives shut and a short one arrives open.
    test('opens a short DONE group by default', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { text: 'One', position: 0, status: 'complete' }),
                filed(2, { text: 'Two', position: 1, status: 'complete' }),
            ],
        });

        // Assert
        expect(doneTexts()).toEqual(['One', 'Two']);
    });

    test('keeps a long DONE group shut until it is asked for', async () => {
        // Arrange
        renderCard({
            todos: [1, 2, 3, 4].map((id) =>
                filed(id, { text: `Done ${id}`, position: id, status: 'complete' })
            ),
        });
        expect(doneTexts()).toEqual([]);

        // Act
        await click(screen.getByRole('button', { name: /done · 4/i }));

        // Assert
        expect(doneTexts()).toEqual(['Done 1', 'Done 2', 'Done 3', 'Done 4']);
    });

    test('un-completes a to-do from its DONE row', async () => {
        // Arrange
        const { value } = renderCard({
            todos: [filed(1, { text: 'Read about lift', status: 'complete' })],
        });

        // Act
        await click(screen.getByRole('button', { name: /mark “read about lift” incomplete/i }));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'todos',
            1,
            expect.objectContaining({ changes: { status: 'incomplete' } })
        );
    });

    test('dates a finished to-do from its completion stamp, not its last edit', () => {
        // Arrange — yesterday, so the label is a weekday.
        const completedAt = new Date();
        completedAt.setDate(completedAt.getDate() - 1);
        const expected = completedAt.toLocaleDateString(undefined, { weekday: 'short' });

        // Act
        renderCard({
            todos: [filed(1, { status: 'complete', completedAt: completedAt.toISOString() })],
        });

        // Assert
        expect(document.querySelector('.sequence-done-day')).toHaveTextContent(expected);
    });

    test('leaves the margin blank for a finished to-do carrying no stamp', () => {
        // Act — a row completed before the column existed.
        renderCard({ todos: [filed(1, { status: 'complete', completedAt: null })] });

        // Assert
        expect(document.querySelector('.sequence-done-day')).toBeNull();
    });

    // -- Adding -------------------------------------------------------------

    test('adds a to-do to the end of this sequence from the add row', async () => {
        // Arrange
        const { value } = renderCard({ todos: [filed(1, { position: 0 })] });

        // Act — the row is a placeholder until it is clicked, then a field.
        await click(screen.getByText(/new to-do in learn aerodynamics/i));
        await type(
            screen.getByRole('textbox', { name: /new to-do in learn aerodynamics/i }),
            'Read about drag{enter}'
        );

        // Assert
        expect(value.createEntity).toHaveBeenCalledWith(
            'todos',
            expect.objectContaining({
                path: '/projects/1/todos',
                body: { text: 'Read about drag', sequenceId: 100 },
                optimistic: expect.objectContaining({ sequenceId: 100, position: 1 }),
            })
        );
    });

    test('keeps the field open after Enter, so a list can be typed straight in', async () => {
        // Arrange
        renderCard();
        await click(screen.getByText(/new to-do in learn aerodynamics/i));

        // Act
        await type(
            screen.getByRole('textbox', { name: /new to-do in learn aerodynamics/i }),
            'First one{enter}'
        );

        // Assert
        const field = screen.getByRole('textbox', { name: /new to-do in learn aerodynamics/i });
        expect(field).toHaveValue('');
        expect(field).toHaveFocus();
    });

    test('sends nothing for a blank entry', async () => {
        // Arrange
        const { value } = renderCard();
        await click(screen.getByText(/new to-do in learn aerodynamics/i));

        // Act
        await type(
            screen.getByRole('textbox', { name: /new to-do in learn aerodynamics/i }),
            '   {enter}'
        );

        // Assert
        expect(value.createEntity).not.toHaveBeenCalled();
    });

    test('offers the add row only while the card is open', async () => {
        // Arrange
        const { rerenderWith } = renderCard();

        // Act
        await collapse(rerenderWith);

        // Assert
        expect(screen.queryByText(/new to-do in learn aerodynamics/i)).not.toBeInTheDocument();
    });

    // -- The header badge ---------------------------------------------------

    test('counts what is left in the header badge', () => {
        // Act
        renderCard({
            todos: [
                filed(1, { position: 0, status: 'complete' }),
                filed(2, { position: 1 }),
                filed(3, { position: 2 }),
            ],
        });

        // Assert
        expect(screen.getByText('2 LEFT')).toBeInTheDocument();
    });

    test('says BLOCKED instead of a count once the sequence is blocked', () => {
        // Act
        renderCard({
            sequence: { ...baseSequence, isBlocked: true },
            todos: [filed(1)],
        });

        // Assert
        expect(screen.getByText('BLOCKED')).toBeInTheDocument();
        expect(screen.queryByText(/\d+ LEFT/)).not.toBeInTheDocument();
    });
});
