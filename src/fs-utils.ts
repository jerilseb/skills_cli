import { access, appendFile, lstat, mkdir, readFile, readlink, realpath, rm, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, relative, resolve } from 'node:path';
import { platform } from 'node:os';
import { AGENTS_DIR, AGENTS_SKILLS_DIR, CLAUDE_DIR, CLAUDE_SKILLS_DIR, PI_DIR, PI_SKILLS_DIR } from './constants.js';
import { c } from './log.js';

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
  piSkillsDir: string;
}> {
  const agentsSkillsDir = join(projectDir, AGENTS_SKILLS_DIR);
  const claudeDir = join(projectDir, CLAUDE_DIR);
  const piDir = join(projectDir, PI_DIR);
  const claudeSkillsDir = join(projectDir, CLAUDE_SKILLS_DIR);
  const piSkillsDir = join(projectDir, PI_SKILLS_DIR);

  await mkdir(agentsSkillsDir, { recursive: true });
  await mkdir(claudeDir, { recursive: true });
  await mkdir(piDir, { recursive: true });
  await ensureClaudeSkillsSymlink(projectDir);
  await ensurePiSkillsSymlink(projectDir);

  return { agentsSkillsDir, claudeSkillsDir, piSkillsDir };
}

async function ensureSkillsSymlink(projectDir: string, linkPath: string): Promise<void> {
  const agentsSkillsDir = join(projectDir, AGENTS_SKILLS_DIR);
  const skillsDir = join(projectDir, linkPath);
  const linkParent = dirname(skillsDir);
  const relativeTarget = relative(linkParent, agentsSkillsDir) || '.';

  if (!(await pathExists(skillsDir))) {
    await symlink(relativeTarget, skillsDir, platform() === 'win32' ? 'junction' : 'dir');
    return;
  }

  const stats = await lstat(skillsDir);
  if (stats.isSymbolicLink()) {
    const existingTarget = await readlink(skillsDir);
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

    await rm(skillsDir, { recursive: true, force: true });
    await symlink(relativeTarget, skillsDir, platform() === 'win32' ? 'junction' : 'dir');
    return;
  }

  throw new Error(`${linkPath} already exists and is not a symlink. Please move it away and try again.`);
}

export async function ensureClaudeSkillsSymlink(projectDir: string): Promise<void> {
  await ensureSkillsSymlink(projectDir, CLAUDE_SKILLS_DIR);
}

export async function ensurePiSkillsSymlink(projectDir: string): Promise<void> {
  await ensureSkillsSymlink(projectDir, PI_SKILLS_DIR);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function maybeUpdateGitignore(projectDir: string): Promise<void> {
  const gitignorePath = join(projectDir, '.gitignore');

  if (!(await pathExists(gitignorePath))) {
    return;
  }

  const content = await readFile(gitignorePath, 'utf-8');
  const dirs = [AGENTS_DIR, CLAUDE_DIR, PI_DIR];
  const missing = dirs.filter((dir) => {
    const pattern = new RegExp(`(^|\\n)\\/?${dir.replace('.', '\\.')}\\/?($|\\n)`);
    return !pattern.test(content);
  });

  if (missing.length === 0) {
    return;
  }

  const answer = await prompt(
    `${c.cyan('?')} Add ${c.bold(missing.join(', '))} to .gitignore? ${c.dim('(Y/n)')} `
  );

  if (answer === '' || answer === 'y' || answer === 'yes') {
    const suffix = content.endsWith('\n') ? '' : '\n';
    await appendFile(gitignorePath, suffix + missing.join('\n') + '\n');
    console.log(`${c.green('✅')} Updated .gitignore`);
  }
}
