export function toEpubFilename(title: string): string {
  const safe = title.replace(/[/\\?%*:|"<>]/g, "").trim().slice(0, 120);
  return `${safe || "Storycot Story"}.epub`;
}
