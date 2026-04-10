#!/usr/bin/env node

import process from 'node:process';
import packageJson from '../package.json' with { type: 'json' };
import { runAdd } from './add.js';
import { runClean } from './clean.js';
import { maybeUpdateGitignore } from './fs-utils.js';
import { c } from './log.js';
import { runPush } from './push.js';

function showHelp(): void {
  console.log('');
  console.log(`  ${c.bold('skills_cli')} ${c.dim(`v${packageJson.version}`)}`);
  console.log(`  ${c.dim('Manage agent skills across AI coding assistants')}`);
  console.log('');
  console.log(`  ${c.bold('Usage')}`);
  console.log(`    ${c.cyan('$')} skills_cli ${c.green('<command>')} ${c.dim('[options]')}`);
  console.log('');
  console.log(`  ${c.bold('Commands')}`);
  console.log(`    ${c.green('add')} ${c.dim('<owner/repo@skill> [...]')}   Add skills from a repo`);
  console.log(`    ${c.green('push')} ${c.dim('<skill_name>')}              Push a skill to the remote repo`);
  console.log(`    ${c.green('clean')}                          Remove .agents, .claude, .pi directories`);
  console.log('');
  console.log(`  ${c.bold('Options')}`);
  console.log(`    ${c.dim('-h, --help')}       Show help`);
  console.log(`    ${c.dim('-v, --version')}    Show version`);
  console.log('');
  console.log(`  ${c.bold('Notes')}`);
  console.log(`    ${c.dim('Skills are installed into .agents/skills by default.')}`);
  console.log(`    ${c.dim('.claude/skills and .pi/skills are symlinked to .agents/skills.')}`);
  console.log(`    ${c.dim('A bare skill name (no owner/repo@) pulls from jerilseb/skills.')}`);
  console.log('');
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  if (!command || command === '-h' || command === '--help') {
    showHelp();
    return;
  }

  if (command === '-v' || command === '--version') {
    console.log(packageJson.version);
    return;
  }

  try {
    switch (command) {
      case 'add': {
        if (args.length === 0) {
          throw new Error('Usage: skills_cli add <owner/repo@skill_name> [...]');
        }
        for (const source of args) {
          await runAdd(source);
        }
        await maybeUpdateGitignore(process.cwd());
        return;
      }
      case 'push': {
        const skillName = args[0];
        if (!skillName) {
          throw new Error('Usage: skills_cli push <skill_name>');
        }
        await runPush(skillName);
        return;
      }
      case 'clean': {
        await runClean();
        return;
      }
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(`\n  ${c.red('✖')} ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

void main();
