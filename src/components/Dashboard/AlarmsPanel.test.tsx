import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { AlarmsPanel } from './AlarmsPanel';
it('does not claim zero open alarms when the source is unavailable', () => {
  render(<AlarmsPanel alarms={[]} now={0} onAcknowledge={() => undefined} dataAvailable={false} emptyText="Alarm source unavailable." />);
  expect(screen.queryByText('0 open')).not.toBeInTheDocument();
  expect(screen.getByText('Unknown')).toBeInTheDocument();
  expect(screen.getByText('Alarm source unavailable.')).toBeInTheDocument();
});
