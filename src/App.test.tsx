import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within, waitFor } from '@testing-library/react';
import App from './App';
import { TICK_MS } from './constants/fleet';

afterEach(cleanup);

describe('App', () => {
  // Equivalent of the original "mounts and renders the dashboard header".
  it('renders the dashboard header', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Industrial Telemetry Dashboard' }),
    ).toBeInTheDocument();
  });

  // Equivalent of the original "shows the seeded devices".
  it('shows the fleet using plant style tags', () => {
    render(<App />);
    expect(screen.getByRole('article', { name: /PRESS-01/ })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /SPINDLE-02/ })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /CONVEYOR-03/ })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /PUMP-04/ })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(8);
  });

  it('never labels a machine as a generic device', () => {
    render(<App />);
    expect(screen.queryByText(/device \d/i)).not.toBeInTheDocument();
  });

  it('shows readings with their units', () => {
    render(<App />);
    const press = screen.getByRole('article', { name: /PRESS-01/ });
    expect(within(press).getByText('Temp')).toBeInTheDocument();
    expect(within(press).getAllByText('C').length).toBeGreaterThan(0);
    expect(within(press).getByText('mm/s')).toBeInTheDocument();
  });

  it('summarises the fleet in the status bar', () => {
    render(<App />);
    expect(screen.getByText('Assets online')).toBeInTheDocument();
    expect(screen.getByText('8/8')).toBeInTheDocument();
    expect(screen.getByText('Availability')).toBeInTheDocument();
  });

  // Equivalent of the original "shows the alerts panel".
  it('shows the alarms panel, empty while the fleet is healthy', () => {
    render(<App />);
    const panel = screen.getByRole('region', { name: 'Alarms' });
    expect(within(panel).getByText(/No active alarms/)).toBeInTheDocument();
    expect(within(panel).getByText('0 open')).toBeInTheDocument();
  });

  describe('fault to acknowledgement', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('raises an alarm in the panel when a fault is injected', () => {
      render(<App />);
      const press = screen.getByRole('article', { name: /PRESS-01/ });

      act(() => {
        fireEvent.click(within(press).getByRole('button', { name: /inject fault/i }));
      });
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      const panel = screen.getByRole('region', { name: 'Alarms' });
      expect(within(panel).getByText('1 open')).toBeInTheDocument();
      expect(within(panel).getByText('PRESS-01')).toBeInTheDocument();
      expect(within(panel).getByText(/Unacknowledged/)).toBeInTheDocument();
    });

    it('states the crossed limit alongside the reading that crossed it', () => {
      render(<App />);
      const press = screen.getByRole('article', { name: /PRESS-01/ });

      act(() => {
        fireEvent.click(within(press).getByRole('button', { name: /inject fault/i }));
      });
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      const panel = screen.getByRole('region', { name: 'Alarms' });
      expect(within(panel).getByText(/past/)).toBeInTheDocument();
      expect(within(panel).getByText(/77/)).toBeInTheDocument();
    });

    // Equivalent of the original "removes an alert when acknowledged", inverted on
    // purpose: acknowledging is a transition, so the row must survive it.
    it('keeps an acknowledged alarm visible and restates it as acknowledged', () => {
      render(<App />);
      const press = screen.getByRole('article', { name: /PRESS-01/ });

      act(() => {
        fireEvent.click(within(press).getByRole('button', { name: /inject fault/i }));
      });
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      const panel = screen.getByRole('region', { name: 'Alarms' });
      act(() => {
        fireEvent.click(within(panel).getByRole('button', { name: /ack/i }));
      });

      expect(within(panel).getByText('1 open')).toBeInTheDocument();
      // Capital A: "Acknowledged" does not occur inside "Unacknowledged".
      expect(within(panel).getByText(/Acknowledged/)).toBeInTheDocument();
      expect(within(panel).queryByRole('button', { name: /ack/i })).not.toBeInTheDocument();
    });

    it('drops the alarm from the panel once it both cleared and was acknowledged', () => {
      render(<App />);
      const press = screen.getByRole('article', { name: /PRESS-01/ });

      act(() => {
        fireEvent.click(within(press).getByRole('button', { name: /inject fault/i }));
      });
      act(() => {
        vi.advanceTimersByTime(TICK_MS);
      });

      const panel = screen.getByRole('region', { name: 'Alarms' });
      act(() => {
        fireEvent.click(within(panel).getByRole('button', { name: /ack/i }));
      });
      act(() => {
        vi.advanceTimersByTime(TICK_MS * 30);
      });

      expect(within(panel).getByText('0 open')).toBeInTheDocument();
    });
  });

  /**
   * The selector and the degradation path. These assert the promise the feature
   * makes: the simulator is the default so the published demo needs nothing
   * installed, and choosing the live source when no server is there says so in
   * words instead of passing the simulator off as live.
   */
  describe('data source', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('offers both sources and starts on the simulator', () => {
      render(<App />);
      const simulated = screen.getByRole('radio', { name: /simulated/i });
      const live = screen.getByRole('radio', { name: /mcp live/i });

      expect(simulated).toBeChecked();
      expect(live).not.toBeChecked();
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated');
    });

    it('shows no degradation banner while the simulator is selected', () => {
      render(<App />);
      expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
    });

    it('labels the fallback and names the reason when no server is reachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      );
      render(<App />);

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));

      const banner = await screen.findByTestId('source-banner');
      expect(within(banner).getByText(/MCP server unavailable/i)).toBeInTheDocument();
      expect(within(banner).getByText(/simulated/i)).toBeInTheDocument();
      expect(within(banner).getByText('Failed to fetch')).toBeInTheDocument();
      expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated (fallback)');
    });

    it('keeps the fleet running on the simulator during the fallback', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      );
      render(<App />);

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));
      await screen.findByTestId('source-banner');

      // The simulated fleet is still on screen, and it is labelled as simulated.
      expect(screen.getAllByRole('article')).toHaveLength(8);
      expect(screen.getByTestId('source-label')).not.toHaveTextContent('MCP live');
    });

    it('switches to the live fleet and labels it as live when the server answers', async () => {
      const now = Date.now();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
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
        }),
      );
      render(<App />);

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));

      await waitFor(() =>
        expect(screen.getByTestId('source-label')).toHaveTextContent('MCP live'),
      );
      expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
      // Only the machines the server actually reports.
      expect(screen.getAllByRole('article')).toHaveLength(1);
      expect(screen.getByRole('article', { name: /PRESS-01/ })).toBeInTheDocument();
    });

    it('returns to the simulator when the operator switches back', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      );
      render(<App />);

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));
      await screen.findByTestId('source-banner');

      fireEvent.click(screen.getByRole('radio', { name: /simulated/i }));

      expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
      expect(screen.getAllByRole('article')).toHaveLength(8);
    });
  });
});
