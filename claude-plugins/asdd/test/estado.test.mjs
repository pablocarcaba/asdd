import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { cargarConfig, ErrorConfig } from '../scripts/lib/config.mjs'
import { generarEstado, normalizarEstado } from '../scripts/lib/estado.mjs'
import { regenerar } from '../scripts/asdd-estado.mjs'
import { proyectoTemporal, borrar, spec, tareas, AHORA } from './ayuda.mjs'

const CLI = fileURLToPath(new URL('../scripts/asdd-estado.mjs', import.meta.url))
const limpiar = []
afterEach(() => limpiar.splice(0).forEach(borrar))
function proyecto(ficheros) {
  const raiz = proyectoTemporal(ficheros)
  limpiar.push(raiz)
  return raiz
}

test('cuenta specs por fase, por nivel y las tareas por estado', () => {
  const raiz = proyecto({
    '.claude/specs/alta/requirements.md': spec({ id: 'SPEC-001', estado: 'aprobada', nivel: 'S', puertas: '{ validacion: pasada }' }),
    '.claude/specs/alta/tasks.md': tareas([
      { id: 'T-1', estado: 'implementada', ola: 1 },
      { id: 'T-2', estado: 'en curso', nivel: 'S' },
    ]),
    '.claude/specs/factura/requirements.md': spec({ id: 'SPEC-002', estado: 'borrador', nivel: 'L' }),
    '.claude/specs/aviso/requirements.md': spec({ id: 'SPEC-010', estado: 'en_curso' }),
  })
  const e = generarEstado(cargarConfig(raiz), { ahora: AHORA })
  assert.equal(e.formato, 1)
  assert.equal(e.generado, AHORA.toISOString())
  assert.deepEqual(
    e.fases.map(f => [f.estado, f.specs]),
    [['borrador', 1], ['validada', 0], ['aprobada', 1], ['en_curso', 1], ['implementada', 0]],
  )
  assert.deepEqual(e.resumen.porNivel, { S: 1, M: 1, L: 1 })
  assert.equal(e.resumen.tareas.total, 2)
  assert.equal(e.resumen.tareas.porEstado.en_curso, 1)
  assert.deepEqual(e.specs.map(s => s.id), ['SPEC-001', 'SPEC-002', 'SPEC-010'])
  const alta = e.specs[0]
  assert.equal(alta.carpeta, '.claude/specs/alta')
  assert.deepEqual(alta.puertas, { validacion: 'pasada', qa: 'pendiente', seguridad: 'pendiente', accesibilidad: 'pendiente' })
  assert.deepEqual(alta.tareas.lista[0], { id: 'T-1', titulo: 'T-1', estado: 'implementada', nivel: null, ola: '1' })
  assert.deepEqual(e.avisos, [])
})

test('el JSON no contiene rutas absolutas', () => {
  const raiz = proyecto({ '.claude/specs/a/requirements.md': spec({ id: 'A' }) })
  const e = generarEstado(cargarConfig(raiz), { ahora: AHORA })
  assert.ok(!JSON.stringify(e).includes(raiz))
})

test('las specs sin cabecera o con errores aparecen con avisos, sin romper el resto', () => {
  const raiz = proyecto({
    '.claude/specs/sin-cabecera/requirements.md': '# Requisitos\n',
    '.claude/specs/sin-requisitos/capability.md': '# Capacidad\n',
    '.claude/specs/rota/requirements.md': '---\nid: R\nid: R\n---\n',
    '.claude/specs/mala/requirements.md': spec({ id: 'M', estado: 'terminada', nivel: 'XL', puertas: '{ qa: quizá, "": x }' }),
    '.claude/specs/mala/tasks.md': '---\ntareas:\n  - id: T-1\n    estado: borrador\n  - id: T-1\n    estado: nada\n---\n',
    '.claude/specs/buena/requirements.md': spec({ id: 'B', estado: 'validada' }),
  })
  const e = generarEstado(cargarConfig(raiz), { ahora: AHORA })
  assert.equal(e.resumen.specs, 5)
  assert.equal(e.resumen.sinEstado, 4)
  assert.equal(e.fases.find(f => f.estado === 'validada').specs, 1)
  const mensajes = e.avisos.map(a => `${a.fichero}: ${a.mensaje}`)
  for (const esperado of [
    /sin-cabecera\/requirements.md: sin cabecera YAML/,
    /sin-requisitos\/requirements.md: falta requirements.md/,
    /rota\/requirements.md: cabecera no válida: línea 3: clave repetida/,
    /mala\/requirements.md: estado no válido: terminada/,
    /mala\/requirements.md: nivel no válido: XL/,
    /mala\/requirements.md: resultado no válido en la puerta qa/,
    /mala\/tasks.md: tarea repetida: T-1/,
    /mala\/tasks.md: la tarea T-1 tiene un estado no válido: nada/,
  ]) {
    assert.ok(mensajes.some(m => esperado.test(m)), `falta el aviso ${esperado}\n${mensajes.join('\n')}`)
  }
})

test('avisa de ids de spec repetidos', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'X' }),
    '.claude/specs/b/requirements.md': spec({ id: 'X' }),
  })
  const e = generarEstado(cargarConfig(raiz), { ahora: AHORA })
  assert.ok(e.avisos.some(a => /id repetido X/.test(a.mensaje)))
})

test('normaliza los estados escritos a mano', () => {
  assert.equal(normalizarEstado('En curso'), 'en_curso')
  assert.equal(normalizarEstado('en-curso'), 'en_curso')
  assert.equal(normalizarEstado('IMPLEMENTADA'), 'implementada')
  assert.equal(normalizarEstado('done'), null)
  assert.equal(normalizarEstado(3), null)
})

test('las puertas admiten una lista de puertas pasadas y puertas nuevas', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'A', puertas: '[validación, QA, rendimiento]' }),
  })
  const [s] = generarEstado(cargarConfig(raiz), { ahora: AHORA }).specs
  assert.deepEqual(s.puertas, {
    validacion: 'pasada',
    qa: 'pasada',
    seguridad: 'pendiente',
    accesibilidad: 'pendiente',
    rendimiento: 'pasada',
  })
})

test('rutas configurables y relativas a la raíz', () => {
  const raiz = proyecto({
    '.claude/asdd.config.json': JSON.stringify({ specs: 'docs/specs', estado: 'salida/estado.json', html: 'salida/panel.html' }),
    'docs/specs/a/requirements.md': spec({ id: 'A' }),
  })
  const rutas = cargarConfig(raiz)
  regenerar(rutas, { ahora: AHORA })
  const e = JSON.parse(fs.readFileSync(path.join(raiz, 'salida/estado.json'), 'utf8'))
  assert.equal(e.specs[0].carpeta, 'docs/specs/a')
  assert.ok(fs.readFileSync(path.join(raiz, 'salida/panel.html'), 'utf8').includes('Estado del pipeline ASDD'))
})

for (const [nombre, config, mensaje] of [
  ['absoluta', { specs: '/var/www/specs' }, /relativa/],
  ['de inicio ~', { estado: '~/estado.json' }, /relativa/],
  ['que sale de la raíz', { estado: '../fuera.json' }, /sale de la raíz/],
  ['que es la raíz', { specs: '.' }, /sale de la raíz/],
  ['clave desconocida', { puerto: 8080 }, /clave desconocida/],
  ['no es texto', { specs: 3 }, /ruta de texto/],
]) {
  test(`rechaza la configuración con una ruta ${nombre}`, () => {
    const raiz = proyecto({ '.claude/asdd.config.json': JSON.stringify(config) })
    assert.throws(() => cargarConfig(raiz), err => err instanceof ErrorConfig && mensaje.test(err.message))
  })
}

test('rechaza una carpeta de specs que es un enlace fuera de la raíz', () => {
  const fuera = proyecto({ 'specs/a/requirements.md': spec({ id: 'A' }) })
  const raiz = proyecto({})
  fs.mkdirSync(path.join(raiz, '.claude'))
  fs.symlinkSync(path.join(fuera, 'specs'), path.join(raiz, '.claude/specs'))
  assert.throws(() => cargarConfig(raiz), /fuera de la raíz/)
})

test('el HTML incrusta el estado sin poder cerrar la etiqueta script y sin red', () => {
  const raiz = proyecto({
    '.claude/specs/a/requirements.md': spec({ id: 'A', titulo: '"</script><script>alert(1)</script>"' }),
  })
  const { html } = regenerar(cargarConfig(raiz), { html: true, ahora: AHORA })
  const texto = fs.readFileSync(html, 'utf8')
  assert.equal(path.relative(raiz, html), path.join('.claude', 'state', 'estado-asdd.html'))
  assert.ok(!texto.includes('</script><script>alert'))
  assert.match(texto, /default-src 'none'/)
  assert.match(texto, /script-src 'sha256-/)
  assert.ok(!/fetch\(|XMLHttpRequest|<form|innerHTML/.test(texto))
})

test('CLI: escribe el JSON y --comprobar sale con 1 si hay avisos', () => {
  const raiz = proyecto({ '.claude/specs/a/requirements.md': spec({ id: 'A' }) })
  const salida = execFileSync(process.execPath, [CLI, '--raiz', raiz], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } })
  assert.match(salida, /estado-asdd.json: 1 specs/)
  assert.ok(fs.existsSync(path.join(raiz, '.claude/state/estado-asdd.json')))

  assert.equal(spawnSync(process.execPath, [CLI, '--raiz', raiz, '--comprobar']).status, 0)
  fs.writeFileSync(path.join(raiz, '.claude/specs/a/requirements.md'), '# sin cabecera\n')
  const r = spawnSync(process.execPath, [CLI, '--raiz', raiz, '--comprobar'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /sin cabecera/)
})

test('CLI: una configuración mala sale con 2 y un mensaje claro', () => {
  const raiz = proyecto({ '.claude/asdd.config.json': '{"specs": "/etc"}' })
  const r = spawnSync(process.execPath, [CLI, '--raiz', raiz], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.match(r.stderr, /relativa/)
})
