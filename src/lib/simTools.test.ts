import { describe, it, expect, vi, afterEach } from 'vitest';

async function loadWithFlag(flag: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_SIMTOOLS', flag as string);
  const { SIM_TOOLS_ENABLED } = await import('./simTools');
  return SIM_TOOLS_ENABLED;
}

describe('SIM_TOOLS_ENABLED', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is on when the flag is missing (a build with no .env, like Lovable publish)', async () => {
    expect(await loadWithFlag(undefined)).toBe(true);
  });

  it('is on when the flag says true', async () => {
    expect(await loadWithFlag('true')).toBe(true);
  });

  it('is off only when the flag explicitly says false (demo capture)', async () => {
    expect(await loadWithFlag('false')).toBe(false);
  });
});
