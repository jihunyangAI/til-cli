function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function localTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function entryLine(time: string, text: string): string {
  return `- ${time} ${text}\n`;
}

export function dayHeading(date: string): string {
  return `# ${date}\n\n`;
}

export function dayFileName(date: string): string {
  return `${date}.md`;
}
