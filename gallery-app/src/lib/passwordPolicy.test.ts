import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { meetsPasswordRequirements, PASSWORD_SYMBOLS } from './passwordPolicy';

describe('new password policy', () => {
  it.each(['Short1!', 'lowercase1!', 'Uppercase!', 'Uppercase12'])(
    'rejects a missing requirement: %s', password => {
      expect(meetsPasswordRequirements(password)).toBe(false);
    },
  );

  it('allows an uppercase-only password with a digit and symbol', () => {
    expect(meetsPasswordRequirements('PASSWORD1!')).toBe(true);
    expect(meetsPasswordRequirements('PASSWORD1:')).toBe(true);
    expect(meetsPasswordRequirements('PASSWORD1\\')).toBe(true);
  });

  it('matches the Supabase Auth policy to apply after deployment', () => {
    const config = JSON.parse(readFileSync('../supabase/auth-password-policy.json', 'utf8'));
    expect(config.password_min_length).toBe(8);
    expect(config.password_required_characters).toBe(
      `ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:${PASSWORD_SYMBOLS.replace(':', '\\:')}`,
    );
  });
});
