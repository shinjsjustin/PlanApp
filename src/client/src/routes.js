import { Navigate } from 'react-router-dom';
import Home from './components/Home';
import Login from './components/Authentication/Login';
import AccessDenied from './components/Authentication/AccessDenied';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import ProjectsHome from './components/Projects/ProjectsHome';
import ProjectPage from './components/Project/ProjectPage';
import CalendarPage from './components/Calendar/CalendarPage';
import ProjectThoughtsPage from './components/ProjectThoughts/ProjectThoughtsPage';
import ThoughtsPage from './components/Thoughts/ThoughtsPage';
import AddressBookPage from './components/AddressBook/AddressBookPage';

import ProtectedRoute from './config/ProtectedRoute';
import UnprotectedRoute from './config/UnprotectedRoute';

// Route definitions — consumed by index.js via BrowserRouter + Routes.
// Each entry: { path: string, element: JSX }
//
// To add a new page:
//   1. Create the component under src/components/
//   2. Import it here
//   3. Add an entry to this array, wrapping with ProtectedRoute or
//      UnprotectedRoute as appropriate
const routes = [
    // Public pages
    { path: '/',              element: <Home /> },
    { path: '/access-denied', element: <AccessDenied /> },
    { path: '/post-register', element: <PostRegisterPage /> },

    // Auth pages — redirect away if already logged in
    { path: '/login',    element: <UnprotectedRoute><Login /></UnprotectedRoute> },
    { path: '/register', element: <Navigate to="/login" replace /> },

    // Protected pages — redirect to /login if no valid token
    // requiredAccessLevel defaults to 1 (approved user)
    { path: '/projects',     element: <ProtectedRoute><ProjectsHome /></ProtectedRoute> },
    { path: '/projects/:id', element: <ProtectedRoute><ProjectPage /></ProtectedRoute> },
    { path: '/projects/:id/thoughts', element: <ProtectedRoute><ProjectThoughtsPage /></ProtectedRoute> },
    { path: '/calendar',     element: <ProtectedRoute><CalendarPage /></ProtectedRoute> },
    { path: '/thoughts',     element: <ProtectedRoute><ThoughtsPage /></ProtectedRoute> },
    { path: '/address-book', element: <ProtectedRoute><AddressBookPage /></ProtectedRoute> },
    { path: '/places',       element: <Navigate to="/address-book" replace /> },

    // The template's dashboard is gone; old links land on /projects.
    { path: '/dashboard', element: <Navigate to="/projects" replace /> },

    // TODO: Add more protected routes here, e.g.:
    // { path: '/jobs',          element: <ProtectedRoute><JobList /></ProtectedRoute> },
    // { path: '/jobs/:id',      element: <ProtectedRoute><JobDetail /></ProtectedRoute> },
    // { path: '/admin/users',   element: <ProtectedRoute requiredAccessLevel={2}><Users /></ProtectedRoute> },
];

export default routes;
