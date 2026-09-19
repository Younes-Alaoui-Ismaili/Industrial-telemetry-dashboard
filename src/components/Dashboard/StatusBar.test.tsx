import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StatusBar } from './StatusBar';

it('reports unknown metrics and no timestamp when its source is unavailable', () => {
  render(<StatusBar assets={[]} alarms={[]} lastUpdate={0} sourceLabel="Cloud API unavailable" dataAvailable={false} />);
  expect(screen.queryByText('100.0%')).not.toBeInTheDocument();
  expect(screen.queryByText('0/0')).not.toBeInTheDocument();
  expect(screen.getByText('No data')).toBeInTheDocument();
  expect(screen.getAllByText('Unknown')).toHaveLength(4);
});
