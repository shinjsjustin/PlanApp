import ProtectedRoute from './config/ProtectedRoute';
import ProjectThoughtsPage from './components/ProjectThoughts/ProjectThoughtsPage';
import routes from './routes';

describe('/projects/:id/thoughts route', () => {
    test('mounts the project thoughts page behind ProtectedRoute', () => {
        const entry = routes.find((route) => route.path === '/projects/:id/thoughts');
        expect(entry).toBeDefined();
        expect(entry.element.type).toBe(ProtectedRoute);
        expect(entry.element.props.children.type).toBe(ProjectThoughtsPage);
    });
});
