import ProtectedRoute from './config/ProtectedRoute';
import routes from './routes';

const routeFor = (path) => routes.find((route) => route.path === path);

describe('routes', () => {
    test('mounts the project page at /projects/:id', () => {
        expect(routeFor('/projects/:id')).toBeDefined();
    });

    test('keeps both project routes behind ProtectedRoute', () => {
        // A project page reachable without a token would render someone's plan
        // to an anonymous visitor before the API ever refused them.
        ['/projects', '/projects/:id'].forEach((path) => {
            expect(routeFor(path).element.type).toBe(ProtectedRoute);
        });
    });
});
