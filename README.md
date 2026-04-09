# @jeril/skills_cli

A small CLI to manage agent skills.

## Install / run

Use directly with `npx`:

```bash
npx @jeril/skills_cli --help
```

If installed globally, use:

```bash
skills_cli --help
```

## Commands

### Add a skill

Clones a source repo and copies `skills/<skill_name>` into the current project's `.agents/skills/<skill_name>`.

It also ensures:
- `.agents/skills` exists
- `.claude/skills` is a symlink to `.agents/skills`

```bash
npx @jeril/skills_cli add <owner/repo@skill_name>
```

Example:

```bash
npx @jeril/skills_cli add jerilseb/skills@my-skill
```

Assumption:
- source repositories contain a top-level `skills/` directory

### Push a skill

Pushes `.agents/skills/<skill_name>` to:
- `jerilseb/skills`
- under `skills/<skill_name>`

```bash
npx @jeril/skills_cli push <skill_name>
```

Example:

```bash
npx @jeril/skills_cli push my-skill
```

This uses your existing git authentication.

You can override the push remote with:

```bash
SKILLS_PUSH_REMOTE=https://github.com/jerilseb/skills.git npx @jeril/skills_cli push my-skill
```

## Local development

Install dependencies:

```bash
npm install
```

Run in dev mode:

```bash
npm run dev -- --help
npm run dev -- add owner/repo@skill_name
npm run dev -- push skill_name
```

Build and run:

```bash
npm run build
node dist/cli.js --help
```

## Publish to npm

Login:

```bash
npm login
```

Build + dry run:

```bash
npm run build
npm publish --dry-run
```

Publish:

```bash
npm publish
```

Notes:
- package name: `@jeril/skills_cli`
- package is published as public via `publishConfig.access = public`
- `prepublishOnly` runs the build automatically before publish

## Requirements

- Node.js 24+
- git installed and available in PATH
