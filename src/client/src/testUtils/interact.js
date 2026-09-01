import { act } from 'react';
import userEvent from '@testing-library/user-event';

/**
 * user-event v13 fires its events synchronously, so a state update that lands
 * after an awaited promise falls outside React's act() window and React warns
 * about it. Wrapping each interaction in an async act closes that window without
 * changing what the interaction does.
 */
const interaction = (fire) => async (...args) => {
    await act(async () => {
        fire(...args);
    });
};

export const click = interaction((element) => userEvent.click(element));
export const type = interaction((element, text) => userEvent.type(element, text));
export const clear = interaction((element) => userEvent.clear(element));
