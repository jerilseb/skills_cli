import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';

const CLONE_TIMEOUT_MS = 60_000;

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitResult {
  stdout: string;
  stderr: string;
}

export async function runGit(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {}
): Promise<GitResult> {
  return await new Promise<GitResult>((resolvePromise, rejectPromise) => {
    const child = spawn('git', args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    const timeoutMs = options.timeoutMs;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs)
      : undefined;

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      rejectPromise(new GitError(`Failed to run git ${args.join(' ')}: ${error.message}`));
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);

      if (timedOut) {
        rejectPromise(new GitError(`git ${args.join(' ')} timed out after ${timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        rejectPromise(
          new GitError(stderr.trim() || stdout.trim() || `git ${args.join(' ')} failed with code ${code}`)
        );
        return;
      }

      resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skills-'));
  const args = ['clone', '--depth', '1'];

  if (ref) {
    args.push('--branch', ref);
  }

  args.push(url, tempDir);

  try {
    await runGit(args, {
      timeoutMs: CLONE_TIMEOUT_MS,
      env: { GIT_TERMINAL_PROMPT: '0' },
    });
    return tempDir;
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupTempDir(dir: string): Promise<void> {
  const normalizedDir = normalize(resolve(dir));
  const normalizedTmpDir = normalize(resolve(tmpdir()));

  if (!normalizedDir.startsWith(normalizedTmpDir + sep) && normalizedDir !== normalizedTmpDir) {
    throw new Error('Refusing to remove a directory outside the system temp directory');
  }

  await rm(dir, { recursive: true, force: true });
}
