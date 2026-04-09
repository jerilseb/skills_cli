import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AGENTS_SKILLS_DIR, PUSH_REMOTE, SOURCE_SKILLS_DIR } from './constants.js';
import { ensureProjectSkillDirs, validateSkillName } from './fs-utils.js';
import { cleanupTempDir, cloneRepo } from './git.js';
import { c } from './log.js';
import { copySkillDirectory, readSkillMetadata } from './skill.js';

export interface ParsedAddSource {
  cloneUrl: string;
  displaySource: string;
  skillName: string;
}

export function parseAddSource(input: string): ParsedAddSource {
  const trimmed = input.trim();
  const atIndex = trimmed.lastIndexOf('@');

  // Bare skill name (no @ or /) — shorthand for the default skills repo
  if (atIndex === -1 && !trimmed.includes('/')) {
    const skillName = validateSkillName(trimmed);
    return {
      cloneUrl: PUSH_REMOTE,
      displaySource: PUSH_REMOTE.replace(/\.git$/, ''),
      skillName,
    };
  }

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    throw new Error('Expected source in the form <owner/repo@skill_name> or a bare skill name');
  }

  const repoPart = trimmed.slice(0, atIndex);
  const skillName = validateSkillName(trimmed.slice(atIndex + 1));

  if (/^https?:\/\//.test(repoPart) || repoPart.startsWith('git@')) {
    return {
      cloneUrl: repoPart,
      displaySource: repoPart,
      skillName,
    };
  }

  if (!/^[^/]+\/[^/]+$/.test(repoPart)) {
    throw new Error(`Invalid repository source: ${repoPart}`);
  }

  return {
    cloneUrl: `https://github.com/${repoPart}.git`,
    displaySource: repoPart,
    skillName,
  };
}

export async function runAdd(sourceInput: string): Promise<void> {
  const parsed = parseAddSource(sourceInput);
  const projectDir = process.cwd();

  let tempDir: string | null = null;

  try {
    console.log(c.dim(`Cloning ${parsed.displaySource}...`));
    tempDir = await cloneRepo(parsed.cloneUrl);

    const sourceSkillDir = join(tempDir, SOURCE_SKILLS_DIR, parsed.skillName);
    await readSkillMetadata(sourceSkillDir);

    const { agentsSkillsDir } = await ensureProjectSkillDirs(projectDir);
    const destinationSkillDir = join(agentsSkillsDir, parsed.skillName);

    await mkdir(agentsSkillsDir, { recursive: true });
    await rm(destinationSkillDir, { recursive: true, force: true });
    await copySkillDirectory(sourceSkillDir, destinationSkillDir);

    const metadata = await readSkillMetadata(destinationSkillDir);
    const skillPath = join(AGENTS_SKILLS_DIR, basename(destinationSkillDir));

    console.log('');
    console.log(`${c.green('✔')} Added ${c.bold(c.cyan(parsed.skillName))}`);
    console.log('');
    console.log(`  ${c.bold('Title')}        ${metadata.title}`);
    console.log(`  ${c.bold('Source')}       ${c.dim(parsed.displaySource)}`);
    console.log(`  ${c.bold('Path')}         ${c.yellow(skillPath)}`);
    console.log(`  ${c.bold('Symlinks')}     ${c.dim('.claude/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
    console.log(`               ${c.dim('.pi/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
    console.log(`  ${c.bold('Description')}  ${c.dim(metadata.description)}`);
    console.log('');
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => undefined);
    }
  }
}
