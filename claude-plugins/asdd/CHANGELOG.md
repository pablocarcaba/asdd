# Changelog

## Unreleased

### Added
- Pipeline status headers (`rules/estado-pipeline.md`): YAML header in every spec (`requirements.md`) and task list (`tasks.md`) with `id`, `titulo`, `estado`, `nivel`, `puertas` and `version`. Only the person may set `aprobada`.
- Spec, Validation, Task Planning, Implementation, QA and Security agents write the header when their phase changes.
- `scripts/asdd-estado.mjs`: dependency-free generator of `.claude/state/estado-asdd.json`, with `--html` (read-only static dashboard) and `--comprobar` (CI check). Paths configurable in `.claude/asdd.config.json`, always relative to the project root.
- Asynchronous, non-blocking hooks: `PreToolUse` (Agent) and `SubagentStop` track running agents; `PostToolUse` (Write|Edit) regenerates the status when a spec changes.
- `examples/proyecto-minimo`: minimal project to try the status and the `asdd-panel` side panel.
- Tests with `node:test` (`npm test`).
