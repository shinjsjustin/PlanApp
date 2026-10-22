import React, { useLayoutEffect, useRef, useState } from 'react';

import { getPair, pairKey } from '../../lib/combinations';
import {
    CARD_HEIGHT, PHONE_LABEL_SCALE, RING_RADIUS, RING_SIZE, cardWidth, ringPositions, ringViewBox,
} from '../../lib/ringGeometry';

const PHONE_WIDTH = 480;
const CARD_LABEL_MAX = 17;
const BASE_FONT_SIZE = 14;
const TIP_GAP = 14;
const TIP_EDGE = 8;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const labelScale = () => (window.innerWidth <= PHONE_WIDTH ? PHONE_LABEL_SCALE : 1);

const RingView = ({ cards, pairs, selectedKey, onOpen }) => {
    const [scale, setScale] = useState(labelScale);
    const [hoverCard, setHoverCard] = useState(null);
    const [pinCard, setPinCard] = useState(null);
    const [tip, setTip] = useState(null);
    const tipRef = useRef(null);

    useLayoutEffect(() => {
        const onResize = () => setScale(labelScale());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Keeps the tip beside the pointer and inside the window.
    useLayoutEffect(() => {
        const el = tipRef.current;
        if (!el || !tip) return;
        const x = Math.min(tip.x + TIP_GAP, window.innerWidth - el.offsetWidth - TIP_EDGE);
        const below = tip.y + TIP_GAP + el.offsetHeight > window.innerHeight;
        const y = below ? tip.y - el.offsetHeight - TIP_GAP : tip.y + TIP_GAP;
        el.style.left = `${Math.max(TIP_EDGE, x)}px`;
        el.style.top = `${Math.max(TIP_EDGE, y)}px`;
    }, [tip]);

    if (cards.length < 2) {
        return <p className="placeholder">Add at least two cards below to see their pairs.</p>;
    }

    const positions = ringPositions(cards);
    const focus = hoverCard ?? pinCard;
    const links = positions.flatMap((p, i) => positions.slice(i + 1).map((q) => ({
        key: pairKey(p.card.id, q.card.id), p, q,
    })));
    const isLit = ({ p, q }) => focus !== null && (p.card.id === focus || q.card.id === focus);
    const linked = new Set(links.filter(isLit).flatMap(({ p, q }) => [p.card.id, q.card.id]));
    linked.add(focus);

    const togglePin = (id) => setPinCard(pinCard === id ? null : id);
    const handleCardKey = (event, id) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        togglePin(id);
    };
    const moveTip = (event) => setTip((t) => ({ ...t, x: event.clientX, y: event.clientY }));
    const showTip = (key, event) => setTip({ key, x: event.clientX, y: event.clientY });
    const hideTip = () => setTip(null);

    const coords = ({ p, q }) => ({ x1: p.x.toFixed(1), y1: p.y.toFixed(1), x2: q.x.toFixed(1), y2: q.y.toFixed(1) });
    const tipLink = tip && links.find((l) => l.key === tip.key);
    const tipPair = tipLink && getPair(pairs, tipLink.p.card.id, tipLink.q.card.id);
    const tipLabel = tipLink && `${tipLink.p.card.name} + ${tipLink.q.card.name}`;
    const cardHeight = CARD_HEIGHT * scale;

    return (
        <>
            <div className="ring-wrap">
                <svg
                    className={`ring${focus !== null ? ' focusing' : ''}`}
                    viewBox={ringViewBox(scale)}
                    role="img"
                    aria-label="Ring of cards with a chord for every pair"
                >
                    <circle className="guide" cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} />
                    <g>
                        {links.map((link) => {
                            const { key } = link;
                            const state = getPair(pairs, link.p.card.id, link.q.card.id).state;
                            const classes = ['chord', `st-${state}`];
                            if (key === selectedKey) classes.push('sel');
                            if (isLit(link)) classes.push('lit');
                            if (tip?.key === key) classes.push('hot');
                            return <line key={key} className={classes.join(' ')} data-k={key} {...coords(link)} />;
                        })}
                    </g>
                    <g>
                        {links.map((link) => (
                            <line
                                key={link.key}
                                className="hit"
                                data-k={link.key}
                                {...coords(link)}
                                onPointerEnter={(event) => showTip(link.key, event)}
                                onPointerMove={moveTip}
                                onPointerLeave={hideTip}
                                onClick={() => onOpen(link.key)}
                            />
                        ))}
                    </g>
                    <g>
                        {positions.map(({ card, x, y }) => {
                            const label = truncate(card.name, CARD_LABEL_MAX);
                            const width = cardWidth(label, scale);
                            const classes = ['card'];
                            if (focus !== null && !linked.has(card.id)) classes.push('faded');
                            if (card.id === pinCard) classes.push('pinned');
                            return (
                                <g
                                    key={card.id}
                                    className={classes.join(' ')}
                                    data-id={card.id}
                                    transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                                    tabIndex={0}
                                    onPointerEnter={() => setHoverCard(card.id)}
                                    onPointerLeave={() => setHoverCard(null)}
                                    onClick={() => togglePin(card.id)}
                                    onKeyDown={(event) => handleCardKey(event, card.id)}
                                >
                                    <title>{card.detail ? `${card.name}: ${card.detail}` : card.name}</title>
                                    <rect x={-width / 2} y={-cardHeight / 2} width={width} height={cardHeight} rx="7" />
                                    <text style={{ fontSize: `${BASE_FONT_SIZE * scale}px` }}>{label}</text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
            <p className="hint">
                Hover a card to light its pairs (tap or click to pin). Hover a line for its pair; click it to edit.
            </p>
            {tipPair && (
                <div className="tip" ref={tipRef}>
                    <span className="st">{tipPair.state}</span>
                    <strong>{tipPair.name || tipLabel}</strong>
                    {tipPair.name && <div>{tipLabel}</div>}
                    <div>{tipPair.effect || <em>No effect yet</em>}</div>
                </div>
            )}
        </>
    );
};

export default RingView;
