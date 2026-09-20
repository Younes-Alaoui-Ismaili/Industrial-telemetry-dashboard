import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  render,
  screen,
  cleanup,
  act,
  within,
  fireEvent,
  waitForElementToBeRemoved,
} from '@testing-library/react';
import App from './App';
import { BOOT_CEILING_MS, BOOT_FADE_MS, BOOT_FLOOR_MS } from './hooks/useBootPhase';

/**
 * The boot experience, asserted at the level a visitor experiences it.
 *
 * Kept apart from App.test.tsx, which asserts the dashboard in its steady state.
 * That file needs no changes for the overlay to exist, and this one is the proof
 * of why: the overlay superimposes, it does not replace, so every query in that
 * file still finds what it looks for while the overlay is up.
 */

afterEach(cleanup);

describe('boot experience', () => {
  describe('with the clock under control', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('puts the overlay up on the first frame', () => {
      render(<App />);
      expect(screen.getByTestId('boot-overlay')).toBeInTheDocument();
    });

    /**
     * The reason App.test.tsx needed no rewriting, stated as an assertion rather
     * than as a claim in a commit message.
     */
    it('leaves the dashboard fully queryable underneath it', () => {
      render(<App />);

      expect(screen.getByTestId('boot-overlay')).toBeInTheDocument();
      expect(screen.getAllByRole('row', { name: /equipment$/ })).toHaveLength(8);
      expect(
        screen.getByRole('heading', { name: 'Industrial Telemetry Dashboard' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Source')).toBeInTheDocument();
      expect(screen.getByText('Assets online')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Alarms' })).toBeInTheDocument();
    });

    it('marks the dashboard busy while the overlay is up, and stops when it goes', () => {
      const { container } = render(<App />);
      const dashboard = container.firstElementChild;

      expect(dashboard).toHaveAttribute('aria-busy', 'true');

      // Two advances: the fade only starts once React has committed the decision
      // to leave, which lands at the end of the first act.
      act(() => {
        vi.advanceTimersByTime(BOOT_FLOOR_MS);
      });
      act(() => {
        vi.advanceTimersByTime(BOOT_FADE_MS);
      });

      expect(screen.queryByTestId('boot-overlay')).not.toBeInTheDocument();
      expect(dashboard).toHaveAttribute('aria-busy', 'false');
    });

    it('names the simulated source and its steps while starting', () => {
      render(<App />);
      const overlay = screen.getByTestId('boot-overlay');

      expect(within(overlay).getByText('Data source: Simulated')).toBeInTheDocument();
      expect(within(overlay).getByText('Fleet definition loaded')).toBeInTheDocument();
      expect(within(overlay).getByText('Trend buffer primed')).toBeInTheDocument();
    });

    it('has historical statistics available before the first tick', () => {
      render(<App />);
      const history = screen.getByRole('table', { name: 'Temperature history statistics' });
      expect(within(history).getAllByRole('row')).toHaveLength(9);
      expect(within(history).queryByText('N/A')).not.toBeInTheDocument();
      expect(within(history).getByRole('row', { name: /PRESS-01/ }).textContent).toContain('°C');
    });

    it('is gone well before the ceiling on a healthy boot', () => {
      render(<App />);

      act(() => {
        vi.advanceTimersByTime(BOOT_CEILING_MS);
      });
      act(() => {
        vi.advanceTimersByTime(BOOT_FADE_MS);
      });

      expect(screen.queryByTestId('boot-overlay')).not.toBeInTheDocument();
    });
  });

  describe('with the live source picked after boot', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /**
     * The honesty requirement, end to end. The overlay must not be what talks
     * to the visitor about the live source, and it must not reappear and hide
     * the guide or the banner that does.
     */
    it('leaves the connect guide to explain, and stays gone', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
      render(<App />);

      await waitForElementToBeRemoved(() => screen.queryByTestId('boot-overlay'), {
        timeout: 3000,
      });

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));
      await screen.findByRole('dialog', { name: 'Connect a live MCP source' });

      expect(screen.queryByTestId('source-banner')).not.toBeInTheDocument();
      expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated');
      expect(screen.getByTestId('source-label')).not.toHaveTextContent('fallback');
      expect(screen.queryByTestId('boot-overlay')).not.toBeInTheDocument();
    });

    it('leaves the banner to state a lost link, and stays gone', async () => {
      // The probe finds a healthy bridge, then the live polling loses it.
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) })
          .mockRejectedValue(new TypeError('Failed to fetch')),
      );
      render(<App />);

      await waitForElementToBeRemoved(() => screen.queryByTestId('boot-overlay'), {
        timeout: 3000,
      });

      fireEvent.click(screen.getByRole('radio', { name: /mcp live/i }));
      // The banner shows up in its connecting state first; wait for the loss.
      const banner = await screen.findByTestId('source-banner');
      await within(banner).findByText(/MCP link lost/i);

      expect(screen.getByTestId('source-label')).toHaveTextContent('Simulated (fallback)');
      expect(screen.queryByTestId('boot-overlay')).not.toBeInTheDocument();
    });
  });
});
