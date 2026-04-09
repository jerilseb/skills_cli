# @jeril/skills_cli

A small CLI to manage agent skills across AI coding assistants (Claude Code, Pi, etc.).

I built this because I often modify skills locally within the projects I'm working on, and I wanted an easy way to sync those changes back to my global skills repo on GitHub. This CLI handles both directions: pulling skills into a project and pushing local modifications back upstream.

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

### Add skills

Clones a source repo and copies `skills/<skill_name>` into the current project's `.agents/skills/<skill_name>`.

It also ensures:
- `.agents/skills` exists
- `.claude/skills` is a symlink to `.agents/skills`
- `.pi/skills` is a symlink to `.agents/skills`

```bash
npx @jeril/skills_cli add <owner/repo@skill_name> [...]
```

You can add multiple skills in one command:

```bash
npx @jeril/skills_cli add owner/repo@skill1 owner/repo@skill2
```

A bare skill name (without `owner/repo@`) is a shorthand that pulls from the default skills repo (`jerilseb/skills`):

```bash
npx @jeril/skills_cli add nuxt
# equivalent to: skills_cli add jerilseb/skills@nuxt
```

You can mix both forms:

```bash
npx @jeril/skills_cli add nuxt other-org/repo@custom-skill
```

Assumption:
- Source repositories contain a top-level `skills/` directory with a `SKILL.md` in each skill folder (YAML frontmatter with `name` and `description` fields)

### Push a skill

Pushes `.agents/skills/<skill_name>` to the default skills repo (`jerilseb/skills`) under `skills/<skill_name>`.

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
SKILLS_PUSH_REMOTE=https://github.com/your-org/skills.git npx @jeril/skills_cli push my-skill
```

## Local development

Install dependencies:

```bash
npm install
```

Run in dev mode:

```bash
npm run dev -- --help
npm run dev -- add nuxt owner/repo@skill_name
npm run dev -- push skill_name
```

Build and run:

```bash
npm run build
node dist/cli.js --help
```

## Requirements

- Node.js 24+
- git installed and available in PATH
