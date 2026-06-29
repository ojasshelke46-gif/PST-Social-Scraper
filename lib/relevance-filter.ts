/**
 * Post-fetch relevance gate. LinkedIn/X search is fuzzy — it matches individual
 * words ("Technology", "School") independently, so a search for
 * "Polaris School of Technology" can return posts about Saints or Verizon sales.
 * This enforces that a post genuinely mentions the searched keyword before it
 * reaches the UI.
 */
export function isRelevantPost(text: string, keyword: string): boolean {
  if (!text || !keyword) return false;

  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase().trim();

  // Check 1: exact phrase match — strongest signal
  if (normalizedText.includes(normalizedKeyword)) return true;

  // Check 2: all meaningful words present
  // Filter out short connector words (of, the, at, in, for, and, a)
  const meaningfulWords = normalizedKeyword
    .split(/\s+/)
    .filter((word) => word.length > 3);

  if (
    meaningfulWords.length > 0 &&
    meaningfulWords.every((word) => normalizedText.includes(word))
  )
    return true;

  return false;
}
