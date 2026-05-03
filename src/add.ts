import { mkdir, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import readline from 'node:readline';
import { AGENTS_SKILLS_DIR, PUSH_REMOTE, SOURCE_SKILLS_DIR } from './constants.js';
import { ensureProjectSkillDirs, validateSkillName } from './fs-utils.js';
import { cleanupTempDir, cloneRepo } from './git.js';
import { c } from './log.js';
import { copySkillDirectory, readSkillMetadata, type SkillMetadata } from './skill.js';

export interface ParsedAddSource {
  cloneUrl: string;
  displaySource: string;
  skillName?: string;
}

interface SelectableSkill {
  name: string;
  title: string;
  description: string;
}

interface AddedSkill {
  name: string;
  metadata: SkillMetadata;
  path: string;
}

interface KeypressKey {
  name?: string;
  ctrl?: boolean;
  sequence?: string;
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

  // Repo-only source — open an interactive picker for all directories under skills/
  if (atIndex === -1) {
    if (/^https?:\/\//.test(trimmed)) {
      return {
        cloneUrl: trimmed,
        displaySource: trimmed,
      };
    }

    if (/^[^/]+\/[^/]+$/.test(trimmed)) {
      return {
        cloneUrl: `https://github.com/${trimmed}.git`,
        displaySource: trimmed,
      };
    }

    throw new Error('Expected source in the form <owner/repo@skill_name>, <owner/repo>, or a bare skill name');
  }

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    throw new Error('Expected source in the form <owner/repo@skill_name>, <owner/repo>, or a bare skill name');
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

async function listRepoSkills(repoDir: string): Promise<SelectableSkill[]> {
  const skillsDir = join(repoDir, SOURCE_SKILLS_DIR);
  const entries = await readdir(skillsDir, { withFileTypes: true }).catch(() => {
    throw new Error(`No ${SOURCE_SKILLS_DIR}/ directory found in repository`);
  });

  const skillNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => validateSkillName(entry.name))
    .sort((a, b) => a.localeCompare(b));

  const skills = await Promise.all(
    skillNames.map(async (name): Promise<SelectableSkill> => {
      const metadata = await readSkillMetadata(join(skillsDir, name));
      return {
        name,
        title: metadata.title,
        description: metadata.description,
      };
    })
  );

  if (skills.length === 0) {
    throw new Error(`No skill directories found in ${SOURCE_SKILLS_DIR}/`);
  }

  return skills;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function renderSkillPicker(
  skills: SelectableSkill[],
  selected: Set<number>,
  cursor: number,
  displaySource: string,
  message = ''
): void {
  const rows = process.stdout.rows ?? 24;
  const columns = process.stdout.columns ?? 100;
  const maxVisible = Math.max(5, rows - 10);
  const halfWindow = Math.floor(maxVisible / 2);
  const start = Math.min(Math.max(0, cursor - halfWindow), Math.max(0, skills.length - maxVisible));
  const visibleSkills = skills.slice(start, start + maxVisible);
  const end = start + visibleSkills.length;
  const count = selected.size;

  process.stdout.write('\x1b[H\x1b[2J');
  console.log(`${c.bold(c.cyan('Select skills'))} ${c.dim('from')} ${c.bold(displaySource)}`);
  console.log(c.dim('Use ↑/↓ or j/k to move, Space to toggle, a to toggle all, Enter to install, q to cancel.'));
  console.log('');

  for (let index = start; index < end; index += 1) {
    const skill = skills[index];
    const active = index === cursor;
    const checked = selected.has(index);
    const pointer = active ? c.cyan('❯') : ' ';
    const box = checked ? c.green('◉') : c.dim('○');
    const name = active ? c.bold(c.cyan(skill.name)) : c.bold(skill.name);
    const availableWidth = Math.max(20, columns - skill.name.length - 12);
    const detail = truncate(`${skill.title} — ${skill.description}`, availableWidth);

    console.log(` ${pointer} ${box} ${name} ${c.dim(detail)}`);
  }

  if (skills.length > maxVisible) {
    console.log('');
    console.log(c.dim(`Showing ${start + 1}-${end} of ${skills.length}`));
  }

  console.log('');
  console.log(`${c.bold('Selected')} ${count === 0 ? c.yellow('none') : c.green(String(count))}`);
  if (message) {
    console.log(c.yellow(message));
  }
}

function selectSkills(skills: SelectableSkill[], displaySource: string): Promise<string[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('Interactive skill selection requires a TTY. Use <owner/repo@skill_name> to add a single skill.');
  }

  return new Promise((resolvePromise, rejectPromise) => {
    let cursor = 0;
    let message = '';
    const selected = new Set<number>();
    const input = process.stdin;

    const cleanup = (): void => {
      input.off('keypress', onKeypress);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\x1b[?25h\x1b[?1049l');
    };

    const finish = (value: string[]): void => {
      cleanup();
      resolvePromise(value);
    };

    const cancel = (): void => {
      cleanup();
      rejectPromise(new Error('Cancelled'));
    };

    const rerender = (): void => renderSkillPicker(skills, selected, cursor, displaySource, message);

    const toggleAll = (): void => {
      if (selected.size === skills.length) {
        selected.clear();
      } else {
        for (let index = 0; index < skills.length; index += 1) {
          selected.add(index);
        }
      }
    };

    const onKeypress = (_str: string, key: KeypressKey): void => {
      message = '';

      if (key.ctrl && key.name === 'c') {
        cancel();
        return;
      }

      switch (key.name) {
        case 'up':
        case 'k':
          cursor = (cursor - 1 + skills.length) % skills.length;
          break;
        case 'down':
        case 'j':
          cursor = (cursor + 1) % skills.length;
          break;
        case 'space':
          if (selected.has(cursor)) {
            selected.delete(cursor);
          } else {
            selected.add(cursor);
          }
          break;
        case 'a':
          toggleAll();
          break;
        case 'return':
        case 'enter':
          if (selected.size === 0) {
            message = 'Select at least one skill before pressing Enter.';
            break;
          }
          finish(skills.filter((_skill, index) => selected.has(index)).map((skill) => skill.name));
          return;
        case 'escape':
        case 'q':
          cancel();
          return;
      }

      rerender();
    };

    process.stdout.write('\x1b[?1049h\x1b[?25l');
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
    rerender();
  });
}

function printAddSummary(added: AddedSkill[], displaySource: string): void {
  if (added.length === 1) {
    const [skill] = added;
    console.log('');
    console.log(`${c.green('✅')} Added ${c.bold(c.cyan(skill.name))}`);
    console.log('');
    console.log(`  ${c.bold('Title')}        ${skill.metadata.title}`);
    console.log(`  ${c.bold('Source')}       ${c.dim(displaySource)}`);
    console.log(`  ${c.bold('Path')}         ${c.yellow(skill.path)}`);
    console.log(`  ${c.bold('Symlinks')}     ${c.dim('.claude/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
    console.log(`               ${c.dim('.pi/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
    console.log(`  ${c.bold('Description')}  ${c.dim(skill.metadata.description)}`);
    console.log('');
    return;
  }

  console.log('');
  console.log(`${c.green('✅')} Added ${c.bold(c.cyan(String(added.length)))} skills`);
  console.log('');
  console.log(`  ${c.bold('Source')}    ${c.dim(displaySource)}`);
  console.log(`  ${c.bold('Path')}      ${c.yellow(AGENTS_SKILLS_DIR)}`);
  console.log(`  ${c.bold('Symlinks')}  ${c.dim('.claude/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
  console.log(`            ${c.dim('.pi/skills')} ${c.dim('→')} ${c.dim('.agents/skills')}`);
  console.log('');
  for (const skill of added) {
    console.log(`  ${c.green('✓')} ${c.bold(skill.name)} ${c.dim('—')} ${skill.metadata.title}`);
  }
  console.log('');
}

export async function runAdd(sourceInput: string): Promise<void> {
  const parsed = parseAddSource(sourceInput);
  const projectDir = process.cwd();

  let tempDir: string | null = null;

  try {
    console.log(c.dim(`Cloning ${parsed.displaySource}...`));
    tempDir = await cloneRepo(parsed.cloneUrl);

    const skillNames = parsed.skillName
      ? [parsed.skillName]
      : await selectSkills(await listRepoSkills(tempDir), parsed.displaySource);

    const { agentsSkillsDir } = await ensureProjectSkillDirs(projectDir);
    await mkdir(agentsSkillsDir, { recursive: true });

    const added: AddedSkill[] = [];
    for (const skillName of skillNames) {
      const sourceSkillDir = join(tempDir, SOURCE_SKILLS_DIR, skillName);
      await readSkillMetadata(sourceSkillDir);

      const destinationSkillDir = join(agentsSkillsDir, skillName);
      await rm(destinationSkillDir, { recursive: true, force: true });
      await copySkillDirectory(sourceSkillDir, destinationSkillDir);

      const metadata = await readSkillMetadata(destinationSkillDir);
      added.push({
        name: skillName,
        metadata,
        path: join(AGENTS_SKILLS_DIR, basename(destinationSkillDir)),
      });
    }

    printAddSummary(added, parsed.displaySource);
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => undefined);
    }
  }
}
