import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

import LivedMomentSheet from './LivedMomentSheet';

const moment = {
    id: 1,
    date: '2026-10-31',
    startMinutes: 1500,
    durationMinutes: 30,
    title: 'Late build',
    category: 'building',
    detail: 'Ran the migration.\nThen slept.',
    chatTicks: [],
};

describe('LivedMomentSheet', () => {
    it('renders nothing without a moment', () => {
        const { container } = render(<LivedMomentSheet moment={null} onClose={() => {}} />);

        expect(container).toBeEmptyDOMElement();
    });

    it('shows title, wrapped range, category label and full detail in a dialog', () => {
        render(<LivedMomentSheet moment={moment} onClose={() => {}} />);
        const dialog = screen.getByRole('dialog', { name: 'Late build' });

        expect(dialog).toHaveTextContent('01:00-01:30');
        expect(dialog).toHaveTextContent('Building');
        expect(dialog).toHaveTextContent('Ran the migration.');
        expect(dialog).toHaveTextContent('Then slept.');
        expect(dialog.style.getPropertyValue('--c')).toBe('var(--lived-building)');
    });

    it('omits the detail section when there is none', () => {
        render(<LivedMomentSheet moment={{ ...moment, detail: null }} onClose={() => {}} />);

        expect(screen.getByRole('dialog')).not.toHaveTextContent('null');
    });

    it('closes on its close button and on Escape, but not other keys', () => {
        const onClose = jest.fn();
        render(<LivedMomentSheet moment={moment} onClose={onClose} />);

        fireEvent.keyDown(document, { key: 'Enter' });
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });
});
