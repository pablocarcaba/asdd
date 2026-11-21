// Agentes en marcha: un fichero JSON por agente dentro de <agentes>/.
// Un fichero por agente evita que dos hooks asíncronos se pisen al escribir.

import fs from 'node:fs'
import path from 'node:path'

import { escribirAtomico } from './config.mjs'

/** Un registro sin cerrar más antiguo que esto se da por perdido. */
export const CADUCIDAD_MS = 6 * 60 * 60 * 1000

/** "asdd:asdd-spec-agent" y "asdd-spec-agent" son el mismo tipo. */
export function tipoBase(tipo) {
  return String(tipo ?? '').split(':').pop().trim()
}

function nombreSeguro(id) {
  const limpio = String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100)
  return limpio || `agente-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function registrarInicio(rutas, { id, tipo, descripcion, sesion }, { ahora = new Date() } = {}) {
  const nombre = nombreSeguro(id)
  const registro = {
    id: nombre,
    tipo: tipoBase(tipo) || 'general-purpose',
    descripcion: descripcion == null ? null : String(descripcion).slice(0, 200),
    sesion: sesion == null ? null : String(sesion).slice(0, 100),
    desde: ahora.toISOString(),
  }
  escribirAtomico(path.join(rutas.agentes, `${nombre}.json`), JSON.stringify(registro, null, 2) + '\n')
  return registro
}

function leerRegistros(rutas) {
  let nombres
  try {
    nombres = fs.readdirSync(rutas.agentes)
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
  const registros = []
  for (const nombre of nombres) {
    if (!nombre.endsWith('.json')) continue
    const fichero = path.join(rutas.agentes, nombre)
    try {
      const r = JSON.parse(fs.readFileSync(fichero, 'utf8'))
      if (r && typeof r === 'object' && typeof r.desde === 'string') registros.push({ ...r, fichero })
    } catch {
      // Un fichero a medio borrar o corrupto no rompe el panel.
    }
  }
  return registros.sort((a, b) => a.desde.localeCompare(b.desde))
}

/**
 * Retira el agente más antiguo de ese tipo (y de esa sesión, si se sabe).
 * SubagentStop no trae el id de la llamada Agent, así que se empareja por tipo.
 * @returns el registro retirado, o null
 */
export function registrarFin(rutas, { tipo, sesion }) {
  const base = tipoBase(tipo)
  if (!base) return null
  const candidatos = leerRegistros(rutas).filter(
    r => r.tipo === base && (sesion == null || r.sesion == null || r.sesion === String(sesion)),
  )
  for (const r of candidatos) {
    // Reclamar con rename: si otro hook lo retiró antes, se prueba el siguiente.
    const reclamado = `${r.fichero}.${process.pid}.fin`
    try {
      fs.renameSync(r.fichero, reclamado)
    } catch {
      continue
    }
    fs.rmSync(reclamado, { force: true })
    const { fichero, ...registro } = r
    return registro
  }
  return null
}

/** Borra los registros caducados (un agente que nunca avisó de su fin). */
export function limpiarCaducados(rutas, { ahora = new Date() } = {}) {
  let borrados = 0
  for (const r of leerRegistros(rutas)) {
    if (ahora - new Date(r.desde) > CADUCIDAD_MS) {
      fs.rmSync(r.fichero, { force: true })
      borrados++
    }
  }
  return borrados
}

export function listarAgentes(rutas, { ahora = new Date() } = {}) {
  return leerRegistros(rutas)
    .filter(r => ahora - new Date(r.desde) <= CADUCIDAD_MS)
    .map(({ fichero, ...r }) => r)
}
