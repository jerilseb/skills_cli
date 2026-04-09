#!/usr/bin/env node

import process from 'node:process';
import packageJson from '../package.json' with { type: 'json' };
import { runAdd } from './add.js';
import { runPush } from './push.js';

function showHelp(): void {
  console.log(`skills_cli

Usage:
  npx @jeril/skills_cli add <owner/repo@skill_name>
  npx @jeril/skills_cli push <skill_name>
  skills_cli add <owner/repo@skill_name>
  skills_cli push <skill_name>

Commands:
  add     Clone a repo and copy skills/<skill_name> into .agents/skills
  push    Push .agents/skills/<skill_name> to jerilseb/skills under skills/<skill_name>

Notes:
  - Skills are installed into .agents/skills by default
  - .claude/skills is symlinked to .agents/skills
  - .pi/skills is symlinked to .agents/skills
  - Source repos are assumed to contain a top-level skills/ directory

Options:
  -h, --help       Show help
  -v, --version    Show version
`);
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
        const source = args[0];
        if (!source) {
          throw new Error('Usage: skills_cli add <owner/repo@skill_name>');
        }
        await runAdd(source);
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
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
