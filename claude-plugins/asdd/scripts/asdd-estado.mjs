#!/usr/bin/env node
// Genera estado-asdd.json (y, si se pide, el dashboard HTML) a partir de las
// cabeceras YAML de las specs y tareas del proyecto.
//
//   node asdd-estado.mjs [--raiz <carpeta>] [--html] [--comprobar] [--salida -]
//
//   --raiz       raíz del proyecto (por defecto CLAUDE_PROJECT_DIR o el cwd)
//   --html       escribe también el dashboard (ruta "html" de la config, o la
//                de por defecto .claude/state/estado-asdd.html)
//   --comprobar  no escribe nada; sale con 1 si hay avisos (útil en CI)
//   --salida -   escribe el JSON en la salida estándar en vez de en el fichero

import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { cargarConfig, escribirAtomico, resolverRaiz, rutaDentro, HTML_POR_DEFECTO, relativa } from './lib/config.mjs'
import { generarEstado } from './lib/estado.mjs'
import { generarHtml } from './lib/html.mjs'

export function regenerar(rutas, { html = false, ahora } = {}) {
  const estado = generarEstado(rutas, { ahora })
  escribirAtomico(rutas.estado, JSON.stringify(estado, null, 2) + '\n')
  const destinoHtml = rutas.html ?? (html ? rutaDentro(rutas.raiz, HTML_POR_DEFECTO, 'html') : null)
  if (destinoHtml) escribirAtomico(destinoHtml, generarHtml(estado))
  return { estado, html: destinoHtml }
}

function leerArgumentos(argv) {
  const opciones = { html: false, comprobar: false, salida: null, raiz: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--html') opciones.html = true
    else if (a === '--comprobar') opciones.comprobar = true
    else if (a === '--raiz') opciones.raiz = argv[++i]
    else if (a === '--salida') opciones.salida = argv[++i]
    else if (a === '-h' || a === '--ayuda' || a === '--help') opciones.ayuda = true
    else throw new Error(`argumento desconocido: ${a}`)
  }
  return opciones
}

function principal() {
  let opciones
  try {
    opciones = leerArgumentos(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    return 2
  }
  if (opciones.ayuda) {
    console.log('Uso: node asdd-estado.mjs [--raiz <carpeta>] [--html] [--comprobar] [--salida -]')
    return 0
  }
  let rutas
  try {
    rutas = cargarConfig(resolverRaiz({ raiz: opciones.raiz }))
  } catch (e) {
    console.error(`asdd-estado: ${e.message}`)
    return 2
  }
  if (opciones.comprobar || opciones.salida === '-') {
    const estado = generarEstado(rutas)
    if (opciones.salida === '-') process.stdout.write(JSON.stringify(estado, null, 2) + '\n')
    if (opciones.comprobar) {
      for (const a of estado.avisos) console.error(`${a.fichero}: ${a.mensaje}`)
      return estado.avisos.length ? 1 : 0
    }
    return 0
  }
  const { estado, html } = regenerar(rutas, { html: opciones.html })
  const partes = estado.fases.map(f => `${f.estado} ${f.specs}`).join(' · ')
  console.log(`${relativa(rutas.raiz, rutas.estado)}: ${estado.resumen.specs} specs (${partes})`)
  if (html) console.log(`${relativa(rutas.raiz, html)}: dashboard en solo lectura`)
  for (const a of estado.avisos) console.error(`aviso: ${a.fichero}: ${a.mensaje}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = principal()
}
