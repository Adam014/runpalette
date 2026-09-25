import type { CatalogCommand } from "../core/model.js";

function subsequenceScore(query: string, value: string): number | undefined {
  let position = 0;
  let score = 0;
  let previousMatch = -2;
  for (const character of query) {
    const found = value.indexOf(character, position);
    if (found === -1) return undefined;
    score += found === previousMatch + 1 ? 8 : 2;
    score -= found;
    previousMatch = found;
    position = found + 1;
  }
  return score;
}

function fieldScore(query: string, value: string): number | undefined {
  if (value === query) return 1_000;
  if (value.startsWith(query)) return 800 - value.length;
  const wordIndex = value.search(new RegExp(`(?:^|[:/_.\\-\\s])${escapeRegExp(query)}`, "u"));
  if (wordIndex !== -1) return 650 - wordIndex;
  const substring = value.indexOf(query);
  if (substring !== -1) return 500 - substring;
  return subsequenceScore(query, value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function filterCommands(
  commands: readonly CatalogCommand[],
  query: string,
): CatalogCommand[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") return [...commands];
  const parts = normalized.split(/\s+/u);

  return commands
    .map((command, index) => {
      const fields = [command.name.toLowerCase(), command.script.toLowerCase()];
      let total = 0;
      for (const part of parts) {
        const scores = fields
          .map((field) => fieldScore(part, field))
          .filter((score): score is number => score !== undefined);
        if (scores.length === 0) return undefined;
        total += Math.max(...scores);
      }
      return { command, score: total, index };
    })
    .filter(
      (entry): entry is { command: CatalogCommand; score: number; index: number } =>
        entry !== undefined,
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.command);
}
