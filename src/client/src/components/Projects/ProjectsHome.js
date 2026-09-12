import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import CreateProjectDialog from './CreateProjectDialog';
import ProjectCard from './ProjectCard';
import { api } from '../../lib/api';
import '../Styling/Projects.css';

// The projects home page: a grid of project cards with create, rename and delete.
//
// A load that fails leaves a retry in place rather than an empty grid. Mutations
// update the list in place from the server's response, so nothing here has to
// guess what the server stored.

const STATUS = { loading: 'loading', ready: 'ready', error: 'error' };

const ProjectsHome = () => {
    const [projects, setProjects] = useState([]);
    const [status, setStatus] = useState(STATUS.loading);
    const [loadError, setLoadError] = useState('');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const load = useCallback(async () => {
        setStatus(STATUS.loading);
        setLoadError('');

        try {
            const loaded = await api.get('/projects');
            setProjects(loaded);
            setStatus(STATUS.ready);
        } catch (err) {
            setLoadError(err.message);
            setStatus(STATUS.error);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // These three intentionally do not catch: the card and the dialog own the
    // error message for the action the user just took.
    const handleCreate = async ({ title, description }) => {
        const created = await api.post('/projects', { title, description });

        setProjects((current) => [created, ...current]);
        setIsDialogOpen(false);
    };

    const handleRename = async (id, title) => {
        const updated = await api.patch(`/projects/${id}`, { title });

        setProjects((current) => current.map((project) => (project.id === id ? updated : project)));
    };

    const handleDelete = async (id) => {
        await api.delete(`/projects/${id}`);

        setProjects((current) => current.filter((project) => project.id !== id));
    };

    return (
        <main className="projects-page">
            <header className="projects-header">
                <h1>Projects</h1>
                <div className="projects-header-actions">
                    {/* Unconditional, unlike "New project": the calendar is the
                        other view onto the same plan, and a grid that is still
                        loading — or that failed to — is exactly when the user
                        most wants a way off this page. */}
                    <Link className="projects-calendar-link" to="/calendar">
                        Calendar →
                    </Link>
                    {status === STATUS.ready && (
                        <button type="button" onClick={() => setIsDialogOpen(true)}>
                            New project
                        </button>
                    )}
                </div>
            </header>

            {status === STATUS.loading && (
                <p className="projects-loading" role="status" aria-label="Loading projects">
                    Loading projects…
                </p>
            )}

            {status === STATUS.error && (
                <div className="projects-error">
                    <p role="alert">{loadError}</p>
                    <button type="button" onClick={load}>
                        Try again
                    </button>
                </div>
            )}

            {status === STATUS.ready && projects.length === 0 && (
                <div className="projects-empty">
                    <p>No projects yet.</p>
                    <p>A project is a layered plan — start one and add your first layer of work.</p>
                    <button type="button" onClick={() => setIsDialogOpen(true)}>
                        Create your first project
                    </button>
                </div>
            )}

            {status === STATUS.ready && projects.length > 0 && (
                <ul className="projects-grid">
                    {projects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            onRename={handleRename}
                            onDelete={handleDelete}
                        />
                    ))}
                </ul>
            )}

            {isDialogOpen && (
                <CreateProjectDialog
                    onCreate={handleCreate}
                    onCancel={() => setIsDialogOpen(false)}
                />
            )}
        </main>
    );
};

export default ProjectsHome;
