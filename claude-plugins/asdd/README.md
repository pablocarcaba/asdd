## Workspace Structure

```
.claude/
├── agents/                    # 13 agent prompt files
│   ├── asdd-discovery-agent.md
│   ├── asdd-spec-agent.md
│   ├── asdd-validation-agent.md
│   ├── asdd-domain-agent.md
│   ├── asdd-design-agent.md
│   ├── asdd-task-planning-agent.md
│   ├── asdd-implementation-agent.md
│   ├── asdd-qa-agent.md
│   ├── asdd-refactor-agent.md
│   ├── asdd-devops-agent.md
│   ├── asdd-observability-agent.md
│   ├── asdd-security-agent.md
│   └── asdd-knowledge-agent.md
├── hooks/                     # pipeline automation hooks
│   └── hooks.json
├── scripts/                   # pipeline status generator and hooks (Node, no deps)
│   ├── asdd-estado.mjs
│   └── asdd-hook.mjs            
├── skills/                    # 5 discovery skills
│   ├── anti-pattern-detection/
│   ├── business-model-canvas/
│   ├── capability-prioritization/
│   ├── domain-language-extraction/
│   └── user-story-decomposition/
├── specs/                     # Spec folders (one per feature)
├── asdd.config.json           # optional: status paths (relative to the project root)
├── state/
│   ├── manifest.json          # Pipeline state tracking
│   ├── estado-asdd.json       # generated pipeline status (do not commit)
│   └── agentes/               # running agents, one file each (do not commit)
└── rules/                     # Quality gates, standards, rules
docs/
├── architecture/
│   └── domain-model.md        # Ubiquitous language (YAML schema)
├── knowledge-base/            # ADRs, failure patterns, proposals
├── agent-failure-log.md
├── dissent-log.md
├── self-healing-log.md
└── lessons-learned.md
```
## Pipeline Status (estado del pipeline)

Every spec (`requirements.md`) and every task (the `tareas` list in `tasks.md`) carries a YAML status header from the first draft: `id`, `titulo`, `estado` (`borrador` · `validada` · `aprobada` · `en_curso` · `implementada`), `nivel` (S/M/L), `puertas` and `version`. The format, and which agent may write each transition, is defined in [`rules/estado-pipeline.md`](rules/estado-pipeline.md). Only the person sets `aprobada`, in git.

The framework hooks keep `.claude/state/estado-asdd.json` up to date. They run asynchronously, never block, and do nothing in a project without ASDD (no `.claude/asdd.config.json` and no `.claude/specs/`):

| Hook | Matcher | Effect |
|---|---|---|
| `PreToolUse` | `Agent\|Task` | Records the running agent in `.claude/state/agentes/` and regenerates the status |
| `SubagentStop` | `*` | Removes it (oldest of that type in the session) and regenerates |
| `PostToolUse` | `Write\|Edit\|MultiEdit` | Regenerates when the written file is a `.md` under the specs folder |

By hand, or in CI:

```bash
node claude-plugins/asdd/scripts/asdd-estado.mjs              # writes estado-asdd.json
node claude-plugins/asdd/scripts/asdd-estado.mjs --html       # also a read-only HTML dashboard
node claude-plugins/asdd/scripts/asdd-estado.mjs --comprobar  # exit 1 if any header is invalid
```

Optional `.claude/asdd.config.json` (all paths relative to the project root; absolute paths and `..` are rejected):

```json
{
  "specs": ".claude/specs",
  "estado": ".claude/state/estado-asdd.json",
  "agentes": ".claude/state/agentes",
  "html": false,
  "maxTareasCabecera": 50
}
```

Plans up to `maxTareasCabecera` tasks list them in the `tasks.md` header; larger plans write `tareas: cuerpo` and the status comes from the body checkboxes (`- [x] TASK-NNN · Title`, with `**Oleada:**` and `**Tamaño:**`), with progress per wave. See the rule for details.

Set `"html"` to a path (or `true`) to rewrite the dashboard on every update. The dashboard is a single static file with the status embedded: no server, no network requests (`Content-Security-Policy: default-src 'none'`) and no editing. Specs only change in git.

The side panel lives in the sibling plugin [`asdd-panel`](../asdd-panel). A minimal project to try both is in [`examples/proyecto-minimo`](examples/proyecto-minimo).

Tests (Node 18+, no dependencies): `npm test` in this folder.
