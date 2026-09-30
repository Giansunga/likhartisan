export const PASSWORD_REQUIREMENTS = 'At least 8 characters, 1 uppercase letter, 1 number, and 1 symbol.';

// Keep this set in sync with the Supabase Auth required-character group.
export const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export function meetsPasswordRequirements(password: string): boolean {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && [...password].some(character => PASSWORD_SYMBOLS.includes(character));
}
