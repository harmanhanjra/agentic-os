import { describe, expect, it } from 'vitest';
import { isPrivateAddress, assertSafeProviderUrl } from '../lib/security/url';

describe('V0.2 security hardening', () => {
  it('blocks private and reserved provider targets', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.5',
      '169.254.169.254',
      '192.168.1.10',
      '100.64.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'metadata.google.internal',
      'service.local',
    ]) {
      expect(isPrivateAddress(host), host).toBe(true);
    }
  });

  it('allows normal public HTTPS provider URLs', () => {
    expect(assertSafeProviderUrl('https://api.example.com/v1', false).hostname).toBe(
      'api.example.com',
    );
  });

  it('rejects embedded URL credentials', () => {
    expect(() =>
      assertSafeProviderUrl('https://user:pass@example.com/v1', false),
    ).toThrow();
  });
});
