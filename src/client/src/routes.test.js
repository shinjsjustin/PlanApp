import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import routes from './routes';

test('/dashboard redirects to /projects', () => {
    const dashboard = routes.find(r => r.path === '/dashboard');
    render(
        <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
                <Route path="/dashboard" element={dashboard.element} />
                <Route path="/projects" element={<div>projects page</div>} />
            </Routes>
        </MemoryRouter>
    );
    expect(screen.getByText('projects page')).toBeInTheDocument();
});
