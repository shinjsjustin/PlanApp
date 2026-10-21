import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Navbar from './Navbar';

afterEach(() => localStorage.clear());

const renderNavbar = () => render(
    <MemoryRouter>
        <Navbar />
        <Routes>
            <Route path="/projects" element={<div>projects page</div>} />
            <Route path="*" element={null} />
        </Routes>
    </MemoryRouter>
);

describe('Navbar', () => {
    test('panel offers Projects and no Dashboard', async () => {
        localStorage.setItem('token', 'abc');
        renderNavbar();
        await userEvent.click(screen.getByTitle('Account'));
        expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
    });

    test('Projects button navigates to /projects', async () => {
        localStorage.setItem('token', 'abc');
        renderNavbar();
        await userEvent.click(screen.getByTitle('Account'));
        await userEvent.click(screen.getByRole('button', { name: 'Projects' }));
        expect(screen.getByText('projects page')).toBeInTheDocument();
    });
});
