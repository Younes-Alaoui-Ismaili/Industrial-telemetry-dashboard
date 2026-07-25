import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
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
});
