// Geometry for the ring view (mirrors the prototype's renderRing).

export const RING_SIZE = 600;
export const RING_RADIUS = 225;
export const PHONE_LABEL_SCALE = 1.6;
export const CARD_HEIGHT = 32;
const CARD_MIN_WIDTH = 64;
const CARD_MAX_WIDTH = 150;
const CHAR_WIDTH = 8.6;
const CARD_PADDING = 22;
const VIEWBOX_MARGIN = 8;

export const ringPositions = (cards) => {
    const center = RING_SIZE / 2;
    return cards.map((card, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / cards.length;
        return { card, x: center + RING_RADIUS * Math.cos(angle), y: center + RING_RADIUS * Math.sin(angle) };
    });
};

export const cardWidth = (label, scale) =>
    scale * Math.min(CARD_MAX_WIDTH, Math.max(CARD_MIN_WIDTH, label.length * CHAR_WIDTH + CARD_PADDING));

export const ringViewBox = (scale) => {
    const pad = Math.max(VIEWBOX_MARGIN, (scale * CARD_MAX_WIDTH) / 2 - (RING_SIZE / 2 - RING_RADIUS) + VIEWBOX_MARGIN);
    return `${-pad} ${-pad / 4} ${RING_SIZE + 2 * pad} ${RING_SIZE + pad / 2}`;
};
