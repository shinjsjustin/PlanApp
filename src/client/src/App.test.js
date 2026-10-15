import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./hooks/useIsPhone', () => ({ __esModule: true, default: () => true }));

it('renders no Projects tab link at /login', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.queryByRole('link', { name: 'Projects' })).toBeNull();
});
