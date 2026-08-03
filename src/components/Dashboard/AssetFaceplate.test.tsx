import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { AssetFaceplate } from './AssetFaceplate';
import type { Alarm, Asset, AssetSpec, History, MetricSpec } from '../../types';

afterEach(cleanup);

const temperature: MetricSpec = {
  key: 'temperature',
  label: 'Temp',
  unit: 'C',
  decimals: 1,
  nominal: 62,
  jitter: 0.8,
  warn: 72,
  alarm: 77,
};

const vibration: MetricSpec = {
  key: 'vibration',
  label: 'Vibration',
  unit: 'mm/s',
  decimals: 2,
  nominal: 2.1,
  jitter: 0.15,
  warn: 3.4,
  alarm: 4.1,
};

const pressure: MetricSpec = {
  key: 'pressure',
  label: 'Pressure',
  unit: 'bar',
  decimals: 0,
  nominal: 210,
  jitter: 4,
  warn: 240,
  alarm: 255,
};

const cycles: MetricSpec = {
  key: 'cycles',
  label: 'Cycles',
  unit: '',
  decimals: 0,
  nominal: 48210,
  jitter: 0,
  counter: true,
};

/** The four metric machine the two slot pane used to truncate. */
const press: AssetSpec = {
  id: 'PRESS-01',
  name: 'Hydraulic Press',
  kind: 'press',
  metrics: [temperature, vibration, pressure, cycles],
};

const chiller: AssetSpec = {
  id: 'CHILLER-08',
  name: 'Process Chiller',
  kind: 'chiller',
  metrics: [temperature, pressure],
};

const asset = (spec: AssetSpec, state: Asset['state'] = 'running'): Asset => ({
  spec,
  state,
  values: { temperature: 62, vibration: 2.1, pressure: 210, cycles: 48210 },
  lastSeen: 1_000,
});

const history: History = {
  'PRESS-01:temperature': [{ timestamp: 0, value: 62 }],
  'PRESS-01:vibration': [{ timestamp: 0, value: 2.1 }],
  'PRESS-01:pressure': [{ timestamp: 0, value: 210 }],
  'PRESS-01:cycles': [{ timestamp: 0, value: 48210 }],
};

const alarm = (assetId: string, id = `${assetId}:temperature:1`): Alarm => ({
  id,
  assetId,
  metric: 'temperature',
  severity: 'alarm',
  threshold: 77,
  unit: 'C',
  decimals: 1,
  raisedAt: 1_000,
  peakValue: 83.2,
});

const renderFaceplate = (overrides: Partial<Parameters<typeof AssetFaceplate>[0]> = {}) => {
  const onClose = vi.fn();
  const onAcknowledge = vi.fn();

  render(
    <AssetFaceplate
      asset={asset(press)}
      history={history}
      alarms={[]}
      now={2_000}
      onAcknowledge={onAcknowledge}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onClose, onAcknowledge };
};

describe('AssetFaceplate', () => {
  it('announces itself as a modal dialog named after the asset', () => {
    renderFaceplate();
    const dialog = screen.getByRole('dialog');

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('PRESS-01 faceplate');
  });

  it('carries the identity and state of the card it came from', () => {
    renderFaceplate({ asset: asset(press, 'fault') });
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('heading', { name: 'PRESS-01' })).toBeInTheDocument();
    expect(within(dialog).getByText('Hydraulic Press')).toBeInTheDocument();
    expect(within(dialog).getByText('Fault')).toBeInTheDocument();
  });

  /** The defect this component exists to fix. */
  it('draws every metric of a four metric asset, none dropped', () => {
    renderFaceplate();
    const dialog = screen.getByRole('dialog');
    const trends = within(dialog).getAllByRole('region', { name: /trend$/ });

    expect(trends).toHaveLength(4);
    for (const name of ['Temp', 'Vibration', 'Pressure', 'Cycles']) {
      expect(
        within(dialog).getByRole('region', { name: `PRESS-01 ${name} trend` }),
      ).toBeInTheDocument();
    }
  });

  it('derives the row count from the asset, so a two metric asset draws two', () => {
    renderFaceplate({ asset: asset(chiller), history: {} });
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getAllByRole('region', { name: /trend$/ })).toHaveLength(2);
  });

  it('states the limits of a limited metric and none for a counter', () => {
    renderFaceplate();
    const dialog = screen.getByRole('dialog');

    const pressureTrend = within(dialog).getByRole('region', { name: 'PRESS-01 Pressure trend' });
    expect(within(pressureTrend).getByText('warn 240 / alarm 255 bar')).toBeInTheDocument();

    const cyclesTrend = within(dialog).getByRole('region', { name: 'PRESS-01 Cycles trend' });
    expect(within(cyclesTrend).queryByText(/warn|alarm/)).not.toBeInTheDocument();
  });

  /** Live devices arrive with unknown limits and no history at all. */
  it('renders a metric with no limits and no samples without failing', () => {
    const unknown: MetricSpec = {
      key: 'temperature',
      label: 'Temp',
      unit: '',
      decimals: 2,
      nominal: 0,
      jitter: 0,
    };
    const device: AssetSpec = { id: 'DEVICE-1', name: 'Device 1', kind: 'pump', metrics: [unknown] };

    renderFaceplate({
      asset: { spec: device, state: 'running', values: { temperature: 21 }, lastSeen: 0 },
      history: {},
    });

    expect(
      within(screen.getByRole('dialog')).getByRole('region', { name: 'DEVICE-1 Temp trend' }),
    ).toBeInTheDocument();
  });

  it('lists this asset alarms only, under its own name', () => {
    renderFaceplate({ alarms: [alarm('PRESS-01'), alarm('SPINDLE-02')] });
    const dialog = screen.getByRole('dialog');
    const list = within(dialog).getByRole('region', { name: 'PRESS-01 alarms' });

    expect(within(list).getByText('PRESS-01')).toBeInTheDocument();
    expect(within(list).queryByText('SPINDLE-02')).not.toBeInTheDocument();
    expect(within(list).getByText('1 open')).toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Alarms' })).not.toBeInTheDocument();
  });

  it('says so explicitly when the asset has no alarms', () => {
    renderFaceplate({ alarms: [alarm('SPINDLE-02')] });

    expect(screen.getByText('No active alarms for this asset.')).toBeInTheDocument();
  });

  it('closes on the close button', () => {
    const { onClose } = renderFaceplate();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderFaceplate();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press outside, and not on a press inside', () => {
    const { onClose } = renderFaceplate();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('faceplate-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('takes focus on open', () => {
    renderFaceplate();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('keeps Tab inside the dialog, in both directions', () => {
    renderFaceplate({ alarms: [alarm('PRESS-01')] });
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea'),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    expect(first).not.toBe(last);

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('pulls focus back in when it has drifted to the page', () => {
    renderFaceplate();
    (document.activeElement as HTMLElement | null)?.blur();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});
