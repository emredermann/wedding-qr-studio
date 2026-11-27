/**
 * Phone numbers → digits with country code (905321234567). Turkish habits
 * are understood: 0532 123 45 67 and 532 123 45 67 become 905321234567;
 * +44 20… and 0044 20… keep their country. Anything that is not 8–15 digits
 * afterwards is not a phone number (null). Dependency-free.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[+\d][\d\s().-]*$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^0[1-9]\d{9}$/.test(digits)) digits = `90${digits.slice(1)}`;
  else if (/^[1-9]\d{9}$/.test(digits)) digits = `90${digits}`;
  return /^\d{8,15}$/.test(digits) ? digits : null;
}

/** "905321234567" → "+90 532 123 45 67" (other countries: "+44 2071234567"). */
export function formatPhone(digits: string): string {
  const tr = /^90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits);
  return tr ? `+90 ${tr[1]} ${tr[2]} ${tr[3]} ${tr[4]}` : `+${digits}`;
}
