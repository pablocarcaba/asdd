import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { cargarConfig, ErrorConfig } from '../scripts/lib/config.mjs'
import { generarEstado, leerTareasDelCuerpo } from '../scripts/lib/estado.mjs'
import { proyectoTemporal, borrar, spec, tareas, AHORA } from './ayuda.mjs'

const limpiar = []
afterEach(() => limpiar.splice(0).forEach(borrar))
function proyecto(ficheros) {
  const raiz = proyectoTemporal(ficheros)
  limpiar.push(raiz)
  return raiz
}
const estado = raiz => generarEstado(cargarConfig(raiz), { ahora: AHORA })

const CUERPO = `# Tasks: Ejemplo

Status: IN_PROGRESS

\`\`\`markdown
- [ ] TASK-999 · Ejemplo dentro de un bloque de código: no cuenta
\`\`\`

### Wave 1: Foundation & Domain
- [x] TASK-001: Crear entidad
  - **Type:** model
- [x] TASK-002 · Repositorio **(cambia en la 1.0.25)**
  - **Oleada:** O02 · **Tamaño:** S · **Type:** repository

#### Etapa 4 · Oleada O40
- [!] TASK-003 · Pruebas de rendimiento
  - **Tamaño:** M
- [ ] TASK-004 · CI de producción
  - **Oleada:** O40 · **Tamaño:** L
- [ ] T-PRE-01 · Tarea externa: no es TASK y no cuenta
`

test('modo cuerpo: lee id, título, oleada, tamaño y casilla', () => {
  const t = leerTareasDelCuerpo(CUERPO.split('\n'))
  assert.deepEqual(t, [
    { id: 'TASK-001', titulo: 'Crear entidad', estado: 'implementada', nivel: null, ola: '1', marca: 'hecha' },
    { id: 'TASK-002', titulo: 'Repositorio', estado: 'implementada', nivel: 'S', ola: 'O02', marca: 'hecha' },
    { id: 'TASK-003', titulo: 'Pruebas de rendimiento', estado: 'en_curso', nivel: 'M', ola: 'O40', marca: 'fallida' },
    { id: 'TASK-004', titulo: 'CI de producción', estado: null, nivel: 'L', ola: 'O40', marca: 'pendiente' },
  ])
})

test('sin cabecera en tasks.md se usan las casillas, con avance por oleada', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'A', estado: 'en_curso' }),
    '.claude/specs/a/tasks.md': CUERPO,
  })
  const e = estado(raiz)
  const t = e.specs[0].tareas
  assert.equal(t.origen, 'cuerpo')
  assert.equal(t.total, 4)
  assert.deepEqual(t.porEstado, { borrador: 0, validada: 0, aprobada: 0, en_curso: 1, implementada: 2 })
  assert.equal(t.pendientes, 1)
  assert.equal(t.fallidas, 1)
  assert.deepEqual(t.porOla, [
    { ola: '1', total: 1, implementadas: 1 },
    { ola: 'O02', total: 1, implementadas: 1 },
    { ola: 'O40', total: 2, implementadas: 0 },
  ])
  assert.deepEqual(e.resumen.tareas.pendientes, 1)
  assert.deepEqual(e.resumen.tareas.fallidas, 1)
  assert.deepEqual(e.avisos, [])
})

test('"tareas: cuerpo" en la cabecera también usa las casillas', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'A' }),
    '.claude/specs/a/tasks.md': `---\nspec: A\nversion: 3\ntareas: cuerpo\n---\n${CUERPO}`,
  })
  assert.equal(estado(raiz).specs[0].tareas.total, 4)
})

test('modo cabecera: avisa si la casilla del cuerpo no coincide o falta una tarea', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'A' }),
    '.claude/specs/a/tasks.md':
      tareas([
        { id: 'TASK-001', estado: 'implementada' },
        { id: 'TASK-002', estado: 'en_curso' },
      ]) + '\n- [x] TASK-001 · Uno\n- [x] TASK-002 · Dos\n- [ ] TASK-005 · Cinco\n',
  })
  const e = estado(raiz)
  assert.equal(e.specs[0].tareas.origen, 'cabecera')
  assert.equal(e.specs[0].tareas.total, 2)
  const mensajes = e.avisos.map(a => a.mensaje)
  assert.deepEqual(mensajes, [
    'TASK-002: la casilla del cuerpo dice [x] y la cabecera dice en_curso',
    'TASK-005 está en el cuerpo pero no en la cabecera',
  ])
})

test('modo cabecera: avisa si la lista supera maxTareasCabecera', () => {
  const lista = Array.from({ length: 4 }, (_, i) => ({ id: `TASK-00${i}`, estado: 'validada' }))
  const raiz = proyecto({
    '.claude/asdd.config.json': JSON.stringify({ maxTareasCabecera: 3 }),
    '.claude/specs/a/requirements.md': spec({ id: 'A' }),
    '.claude/specs/a/tasks.md': tareas(lista),
  })
  const e = estado(raiz)
  assert.equal(e.specs[0].tareas.total, 4)
  assert.match(e.avisos[0].mensaje, /4 tareas en la cabecera \(máximo 3\): usa "tareas: cuerpo"/)
})

test('maxTareasCabecera debe ser un entero no negativo', () => {
  const raiz = proyecto({ '.claude/asdd.config.json': JSON.stringify({ maxTareasCabecera: 'muchas' }) })
  assert.throws(() => cargarConfig(raiz), err => err instanceof ErrorConfig && /maxTareasCabecera/.test(err.message))
})

test('specs y planes grandes: la cabecera se lee del principio y las tareas aunque falte la cabecera', () => {
  const relleno = 'Texto de requisitos. '.repeat(100_000) // ≈ 2 MiB
  const muchas = Array.from({ length: 3000 }, (_, i) => `- [${i % 2 ? 'x' : ' '}] TASK-${i} · Tarea ${i}\n  - **Oleada:** O${Math.floor(i / 100)}`)
  const raiz = proyecto({
    '.claude/specs/grande/requirements.md': spec({ id: 'G', estado: 'en_curso', nivel: 'L' }) + relleno,
    '.claude/specs/grande/tasks.md': `# Tasks\n\n${muchas.join('\n')}\n${relleno}`,
    '.claude/specs/sin-cabecera/requirements.md': relleno,
    '.claude/specs/sin-cabecera/tasks.md': '- [x] TASK-1 · Una\n',
  })
  const e = estado(raiz)
  const [g, s] = e.specs
  assert.equal(g.estado, 'en_curso')
  assert.equal(g.tareas.total, 3000)
  assert.equal(g.tareas.porEstado.implementada, 1500)
  assert.equal(g.tareas.porOla.length, 30)
  assert.equal(s.estado, null)
  assert.equal(s.tareas.total, 1)
  assert.deepEqual(e.avisos.map(a => a.mensaje), ['sin cabecera YAML de estado'])
})

test('una cabecera que no se cierra en un fichero grande da un aviso claro', () => {
  const raiz = proyecto({ '.claude/specs/a/requirements.md': '---\nid: A\n' + 'x: y\n'.repeat(80_000) })
  assert.match(estado(raiz).avisos[0].mensaje, /no se cierra en los primeros 256 KiB/)
})
