// PDPA guard, shared by the UI and server routes. The database enforces the same rule
// with public.has_pii() check constraints, so bypassing the UI doesn't help.
// IC number: \d{6}-?\d{2}-?\d{4}. Bank/card number: 10–16 digits in a row.
const IC = /(?<!\d)\d{6}-?\d{2}-?\d{4}(?!\d)/;
const BANK = /(?<!\d)\d{10,16}(?!\d)/;

export const PII_MESSAGE =
  "This looks like an IC or bank/card number. CaseLab doesn't store personal ID numbers (PDPA) — remove it to save.";

export function hasPII(text: string | null | undefined): boolean {
  if (!text) return false;
  return IC.test(text) || BANK.test(text);
}
