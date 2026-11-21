import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { cargarConfig } from '../scripts/lib/config.mjs'
import { generarEstado } from '../scripts/lib/estado.mjs'
import { proyectoTemporal, borrar, spec, AHORA } from './ayuda.mjs'

const limpiar = []
afterEach(() => limpiar.splice(0).forEach(borrar))
function proyecto(ficheros) {
  const raiz = proyectoTemporal(ficheros)
  limpiar.push(raiz)
  return raiz
}
const estado = raiz => generarEstado(cargarConfig(raiz), { ahora: AHORA })
const S = '.claude/specs/grande'

const INDICE = `# Tasks: Grande

| # | Fichero | Contenido |
|---|---|---|
| 1 | [tasks.md · parte 1](tasks.md) | (este índice) |
| 2 | [oleadas/O01.md](oleadas/O01.md) | Oleada O01 |
| 3 | [oleadas/O02%20b.md](oleadas/O02%20b.md#inicio) | Oleada O02 |
| 4 | [tasks.md · parte 2](tasks.md) | (este índice, otra vez) |
| 5 | [fuera](../../../fuera.md) | sale de la spec: se ignora |
| 6 | [roto](oleadas/%E0%A4%A.md) | % mal escrito: se ignora |
| 7 | [falta](oleadas/O03.md) | no existe: aviso |
| 8 | [imagen](diagrama.png) | no es .md: se ignora |
`

test('spec y plan divididos: cabecera del índice y tareas de los ficheros en el orden de la tabla', () => {
  const raiz = proyecto({
    [`${S}/requirements/requirements.md`]: spec({ id: 'G', estado: 'en_curso', nivel: 'L' }),
    [`${S}/tasks/tasks.md`]: INDICE,
    [`${S}/tasks/oleadas/O01.md`]: '#### Etapa 1 · Oleada O01\n- [x] TASK-001 · Uno\n- [x] TASK-002 · Dos\n',
    // Sin título de oleada: hereda la O01 del fichero anterior, como en el documento original.
    [`${S}/tasks/oleadas/O02 b.md`]: '- [ ] TASK-003 · Tres\n  - **Tamaño:** M\n',
    '.claude/fuera.md': '- [x] TASK-666 · De fuera de la spec\n',
  })
  const e = estado(raiz)
  const [g] = e.specs
  assert.equal(g.id, 'G')
  assert.equal(g.estado, 'en_curso')
  assert.equal(g.tareas.origen, 'cuerpo')
  assert.deepEqual(
    g.tareas.lista.map(t => [t.id, t.ola, t.marca]),
    [
      ['TASK-001', 'O01', 'hecha'],
      ['TASK-002', 'O01', 'hecha'],
      ['TASK-003', 'O01', 'pendiente'],
    ],
  )
  assert.deepEqual(e.avisos.map(a => a.mensaje), [`el índice enlaza ${S}/tasks/oleadas/O03.md, que no existe`])
})

test('un enlace simbólico dentro de la spec que apunta fuera no se lee', () => {
  const fuera = proyecto({ 'secreto.md': '- [x] TASK-999 · De fuera\n' })
  const raiz = proyecto({
    [`${S}/requirements/requirements.md`]: spec({ id: 'G' }),
    [`${S}/tasks/tasks.md`]: '# Tasks\n\n| # | Fichero |\n|---|---|\n| 1 | [x](enlace.md) | |\n',
  })
  fs.symlinkSync(path.join(fuera, 'secreto.md'), path.join(raiz, S, 'tasks/enlace.md'))
  assert.equal(estado(raiz).specs[0].tareas.total, 0)
})

test('si existen las dos versiones, manda el fichero de la raíz de la spec', () => {
  const raiz = proyecto({
    [`${S}/requirements.md`]: spec({ id: 'PLANO' }),
    [`${S}/requirements/requirements.md`]: spec({ id: 'DIVIDIDO' }),
  })
  assert.equal(estado(raiz).specs[0].id, 'PLANO')
})
