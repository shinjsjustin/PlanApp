import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChoreForm from './ChoreForm';

const chore = { id: 5, name: 'Mop', area: 'Kitchen', notes: 'Use bucket', window: { min: 7, max: 10 } };
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

it('shows the four fields and the window hint', () => {
    render(<ChoreForm onSubmit={jest.fn()} />);
    ['Name', 'Area', 'Window (days)', 'Notes'].forEach((l) => expect(screen.getByLabelText(l)).toBeInTheDocument());
    expect(screen.getByText(/N or N-M/)).toBeInTheDocument();
});

it('shows validation messages and does not submit an invalid draft', () => {
    const onSubmit = jest.fn();
    render(<ChoreForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText(/Enter whole days from 1 to 365/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
});

it('submits the payload for a valid draft', () => {
    const onSubmit = jest.fn();
    render(<ChoreForm onSubmit={onSubmit} />);
    type('Name', ' Sweep ');
    type('Window (days)', '3-5');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Sweep', area: null, window: { min: 3, max: 5 }, notes: null });
});

it('prefills from the chore when editing', () => {
    render(<ChoreForm chore={chore} onSubmit={jest.fn()} />);
    expect(screen.getByLabelText('Name')).toHaveValue('Mop');
    expect(screen.getByLabelText('Area')).toHaveValue('Kitchen');
    expect(screen.getByLabelText('Window (days)')).toHaveValue('7-10');
    expect(screen.getByLabelText('Notes')).toHaveValue('Use bucket');
});

it('reports dirtiness and shows a save failure and Cancel', () => {
    const onDirtyChange = jest.fn();
    const onCancel = jest.fn();
    render(<ChoreForm saveFailed onSubmit={jest.fn()} onCancel={onCancel} onDirtyChange={onDirtyChange} />);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    type('Name', 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    type('Name', '');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the chore');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
});
