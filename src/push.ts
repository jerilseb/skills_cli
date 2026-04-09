import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AGENTS_SKILLS_DIR, PUSH_REMOTE, SOURCE_SKILLS_DIR } from './constants.js';
import { validateSkillName } from './fs-utils.js';
import { cleanupTempDir, cloneRepo, runGit } from './git.js';
import { copySkillDirectory, readSkillMetadata } from './skill.js';

export async function runPush(skillNameInput: string): Promise<void> {
  const skillName = validateSkillName(skillNameInput);
  const projectDir = process.cwd();
  const localSkillDir = join(projectDir, AGENTS_SKILLS_DIR, skillName);

  await readSkillMetadata(localSkillDir);

  let tempDir: string | null = null;

  try {
    console.log(`Cloning ${PUSH_REMOTE}...`);
    tempDir = await cloneRepo(PUSH_REMOTE);

    const remoteSkillsDir = join(tempDir, SOURCE_SKILLS_DIR);
    const remoteSkillDir = join(remoteSkillsDir, skillName);

    await mkdir(remoteSkillsDir, { recursive: true });
    await rm(remoteSkillDir, { recursive: true, force: true });
    await copySkillDirectory(localSkillDir, remoteSkillDir);
    const metadata = await readSkillMetadata(remoteSkillDir);

    await runGit(['add', join(SOURCE_SKILLS_DIR, skillName)], { cwd: tempDir });

    const status = await runGit(['status', '--short', '--', join(SOURCE_SKILLS_DIR, skillName)], {
      cwd: tempDir,
    });

    if (!status.stdout.trim()) {
      console.log(`No changes to push for ${skillName}`);
      return;
    }

    await runGit(['commit', '-m', `Add/update skill ${skillName}`], { cwd: tempDir });
    await runGit(['push'], { cwd: tempDir });

    console.log(`Pushed ${skillName}`);
    console.log(`  remote: ${PUSH_REMOTE}`);
    console.log(`  path: ${SOURCE_SKILLS_DIR}/${skillName}`);
    console.log(`  title: ${metadata.title}`);
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir).catch(() => undefined);
    }
  }
}
