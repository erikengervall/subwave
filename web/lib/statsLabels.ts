// Readable names for the internal identifiers the Stats page breaks down by
// (LLM call kinds, TTS segment kinds, booth-log kinds, request paths). The raw
// id stays available as a hover title so an operator can still match a log line.

const WORDS: Record<string, string> = {
  dj: 'DJ',
  id: 'ID',
  ids: 'IDs',
  sfx: 'SFX',
  tts: 'TTS',
  llm: 'LLM',
  url: 'URL',
  ai: 'AI',
};

// "sdk.djAgentPick" → "DJ agent pick", "generateStationId" → "Station ID",
// "artist_fallback" → "Artist fallback".
export function humanKind(kind: string): string {
  const bare = kind.replace(/^sdk\./, '').replace(/^generate(?=[A-Z])/, '');
  const words = bare
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_.\-:/]+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
  if (!words.length) return kind;
  return words
    .map((w, i) => WORDS[w] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}
