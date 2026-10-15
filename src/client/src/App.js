import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import routes from './routes';
import TabBar from './components/Navigation/TabBar';

// App wires BrowserRouter to the flat routes array defined in routes.js.
// This pattern keeps routing centralized — add new pages only in routes.js.
export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                {routes.map(({ path, element }, index) => (
                    <Route key={index} path={path} element={element} />
                ))}
            </Routes>
            <TabBar />
        </BrowserRouter>
    );
}
