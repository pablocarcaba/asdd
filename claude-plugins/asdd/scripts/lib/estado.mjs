// Generador del estado del pipeline ASDD.
// Lee las cabeceras de <specs>/<spec>/requirements.md y tasks.md y compone
// el objeto que se escribe en estado-asdd.json.

import fs from 'node:fs'
import path from 'node:path'

import { leerCabecera } from './cabecera.mjs'
import { relativa } from './config.mjs'
import { listarAgentes } from './agentes.mjs'

export const FORMATO = 1
export const ESTADOS = ['borrador', 'validada', 'aprobada', 'en_curso', 'implementada']
export const NIVELES = ['S', 'M', 'L']
export const RESULTADOS_PUERTA = ['pendiente', 'pasada', 'avisos', 'bloqueada', 'no_aplica']
export const PUERTAS = ['validacion', 'qa', 'seguridad', 'accesibilidad']
export const FICHERO_SPEC = 'requirements.md'
export const FICHERO_TAREAS = 'tasks.md'

const MAX_FICHERO = 1024 * 1024

/** "En curso" → "en_curso"; devuelve null si no es un estado válido. */
export function normalizarEstado(valor) {
  if (typeof valor !== 'string') return null
  const e = valor.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ESTADOS.includes(e) ? e : null
}

function normalizarResultado(valor) {
  if (valor === true) return 'pasada'
  if (valor === false || valor === null || valor === undefined) return 'pendiente'
  if (typeof valor !== 'string') return null
  const r = valor.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (r === 'n/a' || r === 'na') return 'no_aplica'
  return RESULTADOS_PUERTA.includes(r) ? r : null
}

function texto(valor, max = 200) {
  if (valor === null || valor === undefined) return null
  return String(valor).slice(0, max)
}

/**
 * Valida y normaliza las puertas: un mapa puerta → resultado,
 * o una lista de puertas pasadas.
 */
function leerPuertas(valor, avisar) {
  const puertas = Object.fromEntries(PUERTAS.map(p => [p, 'pendiente']))
  if (valor === undefined || valor === null) return puertas
  if (Array.isArray(valor)) {
    for (const p of valor) {
      const nombre = normalizarNombrePuerta(p)
      if (nombre) puertas[nombre] = 'pasada'
      else avisar(`puerta no válida: ${p}`)
    }
    return puertas
  }
  if (typeof valor !== 'object') {
    avisar('"puertas" debe ser un mapa (puerta: resultado) o una lista')
    return puertas
  }
  for (const [p, r] of Object.entries(valor)) {
    const nombre = normalizarNombrePuerta(p)
    const resultado = normalizarResultado(r)
    if (!nombre) avisar(`puerta no válida: ${p}`)
    else if (!resultado) avisar(`resultado no válido en la puerta ${nombre}: ${r} (usa ${RESULTADOS_PUERTA.join(', ')})`)
    else puertas[nombre] = resultado
  }
  return puertas
}

function normalizarNombrePuerta(p) {
  if (typeof p !== 'string') return null
  const n = p
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s-]+/g, '_')
  return /^[a-z][a-z0-9_]{0,40}$/.test(n) ? n : null
}

function leerMarkdown(fichero) {
  const st = fs.statSync(fichero, { throwIfNoEntry: false })
  if (!st || !st.isFile()) return null
  if (st.size > MAX_FICHERO) throw new Error('el fichero supera 1 MiB')
  return fs.readFileSync(fichero, 'utf8')
}

function leerSpec(rutas, carpeta, avisos) {
  const nombreCarpeta = path.basename(carpeta)
  const ficheroSpec = path.join(carpeta, FICHERO_SPEC)
  const rel = relativa(rutas.raiz, ficheroSpec)
  const errores = []
  const avisar = mensaje => {
    errores.push(mensaje)
    avisos.push({ fichero: rel, mensaje })
  }
  const spec = {
    id: null,
    titulo: nombreCarpeta,
    carpeta: relativa(rutas.raiz, carpeta),
    estado: null,
    nivel: null,
    version: null,
    puertas: Object.fromEntries(PUERTAS.map(p => [p, 'pendiente'])),
    tareas: { total: 0, porEstado: Object.fromEntries(ESTADOS.map(e => [e, 0])), lista: [] },
    errores,
  }

  let cab
  try {
    const contenido = leerMarkdown(ficheroSpec)
    if (contenido === null) {
      avisar(`falta ${FICHERO_SPEC}`)
      return spec
    }
    cab = leerCabecera(contenido)
  } catch (e) {
    avisar(`cabecera no válida: ${e.message}`)
    return spec
  }
  if (!cab) {
    avisar('sin cabecera YAML de estado')
    return spec
  }
  const d = cab.datos
  for (const obligatoria of ['id', 'titulo', 'estado', 'nivel', 'version']) {
    if (d[obligatoria] === undefined || d[obligatoria] === null || d[obligatoria] === '') avisar(`falta "${obligatoria}"`)
  }
  spec.id = texto(d.id, 60)
  if (d.titulo) spec.titulo = texto(d.titulo)
  spec.estado = normalizarEstado(d.estado)
  if (d.estado != null && !spec.estado) avisar(`estado no válido: ${d.estado} (usa ${ESTADOS.join(', ')})`)
  spec.nivel = NIVELES.includes(String(d.nivel).toUpperCase()) ? String(d.nivel).toUpperCase() : null
  if (d.nivel != null && !spec.nivel) avisar(`nivel no válido: ${d.nivel} (usa S, M o L)`)
  spec.version = d.version == null ? null : texto(d.version, 30)
  spec.puertas = leerPuertas(d.puertas, avisar)

  leerTareas(rutas, carpeta, spec, avisos)
  return spec
}

function leerTareas(rutas, carpeta, spec, avisos) {
  const fichero = path.join(carpeta, FICHERO_TAREAS)
  const rel = relativa(rutas.raiz, fichero)
  const avisar = mensaje => {
    spec.errores.push(`${FICHERO_TAREAS}: ${mensaje}`)
    avisos.push({ fichero: rel, mensaje })
  }
  let cab
  try {
    const contenido = leerMarkdown(fichero)
    if (contenido === null) return
    cab = leerCabecera(contenido)
  } catch (e) {
    avisar(`cabecera no válida: ${e.message}`)
    return
  }
  if (!cab) {
    avisar('sin cabecera YAML de tareas')
    return
  }
  const lista = cab.datos.tareas
  if (lista == null) return
  if (!Array.isArray(lista)) {
    avisar('"tareas" debe ser una lista')
    return
  }
  const vistas = new Set()
  for (const [i, t] of lista.entries()) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) {
      avisar(`la tarea ${i + 1} no es un mapa`)
      continue
    }
    const id = texto(t.id, 60)
    if (!id) avisar(`la tarea ${i + 1} no tiene "id"`)
    else if (vistas.has(id)) avisar(`tarea repetida: ${id}`)
    vistas.add(id)
    const estado = normalizarEstado(t.estado)
    if (!estado) avisar(`la tarea ${id ?? i + 1} tiene un estado no válido: ${t.estado ?? '(vacío)'}`)
    const nivel = t.nivel == null ? null : NIVELES.includes(String(t.nivel).toUpperCase()) ? String(t.nivel).toUpperCase() : null
    if (t.nivel != null && !nivel) avisar(`la tarea ${id} tiene un nivel no válido: ${t.nivel}`)
    const tarea = {
      id,
      titulo: texto(t.titulo) ?? id,
      estado,
      nivel,
      ola: t.ola == null ? null : texto(t.ola, 20),
    }
    if (t.puertas !== undefined) tarea.puertas = leerPuertas(t.puertas, avisar)
    spec.tareas.lista.push(tarea)
    spec.tareas.total++
    if (estado) spec.tareas.porEstado[estado]++
  }
}

/** Construye el estado completo del proyecto. `ahora` se inyecta en las pruebas. */
export function generarEstado(rutas, { ahora = new Date() } = {}) {
  const avisos = []
  const specs = []
  let entradas = []
  try {
    entradas = fs.readdirSync(rutas.specs, { withFileTypes: true })
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
    avisos.push({ fichero: relativa(rutas.raiz, rutas.specs), mensaje: 'no existe la carpeta de specs' })
  }
  for (const entrada of entradas) {
    if (!entrada.isDirectory() || entrada.name.startsWith('.')) continue
    specs.push(leerSpec(rutas, path.join(rutas.specs, entrada.name), avisos))
  }
  specs.sort((a, b) => (a.id ?? `~${a.carpeta}`).localeCompare(b.id ?? `~${b.carpeta}`, 'es', { numeric: true }))

  const ids = new Map()
  for (const s of specs) {
    if (!s.id) continue
    if (ids.has(s.id)) avisos.push({ fichero: s.carpeta, mensaje: `id repetido ${s.id} (también en ${ids.get(s.id)})` })
    else ids.set(s.id, s.carpeta)
  }

  const fases = ESTADOS.map(estado => ({ estado, specs: specs.filter(s => s.estado === estado).length }))
  const tareasPorEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]))
  let tareasTotal = 0
  for (const s of specs) {
    tareasTotal += s.tareas.total
    for (const e of ESTADOS) tareasPorEstado[e] += s.tareas.porEstado[e]
  }

  return {
    formato: FORMATO,
    generado: ahora.toISOString(),
    fases,
    resumen: {
      specs: specs.length,
      sinEstado: specs.filter(s => !s.estado).length,
      porNivel: Object.fromEntries(NIVELES.map(n => [n, specs.filter(s => s.nivel === n).length])),
      tareas: { total: tareasTotal, porEstado: tareasPorEstado },
    },
    specs,
    agentes: listarAgentes(rutas, { ahora }),
    avisos,
  }
}
