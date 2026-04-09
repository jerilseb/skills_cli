import { cp, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';

export interface SkillMetadata {
  dirName: string;
  title: string;
  description: string;
  skillMdPath: string;
}

export async function readSkillMetadata(skillDir: string): Promise<SkillMetadata> {
  const skillMdPath = join(skillDir, 'SKILL.md');
  const raw = await readFile(skillMdPath, 'utf8').catch(() => {
    throw new Error(`Missing SKILL.md in ${skillDir}`);
  });

  const { data } = parseFrontmatter(raw);
  const name = data.name;
  const description = data.description;

  if (typeof name !== 'string' || !name.trim()) {
    throw new Error(`Invalid SKILL.md in ${skillDir}: missing frontmatter field "name"`);
  }

  if (typeof description !== 'string' || !description.trim()) {
    throw new Error(`Invalid SKILL.md in ${skillDir}: missing frontmatter field "description"`);
  }

  return {
    dirName: basename(skillDir),
    title: name.trim(),
    description: description.trim(),
    skillMdPath,
  };
}

export async function copySkillDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    preserveTimestamps: true,
  });
}
