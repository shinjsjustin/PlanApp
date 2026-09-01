import Home from './components/Home';
import Login from './components/Authentication/Login';
import Register from './components/Authentication/Register';
import AccessDenied from './components/Authentication/AccessDenied';
import PostRegisterPage from './components/Authentication/PostRegisterPage';
import Dashboard from './components/Dashboard/Dashboard';
import ProjectsHome from './components/Projects/ProjectsHome';
import ProjectPage from './components/Project/ProjectPage';

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
    { path: '/register', element: <UnprotectedRoute><Register /></UnprotectedRoute> },

    // Protected pages — redirect to /login if no valid token
    // requiredAccessLevel defaults to 1 (approved user)
    { path: '/projects',     element: <ProtectedRoute><ProjectsHome /></ProtectedRoute> },
    { path: '/projects/:id', element: <ProtectedRoute><ProjectPage /></ProtectedRoute> },

    // The template's dashboard is left mounted but unused; login now lands on
    // /projects instead.
    { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },

    // TODO: Add more protected routes here, e.g.:
    // { path: '/jobs',          element: <ProtectedRoute><JobList /></ProtectedRoute> },
    // { path: '/jobs/:id',      element: <ProtectedRoute><JobDetail /></ProtectedRoute> },
    // { path: '/admin/users',   element: <ProtectedRoute requiredAccessLevel={2}><Users /></ProtectedRoute> },
];

export default routes;
