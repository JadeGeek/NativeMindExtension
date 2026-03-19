# Skills Guide

This folder contains user-defined Skills. Each skill is a folder with a `SKILL.md` file and optional scripts.

## Skill Structure

```
skills/
  my-skill/
    SKILL.md
    scripts/
      my-skill.js
```

## SKILL.md Template

```
---
name: my-skill
description: Short description of what this skill does.
entry: scripts/my-skill.js
allowed-tools: DOM(read,write) SW(fetch)
---

# My Skill

## When to use
- Explain when to call this skill.

## How it works
- Describe the logic and expected inputs/outputs.
```

## allowed-tools

Use `allowed-tools` to declare the scope:

- `DOM(read)` for reading page content
- `DOM(write)` for clicking or typing
- `SW(fetch)` for network requests
- `SW(tabs)` for tab access
- `SW(storage)` for local storage
- `SW(contextMenu)` for context menu actions

Example:

```
allowed-tools: DOM(read,write) SW(fetch)
```

## Writing a Skill Script

Your entry script must export a `run()` function:

```
module.exports.run = async ({ api, args }) => {
  // Use api.dom.* and api.sw.* here
  return { result: 'ok' }
}
```

### DOM Tools (Common)

- `querySelector(selector)`
- `querySelectorAll(selector)`
- `getText(selector)`
- `getTextList(selector)`
- `getAttribute(selector, name)`
- `click(selector)`
- `clickByText(selector, candidates[])`
- `setValue(selector, value)`
- `setAttribute(selector, name, value)`

### Network Tool

- `fetchText(url, init?)`

## Tips

- Keep scripts small and focused.
- Handle errors and return structured results.
- If you add new tools, update documentation accordingly.
