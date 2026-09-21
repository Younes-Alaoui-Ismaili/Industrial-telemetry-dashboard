import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import App from './App';
import { SourceSelector } from './components/Dashboard/SourceSelector';

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });

it('exposes separate Azure proof and Frontend demo recordings without a live Cloud control', () => {
  vi.stubEnv('VITE_AZURE_PROOF_VIDEO_URL', './azure-proof.webm');
  vi.stubEnv('VITE_DEMO_VIDEO_URL', './frontend-demo.webm');
  vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', 'https://example.azurewebsites.net');
  render(<SourceSelector value="simulated" onChange={vi.fn()} />);
  expect(screen.getByRole('link', { name: 'Azure proof' }).getAttribute('href')).toBe('./azure-proof.webm');
  expect(screen.getByRole('link', { name: 'Azure proof' }).getAttribute('title')).toContain('Recorded');
  expect(screen.getByRole('link', { name: 'Frontend demo' }).getAttribute('href')).toBe('./frontend-demo.webm');
  expect(screen.queryByRole('radio', { name: 'Cloud' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Cloud' })).toBeNull();
});

it('keeps an old cloud deep link autonomous when only the Azure recording is configured', () => {
  vi.stubEnv('VITE_AZURE_PROOF_VIDEO_URL', './azure-proof.webm');
  vi.stubEnv('VITE_DEMO_VIDEO_URL', ''); vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', '');
  window.history.replaceState({}, '', '/?source=cloud');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<App />);
  expect(screen.getByRole('radio', { name: 'Simulated' }).getAttribute('checked')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
