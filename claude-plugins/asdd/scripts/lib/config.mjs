// Configuración del estado ASDD: rutas relativas a la raíz del proyecto.
//
// Fichero opcional: <raiz>/.claude/asdd.config.json
//   {
//     "specs":   ".claude/specs",                  carpetas de spec
//     "estado":  ".claude/state/estado-asdd.json", JSON que genera el marco
//     "agentes": ".claude/state/agentes",          un fichero por agente en marcha
//     "html":    false                              o una ruta: dashboard estático
//   }
// Ninguna ruta puede ser absoluta ni salir de la raíz.

import fs from 'node:fs'
import path from 'node:path'

export const FICHERO_CONFIG = '.claude/asdd.config.json'
export const HTML_POR_DEFECTO = '.claude/state/estado-asdd.html'

export const POR_DEFECTO = Object.freeze({
  specs: '.claude/specs',
  estado: '.claude/state/estado-asdd.json',
  agentes: '.claude/state/agentes',
  html: false,
})

export class ErrorConfig extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorConfig'
  }
}

/** La raíz del proyecto: --raiz, CLAUDE_PROJECT_DIR, el cwd del hook o el del proceso. */
export function resolverRaiz({ raiz, cwdHook } = {}) {
  return path.resolve(raiz || process.env.CLAUDE_PROJECT_DIR || cwdHook || process.cwd())
}

/** Comprueba que `relativa` es relativa y queda dentro de `raiz`; devuelve la ruta absoluta. */
export function rutaDentro(raiz, relativa, nombre) {
  if (typeof relativa !== 'string' || relativa.trim() === '') {
    throw new ErrorConfig(`"${nombre}" debe ser una ruta de texto`)
  }
  if (path.isAbsolute(relativa) || /^[a-zA-Z]:[\\/]/.test(relativa) || relativa.startsWith('~')) {
    throw new ErrorConfig(`"${nombre}" debe ser relativa a la raíz del proyecto: ${relativa}`)
  }
  const absoluta = path.resolve(raiz, relativa)
  if (!dentroDe(raiz, absoluta) || absoluta === path.resolve(raiz)) {
    throw new ErrorConfig(`"${nombre}" sale de la raíz del proyecto: ${relativa}`)
  }
  return absoluta
}

export function dentroDe(raiz, absoluta) {
  const rel = path.relative(path.resolve(raiz), absoluta)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/** Lee la configuración (o los valores por defecto) y resuelve las rutas. */
export function cargarConfig(raiz) {
  const fichero = path.join(raiz, FICHERO_CONFIG)
  let propia = {}
  let existe = false
  try {
    propia = JSON.parse(fs.readFileSync(fichero, 'utf8'))
    existe = true
  } catch (e) {
    if (e.code !== 'ENOENT') throw new ErrorConfig(`no se puede leer ${FICHERO_CONFIG}: ${e.message}`)
  }
  if (propia === null || typeof propia !== 'object' || Array.isArray(propia)) {
    throw new ErrorConfig(`${FICHERO_CONFIG} debe ser un objeto JSON`)
  }
  for (const clave of Object.keys(propia)) {
    if (!Object.hasOwn(POR_DEFECTO, clave)) throw new ErrorConfig(`clave desconocida en ${FICHERO_CONFIG}: ${clave}`)
  }
  const c = { ...POR_DEFECTO, ...propia }
  const rutas = {
    raiz,
    specs: rutaDentro(raiz, c.specs, 'specs'),
    estado: rutaDentro(raiz, c.estado, 'estado'),
    agentes: rutaDentro(raiz, c.agentes, 'agentes'),
    html: c.html === false || c.html === null ? null : rutaDentro(raiz, c.html === true ? HTML_POR_DEFECTO : c.html, 'html'),
    existeConfig: existe,
  }
  // Un enlace simbólico no puede sacar las specs de la raíz.
  if (fs.existsSync(rutas.specs)) {
    const real = fs.realpathSync(rutas.specs)
    if (!dentroDe(fs.realpathSync(raiz), real)) throw new ErrorConfig(`"specs" apunta fuera de la raíz del proyecto`)
  }
  return rutas
}

/** ¿Es un proyecto ASDD? (tiene configuración o carpeta de specs) */
export function esProyectoAsdd(rutas) {
  return rutas.existeConfig || fs.existsSync(rutas.specs)
}

/** Ruta relativa con barras /, para guardar en el JSON sin rutas absolutas. */
export function relativa(raiz, absoluta) {
  return path.relative(raiz, absoluta).split(path.sep).join('/')
}

/** Escribe sin dejar nunca un fichero a medias (temporal + rename). */
export function escribirAtomico(fichero, texto) {
  fs.mkdirSync(path.dirname(fichero), { recursive: true })
  const temporal = `${fichero}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  fs.writeFileSync(temporal, texto)
  try {
    fs.renameSync(temporal, fichero)
  } catch (e) {
    fs.rmSync(temporal, { force: true })
    throw e
  }
}
