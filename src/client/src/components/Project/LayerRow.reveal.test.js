import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectProvider } from '../../state/ProjectContext';

import LayerRow from './LayerRow';

const layer = { id: 10, projectId: 1, title: 'Learning', position: 0 };

const sequence = (id, title, position) => ({
    id,
    projectId: 1,
    layerId: 10,
    title,
    description: null,
    isBlocked: false,
    position,
});

const value = {
    state: {
        project: { id: 1, title: 'Build a drone' },
        layers: { 10: layer },
        sequences: {},
        todos: {},
    },
    createEntity: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
};

const tree = (sequences) => (
    <ProjectProvider value={value}>
        <LayerRow layer={layer} sequences={sequences} todos={[]} />
    </ProjectProvider>
);

const first = sequence(100, 'Learn aerodynamics', 0);
const second = sequence(101, 'Learn electronics', 1);

describe('LayerRow reveal of a new sequence', () => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
    const originalMatchMedia = window.matchMedia;
    let scrollIntoView;

    beforeEach(() => {
        scrollIntoView = jest.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        window.matchMedia = undefined;
    });

    afterEach(() => {
        if (original) {
            Object.defineProperty(Element.prototype, 'scrollIntoView', original);
        } else {
            delete Element.prototype.scrollIntoView;
        }
        window.matchMedia = originalMatchMedia;
    });

    const clickAdd = () =>
        fireEvent.click(screen.getByRole('button', { name: /add a sequence to/i }));

    test('scrolls the new last card into view smoothly after the add button is clicked', () => {
        const { rerender, container } = render(tree([first]));

        clickAdd();
        rerender(tree([first, second]));

        const lastCard = container.querySelector('.layer-row-sequences').lastElementChild;
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
        });
        expect(scrollIntoView.mock.instances[0]).toBe(lastCard);
    });

    test('reveals the first card added to an empty layer', () => {
        const { rerender } = render(tree([]));

        clickAdd();
        rerender(tree([first]));

        expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    test('does not scroll on first render', () => {
        render(tree([first]));

        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    test('does not scroll when a sequence arrives without the button being clicked', () => {
        const { rerender } = render(tree([first]));

        rerender(tree([first, second]));

        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    test('does not scroll on a rename after a reveal has been served', () => {
        const { rerender } = render(tree([first]));
        clickAdd();
        rerender(tree([first, second]));
        scrollIntoView.mockClear();

        rerender(tree([first, { ...second, title: 'Renamed' }]));

        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    test('does not scroll a later arrival once the request has been served', () => {
        const { rerender } = render(tree([first]));
        clickAdd();
        rerender(tree([first, second]));
        scrollIntoView.mockClear();

        rerender(tree([first, second, sequence(102, 'Learn controls', 2)]));

        expect(scrollIntoView).not.toHaveBeenCalled();
    });

    test('uses auto behavior under prefers-reduced-motion: reduce', () => {
        window.matchMedia = jest.fn((query) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
        }));
        const { rerender } = render(tree([first]));

        clickAdd();
        rerender(tree([first, second]));

        expect(scrollIntoView).toHaveBeenCalledWith({
            behavior: 'auto',
            block: 'nearest',
            inline: 'nearest',
        });
    });
});
