import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { SourceSelector } from './components/Dashboard/SourceSelector';

const azureUrl = 'https://telemetry-proof-yai-20260909-us.azurewebsites.net/?source=cloud';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('Cloud navigation', () => {
  it('offers an Azure link instead of activating an absent API on Pages', () => {
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', azureUrl);
    const onChange = vi.fn();
    render(<SourceSelector value="simulated" onChange={onChange} />);
    expect(screen.getByRole('link', { name: 'Cloud' })).toHaveAttribute('href', azureUrl);
    expect(screen.queryByRole('radio', { name: 'Cloud' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the Cloud radio on the API-backed deployment', () => {
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', '');
    const onChange = vi.fn();
    render(<SourceSelector value="simulated" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Cloud' }));
    expect(onChange).toHaveBeenCalledWith('cloud', expect.any(HTMLInputElement));
    expect(screen.queryByRole('link', { name: 'Cloud' })).not.toBeInTheDocument();
  });

  it('does not request a same-origin API for a Cloud deep link on Pages', () => {
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', azureUrl);
    window.history.replaceState({}, '', '/?source=cloud');
    const fetch = vi.fn().mockRejectedValue(new Error('No API on Pages'));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(screen.getByRole('radio', { name: 'Simulated' })).toBeChecked();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Sign in with Microsoft' })).not.toBeInTheDocument();
  });

  it('preserves the API and Microsoft login for a Cloud deep link on Azure', async () => {
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', '');
    window.history.replaceState({}, '', '/?source=cloud');
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(screen.getByRole('radio', { name: 'Cloud' })).toBeChecked();
    expect(fetch).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ credentials: 'same-origin' }));
    expect(await screen.findByText('Sign in or enter a local access token.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Microsoft' })).toHaveAttribute('href', '/.auth/login/aad?post_login_redirect_uri=/?source=cloud');
  });
});


describe('Archived Cloud evidence', () => {
  it('replaces the live link with an explicitly recorded video, even if both URLs are configured', () => {
    vi.stubEnv('VITE_CLOUD_EVIDENCE_URL', './cloud-proof.webm');
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', azureUrl);
    const onChange = vi.fn();
    render(<SourceSelector value="simulated" onChange={onChange} />);
    const link = screen.getByRole('link', { name: 'Cloud video' });
    expect(link).toHaveAttribute('href', './cloud-proof.webm');
    expect(link).toHaveAttribute('title', expect.stringContaining('Recorded'));
    expect(screen.queryByRole('link', { name: 'Cloud' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Cloud' })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('keeps old cloud deep links in autonomous mode without any API request', () => {
    vi.stubEnv('VITE_CLOUD_EVIDENCE_URL', './cloud-proof.webm');
    vi.stubEnv('VITE_CLOUD_DASHBOARD_URL', '');
    window.history.replaceState({}, '', '/?source=cloud');
    const fetch = vi.fn().mockRejectedValue(new Error('No API on Pages'));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(screen.getByRole('radio', { name: 'Simulated' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Cloud video' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
