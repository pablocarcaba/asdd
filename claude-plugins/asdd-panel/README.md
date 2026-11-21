# asdd-panel

Claude Code side panel showing the ASDD pipeline status of the current project:

- the pipeline (`borrador → validada → aprobada → en_curso → implementada`) with spec and task counts per phase, plus specs without a valid header;
- filters by `estado` and `nivel`;
- the gates of each spec (`val`, `qa`, `seg`, `acc`: ✓ passed, ! warnings, ✗ blocked, · pending, – not applicable) and its task progress;
- the agents currently running;
- the number of invalid headers.
- a button, «Abrir el dashboard en el navegador», that opens the HTML dashboard (`html` in `.claude/asdd.config.json`, by default `.claude/state/estado-asdd.html`) with the system's default app (`open` on macOS, `xdg-open` on Linux, `wslview` on WSL, `start` on Windows). It shows only when that file exists.

It is read-only: it reads `.claude/state/estado-asdd.json` (or the `estado` path in `.claude/asdd.config.json`, which must be relative and stay inside the project) every 3 seconds and never writes a file. The JSON is produced by the hooks and the generator of the [`asdd`](../asdd) plugin; without them the panel explains that there is no status yet.

The panel opens by itself when a session starts in an ASDD project (one with `.claude/asdd.config.json` or `.claude/specs/`). Reopen it with `/asdd-panel`.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install asdd-panel --marketplace pablocarcaba/asdd
```

From a shell (add `--scope project` to record it in the project's `.claude/settings.json`):

```bash
claude plugin install asdd-panel --marketplace pablocarcaba/asdd
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `pablocarcaba/asdd`, then Add plugin.

If the terminal is narrower than 144 columns, the panel waits undrawn and a toast says to type `/asdd-panel`.

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

## Credits

- **Idea:** Alfonso Martinez Moreno ([@sitomarmohotmail](https://github.com/sitomarmohotmail)). Showing the progress and status of each ASDD module comes from [sitomarmohotmail/d11_asdd](https://github.com/sitomarmohotmail/d11_asdd).
- **Contributor:** Pablo ([@pablocarcaba](https://github.com/pablocarcaba)), who built this panel on that idea.
