import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import App from './App';

/**
 * The connect guide, asserted end to end.
 *
 * Kept apart from App.test.tsx the way the boot suite is: that file asserts
 * the dashboard in its steady state, this one asserts what happens when the
 * live source is asked for and no bridge answers. The core of the feature is
 * structural: the source never leaves the simulator on a dead bridge, so every
 * close path has nothing to roll back, and the header, the selector and the
 * absence of a banner are all the same fact observed three ways.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The closed list from the mandate, checked on rendered text. */
const FORBIDDEN = /error|failed|unavailable|not working|cannot|unable/i;

const deadBridge = () =>
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

const liveSnapshot = (now: number) => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: 'live',
    server: { name: 'telemetry', version: '0.1.0' },
    fetchedAt: now,
    window: { start: now - 900_000, end: now, step_ms: 30_000 },
    devices: [
      {
        id: 'press-01',
        name: 'Hydraulic Press',
        state: 'running',
        temperature_c: 62.4,
        vibration_mm_s: 2.05,
        timestamp: now,
      },
    ],
    anomalies: [],
    telemetry: { 'press-01': [] },
  }),
});

const clickMcpLive = () => fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));

const findGuide = () => screen.findByRole('dialog', { name: 'Connect a live MCP source' });

/** The invariant every close path must land on: nothing ever switched. */
const expectSimulatedEverywhere = () => {
  expect(screen.getByRole('radio', { name: /simulated/i })).toBeChecked();
  expect(screen.getByRole('radio', { name: /mcp live/i })).not.toBeChecked();
  expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated');
  expect(screen.getByTestId('source-label')).not.toHaveTextContent('fallback');
  expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
};

describe('connect guide', () => {
  it('opens the guide instead of switching when the bridge does not answer', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();

    expectSimulatedEverywhere();
    // The simulated fleet never blinked.
    expect(screen.getAllByRole('article')).toHaveLength(8);
  });

  it('closes on Stay in simulated mode and hands focus back to the selector', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Stay in simulated mode' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectSimulatedEverywhere();
    expect(screen.getByRole('radio', { name: /mcp live/i })).toHaveFocus();
  });

  it('closes on the close control and hands focus back to the selector', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectSimulatedEverywhere();
    expect(screen.getByRole('radio', { name: /mcp live/i })).toHaveFocus();
  });

  it('closes on Escape and hands focus back to the selector', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectSimulatedEverywhere();
    expect(screen.getByRole('radio', { name: /mcp live/i })).toHaveFocus();
  });

  it('closes on a press on the backdrop and hands focus back to the selector', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();
    fireEvent.mouseDown(screen.getByTestId('connect-mcp-scrim'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectSimulatedEverywhere();
    expect(screen.getByRole('radio', { name: /mcp live/i })).toHaveFocus();
  });

  it('ignores a second press on the live option while the probe is out', async () => {
    let rejectProbe: (reason: unknown) => void = () => {};
    const gate = new Promise((_resolve, reject) => {
      rejectProbe = reject;
    });
    const fetchMock = vi.fn().mockReturnValue(gate);
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);

    clickMcpLive();
    clickMcpLive();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rejectProbe(new TypeError('Failed to fetch'));
    await findGuide();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('closes an open faceplate before presenting the guide', async () => {
    let rejectProbe: (reason: unknown) => void = () => {};
    const gate = new Promise((_resolve, reject) => {
      rejectProbe = reject;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(gate));
    render(<App />);

    clickMcpLive();
    fireEvent.click(screen.getByRole('button', { name: /PRESS-01/ }));
    expect(screen.getByRole('dialog', { name: 'PRESS-01 faceplate' })).toBeInTheDocument();

    rejectProbe(new TypeError('Failed to fetch'));
    await findGuide();

    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveAccessibleName('Connect a live MCP source');
  });

  it('switches to live with no guide when the bridge answers', async () => {
    const now = Date.now();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(liveSnapshot(now)));
    render(<App />);

    clickMcpLive();
    await waitFor(() =>
      expect(screen.getByTestId('source-label')).toHaveTextContent('MCP live'),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /mcp live/i })).toBeChecked();
  });

  it('renders no failure vocabulary while the guide is up', async () => {
    deadBridge();
    render(<App />);

    clickMcpLive();
    await findGuide();
    expect(document.body.textContent).not.toMatch(FORBIDDEN);

    fireEvent.click(screen.getByRole('button', { name: 'Stay in simulated mode' }));
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });

  it('renders no failure vocabulary when a live link degrades', async () => {
    // The probe finds a healthy bridge, then the live polling loses it.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
        .mockRejectedValue(new TypeError('Failed to fetch')),
    );
    render(<App />);

    clickMcpLive();
    const banner = await screen.findByTestId('source-banner');
    await within(banner).findByText(/MCP link lost/i);

    expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated (fallback)');
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });
});
