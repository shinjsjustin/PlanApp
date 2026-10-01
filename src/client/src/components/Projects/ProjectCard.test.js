import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { clear, click, type } from '../../testUtils/interact';

import ProjectCard from './ProjectCard';

// The card contract returned by every project endpoint. Pins are already in the
// deterministic order the server chose and the card must preserve it.
const project = {
    id: 1,
    title: 'Build a drone',
    description: 'Layered plan',
    todoCount: 4,
    completedTodoCount: 1,
    pinnedTodos: [
        {
            id: 202,
            text: 'Understand ESCs',
            status: 'incomplete',
            sequenceId: 2,
            sequenceTitle: 'Learn electronics',
            position: 0,
            isPinned: true,
        },
        {
            id: 502,
            text: 'Bring up the radio',
            status: 'blocked',
            sequenceId: 5,
            sequenceTitle: 'Connect drone to wifi',
            position: 0,
            isPinned: true,
        },
    ],
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-27T10:00:00.000Z',
};

/** Reports the current route, so a test can see whether a click navigated. */
const LocationProbe = () => <p data-testid="location">{useLocation().pathname}</p>;

const renderCard = (props = {}) => {
    const onRename = props.onRename ?? jest.fn().mockResolvedValue(undefined);
    const onDelete = props.onDelete ?? jest.fn().mockResolvedValue(undefined);
    const onRecolor = props.onRecolor ?? jest.fn().mockResolvedValue(undefined);

    render(
        <MemoryRouter initialEntries={['/projects']}>
            <ul>
                <ProjectCard
                    project={{ ...project, ...props.project }}
                    onRename={onRename}
                    onDelete={onDelete}
                    onRecolor={onRecolor}
                    placement={props.placement}
                />
            </ul>
            <LocationProbe />
        </MemoryRouter>
    );

    return { onRename, onDelete, onRecolor };
};

const currentPath = () => screen.getByTestId('location').textContent;

/**
 * The hover-reveal × in the card's top-right — the card's only delete path.
 *
 * It is always rendered and always in the tab order; only its opacity depends on
 * hover, which is CSS and belongs to the browser, not to jsdom.
 */
const deleteBubble = () => screen.getByRole('button', { name: 'Delete “Build a drone”' });

/**
 * What a browser's hit test would resolve a click on `element` to, given the
 * stretched link that covers the card.
 *
 * jsdom has no layout, so it cannot hit-test the `::after` overlay the card
 * leans on — under Jest a click on the body simply never reaches the link. What
 * it can check is the contract that overlay depends on, which is where the
 * mistakes live: the link only stretches while the card is idle, and only over
 * the parts of the card that have not been lifted back above it. The click
 * itself is covered in `tests/e2e/criticalFlow.spec.js`, in a real browser.
 *
 *
 * Returns the stretched link, or null when the click lands on a control of its
 * own instead.
 */
const stretchedLinkTargetFor = (element) => {
    const card = element.closest('.project-card');

    if (!card || card.classList.contains('project-card--editing')) return null;
    if (element.closest('.project-card-raised, .delete-bubble')) return null;
    if (element.closest('a')) return element.closest('a');

    return card.querySelector('.project-card-title a');
};

/** The pinned list, addressed by its label rather than by the card's own <li>. */
const pinnedList = () => screen.getByRole('list', { name: /^pinned$/i });

describe('ProjectCard', () => {
    test('shows the title, description and progress', () => {
        renderCard();

        expect(screen.getByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(screen.getByText('Layered plan')).toBeInTheDocument();
        expect(screen.getByText('1/4 to-dos done')).toBeInTheDocument();
    });

    test('renders the progress in the card, outside the title block', () => {
        // Arrange & Act
        renderCard();

        // Assert
        const heading = screen.getByRole('heading', { name: 'Build a drone' });
        expect(heading.closest('.project-card-heading')).not.toHaveTextContent('1/4 to-dos done');
        expect(screen.getByText('1/4 to-dos done').closest('.project-card')).not.toBeNull();
    });

    test('has no drop-down panel: nothing in the card is a reveal wrapper', () => {
        // Arrange & Act
        renderCard();

        // Assert
        expect(document.querySelector('[class*="reveal"]')).toBeNull();
    });

    test('puts Rename inside the hover control', () => {
        // Arrange & Act
        renderCard();

        // Assert
        const control = screen.getByRole('button', { name: /rename/i }).closest('.project-card-hover-control');
        expect(control).not.toBeNull();
        expect(control.closest('.project-card')).not.toBeNull();
    });

    test('links its title through to the project page', () => {
        renderCard();

        expect(screen.getByRole('link', { name: 'Build a drone' })).toHaveAttribute(
            'href',
            '/projects/1'
        );
    });

    describe('the whole card as the way in', () => {
        test('a click on the card body lands on the link into the project', () => {
            // Arrange
            renderCard();

            // Act — the progress text, which is body, not a control.
            const target = stretchedLinkTargetFor(screen.getByText('1/4 to-dos done'));

            // Assert
            expect(target).toHaveAttribute('href', '/projects/1');
        });

        test('a click on a pinned row lands on the link too', () => {
            // Arrange
            renderCard();

            // Act
            const target = stretchedLinkTargetFor(screen.getByText('Understand ESCs'));

            // Assert
            expect(target).toHaveAttribute('href', '/projects/1');
        });

        test('a click on Rename or the delete × belongs to the button, not the link', async () => {
            // Arrange
            renderCard();

            // Act & Assert — the buttons keep their own clicks...
            expect(
                stretchedLinkTargetFor(screen.getByRole('button', { name: /rename/i }))
            ).toBeNull();
            expect(stretchedLinkTargetFor(deleteBubble())).toBeNull();

            // ...and pressing one opens its own affordance without navigating.
            await click(screen.getByRole('button', { name: /rename/i }));
            expect(screen.getByLabelText(/project title/i)).toBeInTheDocument();
            expect(currentPath()).toBe('/projects');
        });

        test('does not stretch the link over the card while it is being edited', async () => {
            // Arrange
            renderCard();

            // Act — the delete confirmation still renders the title link.
            await click(deleteBubble());

            // Assert
            const confirmText = screen.getByText(/delete “Build a drone”\?/i);
            expect(stretchedLinkTargetFor(confirmText)).toBeNull();
            expect(currentPath()).toBe('/projects');
        });

        test('lifts the rename form above the stretched link', async () => {
            // Arrange
            renderCard();

            // Act
            await click(screen.getByRole('button', { name: /rename/i }));

            // Assert
            expect(screen.getByLabelText(/project title/i).closest('.project-card-raised')).not.toBeNull();
        });

        test('lifts an inline error above the stretched link', async () => {
            // Arrange
            renderCard();

            // Act
            await click(screen.getByRole('button', { name: /rename/i }));
            await clear(screen.getByLabelText(/project title/i));
            await click(screen.getByRole('button', { name: /^save$/i }));

            // Assert
            expect((await screen.findByRole('alert')).closest('.project-card-raised')).not.toBeNull();
        });
    });

    test('renders description and pins in the card, not inside the title heading', () => {
        // Arrange & Act
        renderCard();

        // Assert
        const card = screen.getByRole('link', { name: project.title }).closest('.project-card');
        expect(within(card).getByText('Layered plan')).toBeInTheDocument();
        expect(within(card).getByText('Learn electronics')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: project.title })).not.toHaveTextContent('Layered plan');
    });

    describe('the pinned list', () => {
        test('shows each pin icon, text, and filed sequence in server order', () => {
            // Arrange & Act
            renderCard();

            // Assert
            const lines = within(pinnedList()).getAllByRole('listitem');
            expect(lines).toHaveLength(2);
            expect(lines[0]).toHaveTextContent('📌Understand ESCsLearn electronics');
            expect(lines[1]).toHaveTextContent('📌Bring up the radioConnect drone to wifi');
        });

        test('labels an unorganized pin', () => {
            renderCard({
                project: {
                    pinnedTodos: [{
                        id: 9,
                        text: 'Buy propellers',
                        status: 'incomplete',
                        sequenceId: null,
                        sequenceTitle: null,
                        position: 0,
                        isPinned: true,
                    }],
                },
            });

            const [line] = within(pinnedList()).getAllByRole('listitem');
            expect(line).toHaveTextContent('Buy propellers');
            expect(line).toHaveTextContent('Unorganized');
        });

        test('keeps a complete pin listed and crossed out', () => {
            renderCard({
                project: {
                    pinnedTodos: [{ ...project.pinnedTodos[0], status: 'complete' }],
                },
            });

            const [line] = within(pinnedList()).getAllByRole('listitem');
            expect(line).toHaveClass('pinned-line--complete');
            expect(within(line).getByText('Understand ESCs')).toBeInTheDocument();
        });

        test('marks a blocked pin without removing it', () => {
            renderCard({
                project: {
                    pinnedTodos: [{ ...project.pinnedTodos[0], status: 'blocked' }],
                },
            });

            const [line] = within(pinnedList()).getAllByRole('listitem');
            expect(line).toHaveClass('pinned-line--blocked');
            expect(within(line).getByText('Understand ESCs')).toBeInTheDocument();
        });

        test('shows one explicit empty state for a project without pins', () => {
            renderCard({ project: { pinnedTodos: [] } });

            expect(screen.getByText('No pinned to-dos yet.')).toBeInTheDocument();
            expect(screen.queryByRole('list', { name: /^pinned$/i })).not.toBeInTheDocument();
        });
    });

    test('rejects a blank rename inline without calling the API', async () => {
        // Arrange
        const { onRename } = renderCard();

        // Act
        await click(screen.getByRole('button', { name: /rename/i }));
        await clear(screen.getByLabelText(/project title/i));
        await click(screen.getByRole('button', { name: /^save$/i }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(/title/i);
        expect(onRename).not.toHaveBeenCalled();
    });

    test('surfaces a failed rename and keeps the field open', async () => {
        // Arrange
        const onRename = jest.fn().mockRejectedValue(new Error('Something went wrong.'));
        renderCard({ onRename });

        // Act
        await click(screen.getByRole('button', { name: /rename/i }));
        await type(screen.getByLabelText(/project title/i), '!');
        await click(screen.getByRole('button', { name: /^save$/i }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
        expect(screen.getByLabelText(/project title/i)).toHaveValue('Build a drone!');
    });

    test('asks for confirmation before deleting', async () => {
        // Arrange
        const { onDelete } = renderCard();

        // Act
        await click(deleteBubble());

        // Assert
        expect(onDelete).not.toHaveBeenCalled();
        expect(screen.getByText(/delete “Build a drone”\?/i)).toBeInTheDocument();

        // Act
        await click(screen.getByRole('button', { name: /yes, delete it/i }));

        // Assert
        expect(onDelete).toHaveBeenCalledWith(1);
    });

    test('abandons a delete when the confirmation is dismissed', async () => {
        // Arrange
        const { onDelete } = renderCard();

        // Act
        await click(deleteBubble());
        await click(screen.getByRole('button', { name: /keep it/i }));

        // Assert
        expect(onDelete).not.toHaveBeenCalled();
        expect(deleteBubble()).toBeInTheDocument();
    });

    describe('the delete ×', () => {
        test('names the project it would delete', () => {
            // Arrange & Act
            renderCard();

            // Assert — one shared affordance, one named target.
            expect(deleteBubble()).toHaveClass('delete-bubble');
        });

        test('is the card that opts into the shared hover reveal', () => {
            // Arrange & Act
            renderCard();

            // Assert — the parent class the shared CSS block hangs the reveal on.
            expect(deleteBubble().closest('.project-card')).toHaveClass('has-delete-bubble');
        });

        test('replaces the visible Delete button, leaving Rename in place', () => {
            // Arrange & Act
            renderCard();

            // Assert
            expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
        });

        test('withdraws while a form is open over the card, like the other actions', async () => {
            // Arrange
            renderCard();

            // Act
            await click(screen.getByRole('button', { name: /rename/i }));

            // Assert
            expect(
                screen.queryByRole('button', { name: 'Delete “Build a drone”' })
            ).not.toBeInTheDocument();
        });
    });

    describe('card color', () => {
        const paletteButton = () => screen.getByRole('button', { name: 'Change color of “Build a drone”' });
        const card = () => screen.getByRole('heading', { name: 'Build a drone' }).closest('.project-card');

        test('puts the palette button in the hover control', () => {
            renderCard();

            expect(paletteButton()).toHaveClass('project-card-hover-control');
        });

        test('opens and closes the palette from the button', async () => {
            renderCard();

            await click(paletteButton());
            expect(screen.getByRole('dialog', { name: 'Card color' })).toBeInTheDocument();

            await click(paletteButton());
            expect(screen.queryByRole('dialog')).toBeNull();
        });

        test('picking a swatch calls onRecolor and closes the palette', async () => {
            const { onRecolor } = renderCard();

            await click(paletteButton());
            await click(screen.getByRole('button', { name: 'red berry' }));

            expect(onRecolor).toHaveBeenCalledWith(1, '#980000');
            expect(screen.queryByRole('dialog')).toBeNull();
        });

        test('picking Default recolors with null', async () => {
            const { onRecolor } = renderCard({ project: { color: '#980000' } });

            await click(paletteButton());
            await click(screen.getByRole('button', { name: 'Default' }));

            expect(onRecolor).toHaveBeenCalledWith(1, null);
        });

        test('shows a failed recolor inline', async () => {
            renderCard({ onRecolor: jest.fn().mockRejectedValue(new Error('Could not save color.')) });

            await click(paletteButton());
            await click(screen.getByRole('button', { name: 'red berry' }));

            expect(await screen.findByRole('alert')).toHaveTextContent('Could not save color.');
        });

        test('withdraws the stretched link and lifts the card while open', async () => {
            renderCard();

            await click(paletteButton());

            expect(card()).toHaveClass('project-card--editing');
            expect(card()).toHaveClass('project-card--palette-open');
        });

        test('uses the color as background with light text on a dark color', () => {
            renderCard({ project: { color: '#000000' } });

            expect(card()).toHaveStyle({ background: '#000000' });
            expect(card()).toHaveClass('project-card--light-text');
        });

        test('keeps dark text on a light color', () => {
            renderCard({ project: { color: '#ffffff' } });

            expect(card()).toHaveStyle({ background: '#ffffff' });
            expect(card()).not.toHaveClass('project-card--light-text');
        });

        test('keeps the default look with a null color', () => {
            renderCard({ project: { color: null } });

            expect(card().style.background).toBe('');
            expect(card()).not.toHaveClass('project-card--light-text');
        });
    });

    describe('placement', () => {
        const cardEl = () =>
            screen.getByRole('heading', { name: 'Build a drone' }).closest('.project-card');

        test('puts the card at its row and spans two columns, keeping its color', () => {
            renderCard({ project: { color: '#ffffff' }, placement: { row: 3, column: 5 } });

            expect(cardEl().style.gridRow).toBe('3');
            expect(cardEl().style.gridColumn).toBe('5 / span 2');
            expect(cardEl()).toHaveStyle({ background: '#ffffff' });
        });

        test('sets no grid position without a placement', () => {
            renderCard();

            expect(cardEl().style.gridRow).toBe('');
            expect(cardEl().style.gridColumn).toBe('');
        });
    });
});
