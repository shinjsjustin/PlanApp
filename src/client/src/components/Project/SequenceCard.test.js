import { act, fireEvent, screen, within } from '@testing-library/react';

import { click } from '../../testUtils/interact';
import {
    SAVE_DELAY,
    baseSequence,
    collapse,
    deleteBubble,
    todo,
    renderCard,
    expander,
} from './sequenceCardHarness';

// The card itself: it opens and closes and remembers which, its title is
// editable in place, its status is derived from its to-dos on every render, and
// deleting it warns first when there is work filed inside (spec decisions 2
// and 4).
//
// Folding is stored on the sequence now rather than held in the card, so the
// tests that fold go through the mutation and re-render with the answer — see
// `collapse` in the harness.

describe('SequenceCard', () => {
    test('shows the title in an editable field', () => {
        // Act
        renderCard();

        // Assert
        expect(screen.getByRole('textbox', { name: /sequence title/i })).toHaveValue(
            'Learn aerodynamics'
        );
    });

    test('is open when the sequence is not folded', () => {
        // Act
        renderCard();

        // Assert
        expect(expander()).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByText(baseSequence.description)).toBeInTheDocument();
    });

    test('is folded when the sequence says so', () => {
        // Act
        renderCard({ sequence: { ...baseSequence, isCollapsed: true } });

        // Assert
        expect(expander()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText(baseSequence.description)).not.toBeInTheDocument();
    });

    // Folding is remembered per sequence, so a canvas comes back the way it was
    // left. It travels the same optimistic path as every other patch.
    test('persists the fold on the sequence', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(expander());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({
                path: '/sequences/100',
                changes: { isCollapsed: true },
            })
        );
    });

    test('persists unfolding it again', async () => {
        // Arrange
        const { value } = renderCard({ sequence: { ...baseSequence, isCollapsed: true } });

        // Act
        await click(expander());

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ changes: { isCollapsed: false } })
        );
    });

    test('collapses in place', async () => {
        // Arrange
        const { rerenderWith } = renderCard();

        // Act
        await collapse(rerenderWith);

        // Assert
        expect(expander()).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText(baseSequence.description)).not.toBeInTheDocument();
    });

    // The card surface is a convenience layer over the expander button: the
    // whole inert face of a card opens it, because a card is the thing being
    // aimed at, not the chevron in its corner. Anything a person can operate —
    // the title field, a to-do, the spotlight, the blocked toggle, the add row —
    // must stay operable, so a click that lands on one of those never toggles.

    test('folds when the inert card surface is clicked', async () => {
        // Arrange — the footer's status word is inert face, not a control.
        const { value } = renderCard();

        // Act
        await click(screen.getByText('Incomplete'));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ changes: { isCollapsed: true } })
        );
    });

    test('leaves the card open when its title field is clicked', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(screen.getByRole('textbox', { name: /sequence title/i }));

        // Assert
        expect(value.updateEntity).not.toHaveBeenCalled();
    });

    test('stays open when a to-do inside it is clicked', async () => {
        // Arrange — two to-dos, so one is in the spotlight and one in the list.
        const { value } = renderCard({
            todos: [todo(1, 'incomplete'), todo(2, 'incomplete')],
        });

        // Act
        await click(screen.getByText('To-do 2'));

        // Assert
        expect(value.updateEntity).not.toHaveBeenCalled();
    });

    test('stays open when the spotlight is clicked', async () => {
        // Arrange
        const { value } = renderCard({ todos: [todo(1, 'incomplete')] });

        // Act
        await click(screen.getByText('To-do 1'));

        // Assert
        expect(value.updateEntity).not.toHaveBeenCalled();
    });

    test('stays open when the blocked toggle is clicked', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(screen.getByRole('button', { name: /blocked/i }));

        // Assert — the blocked patch, and nothing about folding.
        expect(value.updateEntity).toHaveBeenCalledTimes(1);
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ changes: { isBlocked: true } })
        );
    });

    test('stays open when the add row inside it is clicked', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(screen.getByText(/new to-do in learn aerodynamics/i));

        // Assert
        expect(value.updateEntity).not.toHaveBeenCalled();
    });

    test('says so when an open sequence has no description', () => {
        // Act
        renderCard({ sequence: { ...baseSequence, description: null } });

        // Assert
        expect(screen.getByText(/no description/i)).toBeInTheDocument();
    });

    test('shows a derived status of incomplete for an empty sequence', () => {
        // Act
        const { container } = renderCard();

        // Assert
        expect(screen.getByText('Incomplete')).toBeInTheDocument();
        expect(container.querySelector('.sequence-card--incomplete')).toBeInTheDocument();
    });

    test('shows complete once every to-do is done', () => {
        // Act
        const { container } = renderCard({ todos: [todo(1, 'complete'), todo(2, 'complete')] });

        // Assert
        expect(screen.getByText('Complete')).toBeInTheDocument();
        expect(container.querySelector('.sequence-card--complete')).toBeInTheDocument();
    });

    test('shows incomplete while any to-do is outstanding', () => {
        // Act
        const { container } = renderCard({ todos: [todo(1, 'complete'), todo(2, 'incomplete')] });

        // Assert
        expect(container.querySelector('.sequence-card--incomplete')).toBeInTheDocument();
    });

    test('shows the manual block ahead of the derived status', () => {
        // Act
        const { container } = renderCard({
            sequence: { ...baseSequence, isBlocked: true },
            todos: [todo(1, 'complete')],
        });

        // Assert — the status word in the footer, not the toggle beside it: an
        // open card shows both, and they read the same word.
        expect(container.querySelector('.sequence-card-status')).toHaveTextContent('Blocked');
        expect(container.querySelector('.sequence-card--blocked')).toBeInTheDocument();
    });

    test('sets the blocked override from the footer toggle', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(screen.getByRole('button', { name: /blocked/i }));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ path: '/sequences/100', changes: { isBlocked: true } })
        );
    });

    test('clears the blocked override from the footer toggle', async () => {
        // Arrange
        const { value } = renderCard({ sequence: { ...baseSequence, isBlocked: true } });

        // Act
        await click(screen.getByRole('button', { name: /blocked/i }));

        // Assert
        expect(value.updateEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ changes: { isBlocked: false } })
        );
    });

    test('says on or off through aria-pressed, not through colour alone', () => {
        // Act
        renderCard({ sequence: { ...baseSequence, isBlocked: true } });

        // Assert
        expect(screen.getByRole('button', { name: /blocked/i })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
    });

    test('patches the sequence when its title is edited and committed', () => {
        // Arrange
        jest.useFakeTimers();
        try {
            const { value } = renderCard();
            const field = screen.getByRole('textbox', { name: /sequence title/i });

            // Act
            fireEvent.change(field, { target: { value: 'Aerodynamics' } });
            fireEvent.blur(field);
            act(() => jest.advanceTimersByTime(SAVE_DELAY));

            // Assert
            expect(value.updateEntity).toHaveBeenCalledWith(
                'sequences',
                100,
                expect.objectContaining({ changes: { title: 'Aerodynamics' } })
            );
        } finally {
            jest.useRealTimers();
        }
    });

    test('asks before deleting a sequence holding to-dos, and says where they go', async () => {
        // Arrange
        const { value } = renderCard({ todos: [todo(1, 'incomplete')] });

        // Act
        await click(deleteBubble());

        // Assert
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveTextContent(/not deleted/i);
        expect(dialog).toHaveTextContent(/unorganized panel/i);
        expect(value.removeEntity).not.toHaveBeenCalled();
    });

    test('counts the finished to-dos in the delete prompt too', async () => {
        // Arrange — one done, one not: the prompt is about what is filed here,
        // not about what is left to do.
        renderCard({ todos: [todo(1, 'complete'), todo(2, 'incomplete')] });

        // Act
        await click(deleteBubble());

        // Assert
        expect(screen.getByRole('dialog')).toHaveTextContent('Its 2 to-dos');
    });

    test('deletes the sequence once the confirmation is accepted', async () => {
        // Arrange
        const { value } = renderCard({ todos: [todo(1, 'incomplete')] });
        await click(deleteBubble());

        // Act
        await click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

        // Assert
        expect(value.removeEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ path: '/sequences/100' })
        );
    });

    test('leaves the sequence alone when the confirmation is cancelled', async () => {
        // Arrange
        const { value } = renderCard({ todos: [todo(1, 'incomplete')] });
        await click(deleteBubble());

        // Act
        await click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

        // Assert
        expect(value.removeEntity).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('deletes an empty sequence without asking, since nothing is orphaned', async () => {
        // Arrange
        const { value } = renderCard();

        // Act
        await click(deleteBubble());

        // Assert
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(value.removeEntity).toHaveBeenCalledWith(
            'sequences',
            100,
            expect.objectContaining({ path: '/sequences/100' })
        );
    });

    describe('the delete ×', () => {
        test('sits on the card face, so a folded card can still be deleted', () => {
            // Arrange & Act
            renderCard({ sequence: { ...baseSequence, isCollapsed: true } });

            // Assert
            expect(expander()).toHaveAttribute('aria-expanded', 'false');
            expect(deleteBubble()).toHaveClass('delete-bubble');
        });

        test('is the card that opts into the shared hover reveal', () => {
            // Arrange & Act
            renderCard();

            // Assert
            expect(deleteBubble().closest('.sequence-card')).toHaveClass('has-delete-bubble');
        });

        test('replaces the Delete sequence button in the body', () => {
            // Arrange & Act — the body is open from the start.
            renderCard();

            // Assert
            expect(
                screen.queryByRole('button', { name: /^delete sequence$/i })
            ).not.toBeInTheDocument();
        });

        test('deletes rather than folding the card it is pinned to', async () => {
            // Arrange — a click on a control is that control's, never the card's.
            const { value } = renderCard();

            // Act
            await click(deleteBubble());

            // Assert
            expect(value.removeEntity).toHaveBeenCalledWith(
                'sequences',
                100,
                expect.objectContaining({ path: '/sequences/100' })
            );
            expect(value.updateEntity).not.toHaveBeenCalled();
        });
    });
});
