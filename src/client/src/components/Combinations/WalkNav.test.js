import { render, screen, fireEvent } from '@testing-library/react';

import WalkNav from './WalkNav';

const setup = (overrides = {}) => {
    const props = { onPrevious: jest.fn(), onNext: jest.fn(), onNextUnfilled: jest.fn() };
    render(<WalkNav cardName="Fire" keys={['1|2', '1|3', '1|4']} selectedKey="1|3" {...props} {...overrides} />);
    return props;
};

describe('WalkNav', () => {
    it('calls the matching handler for each button', () => {
        const { onPrevious, onNext, onNextUnfilled } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next unfilled' }));
        expect(onPrevious).toHaveBeenCalledTimes(1);
        expect(onNext).toHaveBeenCalledTimes(1);
        expect(onNextUnfilled).toHaveBeenCalledTimes(1);
    });

    it('shows the position of the open pair', () => {
        setup();
        expect(screen.getByText('Fire: 2 of 3')).toBeInTheDocument();
    });

    it('shows a dash when the open pair is not in the walk', () => {
        setup({ selectedKey: null });
        expect(screen.getByText('Fire: – of 3')).toBeInTheDocument();
    });
});
