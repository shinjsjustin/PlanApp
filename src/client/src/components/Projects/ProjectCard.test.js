import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { clear, click, type } from '../../testUtils/interact';

import ProjectCard from './ProjectCard';

// The drone project from spec section 1, as `GET /api/projects` serves it: two
// threads of work are ready, the rotor design is still gated behind electronics.
const project = {
    id: 1,
    title: 'Build a drone',
    description: 'Layered plan',
    todoCount: 4,
    completedTodoCount: 1,
    sequenceCount: 5,
    frontier: [
        {
            sequenceId: 2,
            sequenceTitle: 'Learn electronics',
            nextTodo: { id: 202, text: 'Understand ESCs' },
        },
        {
            sequenceId: 5,
            sequenceTitle: 'Connect drone to wifi',
            nextTodo: { id: 502, text: 'Bring up the radio' },
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

    render(
        <MemoryRouter initialEntries={['/projects']}>
            <ul>
                <ProjectCard
                    project={{ ...project, ...props.project }}
                    onRename={onRename}
                    onDelete={onDelete}
                />
            </ul>
            <LocationProbe />
        </MemoryRouter>
    );

    return { onRename, onDelete };
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
 * The drop-down panel is covered by a stretched link of its own rather than by
 * the title's, because the title's `::after` is `inset: 0` on the card and the
 * panel hangs below that box. Resolving a click in the panel to the title's link
 * here would model a hit test no browser performs.
 *
 * Returns the stretched link, or null when the click lands on a control of its
 * own instead.
 */
const stretchedLinkTargetFor = (element) => {
    const card = element.closest('.project-card');

    if (!card || card.classList.contains('project-card--editing')) return null;
    if (element.closest('.project-card-raised, .delete-bubble')) return null;
    if (element.closest('a')) return element.closest('a');

    const reveal = element.closest('.project-card-reveal');
    if (reveal) return reveal.querySelector('.project-card-reveal-link');

    return card.querySelector('.project-card-title a');
};

/** The frontier list, addressed by its label rather than by the card's own <li>. */
const frontierList = () => screen.getByRole('list', { name: /ready now/i });

describe('ProjectCard', () => {
    test('shows the title, description and progress', () => {
        renderCard();

        expect(screen.getByRole('heading', { name: 'Build a drone' })).toBeInTheDocument();
        expect(screen.getByText('Layered plan')).toBeInTheDocument();
        expect(screen.getByText('1/4 to-dos done')).toBeInTheDocument();
    });

    test('keeps the progress out of the title block, in the reveal panel instead', () => {
        // Arrange & Act
        renderCard();

        // Assert — spec section 8 moved overall progress out of the title block
        // and into the hover/focus reveal, so the collapsed face is the name alone.
        const heading = screen.getByRole('heading', { name: 'Build a drone' });
        expect(heading.closest('.project-card-heading')).not.toHaveTextContent('1/4 to-dos done');

        const progress = screen.getByText('1/4 to-dos done');
        expect(progress.closest('.project-card-reveal')).not.toBeNull();
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

        test('a click on the frontier lands on the link too', () => {
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

    test('keeps the frontier in a reveal panel rather than on the collapsed face', () => {
        // Arrange & Act
        renderCard({
            project: {
                ...project,
                frontier: [
                    {
                        sequenceId: 7,
                        sequenceTitle: 'Learn electronics',
                        nextTodo: { id: 1, text: 'Learn to solder' },
                    },
                ],
            },
        });

        // Assert — the title is the card's face; everything else is in the reveal,
        // which is present for a screen reader and hidden only by CSS.
        const title = screen.getByRole('link', { name: project.title });
        expect(title.closest('.project-card-reveal')).toBeNull();

        const frontierEntry = screen.getByText('Learn electronics');
        expect(frontierEntry.closest('.project-card-reveal')).not.toBeNull();
    });

    test('keeps the progress line out of the collapsed face too', () => {
        // Arrange & Act
        renderCard();

        // Assert
        const progress = screen.getByText(/to-dos done/);
        expect(progress.closest('.project-card-reveal')).not.toBeNull();
    });

    describe('the ready frontier', () => {
        test('lists one line per ready sequence, naming its next incomplete to-do', () => {
            // Arrange & Act
            renderCard();

            // Assert
            const lines = within(frontierList()).getAllByRole('listitem');
            expect(lines).toHaveLength(2);
            expect(lines[0]).toHaveTextContent('Learn electronics');
            expect(lines[0]).toHaveTextContent('Understand ESCs');
            expect(lines[1]).toHaveTextContent('Connect drone to wifi');
            expect(lines[1]).toHaveTextContent('Bring up the radio');
        });

        test('says so when a ready sequence has no to-dos in it yet', () => {
            // Arrange & Act — ready, and genuinely empty.
            renderCard({
                project: {
                    frontier: [
                        {
                            sequenceId: 2,
                            sequenceTitle: 'Learn electronics',
                            nextTodo: null,
                            isStalled: false,
                        },
                    ],
                },
            });

            // Assert
            const [line] = within(frontierList()).getAllByRole('listitem');
            expect(line).toHaveTextContent('Learn electronics');
            expect(line).toHaveTextContent(/no to-dos yet/i);
        });

        /**
         * Since blocked to-dos stopped counting as a next step (spec section 3)
         * a sequence holding nothing but blocked work also arrives with a null
         * `nextTodo`, and calling that "No to-dos yet" would be false about a
         * sequence that is full of them.
         */
        test('says the work is blocked when a ready sequence has nothing startable', () => {
            // Arrange & Act
            renderCard({
                project: {
                    frontier: [
                        {
                            sequenceId: 2,
                            sequenceTitle: 'Learn aerodynamics',
                            nextTodo: null,
                            isStalled: true,
                        },
                    ],
                },
            });

            // Assert
            const [line] = within(frontierList()).getAllByRole('listitem');
            expect(line).toHaveTextContent('Learn aerodynamics');
            expect(line).toHaveTextContent(/blocked/i);
            expect(line).not.toHaveTextContent(/no to-dos yet/i);
        });

        test('shows a completed state when nothing is left to start', () => {
            // Arrange & Act — an empty frontier, but the project does hold work,
            // and none of it is blocked.
            renderCard({
                project: {
                    frontier: [],
                    sequenceCount: 5,
                    blockedSequenceCount: 0,
                    todoCount: 4,
                    completedTodoCount: 4,
                },
            });

            // Assert
            expect(screen.getByText(/every sequence is complete/i)).toBeInTheDocument();
            expect(screen.queryByRole('list', { name: /ready now/i })).not.toBeInTheDocument();
            expect(screen.queryByText(/no sequences yet/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/nothing can be started/i)).not.toBeInTheDocument();
        });

        test('shows a blocked state, not a completed one, when everything left is blocked', () => {
            // Arrange & Act — an empty frontier, but the project still holds
            // sequences, and some of what's left is blocked.
            renderCard({
                project: {
                    frontier: [],
                    sequenceCount: 5,
                    blockedSequenceCount: 2,
                    todoCount: 4,
                    completedTodoCount: 1,
                },
            });

            // Assert — this must NOT read as "every sequence is complete": a
            // stuck project is not a finished one.
            expect(screen.getByText(/nothing can be started/i)).toBeInTheDocument();
            expect(screen.queryByText(/every sequence is complete/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/no sequences yet/i)).not.toBeInTheDocument();
            expect(screen.queryByRole('list', { name: /ready now/i })).not.toBeInTheDocument();
        });

        test('distinguishes a project with no sequences from a completed one', () => {
            // Arrange & Act — also an empty frontier, but nothing has been planned.
            renderCard({
                project: {
                    frontier: [],
                    sequenceCount: 0,
                    todoCount: 1,
                    completedTodoCount: 0,
                },
            });

            // Assert
            expect(screen.getByText(/no sequences yet/i)).toBeInTheDocument();
            expect(screen.queryByText(/every sequence is complete/i)).not.toBeInTheDocument();
            expect(screen.queryByRole('list', { name: /ready now/i })).not.toBeInTheDocument();
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
});
