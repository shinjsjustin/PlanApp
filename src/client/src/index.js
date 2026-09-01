import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import routes from './routes';
import reportWebVitals from './reportWebVitals';

// App wires BrowserRouter to the flat routes array defined in routes.js.
// This pattern keeps routing centralized — add new pages only in routes.js.
function App() {
    return (
        <BrowserRouter>
            <Routes>
                {routes.map(({ path, element }, index) => (
                    <Route key={index} path={path} element={element} />
                ))}
            </Routes>
        </BrowserRouter>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

reportWebVitals();
