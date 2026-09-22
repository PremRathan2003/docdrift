/** Parses "YYYY-MM-DD" into a Date at midnight UTC. */
export function parseIsoDate(text: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new RangeError(`Not a date: ${text}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
