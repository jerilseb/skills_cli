import { access, lstat, mkdir, readlink, realpath, rm, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:os';
import { AGENTS_SKILLS_DIR, CLAUDE_DIR, CLAUDE_SKILLS_DIR } from './constants.js';

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function validateSkillName(skillName: string): string {
  const value = skillName.trim();

  if (!value) {
    throw new Error('Skill name cannot be empty');
  }

  if (value === '.' || value === '..') {
    throw new Error(`Invalid skill name: ${skillName}`);
  }

  if (value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid skill name: ${skillName}. Skill names cannot contain path separators.`);
  }

  if (value.includes('..')) {
    throw new Error(`Invalid skill name: ${skillName}. Skill names cannot contain "..".`);
  }

  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(
      `Invalid skill name: ${skillName}. Allowed characters: letters, numbers, dot, underscore, hyphen.`
    );
  }

  return value;
}

export async function ensureProjectSkillDirs(projectDir: string): Promise<{
  agentsSkillsDir: string;
  claudeSkillsDir: string;
}> {
  const agentsSkillsDir = join(projectDir, AGENTS_SKILLS_DIR);
  const claudeDir = join(projectDir, CLAUDE_DIR);
  const claudeSkillsDir = join(projectDir, CLAUDE_SKILLS_DIR);

  await mkdir(agentsSkillsDir, { recursive: true });
  await mkdir(claudeDir, { recursive: true });
  await ensureClaudeSkillsSymlink(projectDir);

  return { agentsSkillsDir, claudeSkillsDir };
}

export async function ensureClaudeSkillsSymlink(projectDir: string): Promise<void> {
  const agentsSkillsDir = join(projectDir, AGENTS_SKILLS_DIR);
  const claudeSkillsDir = join(projectDir, CLAUDE_SKILLS_DIR);
  const linkParent = dirname(claudeSkillsDir);
  const relativeTarget = relative(linkParent, agentsSkillsDir) || '.';

  if (!(await pathExists(claudeSkillsDir))) {
    await symlink(relativeTarget, claudeSkillsDir, platform() === 'win32' ? 'junction' : 'dir');
    return;
  }

  const stats = await lstat(claudeSkillsDir);
  if (stats.isSymbolicLink()) {
    const existingTarget = await readlink(claudeSkillsDir);
    const resolvedExisting = resolve(linkParent, existingTarget);
    const resolvedExpected = resolve(agentsSkillsDir);

    if (resolvedExisting === resolvedExpected) {
      return;
    }

    const [realExisting, realExpected] = await Promise.all([
      realpath(resolvedExisting).catch(() => resolvedExisting),
      realpath(resolvedExpected).catch(() => resolvedExpected),
    ]);

    if (realExisting === realExpected) {
      return;
    }

    await rm(claudeSkillsDir, { recursive: true, force: true });
    await symlink(relativeTarget, claudeSkillsDir, platform() === 'win32' ? 'junction' : 'dir');
    return;
  }

  throw new Error(
    `${CLAUDE_SKILLS_DIR} already exists and is not a symlink. Please move it away and try again.`
  );
}
