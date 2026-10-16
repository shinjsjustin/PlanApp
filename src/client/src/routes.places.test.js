import ProtectedRoute from './config/ProtectedRoute';
import PlacesPage from './components/Places/PlacesPage';
import routes from './routes';

describe('/places route', () => {
    test('mounts the places page behind ProtectedRoute', () => {
        const entry = routes.find((route) => route.path === '/places');
        expect(entry).toBeDefined();
        expect(entry.element.type).toBe(ProtectedRoute);
        expect(entry.element.props.children.type).toBe(PlacesPage);
    });
});
