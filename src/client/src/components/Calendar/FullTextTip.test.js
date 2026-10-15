import { render, screen } from '@testing-library/react';
import FullTextTip from './FullTextTip';

const anchorRef = {
    current: { getBoundingClientRect: () => ({ left: 10, bottom: 50, top: 20, width: 100 }) },
};

test('renders nothing when closed', () => {
    render(<FullTextTip isOpen={false} tipId="t1" anchorRef={anchorRef} text="Hello" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
});

test('portals a tooltip with the id and full text into document.body, fixed below the anchor', () => {
    const { container } = render(<FullTextTip isOpen tipId="t1" anchorRef={anchorRef} text="Full text here" />);
    const tip = screen.getByRole('tooltip');
    expect(tip.id).toBe('t1');
    expect(tip).toHaveTextContent('Full text here');
    expect(tip.parentElement).toBe(document.body);
    expect(container).not.toContainElement(tip);
    expect(tip.className).toContain('full-text-tip');
    expect(tip.style.position).toBe('fixed');
    expect(tip.style.left).toBe('10px');
    expect(tip.style.top).toBe('54px');
});
