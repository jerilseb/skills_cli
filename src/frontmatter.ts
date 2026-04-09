import { parse as parseYaml } from 'yaml';

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Minimal YAML frontmatter parser.
 *
 * Only supports standard --- YAML blocks. This mirrors the safer
 * approach used in vercel_skills.md: no JS frontmatter evaluation.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: raw };
  }

  const data = (parseYaml(match[1] ?? '') as Record<string, unknown> | null) ?? {};
  return {
    data,
    content: match[2] ?? '',
  };
}
