import React from 'react';
import { render, screen } from '@testing-library/react';

import { ProjectProvider, useProjectContext } from './ProjectContext';

const Consumer = () => {
    const { state } = useProjectContext();

    return <p>{state.project.title}</p>;
};

describe('ProjectContext', () => {
    test('hands the graph to everything inside the provider', () => {
        // Act
        render(
            <ProjectProvider value={{ state: { project: { title: 'Build a drone' } } }}>
                <Consumer />
            </ProjectProvider>
        );

        // Assert
        expect(screen.getByText('Build a drone')).toBeInTheDocument();
    });

    test('fails loudly when used outside a provider rather than reading undefined', () => {
        // Arrange — React logs the thrown render error; silence it for this test.
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act & Assert
        expect(() => render(<Consumer />)).toThrow(/ProjectProvider/);

        consoleError.mockRestore();
    });
});
