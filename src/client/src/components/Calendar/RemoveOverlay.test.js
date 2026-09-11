import React from 'react';
import { render, screen } from '@testing-library/react';

import RemoveOverlay from './RemoveOverlay';

describe('RemoveOverlay', () => {
    test('is hidden when nothing is being dragged out of a day', () => {
        // Arrange + Act
        render(<RemoveOverlay isActive={false} />);

        // Assert
        expect(screen.getByText('Drag here to remove from day')).not.toBeVisible();
    });

    test('covers the panel while a booking is in the air', () => {
        // Arrange + Act
        render(<RemoveOverlay isActive />);

        // Assert
        expect(screen.getByText('Drag here to remove from day')).toBeVisible();
    });
});
