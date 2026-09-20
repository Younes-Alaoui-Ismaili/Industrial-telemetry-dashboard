import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('opens the autonomous equipment table without any server request', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<App />);
  const table = screen.getByRole('table', { name: 'Equipment measurements' });
  expect(within(table).getAllByRole('row')).toHaveLength(9);
  expect(screen.getByRole('region', { name: 'Temperature history trend' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Vibration history trend' })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});

it('filters equipment and opens all metrics from the matching row', () => {
  render(<App />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search equipment' }), { target: { value: 'PRESS-01' } });
  const table = screen.getByRole('table', { name: 'Equipment measurements' });
  expect(within(table).getAllByRole('row')).toHaveLength(2);
  fireEvent.click(within(table).getByRole('button', { name: /PRESS-01/ }));
  expect(screen.getByRole('dialog', { name: 'PRESS-01 faceplate' })).toBeInTheDocument();
});
