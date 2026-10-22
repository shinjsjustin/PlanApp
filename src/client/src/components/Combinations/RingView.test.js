import { act, render, fireEvent } from '@testing-library/react';

import RingView from './RingView';

const CARDS = [
    { id: 11, name: 'Fire', detail: 'hot' },
    { id: 12, name: 'Water', detail: '' },
    { id: 13, name: 'A very long card name indeed', detail: '' },
];
const PAIRS = {
    '11|12': { name: 'Steam', effect: 'Rises', state: 'done' },
    '11|13': { name: '', effect: '', state: 'drafted' },
};

const setup = (props = {}) => {
    const onOpen = jest.fn();
    const view = render(<RingView cards={CARDS} pairs={PAIRS} selectedKey={null} onOpen={onOpen} {...props} />);
    const q = (sel) => view.container.querySelector(sel);
    const all = (sel) => view.container.querySelectorAll(sel);
    return { ...view, onOpen, q, all, svg: q('svg.ring') };
};

const hit = (container, key) => container.querySelector(`.hit[data-k="${key}"]`);
const cardG = (container, id) => container.querySelector(`.card[data-id="${id}"]`);

describe('RingView', () => {
    it('shows the placeholder under two cards', () => {
        const { container } = setup({ cards: [CARDS[0]] });
        expect(container).toHaveTextContent('Add at least two cards below to see their pairs.');
        expect(container.querySelector('svg')).toBeNull();
    });

    it('draws a state chord, a hit line and a card group for every pair and card', () => {
        const { all, q } = setup();
        expect(all('.chord')).toHaveLength(3);
        expect(all('.hit')).toHaveLength(3);
        expect(all('.card')).toHaveLength(3);
        expect(q('.chord[data-k="11|12"]')).toHaveClass('st-done');
        expect(q('.chord[data-k="11|13"]')).toHaveClass('st-drafted');
        expect(q('.chord[data-k="12|13"]')).toHaveClass('st-empty');
    });

    it('truncates long labels to 17 characters', () => {
        const { q } = setup();
        expect(cardG(q('svg').parentNode, 13).querySelector('text')).toHaveTextContent('A very long card…');
    });

    it('opens the pair when its hit line is clicked', () => {
        const { container, onOpen } = setup();
        fireEvent.click(hit(container, '12|13'));
        expect(onOpen).toHaveBeenCalledWith('12|13');
    });

    it('marks only the open pair chord as sel', () => {
        const { all, q } = setup({ selectedKey: '11|12' });
        expect(all('.chord.sel')).toHaveLength(1);
        expect(q('.chord[data-k="11|12"]')).toHaveClass('sel');
    });

    it('focuses on a hovered card, lighting its chords and fading unlinked cards', () => {
        const { container, svg, all, q } = setup({ pairs: {}, cards: [...CARDS, { id: 14, name: 'Air', detail: '' }] });
        expect(svg).not.toHaveClass('focusing');
        fireEvent.pointerEnter(cardG(container, 11));
        expect(svg).toHaveClass('focusing');
        expect(all('.chord.lit')).toHaveLength(3);
        expect(all('.card.faded')).toHaveLength(0);
        fireEvent.pointerLeave(cardG(container, 11));
        expect(svg).not.toHaveClass('focusing');
        expect(q('.chord.lit')).toBeNull();
    });

    it('fades cards with no chord to the focus', () => {
        const { container, rerender, all } = setup();
        fireEvent.click(cardG(container, 13));
        rerender(<RingView cards={CARDS.slice(0, 2)} pairs={PAIRS} selectedKey={null} onOpen={jest.fn()} />);
        expect(all('.chord.lit')).toHaveLength(0);
        expect(all('.card.faded')).toHaveLength(2);
    });

    it('pins a card on click and unpins on a second click', () => {
        const { container, svg } = setup();
        fireEvent.click(cardG(container, 11));
        expect(svg).toHaveClass('focusing');
        expect(cardG(container, 11)).toHaveClass('pinned');
        fireEvent.click(cardG(container, 11));
        expect(svg).not.toHaveClass('focusing');
    });

    it('pins a card with Enter and Space but not other keys', () => {
        const { container, svg } = setup();
        fireEvent.keyDown(cardG(container, 12), { key: 'a' });
        expect(svg).not.toHaveClass('focusing');
        fireEvent.keyDown(cardG(container, 12), { key: 'Enter' });
        expect(cardG(container, 12)).toHaveClass('pinned');
        fireEvent.keyDown(cardG(container, 12), { key: ' ' });
        expect(svg).not.toHaveClass('focusing');
    });

    it('shows the pinned card even after the hover ends, and hover wins while hovering', () => {
        const { container, all } = setup();
        fireEvent.click(cardG(container, 11));
        fireEvent.pointerEnter(cardG(container, 12));
        expect(cardG(container, 11)).toHaveClass('pinned');
        expect(all('.chord.lit')).toHaveLength(2);
        fireEvent.pointerLeave(cardG(container, 12));
        expect(all('.chord.lit')).toHaveLength(2);
    });

    it('shows a tip with state, name and effect while hovering a hit line', () => {
        const { container, q } = setup();
        expect(q('.tip')).toBeNull();
        fireEvent.pointerEnter(hit(container, '11|12'), { clientX: 10, clientY: 10 });
        const tip = q('.tip');
        expect(tip).toHaveTextContent('done');
        expect(tip).toHaveTextContent('Steam');
        expect(tip).toHaveTextContent('Fire + Water');
        expect(tip).toHaveTextContent('Rises');
        expect(q('.chord[data-k="11|12"]')).toHaveClass('hot');
        fireEvent.pointerLeave(hit(container, '11|12'));
        expect(q('.tip')).toBeNull();
        expect(q('.chord.hot')).toBeNull();
    });

    it('shows A + B and No effect yet for an unnamed pair', () => {
        const { container, q } = setup();
        fireEvent.pointerEnter(hit(container, '11|13'), { clientX: 10, clientY: 10 });
        expect(q('.tip strong')).toHaveTextContent('Fire + A very long card name indeed');
        expect(q('.tip')).toHaveTextContent('No effect yet');
        expect(q('.tip')).toHaveTextContent('drafted');
    });

    it('uses a bigger label scale at 480px or less and re-measures on resize', () => {
        const original = window.innerWidth;
        const width = () => Number(cardG(document.body, 11).querySelector('rect').getAttribute('width'));
        try {
            window.innerWidth = 1024;
            setup();
            expect(width()).toBeCloseTo(64, 6);
            act(() => { window.innerWidth = 480; window.dispatchEvent(new Event('resize')); });
            expect(width()).toBeCloseTo(64 * 1.6, 6);
            act(() => { window.innerWidth = 481; window.dispatchEvent(new Event('resize')); });
            expect(width()).toBeCloseTo(64, 6);
        } finally {
            window.innerWidth = original;
        }
    });
});
