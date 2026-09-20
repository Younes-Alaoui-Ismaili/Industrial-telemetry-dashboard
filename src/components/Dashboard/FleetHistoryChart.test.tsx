import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { FleetHistoryChart } from './FleetHistoryChart';
import { FLEET } from '../../constants/fleet';
import type { Asset } from '../../types';

afterEach(cleanup);
const assets: Asset[] = FLEET.slice(0, 2).map(spec => ({ spec, state: 'running', values: {}, lastSeen: 3000 }));
it('computes each asset statistics independently and leaves missing history unavailable', () => {
  render(<FleetHistoryChart assets={assets} metric="temperature" history={{
    'PRESS-01:temperature': [{timestamp: 1000, value: 61.5}, {timestamp: 2000, value: 82}, {timestamp: 3000, value: 70}],
    'PRESS-01:vibration': [{timestamp: 3000, value: 2}],
  }} />);
  const table = screen.getByRole('table', {name: 'Temperature history statistics'});
  const press = within(table).getByRole('row', {name: /PRESS-01/});
  expect(within(press).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['61.5 °C', '82.0 °C', '70.0 °C']);
  const spindle = within(table).getByRole('row', {name: /SPINDLE-02/});
  expect(within(spindle).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['N/A', 'N/A', 'N/A']);
});
