import { render, screen } from '@testing-library/react';

import PairPanel from './PairPanel';

const A = { id: 1, name: 'Stone', detail: '' };
const B = { id: 2, name: 'Stick', detail: '' };
const PAIR = { state: 'empty', name: '', effect: '', notes: '' };

const setup = (props = {}) => render(
    <PairPanel cardA={A} cardB={B} pair={PAIR} savePair={jest.fn().mockResolvedValue({})} onClose={jest.fn()} {...props} />,
);

describe('PairPanel recipe label', () => {
    it('labels the field Result with its placeholder in a recipe deck', () => {
        setup({ recipe: true });
        expect(screen.getByLabelText('Result')).toHaveAttribute('placeholder', 'What they make');
        expect(screen.queryByLabelText('Name')).toBeNull();
    });

    it('keeps Name in other decks', () => {
        setup();
        expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Stone + Stick');
        expect(screen.queryByLabelText('Result')).toBeNull();
    });
});
