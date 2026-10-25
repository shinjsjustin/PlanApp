import { render, screen, fireEvent } from '@testing-library/react';

import GridView from './GridView';
import WalkView from './WalkView';

const CARDS = [
    { id: 1, name: 'Stone' },
    { id: 2, name: 'Stick' },
];

const setupGrid = (overrides = {}) => {
    const onOpen = jest.fn();
    const utils = render(
        <GridView cards={CARDS} pairs={{}} mode="combinations" selectedKey={null} onOpen={onOpen} {...overrides} />,
    );
    return { onOpen, ...utils };
};

describe('GridView recipe', () => {
    it('opens the same-item key from the Stone row and column cell', () => {
        const { onOpen, container } = setupGrid({ recipe: true });
        expect(container.querySelectorAll('td.diag')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Stone + Stone: empty' }));
        expect(onOpen).toHaveBeenCalledWith('1|1');
    });

    it('says every cell is a recipe, including the diagonal', () => {
        setupGrid({ recipe: true });
        expect(screen.getByText(/each cell is a recipe, including the diagonal/i)).toBeInTheDocument();
    });

    it('keeps an empty diagonal and the usual hint without the flag', () => {
        const { container } = setupGrid();
        expect(container.querySelectorAll('td.diag')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: /Stone \+ Stone/ })).toBeNull();
        expect(screen.getByText(/above the diagonal is one pair/)).toBeInTheDocument();
    });
});

describe('WalkView recipe', () => {
    const walk = (recipe) => {
        const onOpen = jest.fn();
        render(
            <WalkView
                cards={CARDS}
                pairs={{}}
                mode="combinations"
                recipe={recipe}
                walkCardId={1}
                selectedKey={null}
                onOpen={onOpen}
                onSelectCard={jest.fn()}
            />,
        );
        return onOpen;
    };

    it('lists the same-item step and opens it', () => {
        const onOpen = walk(true);
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: /\+ Stone/ }));
        expect(onOpen).toHaveBeenCalledWith('1|1');
    });

    it('omits the same-item step without the flag', () => {
        walk(false);
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
});
