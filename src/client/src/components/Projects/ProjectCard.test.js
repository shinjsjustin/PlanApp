import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { clear, click, type } from '../../testUtils/interact';

import ProjectCard from './ProjectCard';

const TODAY = '2026-09-10';

const aSequence = (overrides = {}) => ({
    id: 2,
    title: 'Learn electronics',
    date: TODAY,
    owner: 'justin',
    description: null,
    isBlocked: false,
    layerId: 1,
    visitMinutes: null,
    todos: [
        { id: 202, text: 'Understand ESCs', status: 'incomplete', position: 0, visitMinutes: null },
        { id: 203, text: 'Solder motors', status: 'complete', position: 1, visitMinutes: null },
    ],
    ...overrides,
});

// The card contract returned by every project endpoint.
const project = {
    id: 1,
    title: 'Build a drone',
    description: 'Layered plan',
    todoCount: 4,
    completedTodoCount: 1,
    datedSequences: [aSequence()],
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
                    today={props.today ?? TODAY}
                    onRename={onRename}
                    onDelete={onDelete}
                    onRecolor={onRecolor}
                    placement={props.placement}
                    measureRef={props.measureRef}
                    canDelete={props.canDelete}
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

        test('a click on a today to-do lands on the link too', () => {
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

    test('renders description and the day sequence in the card, not inside the title heading', () => {
        // Arrange & Act
        renderCard();

        // Assert
        const card = screen.getByRole('link', { name: project.title }).closest('.project-card');
        expect(within(card).getByText('Layered plan')).toBeInTheDocument();
        expect(within(card).getByText('Learn electronics')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: project.title })).not.toHaveTextContent('Layered plan');
    });

    describe("today's sequences", () => {
        test("lists Justin's to-dos under the sequence title, complete ones with a done class", () => {
            renderCard();

            const list = screen.getByRole('list', { name: 'Learn electronics' });
            const [open, done] = within(list).getAllByRole('listitem');
            expect(open).toHaveTextContent('Understand ESCs');
            expect(open).not.toHaveClass('today-todo--complete');
            expect(done).toHaveTextContent('Solder motors');
            expect(done).toHaveClass('today-todo--complete');
        });

        test('labels a sequence by its description when it has one', () => {
            renderCard({ project: { datedSequences: [aSequence({ description: 'Wire the frame' })] } });

            expect(screen.getByRole('list', { name: 'Wire the frame' })).toBeInTheDocument();
            expect(screen.queryByText('Learn electronics')).not.toBeInTheDocument();
        });

        test('lists every one of Justin\'s sequences dated today', () => {
            renderCard({
                project: {
                    datedSequences: [
                        aSequence(),
                        aSequence({ id: 3, title: 'Flash firmware', todos: [] }),
                    ],
                },
            });

            expect(screen.getByRole('list', { name: 'Learn electronics' })).toBeInTheDocument();
            expect(screen.getByText('Flash firmware')).toBeInTheDocument();
        });

        test('shows the empty message when Justin has nothing today', () => {
            renderCard({ project: { datedSequences: [aSequence({ owner: 'bourne' })] } });

            expect(screen.getByText('No sequence for today.')).toBeInTheDocument();
        });

        test('treats a missing datedSequences as empty', () => {
            renderCard({ project: { datedSequences: undefined } });

            expect(screen.getByText('No sequence for today.')).toBeInTheDocument();
        });

        test('never shows sequences dated on other days, and has no pin remnants', () => {
            renderCard({
                project: {
                    datedSequences: [
                        aSequence({ date: '2026-09-11', title: 'Tomorrow thing' }),
                        aSequence({ id: 4, date: '2026-09-11', owner: 'bourne', title: 'Bourne tomorrow' }),
                    ],
                },
            });

            expect(screen.queryByText('Tomorrow thing')).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^bourne/i })).not.toBeInTheDocument();
            expect(screen.getByText('No sequence for today.')).toBeInTheDocument();
            expect(screen.queryByText(/pinned/i)).not.toBeInTheDocument();
            expect(document.querySelector('.project-card-pin-icon, .project-card-pins')).toBeNull();
        });

        describe("Bourne's sequences", () => {
            const bourneProject = {
                datedSequences: [
                    aSequence({
                        id: 7,
                        owner: 'bourne',
                        title: 'Bourne errands',
                        todos: [
                            { id: 1, text: 'Pick up parts', status: 'complete', position: 0, visitMinutes: null },
                            { id: 2, text: 'Drop off box', status: 'incomplete', position: 1, visitMinutes: null },
                            { id: 3, text: 'Call vendor', status: 'blocked', position: 2, visitMinutes: null },
                        ],
                    }),
                    aSequence({
                        id: 8,
                        owner: 'bourne',
                        title: 'Bourne more',
                        todos: [{ id: 4, text: 'Sort bins', status: 'complete', position: 0, visitMinutes: null }],
                    }),
                ],
            };

            test('summarizes complete of all to-dos on a collapsed raised button', () => {
                renderCard({ project: bourneProject });

                const button = screen.getByRole('button', { name: 'Bourne: 2 of 4 done' });
                expect(button).toHaveAttribute('aria-expanded', 'false');
                expect(button).toHaveClass('project-card-raised');
                expect(screen.queryByText('Pick up parts')).not.toBeInTheDocument();
            });

            test('expands and collapses his sequences on click', async () => {
                renderCard({ project: bourneProject });
                const button = screen.getByRole('button', { name: 'Bourne: 2 of 4 done' });

                await click(button);

                expect(button).toHaveAttribute('aria-expanded', 'true');
                const list = screen.getByRole('list', { name: 'Bourne errands' });
                const [done] = within(list).getAllByRole('listitem');
                expect(done).toHaveClass('today-todo--complete');
                expect(screen.getByRole('list', { name: 'Bourne more' })).toBeInTheDocument();

                await click(button);

                expect(button).toHaveAttribute('aria-expanded', 'false');
                expect(screen.queryByText('Pick up parts')).not.toBeInTheDocument();
            });
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

        test('places the card absolutely at top, left and width, keeping its color', () => {
            renderCard({
                project: { color: '#ffffff' },
                placement: { top: 120, left: 276, width: 260 },
            });

            expect(cardEl().style.position).toBe('absolute');
            expect(cardEl().style.top).toBe('120px');
            expect(cardEl().style.left).toBe('276px');
            expect(cardEl().style.width).toBe('260px');
            expect(cardEl()).toHaveStyle({ background: '#ffffff' });
        });

        test('sets no position, top, left or width without a placement', () => {
            renderCard();

            expect(cardEl().style.position).toBe('');
            expect(cardEl().style.top).toBe('');
            expect(cardEl().style.left).toBe('');
            expect(cardEl().style.width).toBe('');
        });

        test('hands the card li to measureRef', () => {
            const measureRef = jest.fn();
            renderCard({ measureRef });

            expect(measureRef).toHaveBeenCalledWith(cardEl());
            expect(cardEl().tagName).toBe('LI');
        });
    });
});

describe('ProjectCard delete and rename controls', () => {
    test('offers the delete bubble by default, as on desktop', () => {
        renderCard();

        expect(deleteBubble()).toBeInTheDocument();
    });

    test('renders no delete bubble when canDelete is false', () => {
        renderCard({ canDelete: false });

        expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
    });

    test('gives Rename the neon-button class inside the hover control', () => {
        renderCard();

        const rename = screen.getByRole('button', { name: 'Rename' });
        expect(rename).toHaveClass('neon-button');
        expect(rename.closest('.project-card-hover-control')).not.toBeNull();
    });
});

describe('Projects.css card text tone', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'Styling', 'Projects.css'),
        'utf8'
    );
    const rule = (selector) => {
        const escaped = selector.replace(/[.\\]/g, '\\$&');
        const match = new RegExp(`(?:^|[}/])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
        return match ? match[1] : null;
    };

    test.each([
        '.project-card-today-empty',
        '.project-card-progress',
        '.project-card-today-heading',
    ])('%s inherits the card text colour', (selector) => {
        const body = rule(selector);

        expect(body).toMatch(/(?:^|[;\s])color:\s*inherit/);
        expect(body).not.toMatch(/--text-muted|#777|#999/);
    });
});
