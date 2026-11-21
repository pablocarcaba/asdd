---
inclusion: always
---

# Pipeline Status Headers (estado del pipeline)

Every spec and every task carries a YAML status header from the first draft. The framework reads these headers to build `.claude/state/estado-asdd.json`, which feeds the Claude Code side panel and the read-only dashboard. Keys and values are in Spanish and MUST be written exactly as below.

## Spec header — `.claude/specs/[spec-name]/requirements.md`

The header is the first thing in the file, between `---` lines:

```yaml
---
id: SPEC-001                 # stable, unique across the project; never reused
titulo: Alta de clientes     # short human title
estado: borrador             # borrador | validada | aprobada | en_curso | implementada
nivel: M                     # S | M | L  (size / risk of the spec)
version: 1                   # integer, +1 every time requirements.md content changes
puertas:                     # gate results
  validacion: pendiente      # pendiente | pasada | avisos | bloqueada | no_aplica
  qa: pendiente
  seguridad: pendiente
  accesibilidad: pendiente
---
```

## Task header — `.claude/specs/[spec-name]/tasks.md`

Tasks stay as Execution Waves in the body of `tasks.md`. The header lists every task with the same status vocabulary:

```yaml
---
spec: SPEC-001
version: 1
tareas:
  - id: TASK-001             # matches the task id used in the body
    titulo: Crear entidad Cliente
    estado: validada         # borrador | validada | aprobada | en_curso | implementada
    nivel: S                 # optional: S | M | L
    ola: 1                   # optional: Execution Wave number
  - id: TASK-002
    titulo: Endpoint de alta
    estado: validada
    nivel: M
    ola: 2
---
```

## Who may write what

| Transition | Who | When |
|---|---|---|
| (new) → `borrador` | Spec Agent | Creates `requirements.md`; `version: 1`, all gates `pendiente` |
| any → `borrador` | Spec Agent | Rewrites requirements: `version` +1, `puertas.validacion` back to `pendiente`. A rewrite after approval removes the approval |
| `borrador` → `validada` | Validation Agent | Report PASSED or PASSED_WITH_WARNINGS: `puertas.validacion` = `pasada` or `avisos` |
| stays `borrador` | Validation Agent | Report BLOCKED or PARTIAL: `puertas.validacion` = `bloqueada` |
| `validada` → `aprobada` | **The person only** | Human approval, committed in git. **No agent may ever write `aprobada`** |
| task `borrador`/`validada` | Task Planning Agent | Writes the `tareas` list: `validada` if the Task Planning gate passes, otherwise `borrador` |
| `aprobada` → `en_curso` | Implementation Agent | First task starts (task and spec) |
| `en_curso` → `implementada` | Implementation Agent | Task done; the spec when every task is `implementada` |
| `puertas.qa` | QA Agent | `pasada`, `avisos` (only WARN items) or `bloqueada` (any BLOCK item) |
| `puertas.seguridad` | Security Agent | `pasada` (PASSED), `avisos` (PASSED_WITH_WARNINGS) or `bloqueada` (BLOCKED) |
| `puertas.accesibilidad` | The person, or QA when the spec has UI criteria | `no_aplica` when the spec has no user interface |

## Rules for agents

1. **Header only.** Agents that must not modify `requirements.md` or `tasks.md` (Validation, Implementation, QA, Security) MAY edit only the status header of those files, never their body.
2. **Minimal edit.** Change only the keys your phase owns; keep every other key and value as found.
3. **Never `aprobada`.** If a step requires an approved spec and the status is not `aprobada` or later, report it to the person instead of changing it.
4. **Valid values only.** Use exactly the values listed above. The generator reports anything else as a warning, and the spec shows up as "sin estado" in the panel.
5. **No secrets or absolute paths** in headers.

## Regenerating the status

The framework hooks regenerate `estado-asdd.json` automatically when a file under the specs folder is written. To regenerate or check it by hand:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/asdd-estado.mjs"             # writes .claude/state/estado-asdd.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/asdd-estado.mjs" --html      # also the read-only dashboard
node "${CLAUDE_PLUGIN_ROOT}/scripts/asdd-estado.mjs" --comprobar # CI: exit 1 if any header is invalid
```

Paths are configurable in `.claude/asdd.config.json` (`specs`, `estado`, `agentes`, `html`) and are always relative to the project root.
