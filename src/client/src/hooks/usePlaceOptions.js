import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

// One fetch of /places shared by every place picker under it, so a project page
// with many cards makes a single request.

const PlaceOptionsContext = createContext(null);

export const PlaceOptionsProvider = ({ children }) => {
    const [status, setStatus] = useState('loading');
    const [places, setPlaces] = useState([]);

    useEffect(() => {
        let isActive = true;

        api.get('/places')
            .then((data) => {
                if (!isActive) return;
                if (!Array.isArray(data?.places)) {
                    setStatus('error');
                    return;
                }
                setPlaces(data.places);
                setStatus('ready');
            })
            .catch(() => {
                if (isActive) setStatus('error');
            });

        return () => {
            isActive = false;
        };
    }, []);

    const value = useMemo(() => ({ places, status }), [places, status]);

    return <PlaceOptionsContext.Provider value={value}>{children}</PlaceOptionsContext.Provider>;
};

export const usePlaceOptions = () => useContext(PlaceOptionsContext);
