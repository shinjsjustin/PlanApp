import ProtectedRoute from './config/ProtectedRoute';
import ChoresPage from './components/Chores/ChoresPage';
import routes from './routes';

test('mounts ChoresPage at /chores behind ProtectedRoute', () => {
    const route = routes.find((r) => r.path === '/chores');
    expect(route.element.type).toBe(ProtectedRoute);
    expect(route.element.props.children.type).toBe(ChoresPage);
});
