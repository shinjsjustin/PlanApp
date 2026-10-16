import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';

import PhoneSequenceEditor from './PhoneSequenceEditor';
import useProjectMutations from '../../hooks/useProjectMutations';
import { SAVE_DELAY_MS } from './InlineTitle';

jest.mock('../../hooks/useProjectMutations');

const verbs = {
    renameSequence: jest.fn(),
    updateSequenceDescription: jest.fn(),
    setSequenceBlocked: jest.fn(),
};
const sequence = { id: 5, title: 'Frame', description: 'Parts', isBlocked: false };

beforeEach(() => {
    jest.useFakeTimers();
    Object.values(verbs).forEach((v) => v.mockReset());
    useProjectMutations.mockReturnValue(verbs);
});
afterEach(() => jest.useRealTimers());

test('title edit calls renameSequence', () => {
    render(<PhoneSequenceEditor sequence={sequence} onDone={jest.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Sequence title' });
    expect(title).toHaveValue('Frame');
    fireEvent.change(title, { target: { value: 'Body' } });
    fireEvent.blur(title);
    act(() => jest.advanceTimersByTime(SAVE_DELAY_MS));
    expect(verbs.renameSequence).toHaveBeenCalledWith(5, 'Body');
});

test('a pending title edit is flushed when the editor closes', () => {
    const { unmount } = render(<PhoneSequenceEditor sequence={sequence} onDone={jest.fn()} />);
    const title = screen.getByRole('textbox', { name: 'Sequence title' });
    fireEvent.change(title, { target: { value: 'Body' } });
    fireEvent.blur(title);
    unmount();
    expect(verbs.renameSequence).toHaveBeenCalledWith(5, 'Body');
});

test('description blur calls updateSequenceDescription', () => {
    render(<PhoneSequenceEditor sequence={sequence} onDone={jest.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Sequence description' });
    fireEvent.change(field, { target: { value: 'More parts' } });
    fireEvent.blur(field);
    expect(verbs.updateSequenceDescription).toHaveBeenCalledWith(5, 'More parts');
});

test.each([[false, 'false', true], [true, 'true', false]])(
    'Blocked toggle (isBlocked %s) shows aria-pressed %s and sends %s',
    (isBlocked, pressed, next) => {
        render(<PhoneSequenceEditor sequence={{ ...sequence, isBlocked }} onDone={jest.fn()} />);
        const toggle = screen.getByRole('button', { name: 'Blocked' });
        expect(toggle).toHaveAttribute('aria-pressed', pressed);
        fireEvent.click(toggle);
        expect(verbs.setSequenceBlocked).toHaveBeenCalledWith(5, next);
    }
);

test('Done calls onDone', () => {
    const onDone = jest.fn();
    render(<PhoneSequenceEditor sequence={sequence} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
});
