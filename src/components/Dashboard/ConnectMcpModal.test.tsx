import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { ConnectMcpModal } from './ConnectMcpModal';

afterEach(cleanup);

/**
 * The closed list from the mandate. The guide exists to remove the vocabulary
 * of a product defect from a missing optional install, so the absence of these
 * words is a feature and gets pinned like one.
 */
const FORBIDDEN = /error|failed|unavailable|not working|cannot|unable/i;

const renderModal = () => {
  const onClose = vi.fn();
  render(<ConnectMcpModal onClose={onClose} />);
  return { onClose };
};

describe('ConnectMcpModal', () => {
  it('announces itself as a modal dialog labelled by its title', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Connect a live MCP source');
  });

  it('names itself through aria-labelledby pointing at the heading', () => {
    renderModal();
    const heading = screen.getByRole('heading', { name: 'Connect a live MCP source' });

    expect(heading.id).not.toBe('');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', heading.id);
  });

  it('lists exactly three numbered steps, in order', () => {
    renderModal();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Run a telemetry MCP server on your machine.');
    expect(items[1]).toHaveTextContent(
      'Start the bridge with the server path in its environment variable.',
    );
    expect(items[2]).toHaveTextContent(
      'Open this dashboard from a local build, then switch the source to MCP live.',
    );
  });

  it('offers a single action button, a close control, and no links', () => {
    renderModal();
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getAllByRole('button')).toHaveLength(2);
    expect(
      within(dialog).getByRole('button', { name: 'Stay in simulated mode' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
  });

  it('closes exactly once on the action button', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Stay in simulated mode' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes exactly once on the croix', () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press on the backdrop, and not on a press inside', () => {
    const { onClose } = renderModal();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('connect-mcp-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes focus on the action button when it opens', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Stay in simulated mode' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog, in both directions', () => {
    renderModal();
    const croix = screen.getByRole('button', { name: 'Close' });
    const action = screen.getByRole('button', { name: 'Stay in simulated mode' });

    action.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(croix).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(action).toHaveFocus();
  });

  /**
   * The T-038 lesson, stated as an assertion. A click on an inner control
   * stops where stopPropagation says, but the keystroke that produced it
   * travels on its own; any close observed here could only come from a parent
   * handler hijacking that keystroke, which is exactly what must not exist.
   */
  it('leaves a keystroke on the action button to the button', () => {
    const { onClose } = renderModal();
    const action = screen.getByRole('button', { name: 'Stay in simulated mode' });

    fireEvent.keyDown(action, { key: 'Enter' });
    fireEvent.keyDown(action, { key: ' ' });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(action);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape even while an inner control holds focus', () => {
    const { onClose } = renderModal();
    const action = screen.getByRole('button', { name: 'Stay in simulated mode' });

    action.focus();
    fireEvent.keyDown(action, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders none of the failure vocabulary', () => {
    renderModal();
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });
});
