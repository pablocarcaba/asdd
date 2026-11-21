# Changelog

## Unreleased

### Added
- Pipeline status headers (`rules/estado-pipeline.md`): YAML header in every spec (`requirements.md`) and task list (`tasks.md`) with `id`, `titulo`, `estado`, `nivel`, `puertas` and `version`. Only the person may set `aprobada`.
- Spec, Validation, Task Planning, Implementation, QA and Security agents write the header when their phase changes.
- `scripts/asdd-estado.mjs`: dependency-free generator of `.claude/state/estado-asdd.json`, with `--html` (read-only static dashboard) and `--comprobar` (CI check). Paths configurable in `.claude/asdd.config.json`, always relative to the project root.
- Asynchronous, non-blocking hooks: `PreToolUse` (Agent) and `SubagentStop` track running agents; `PostToolUse` (Write|Edit) regenerates the status when a spec changes.
- `examples/proyecto-minimo`: minimal project to try the status and the `asdd-panel` side panel.
- Two task modes: the `tareas` list in the `tasks.md` header for small plans (checked against the body checkboxes), and `tareas: cuerpo` for plans above `maxTareasCabecera` (default 50), read from the `- [x] TASK-NNN` lines with their wave and size. The panel and the dashboard show progress per wave.
- Large specs: the status header is read from the first 256 KiB, so multi-MiB `requirements.md` files work; tasks are read even when the spec header is missing.
- Split documents: when `requirements.md` or `tasks.md` is not at the spec root, the generator reads `requirements/requirements.md` and `tasks/tasks.md` (indexes); the plan body is the files of the index table, in table order. Links outside the spec folder, symbolic links included, are ignored. Plan files not yet listed in the index table are still counted (wave from their headings, fields or file name) with a warning to add their row.
- Tests with `node:test` (`npm test`).
