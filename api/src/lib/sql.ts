// Builds a "contains" pattern for ILIKE. The user's % and _ are escaped so they match literally
// instead of acting as wildcards.
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
