import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANEL = {
  plugin: 'asdd-panel',
  component: 'Pane',
  requestId: 'asdd-panel',
  props: {
    title: 'Pipeline ASDD',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SUPERFICIES = ['terminal', 'desktop'] as const

// Lo que escribe asdd-estado.mjs (formato 1), recortado.
const ESTADO = {
  formato: 1,
  generado: '2026-11-21T10:00:00.000Z',
  fases: [
    { estado: 'borrador', specs: 1 },
    { estado: 'validada', specs: 1 },
    { estado: 'aprobada', specs: 0 },
    { estado: 'en_curso', specs: 1 },
    { estado: 'implementada', specs: 0 },
  ],
  resumen: {
    specs: 4,
    sinEstado: 1,
    tareas: { total: 4, porEstado: { borrador: 0, validada: 1, aprobada: 0, en_curso: 1, implementada: 2 }, pendientes: 2, fallidas: 1 },
  },
  specs: [
    {
      id: 'SPEC-001',
      titulo: 'Alta de clientes',
      carpeta: '.claude/specs/alta-clientes',
      estado: 'en_curso',
      nivel: 'M',
      version: 3,
      puertas: { validacion: 'pasada', qa: 'pendiente', seguridad: 'bloqueada', accesibilidad: 'no_aplica' },
      tareas: {
        origen: 'cuerpo',
        total: 4,
        porEstado: { implementada: 2, en_curso: 1, validada: 1 },
        pendientes: 1,
        fallidas: 1,
        porOla: [
          { ola: 'O01', total: 1, implementadas: 1 },
          { ola: 'O02', total: 1, implementadas: 1 },
          { ola: 'O03', total: 2, implementadas: 0 },
        ],
      },
      errores: [],
    },
    {
      id: 'SPEC-002',
      titulo: 'Facturación mensual',
      carpeta: '.claude/specs/facturacion',
      estado: 'validada',
      nivel: 'L',
      version: 2,
      puertas: { validacion: 'avisos' },
      tareas: { total: 0, porEstado: {} },
      errores: [],
    },
    {
      id: 'SPEC-003',
      titulo: 'Avisos por correo',
      carpeta: '.claude/specs/notificaciones',
      estado: 'borrador',
      nivel: 'S',
      version: 1,
      puertas: {},
      tareas: { total: 0, porEstado: {} },
      errores: [],
    },
    {
      id: null,
      titulo: 'sin-cabecera',
      carpeta: '.claude/specs/sin-cabecera',
      estado: null,
      nivel: null,
      version: null,
      puertas: {},
      tareas: { total: 0, porEstado: {} },
      errores: ['sin cabecera YAML de estado'],
    },
  ],
  agentes: [{ id: 'toolu_1', tipo: 'asdd-qa-agent', descripcion: 'Cobertura de SPEC-001', desde: '2026-11-21T09:58:00.000Z' }],
  avisos: [{ fichero: '.claude/specs/sin-cabecera/requirements.md', mensaje: 'sin cabecera YAML de estado' }],
}

type Ficheros = Record<string, string>

const ABRIR = {
  command: 'asdd-panel',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120, command: 'asdd-panel' },
} as const

/**
 * Un proyecto simulado: el panel solo ve estos ficheros. El motor entrega las
 * rutas ya resueltas (absolutas), así que se buscan por el final de la ruta.
 */
function proyecto(on: On, inicial: Ficheros) {
  const p = { ficheros: inicial, abiertos: [] as string[], estrecho: false }
  const buscar = (ruta: string) => Object.keys(p.ficheros).find(k => ruta === k || ruta.endsWith(`/${k}`))
  on('fs.exists', (_, e) => ({ value: buscar(e.path) !== undefined }))
  on('fs.read', (_, e) => {
    const k = buscar(e.path)
    if (k === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: p.ficheros[k] ?? '' }
  })
  on('fs.stat', (_, e) => {
    const k = buscar(e.path)
    return { value: { kind: 'file', size: k ? (p.ficheros[k] ?? '').length : 0, mtimeMs: 1, isLink: false } }
  })
  on('command.register', () => ({ value: { command: 'asdd-panel' } }))
  on('ui.open', (_, e) => {
    p.abiertos.push(e.id)
    return { value: p.estrecho ? { isPlaced: false, reason: 'terminal estrecho' } : { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return p
}

test('en un proyecto ASDD se abre el panel con el pipeline, las puertas y los agentes', async ($, on) => {
  const p = proyecto(on, {
    '.claude/specs': '',
    '.claude/state/estado-asdd.json': JSON.stringify(ESTADO),
  })
  await $.session.start({ cwd: '/proyecto', surface: 'desktop', isInteractive: true })
  expect(p.abiertos).toEqual(['asdd-panel'])

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PANEL, surface })
    expect(await ui.find({ type: 'Text', text: /^Borrador/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Implementada/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sin estado/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Alta de clientes' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /2\/4 tareas/ }))?.text).toContain('nivel M')
    expect((await ui.find({ type: 'Text', text: /^seg/ }))?.text).toBe('seg ✗')
    expect((await ui.find({ type: 'Text', text: /^val/ }))?.text).toBe('val ✓')
    expect(await ui.find({ type: 'Text', text: 'asdd-qa-agent' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 aviso en las cabeceras/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^Specs/ }))?.text).toBe('Specs (4)')
    expect((await ui.find({ type: 'Text', text: /^Oleadas/ }))?.text).toBe('Oleadas: O03 0/2 · 2 completas')
    expect((await ui.find({ type: 'Text', text: /fallida \[!\]/ }))?.text).toBe('1 tarea fallida [!]')
    expect((await ui.find({ type: 'Text', text: /Tareas sin estado/ }))?.text).toContain('2 pendientes · 1 fallida')
    await ui.unmount()
  }
})

test('los filtros por estado y nivel reducen la lista', async ($, on) => {
  proyecto(on, { '.claude/specs': '', '.claude/state/estado-asdd.json': JSON.stringify(ESTADO) })
  await $.session.start({ cwd: '/proyecto', surface: 'desktop', isInteractive: true })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PANEL, surface })
    await ui.select({ key: 'filtro-estado', value: 'borrador' })
    expect((await ui.find({ type: 'Text', text: /^Specs/ }))?.text).toBe('Specs (1 de 4)')
    expect(await ui.find({ type: 'Text', text: 'Avisos por correo' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Alta de clientes' })).toBeUndefined()

    await ui.select({ key: 'filtro-nivel', value: 'L' })
    expect(await ui.find({ type: 'Text', text: /Ninguna spec con este filtro/ })).toBeDefined()

    await ui.select({ key: 'filtro-estado', value: 'sin_estado' })
    await ui.select({ key: 'filtro-nivel', value: '' })
    expect((await ui.find({ type: 'Text', text: /^Specs/ }))?.text).toBe('Specs (1 de 4)')
    expect(await ui.find({ type: 'Text', text: 'sin-cabecera' })).toBeDefined()

    await ui.select({ key: 'filtro-estado', value: '' })
    await ui.unmount()
  }
})

test('en un proyecto sin ASDD no abre nada', async ($, on) => {
  const p = proyecto(on, { 'README.md': '# otro' })
  await $.session.start({ cwd: '/otro', surface: 'desktop', isInteractive: true })
  expect(p.abiertos).toEqual([])
  const ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toMatch(/no usa ASDD/)
  await ui.unmount()
})

test('rechaza una ruta de estado absoluta o con .. en la configuración', async ($, on) => {
  const p = proyecto(on, {})
  for (const estado of ['/var/www/estado.json', '../fuera.json', '~/estado.json']) {
    p.ficheros = { '.claude/asdd.config.json': JSON.stringify({ estado }) }
    await $.command.run(ABRIR)
    const ui = await $.ui.mount({ ...PANEL, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /ruta relativa/ }))?.text).toContain('"estado"')
    await ui.unmount()
  }
})

test('sin JSON todavía, o con un JSON roto, explica qué pasa en vez de romperse', async ($, on) => {
  const p = proyecto(on, { '.claude/specs': '' })
  await $.session.start({ cwd: '/proyecto', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Aún no hay estado/ })).toBeDefined()
  await ui.unmount()

  p.ficheros = { '.claude/specs': '', '.claude/state/estado-asdd.json': '{"formato": 99}' }
  await $.command.run(ABRIR)
  ui = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /formato de estado desconocido/ })).toBeDefined()
  await ui.unmount()
})

test('si el terminal es estrecho y el panel queda esperando, avisa de /asdd-panel', async ($, on) => {
  const p = proyecto(on, { '.claude/specs': '', '.claude/state/estado-asdd.json': JSON.stringify(ESTADO) })
  p.estrecho = true
  const avisos: string[] = []
  on('ui.toast', (_, e) => {
    avisos.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })
  expect(avisos).toEqual([
    'Panel del pipeline ASDD listo: escribe /asdd-panel para verlo (abierto solo necesita 144 columnas)',
  ])
  expect(p.abiertos).toEqual(['asdd-panel'])
})

test('si el panel se coloca, no avisa', async ($, on) => {
  proyecto(on, { '.claude/specs': '', '.claude/state/estado-asdd.json': JSON.stringify(ESTADO) })
  const avisos: string[] = []
  on('ui.toast', (_, e) => {
    avisos.push(e.text)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/proyecto', surface: 'terminal', isInteractive: true })
  expect(avisos).toEqual([])
})
