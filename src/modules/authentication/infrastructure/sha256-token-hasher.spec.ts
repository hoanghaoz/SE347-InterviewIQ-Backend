import { Sha256TokenHasher } from './sha256-token-hasher';

describe('Sha256TokenHasher', () => {
  const hasher = new Sha256TokenHasher();

  describe('generateToken', () => {
    it('returns a 32-byte token encoded as 64 hex characters', () => {
      const token = hasher.generateToken();

      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns a different token on each call', () => {
      const first = hasher.generateToken();
      const second = hasher.generateToken();

      expect(first).not.toBe(second);
    });
  });

  describe('hashToken', () => {
    it('matches the known SHA-256 hex digest', () => {
      expect(hasher.hashToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('is deterministic so a stored hash can be looked up again', () => {
      const token = hasher.generateToken();

      expect(hasher.hashToken(token)).toBe(hasher.hashToken(token));
    });

    it('produces different hashes for different tokens', () => {
      const first = hasher.generateToken();
      const second = hasher.generateToken();

      expect(hasher.hashToken(first)).not.toBe(hasher.hashToken(second));
    });

    it('never returns the raw token', () => {
      const token = hasher.generateToken();

      expect(hasher.hashToken(token)).not.toBe(token);
    });
  });
});
