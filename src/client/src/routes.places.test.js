import { Navigate } from 'react-router-dom';
import ProtectedRoute from './config/ProtectedRoute';
import AddressBookPage from './components/AddressBook/AddressBookPage';
import routes from './routes';

const routeFor = (path) => routes.find((route) => route.path === path);

describe('address book routes', () => {
    test('mounts the address book page behind ProtectedRoute', () => {
        const entry = routeFor('/address-book');
        expect(entry).toBeDefined();
        expect(entry.element.type).toBe(ProtectedRoute);
        expect(entry.element.props.children.type).toBe(AddressBookPage);
    });

    test('redirects /places to /address-book with replace', () => {
        const entry = routeFor('/places');
        expect(entry.element.type).toBe(Navigate);
        expect(entry.element.props.to).toBe('/address-book');
        expect(entry.element.props.replace).toBe(true);
    });
});
