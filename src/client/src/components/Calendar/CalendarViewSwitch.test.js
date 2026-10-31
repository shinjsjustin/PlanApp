import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CalendarViewSwitch from './CalendarViewSwitch';

test('marks only the current view pressed', () => {
    render(<CalendarViewSwitch value="lived" onChange={() => {}} />);

    expect(screen.getByRole('button', { name: 'Lived' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-pressed', 'false');
});

test('reports the view that was clicked', async () => {
    const onChange = jest.fn();
    render(<CalendarViewSwitch value="lived" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Plan' }));

    expect(onChange).toHaveBeenCalledWith('plan');
});
