export function extractEventMarketLabel(question: string): string {
  const raw = String(question || "").trim();
  if (!raw) return "Unnamed market";

  const normalized = raw.replace(/\s+/g, " ").trim();

  const patterns = [
    /^Will\s+(.+?)\s+win\s+the\s+\d{4}\s+Democratic presidential nomination\??$/i,
    /^Will\s+(.+?)\s+win\s+the\s+\d{4}\s+Republican presidential nomination\??$/i,
    /^Will\s+(.+?)\s+win\s+the\s+presidency\??$/i,
    /^Will\s+(.+?)\s+win\??$/i,
    /^Will\s+(.+?)\s+be\s+the\s+next\s+.+\??$/i,
    /^Will\s+(.+?)\s+become\s+.+\??$/i,
    /^Is\s+(.+?)\s+the\s+nominee\??$/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return normalized;
}
