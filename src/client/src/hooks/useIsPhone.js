import { useEffect, useState } from 'react';

// jsdom has no window.matchMedia, so the hook reports false there and every
// existing test stays on the desktop path.
export const PHONE_QUERY = '(max-width: 600px)';

const hasMatchMedia = () => typeof window.matchMedia === 'function';

export default function useIsPhone() {
    const [isPhone, setIsPhone] = useState(
        () => hasMatchMedia() && window.matchMedia(PHONE_QUERY).matches
    );

    useEffect(() => {
        if (!hasMatchMedia()) return undefined;
        const mql = window.matchMedia(PHONE_QUERY);
        const onChange = (event) => setIsPhone(event.matches);
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return isPhone;
}
