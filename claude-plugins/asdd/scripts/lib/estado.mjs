// Generador del estado del pipeline ASDD.
// Lee las cabeceras de <specs>/<spec>/requirements.md y tasks.md y compone
// el objeto que se escribe en estado-asdd.json.

import fs from 'node:fs'
import path from 'node:path'

import { leerCabecera } from './cabecera.mjs'
import { dentroDe, relativa } from './config.mjs'
import { listarAgentes } from './agentes.mjs'

export const FORMATO = 1
export const ESTADOS = ['borrador', 'validada', 'aprobada', 'en_curso', 'implementada']
export const NIVELES = ['S', 'M', 'L']
export const RESULTADOS_PUERTA = ['pendiente', 'pasada', 'avisos', 'bloqueada', 'no_aplica']
export const PUERTAS = ['validacion', 'qa', 'seguridad', 'accesibilidad']
export const FICHERO_SPEC = 'requirements.md'
export const FICHERO_TAREAS = 'tasks.md'

// La cabecera se lee del principio del fichero: una spec puede pesar varios MiB.
const MAX_CABECERA = 256 * 1024
// tasks.md se lee entero en modo "cuerpo"; un plan de miles de tareas cabe de sobra.
const MAX_TAREAS = 64 * 1024 * 1024

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

function leerMarkdown(fichero, max = MAX_TAREAS) {
  const st = fs.statSync(fichero, { throwIfNoEntry: false })
  if (!st || !st.isFile()) return null
  if (st.size > max) throw new Error(`el fichero supera ${Math.round(max / 1024 / 1024)} MiB`)
  return fs.readFileSync(fichero, 'utf8')
}

/**
 * Busca <carpeta>/<nombre> y, si no está, la versión dividida en ficheros
 * pequeños: <carpeta>/<nombre sin .md>/<nombre>, que hace de índice.
 * @returns {{ fichero: string, dividido: boolean } | null}
 */
export function localizarFichero(carpeta, nombre) {
  const plano = path.join(carpeta, nombre)
  if (fs.statSync(plano, { throwIfNoEntry: false })?.isFile()) return { fichero: plano, dividido: false }
  const indice = path.join(carpeta, nombre.replace(/\.md$/, ''), nombre)
  if (fs.statSync(indice, { throwIfNoEntry: false })?.isFile()) return { fichero: indice, dividido: true }
  return null
}

// Fila de la tabla de ficheros de un índice dividido: | 3 | [historial.md](historial.md) | …
const RE_FILA_INDICE = /^\|\s*\d+\s*\|\s*\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)/

/** ¿`destino` queda dentro de `carpeta`, también tras seguir enlaces simbólicos? */
function dentroDeVerdad(carpeta, destino) {
  if (!dentroDe(carpeta, destino)) return false
  try {
    return dentroDe(fs.realpathSync(carpeta), fs.realpathSync(destino))
  } catch {
    return true // no existe: se avisará al leerlo
  }
}

/**
 * Lista, en el orden de la tabla del índice, los ficheros de un documento
 * dividido. Concatenarlos en ese orden da el documento original, así que el
 * título de oleada de un fichero sigue valiendo para las tareas del siguiente.
 * El índice entra una sola vez, en su primera fila. Solo se admiten .md
 * dentro de la carpeta de la spec (también tras seguir enlaces simbólicos).
 */
export function ficherosDelIndice(indice, contenidoIndice, carpetaSpec) {
  const dir = path.dirname(indice)
  const ficheros = []
  const vistos = new Set()
  for (const linea of contenidoIndice.split(/\r\n|\r|\n/)) {
    const m = linea.match(RE_FILA_INDICE)
    if (!m) continue
    let enlace
    try {
      enlace = decodeURIComponent(m[1])
    } catch {
      continue // un % mal escrito no rompe la generación
    }
    const destino = path.resolve(dir, enlace)
    if (!destino.endsWith('.md') || vistos.has(destino) || !dentroDeVerdad(carpetaSpec, destino)) continue
    vistos.add(destino)
    ficheros.push(destino)
  }
  if (!vistos.has(path.resolve(indice))) ficheros.unshift(path.resolve(indice))
  return ficheros
}

/** Todos los .md bajo `dir` (sin seguir enlaces simbólicos a carpetas), ordenados. */
function markdownsBajo(dir) {
  const encontrados = []
  const recorrer = d => {
    let entradas
    try {
      entradas = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entradas) {
      if (e.name.startsWith('.')) continue
      const ruta = path.join(d, e.name)
      if (e.isDirectory()) recorrer(ruta)
      else if ((e.isFile() || e.isSymbolicLink()) && e.name.endsWith('.md')) encontrados.push(ruta)
    }
  }
  recorrer(dir)
  return encontrados.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
}

/** "oleadas/O45-paquetes.md" → "O45" */
export function olaDelNombre(fichero) {
  return path.basename(fichero).match(/(?:^|[^A-Za-z0-9])(O\d{2,})(?![0-9])/)?.[1] ?? null
}

/** Lee solo el principio del fichero y devuelve su cabecera (o null). */
function leerCabeceraDeFichero(fichero) {
  const st = fs.statSync(fichero, { throwIfNoEntry: false })
  if (!st || !st.isFile()) return undefined
  const fd = fs.openSync(fichero, 'r')
  let principio
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_CABECERA))
    const leidos = fs.readSync(fd, buf, 0, buf.length, 0)
    principio = buf.subarray(0, leidos).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
  try {
    return leerCabecera(principio)
  } catch (e) {
    if (st.size > MAX_CABECERA && /no se cierra/.test(e.message)) {
      throw new Error(`la cabecera YAML no se cierra en los primeros ${MAX_CABECERA / 1024} KiB`)
    }
    throw e
  }
}

function leerSpec(rutas, carpeta, avisos) {
  const nombreCarpeta = path.basename(carpeta)
  const ficheroSpec = localizarFichero(carpeta, FICHERO_SPEC)?.fichero ?? path.join(carpeta, FICHERO_SPEC)
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
    tareas: {
      origen: null,
      total: 0,
      porEstado: Object.fromEntries(ESTADOS.map(e => [e, 0])),
      pendientes: 0,
      fallidas: 0,
      porOla: [],
      lista: [],
    },
    errores,
  }

  // Las tareas se leen aunque la cabecera de la spec falte o esté mal.
  leerCabeceraSpec(ficheroSpec, spec, avisar)
  leerTareas(rutas, carpeta, spec, avisos)
  return spec
}

function leerCabeceraSpec(ficheroSpec, spec, avisar) {
  let cab
  try {
    cab = leerCabeceraDeFichero(ficheroSpec)
  } catch (e) {
    avisar(`cabecera no válida: ${e.message}`)
    return
  }
  if (cab === undefined) {
    avisar(`falta ${FICHERO_SPEC}`)
    return
  }
  if (!cab) {
    avisar('sin cabecera YAML de estado')
    return
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
}

// Tareas en el cuerpo de tasks.md (modo "cuerpo", para planes grandes):
//   - [x] TASK-001 · Título            [x] implementada · [!] fallida · [ ] pendiente
//     - **Oleada:** O39 · **Tamaño:** M
// La oleada también se toma del último título "Wave N" / "Oleada ON".
const RE_LINEA_TAREA = /^\s*[-*] \[([ xX!])\] (TASK-[A-Za-z0-9_.-]+)\b\s*(?:[·:—–-]\s*)?(.*)$/
const RE_OLA_CAMPO = /\*\*(?:Oleada|Ola|Wave):\*\*\s*([A-Za-z]?\d+[A-Za-z0-9.-]*)/i
const RE_TAMANO_CAMPO = /\*\*(?:Tamaño|Nivel|Size):\*\*\s*([SML])\b/i
const RE_OLA_TITULO = /^#{1,6}\s.*?\b(?:Oleada|Ola|Wave)\s+([A-Za-z]?\d+[A-Za-z0-9.-]*)/i

export function leerTareasDelCuerpo(lineas) {
  const tareas = []
  let ola = null
  let actual = null
  let enCodigo = false
  for (const linea of lineas) {
    if (/^\s*(```|~~~)/.test(linea)) {
      enCodigo = !enCodigo
      continue
    }
    if (enCodigo) continue
    const titulo = linea.match(RE_OLA_TITULO)
    if (titulo) {
      ola = titulo[1]
      actual = null
      continue
    }
    if (/^#{1,6}\s/.test(linea)) {
      actual = null
      continue
    }
    const m = linea.match(RE_LINEA_TAREA)
    if (m) {
      const marca = m[1].toLowerCase()
      actual = {
        id: m[2],
        titulo: m[3].replace(/\*\*\(.*?\)\*\*/g, '').replace(/\*\*/g, '').trim().slice(0, 200) || m[2],
        estado: marca === 'x' ? 'implementada' : marca === '!' ? 'en_curso' : null,
        nivel: null,
        ola,
        marca: marca === 'x' ? 'hecha' : marca === '!' ? 'fallida' : 'pendiente',
      }
      tareas.push(actual)
      continue
    }
    if (actual && /^\s+\S/.test(linea)) {
      const o = linea.match(RE_OLA_CAMPO)
      if (o) actual.ola = o[1]
      const t = linea.match(RE_TAMANO_CAMPO)
      if (t) actual.nivel = t[1].toUpperCase()
    } else if (linea.trim() !== '') {
      actual = null
    }
  }
  return tareas
}

function anotarTarea(spec, tarea) {
  const t = spec.tareas
  t.lista.push(tarea)
  t.total++
  if (tarea.estado) t.porEstado[tarea.estado]++
  if (tarea.marca === 'pendiente' || (!tarea.marca && !tarea.estado)) t.pendientes++
  if (tarea.marca === 'fallida') t.fallidas++
  const ola = tarea.ola ?? '—'
  let grupo = t.porOla.find(g => g.ola === ola)
  if (!grupo) t.porOla.push((grupo = { ola, total: 0, implementadas: 0 }))
  grupo.total++
  if (tarea.estado === 'implementada') grupo.implementadas++
}

function leerTareas(rutas, carpeta, spec, avisos) {
  const ubicacion = localizarFichero(carpeta, FICHERO_TAREAS)
  const fichero = ubicacion?.fichero ?? path.join(carpeta, FICHERO_TAREAS)
  const rel = relativa(rutas.raiz, fichero)
  const avisar = mensaje => {
    spec.errores.push(`${FICHERO_TAREAS}: ${mensaje}`)
    avisos.push({ fichero: rel, mensaje })
  }
  let contenido
  let cab
  try {
    contenido = leerMarkdown(fichero)
    if (contenido === null) return
    cab = leerCabecera(contenido)
  } catch (e) {
    avisar(`cabecera no válida: ${e.message}`)
    return
  }
  const lineas = contenido.replace(/^﻿/, '').split(/\r\n|\r|\n/)
  let lineasCuerpo = cab ? lineas.slice(cab.lineas) : lineas
  if (ubicacion?.dividido) {
    // Plan dividido: el cuerpo es la concatenación de los ficheros del índice.
    const delIndice = lineasCuerpo
    lineasCuerpo = []
    let total = 0
    for (const parte of ficherosDelIndice(fichero, contenido, carpeta)) {
      let partes
      if (parte === path.resolve(fichero)) {
        partes = delIndice
      } else {
        let texto
        try {
          texto = leerMarkdown(parte)
        } catch (e) {
          avisar(`${relativa(rutas.raiz, parte)}: ${e.message}`)
          continue
        }
        if (texto === null) {
          avisar(`el índice enlaza ${relativa(rutas.raiz, parte)}, que no existe`)
          continue
        }
        partes = texto.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
      }
      total += partes.reduce((n, l) => n + l.length + 1, 0)
      if (total > MAX_TAREAS) {
        avisar(`el plan dividido supera ${Math.round(MAX_TAREAS / 1024 / 1024)} MiB`)
        break
      }
      for (const l of partes) lineasCuerpo.push(l)
    }
  }
  const cuerpo = leerTareasDelCuerpo(lineasCuerpo)
  if (ubicacion?.dividido) {
    // Ficheros del plan que aún no están en la tabla del índice (una oleada recién
    // creada): se cuentan igual, cada uno por separado, y se avisa para que se añada
    // su fila. No se escribe nada.
    const enTabla = new Set(ficherosDelIndice(fichero, contenido, carpeta))
    for (const suelto of markdownsBajo(path.dirname(fichero))) {
      if (enTabla.has(path.resolve(suelto)) || !dentroDeVerdad(carpeta, suelto)) continue
      let texto
      try {
        texto = leerMarkdown(suelto)
      } catch (e) {
        avisar(`${relativa(rutas.raiz, suelto)}: ${e.message}`)
        continue
      }
      const tareas = leerTareasDelCuerpo((texto ?? '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/))
      if (tareas.length === 0) continue
      const ola = olaDelNombre(suelto)
      for (const t of tareas) if (!t.ola) t.ola = ola
      cuerpo.push(...tareas)
      avisar(
        `${relativa(rutas.raiz, suelto)} no está en la tabla de ${relativa(rutas.raiz, fichero)}: ` +
          `${tareas.length === 1 ? 'su tarea se cuenta' : `sus ${tareas.length} tareas se cuentan`}, pero añade su fila al índice`,
      )
    }
  }
  const lista = cab?.datos.tareas

  // Modo "cuerpo": sin cabecera, sin lista, o "tareas: cuerpo".
  if (lista === undefined || lista === null || lista === 'cuerpo') {
    spec.tareas.origen = 'cuerpo'
    const vistas = new Set()
    for (const t of cuerpo) {
      if (vistas.has(t.id)) {
        avisar(`tarea repetida en el cuerpo: ${t.id}`)
        continue
      }
      vistas.add(t.id)
      anotarTarea(spec, t)
    }
    return
  }
  if (!Array.isArray(lista)) {
    avisar('"tareas" debe ser una lista, o "cuerpo" para leer las casillas del cuerpo')
    return
  }

  // Modo "cabecera": la lista YAML manda; las casillas del cuerpo se contrastan.
  spec.tareas.origen = 'cabecera'
  if (lista.length > rutas.maxTareasCabecera) {
    avisar(
      `${lista.length} tareas en la cabecera (máximo ${rutas.maxTareasCabecera}): usa "tareas: cuerpo" y las casillas del cuerpo`,
    )
  }
  const casillas = new Map(cuerpo.map(t => [t.id, t]))
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
    const casilla = id ? casillas.get(id) : undefined
    if (casilla && estado) {
      const hecha = casilla.marca === 'hecha'
      if (hecha !== (estado === 'implementada')) {
        avisar(`${id}: la casilla del cuerpo dice ${hecha ? '[x]' : `[${casilla.marca === 'fallida' ? '!' : ' '}]`} y la cabecera dice ${estado}`)
      }
    }
    const tarea = {
      id,
      titulo: texto(t.titulo) ?? casilla?.titulo ?? id,
      estado,
      nivel: nivel ?? casilla?.nivel ?? null,
      ola: t.ola == null ? casilla?.ola ?? null : texto(t.ola, 20),
    }
    if (t.puertas !== undefined) tarea.puertas = leerPuertas(t.puertas, avisar)
    anotarTarea(spec, tarea)
  }
  for (const id of casillas.keys()) {
    if (!vistas.has(id)) avisar(`${id} está en el cuerpo pero no en la cabecera`)
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
  // Por id; las specs sin id, al final y por carpeta.
  const comparar = (x, y) => x.localeCompare(y, 'es', { numeric: true })
  specs.sort((a, b) => (a.id && b.id ? comparar(a.id, b.id) : a.id ? -1 : b.id ? 1 : comparar(a.carpeta, b.carpeta)))

  const ids = new Map()
  for (const s of specs) {
    if (!s.id) continue
    if (ids.has(s.id)) avisos.push({ fichero: s.carpeta, mensaje: `id repetido ${s.id} (también en ${ids.get(s.id)})` })
    else ids.set(s.id, s.carpeta)
  }

  const fases = ESTADOS.map(estado => ({ estado, specs: specs.filter(s => s.estado === estado).length }))
  const tareasPorEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]))
  let tareasTotal = 0
  let pendientes = 0
  let fallidas = 0
  for (const s of specs) {
    tareasTotal += s.tareas.total
    pendientes += s.tareas.pendientes
    fallidas += s.tareas.fallidas
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
      tareas: { total: tareasTotal, porEstado: tareasPorEstado, pendientes, fallidas },
    },
    specs,
    agentes: listarAgentes(rutas, { ahora }),
    avisos,
  }
}
