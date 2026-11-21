# asdd-panel

Claude Code side panel showing the ASDD pipeline status of the current project:

- the pipeline (`borrador → validada → aprobada → en_curso → implementada`) with spec and task counts per phase, plus specs without a valid header;
- filters by `estado` and `nivel`;
- the gates of each spec (`val`, `qa`, `seg`, `acc`: ✓ passed, ! warnings, ✗ blocked, · pending, – not applicable) and its task progress;
- the agents currently running;
- the number of invalid headers.

It is read-only: it reads `.claude/state/estado-asdd.json` (or the `estado` path in `.claude/asdd.config.json`, which must be relative and stay inside the project) every 3 seconds and never writes a file. The JSON is produced by the hooks and the generator of the [`asdd`](../asdd) plugin; without them the panel explains that there is no status yet.

The panel opens by itself when a session starts in an ASDD project (one with `.claude/asdd.config.json` or `.claude/specs/`). Reopen it with `/asdd-panel`.

## Try it

From the example project, loading both plugins:

```bash
cd claude-plugins/asdd/examples/proyecto-minimo
node ../../scripts/asdd-estado.mjs          # first status, before any hook runs
claude --plugin-dir ../.. --plugin-dir ../../../asdd-panel
```

## Develop

```bash
claude plugin validate claude-plugins/asdd-panel
claude plugin test claude-plugins/asdd-panel
```

`hooks/register.tsx` is the hooks module (UI and polling); `types/index.d.ts` declares the panel state; `tests/panel.test.tsx` covers drawing on the terminal and desktop surfaces, the filters, non-ASDD projects, unsafe paths and missing or broken status files.
