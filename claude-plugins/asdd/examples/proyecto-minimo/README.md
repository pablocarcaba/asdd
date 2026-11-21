# Proyecto mínimo ASDD

Four specs in different phases, to try the pipeline status, the read-only dashboard and the `asdd-panel` side panel:

| Spec | Estado | Nivel | Notes |
|---|---|---|---|
| SPEC-001 Alta de clientes | en_curso | M | 4 tasks: 2 implemented, 1 in progress |
| SPEC-002 Facturación mensual | validada | L | validation passed with warnings, waiting for approval |
| SPEC-003 Avisos por correo | borrador | S | just written |
| SPEC-004 Exportar informes a CSV | implementada | S | all gates done, security with warnings |

```bash
cd claude-plugins/asdd/examples/proyecto-minimo
node ../../scripts/asdd-estado.mjs            # .claude/state/estado-asdd.json (+ HTML: "html" is set in .claude/asdd.config.json)
open .claude/state/estado-asdd.html           # read-only dashboard
claude --plugin-dir ../.. --plugin-dir ../../../asdd-panel   # side panel; /asdd-panel reopens it
```

In that session, edit a header (for example `estado: aprobada` in `facturacion/requirements.md`) and the panel updates within a few seconds. Launching any subagent shows it under "Agentes en marcha" until it stops.

Generated files under `.claude/state/` are ignored by git (see `.gitignore`).
