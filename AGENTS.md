# 2026PM Project Rules

## Project

- Name: 2026PM
- Purpose: Local project management app with SQLite-backed tasks and a Gantt chart
- Working directory: `G:\我的雲端硬碟\2026PM`
- Default branch: created by local Git initialization
- GitHub repo: not configured yet
- Deployment target: local Python server for now

## Workflow

- Add new tools under `tools/<tool-name>/`.
- Keep the project manager app in the project root and `static/` unless it grows into a larger package.
- Runtime SQLite files live under `data/` and should not be committed.
- Use `startup-sync` when starting work and `shutdown-sync` when ending work.
- Use `project-init-sync` for future initialization or setup adjustments.
- Keep project instructions in this file stable and project-specific.

## Obsidian

- Main vault: `C:\Users\chain\SynologyDrive\Obsidian Vault`
- Current second brain: `C:\Users\chain\SynologyDrive\Obsidian Vault\2ndbrain`
- Dashboard note: not created yet

## Safety

- Do not commit secrets, API keys, credentials, or `.env` files.
- Do not include real student names or private personal data.
- Do not mix unrelated Git changes into project work.
- Do not overwrite existing project files without checking their contents first.
