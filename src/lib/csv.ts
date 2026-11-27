/**
 * One CSV cell for Excel (semicolon-separated files). Text that a
 * spreadsheet would run as a formula (= + - @, or a leading tab / carriage
 * return) is prefixed with an apostrophe FIRST, then the cell is quoted when
 * it contains a quote, separator or line break — quoting alone does not stop
 * Excel from evaluating "=HYPERLINK(...)". Dependency-free.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";,\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
