import ProtectedRoute from './config/ProtectedRoute';
import RhythmPage from './components/Rhythm/RhythmPage';
import routes from './routes';

test('mounts RhythmPage at /rhythm behind ProtectedRoute', () => {
    const route = routes.find((r) => r.path === '/rhythm');
    expect(route.element.type).toBe(ProtectedRoute);
    expect(route.element.props.children.type).toBe(RhythmPage);
});
