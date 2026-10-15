import React from 'react';
import { NavLink, matchPath, useLocation, useNavigate } from 'react-router-dom';
import useIsPhone from '../../hooks/useIsPhone';
import '../Styling/TabBar.css';

const TAB_PATHS = ['/projects', '/projects/:id', '/calendar'];

// Standalone (home-screen) mode has no Safari chrome, so phones get their
// navigation and back button from this bar.
export default function TabBar() {
    const isPhone = useIsPhone();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const isTabPage = TAB_PATHS.some((path) => matchPath(path, pathname));
    if (!isPhone || !localStorage.getItem('token') || !isTabPage) return null;

    const isProjectPage = Boolean(matchPath('/projects/:id', pathname));
    // React Router writes idx > 0 once an in-app page exists to return to.
    const goBack = () =>
        window.history.state?.idx > 0 ? navigate(-1) : navigate('/projects');

    return (
        <>
            <nav className="tab-bar" aria-label="Tabs">
                {isProjectPage && (
                    <button type="button" className="tab-bar-back" onClick={goBack}>Back</button>
                )}
                <NavLink to="/projects" end className="tab-bar-link">Projects</NavLink>
                <NavLink to="/calendar" className="tab-bar-link">Calendar</NavLink>
            </nav>
            <div className="tab-bar-spacer" />
        </>
    );
}
