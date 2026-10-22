import ProtectedRoute from './config/ProtectedRoute';
import ShortcutsPage from './components/Shortcuts/ShortcutsPage';
import routes from './routes';

describe('shortcuts route', () => {
    test('mounts the shortcuts page behind ProtectedRoute', () => {
        const entry = routes.find((route) => route.path === '/shortcuts');
        expect(entry).toBeDefined();
        expect(entry.element.type).toBe(ProtectedRoute);
        expect(entry.element.props.children.type).toBe(ShortcutsPage);
    });
});
