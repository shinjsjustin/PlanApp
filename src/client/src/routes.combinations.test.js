import ProtectedRoute from './config/ProtectedRoute';
import routes from './routes';

describe('combinations route', () => {
    it('mounts /combinations behind ProtectedRoute', () => {
        const route = routes.find((r) => r.path === '/combinations');
        expect(route).toBeDefined();
        expect(route.element.type).toBe(ProtectedRoute);
    });
});
