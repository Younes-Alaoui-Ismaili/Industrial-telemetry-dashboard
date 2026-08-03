import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SourceBanner } from './SourceBanner';
import type { McpConnection } from '../../types/mcp';

afterEach(cleanup);

/** The closed list from the mandate, checked on rendered text. */
const FORBIDDEN = /error|failed|unavailable|not working|cannot|unable/i;

const lost: McpConnection = {
  status: 'unavailable',
  detail: 'Failed to fetch',
  checkedAt: 1_000,
};

describe('SourceBanner', () => {
  it('says nothing while idle or live', () => {
    const { rerender } = render(
      <SourceBanner connection={{ status: 'idle', checkedAt: 0 }} />,
    );
    expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();

    rerender(<SourceBanner connection={{ status: 'live', checkedAt: 1_000 }} />);
    expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
  });

  it('names the connecting state', () => {
    render(<SourceBanner connection={{ status: 'connecting', checkedAt: 0 }} />);
    const banner = screen.getByTestId('source-banner');

    expect(banner).toHaveTextContent('Connecting to MCP server');
    expect(banner).toHaveTextContent('Waiting for the local bridge to answer.');
  });

  /**
   * The load bearing change: the raw detail string ("Failed to fetch" and
   * friends) is in the connection state and must stay off the screen. The
   * substitution itself is still stated in words.
   */
  it('states a lost link and the simulated substitution, without the raw detail', () => {
    render(<SourceBanner connection={lost} />);
    const banner = screen.getByTestId('source-banner');

    expect(banner).toHaveTextContent('MCP link lost');
    expect(banner).toHaveTextContent(/simulated/i);
    expect(banner).toHaveTextContent('keeps polling');
    expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it('renders none of the failure vocabulary', () => {
    render(<SourceBanner connection={lost} />);
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });
});
