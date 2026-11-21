import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { ejecutarHook } from '../scripts/asdd-hook.mjs'
import { CADUCIDAD_MS } from '../scripts/lib/agentes.mjs'
import { proyectoTemporal, borrar, spec, AHORA } from './ayuda.mjs'

const HOOK = fileURLToPath(new URL('../scripts/asdd-hook.mjs', import.meta.url))
const HOOKS_JSON = fileURLToPath(new URL('../hooks/hooks.json', import.meta.url))

const limpiar = []
afterEach(() => limpiar.splice(0).forEach(borrar))
function proyecto(ficheros = { '.claude/specs/a/requirements.md': spec({ id: 'SPEC-001' }) }) {
  const raiz = proyectoTemporal(ficheros)
  limpiar.push(raiz)
  return raiz
}
const leerEstado = raiz => JSON.parse(fs.readFileSync(path.join(raiz, '.claude/state/estado-asdd.json'), 'utf8'))

/** Ejecuta el hook como lo haría Claude Code: proceso aparte, entrada por stdin. */
function lanzar(accion, entrada, raiz) {
  return new Promise(resolve => {
    const hijo = spawn(process.execPath, [HOOK, accion], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: raiz },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stderr = ''
    hijo.stderr.on('data', d => (stderr += d))
    hijo.on('close', codigo => resolve({ codigo, stderr }))
    hijo.stdin.end(typeof entrada === 'string' ? entrada : JSON.stringify(entrada))
  })
}

const inicio = (id, tipo, sesion = 's1', cwd) => ({
  cwd,
  session_id: sesion,
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_use_id: id,
  tool_input: { subagent_type: tipo, description: `Trabajo de ${tipo}`, prompt: '...' },
})
const fin = (tipo, sesion = 's1', cwd) => ({ cwd, session_id: sesion, hook_event_name: 'SubagentStop', agent_type: tipo, agent_id: 'x' })

test('PreToolUse anota el agente y SubagentStop lo retira', async () => {
  const raiz = proyecto()
  assert.equal((await lanzar('agente-inicio', inicio('toolu_01', 'asdd:asdd-spec-agent'), raiz)).codigo, 0)
  let e = leerEstado(raiz)
  assert.equal(e.agentes.length, 1)
  assert.equal(e.agentes[0].tipo, 'asdd-spec-agent')
  assert.equal(e.agentes[0].descripcion, 'Trabajo de asdd:asdd-spec-agent')
  assert.equal(e.specs[0].id, 'SPEC-001')

  assert.equal((await lanzar('agente-fin', fin('asdd-spec-agent'), raiz)).codigo, 0)
  e = leerEstado(raiz)
  assert.deepEqual(e.agentes, [])
})

test('varios agentes del mismo tipo: el fin retira el más antiguo y no toca otras sesiones', () => {
  const raiz = proyecto()
  const t = ms => new Date(AHORA.getTime() + ms)
  ejecutarHook('agente-inicio', inicio('a1', 'asdd-qa-agent', 's1', raiz), { ahora: t(0), raiz })
  ejecutarHook('agente-inicio', inicio('a2', 'asdd-qa-agent', 's1', raiz), { ahora: t(1000), raiz })
  ejecutarHook('agente-inicio', inicio('b1', 'asdd-qa-agent', 'otra', raiz), { ahora: t(500), raiz })
  const r = ejecutarHook('agente-fin', fin('asdd-qa-agent', 's1', raiz), { ahora: t(2000), raiz })
  assert.equal(r.registro.id, 'a1')
  assert.deepEqual(leerEstado(raiz).agentes.map(a => a.id).sort(), ['a2', 'b1'])
})

test('hooks concurrentes no pierden agentes', async () => {
  const raiz = proyecto()
  const ids = Array.from({ length: 8 }, (_, i) => `toolu_${i}`)
  const r = await Promise.all(ids.map(id => lanzar('agente-inicio', inicio(id, 'asdd-implementation-agent'), raiz)))
  assert.ok(r.every(x => x.codigo === 0))
  const dir = path.join(raiz, '.claude/state/agentes')
  assert.equal(fs.readdirSync(dir).filter(f => f.endsWith('.json')).length, 8)
  await Promise.all(ids.map(() => lanzar('agente-fin', fin('asdd-implementation-agent'), raiz)))
  assert.equal(fs.readdirSync(dir).length, 0)
})

test('los registros caducados se limpian y no aparecen', () => {
  const raiz = proyecto()
  ejecutarHook('agente-inicio', inicio('viejo', 'asdd-qa-agent', 's1', raiz), { ahora: AHORA, raiz })
  const despues = new Date(AHORA.getTime() + CADUCIDAD_MS + 1)
  ejecutarHook('agente-inicio', inicio('nuevo', 'asdd-spec-agent', 's1', raiz), { ahora: despues, raiz })
  assert.deepEqual(leerEstado(raiz).agentes.map(a => a.id), ['nuevo'])
  assert.equal(fs.readdirSync(path.join(raiz, '.claude/state/agentes')).length, 1)
})

test('el id de la llamada no puede escribir fuera de la carpeta de agentes', () => {
  const raiz = proyecto()
  const { registro } = ejecutarHook('agente-inicio', inicio('../../../evil', 'x', 's1', raiz), { ahora: AHORA, raiz })
  assert.equal(registro.id, 'evil')
  assert.deepEqual(fs.readdirSync(path.join(raiz, '.claude/state/agentes')), ['evil.json'])
})

test('PostToolUse regenera solo si el fichero está dentro de las specs', async () => {
  const raiz = proyecto()
  const editar = file_path => ({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path } })
  const estado = path.join(raiz, '.claude/state/estado-asdd.json')

  await lanzar('fichero', editar(path.join(raiz, 'src/app.md')), raiz)
  assert.equal(fs.existsSync(estado), false)
  await lanzar('fichero', editar(path.join(raiz, '.claude/specs/a/design.ts')), raiz)
  assert.equal(fs.existsSync(estado), false)
  await lanzar('fichero', editar(path.join(raiz, '.claude/specs/../../fuera.md')), raiz)
  assert.equal(fs.existsSync(estado), false)

  fs.writeFileSync(path.join(raiz, '.claude/specs/a/requirements.md'), spec({ id: 'SPEC-001', estado: 'validada' }))
  await lanzar('fichero', editar('.claude/specs/a/requirements.md'), raiz)
  assert.equal(leerEstado(raiz).specs[0].estado, 'validada')
})

test('en un proyecto sin ASDD no escribe nada', async () => {
  const raiz = proyecto({ 'README.md': '# otro proyecto\n' })
  await lanzar('agente-inicio', inicio('a', 'general-purpose'), raiz)
  await lanzar('fichero', { tool_input: { file_path: path.join(raiz, 'README.md') } }, raiz)
  assert.deepEqual(fs.readdirSync(raiz), ['README.md'])
})

test('nunca bloquea: entrada rota, acción desconocida o configuración mala salen con 0', async () => {
  const raiz = proyecto()
  for (const [accion, entrada] of [
    ['agente-inicio', '{no es json'],
    ['agente-fin', ''],
    ['nada', {}],
  ]) {
    assert.equal((await lanzar(accion, entrada, raiz)).codigo, 0)
  }
  fs.mkdirSync(path.join(raiz, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(raiz, '.claude/asdd.config.json'), '{"specs": "/var/www"}')
  const r = await lanzar('agente-inicio', inicio('a', 'x'), raiz)
  assert.equal(r.codigo, 0)
  assert.match(r.stderr, /relativa/)
})

test('hooks.json: los hooks de estado son asíncronos y usan rutas del plugin', () => {
  const { hooks } = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'))
  const deEstado = Object.entries(hooks).flatMap(([evento, grupos]) =>
    grupos.flatMap(g => g.hooks.filter(h => h.type === 'command').map(h => ({ evento, matcher: g.matcher, ...h }))),
  )
  assert.deepEqual(
    deEstado.map(h => [h.evento, h.matcher, h.command.split(' ').pop()]),
    [
      ['PreToolUse', 'Agent|Task', 'agente-inicio'],
      ['PostToolUse', 'Write|Edit|MultiEdit', 'fichero'],
      ['SubagentStop', '*', 'agente-fin'],
    ],
  )
  for (const h of deEstado) {
    assert.equal(h.async, true)
    assert.match(h.command, /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/asdd-hook\.mjs" /)
  }
})
