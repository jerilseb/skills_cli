import { lstat, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { AGENTS_DIR, CLAUDE_DIR, PI_DIR } from './constants.js';
import { pathExists } from './fs-utils.js';
import { c } from './log.js';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export async function runClean(): Promise<void> {
  const projectDir = process.cwd();
  const dirs = [AGENTS_DIR, CLAUDE_DIR, PI_DIR];

  const existing: { name: string; isSymlink: boolean }[] = [];
  for (const dir of dirs) {
    const fullPath = join(projectDir, dir);
    if (await pathExists(fullPath)) {
      const stats = await lstat(fullPath);
      existing.push({ name: dir, isSymlink: stats.isSymbolicLink() });
    }
  }

  if (existing.length === 0) {
    console.log('');
    console.log(`  ${c.yellow('!')} No skill directories found in this project.`);
    console.log('');
    return;
  }

  console.log('');
  console.log(`  ${c.bold('The following will be removed:')}`);
  console.log('');
  for (const { name, isSymlink } of existing) {
    const label = isSymlink ? c.dim('(symlink)') : c.dim('(directory)');
    console.log(`    ${c.red('●')} ${c.bold(name)}  ${label}`);
  }
  console.log('');

  const answer = await prompt(`  ${c.cyan('?')} Are you sure? ${c.dim('(y/N)')} `);

  if (answer !== 'y' && answer !== 'yes') {
    console.log(`  ${c.dim('Cancelled.')}`);
    console.log('');
    return;
  }

  for (const { name } of existing) {
    const fullPath = join(projectDir, name);
    await rm(fullPath, { recursive: true, force: true });
  }

  console.log('');
  console.log(`  ${c.green('✅')} Removed ${c.bold(existing.map((d) => d.name).join(', '))}`);
  console.log('');
}
