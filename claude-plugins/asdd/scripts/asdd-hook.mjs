#!/usr/bin/env node
// Hooks del marco ASDD para el estado del pipeline. Se configuran como
// asíncronos en hooks/hooks.json y nunca bloquean: siempre salen con 0.
//
//   node asdd-hook.mjs agente-inicio   PreToolUse (Agent): anota el agente
//   node asdd-hook.mjs agente-fin      SubagentStop: lo retira
//   node asdd-hook.mjs fichero         PostToolUse (Write|Edit): si el fichero
//                                      está en las specs, regenera el estado
//
// Lee la entrada del hook (JSON) por stdin. En un proyecto sin ASDD
// (sin .claude/asdd.config.json ni carpeta de specs) no hace nada.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { cargarConfig, dentroDe, esProyectoAsdd, resolverRaiz } from './lib/config.mjs'
import { limpiarCaducados, registrarFin, registrarInicio } from './lib/agentes.mjs'
import { regenerar } from './asdd-estado.mjs'

const MAX_ENTRADA = 1024 * 1024
const ESPERA_MS = 5000

function leerEntrada() {
  return new Promise(resolve => {
    if (process.stdin.isTTY) return resolve({})
    let texto = ''
    let demasiado = false
    const fin = () => {
      clearTimeout(reloj)
      if (demasiado) return resolve({})
      try {
        resolve(texto.trim() ? JSON.parse(texto) : {})
      } catch {
        resolve({})
      }
    }
    const reloj = setTimeout(fin, ESPERA_MS)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', trozo => {
      if (texto.length + trozo.length > MAX_ENTRADA) demasiado = true
      else texto += trozo
    })
    process.stdin.on('end', fin)
    process.stdin.on('error', fin)
  })
}

/** Lógica de cada hook; separada de la E/S para probarla. */
export function ejecutarHook(accion, entrada, { ahora = new Date(), raiz } = {}) {
  const rutas = cargarConfig(resolverRaiz({ raiz, cwdHook: entrada.cwd }))
  if (!esProyectoAsdd(rutas)) return { hecho: false, motivo: 'no es un proyecto ASDD' }

  if (accion === 'agente-inicio') {
    const nombreHerramienta = entrada.tool_name
    if (nombreHerramienta && nombreHerramienta !== 'Agent' && nombreHerramienta !== 'Task') {
      return { hecho: false, motivo: `herramienta ${nombreHerramienta}` }
    }
    const input = entrada.tool_input ?? {}
    limpiarCaducados(rutas, { ahora })
    const registro = registrarInicio(
      rutas,
      {
        id: entrada.tool_use_id,
        tipo: input.subagent_type,
        descripcion: input.description,
        sesion: entrada.session_id,
      },
      { ahora },
    )
    regenerar(rutas, { ahora })
    return { hecho: true, registro }
  }

  if (accion === 'agente-fin') {
    const registro = registrarFin(rutas, { tipo: entrada.agent_type, sesion: entrada.session_id })
    regenerar(rutas, { ahora })
    return { hecho: true, registro }
  }

  if (accion === 'fichero') {
    const ruta = entrada.tool_input?.file_path ?? entrada.tool_input?.path
    if (typeof ruta !== 'string' || !ruta.endsWith('.md')) return { hecho: false, motivo: 'no es un Markdown' }
    const absoluta = path.resolve(rutas.raiz, ruta)
    if (!dentroDe(rutas.specs, absoluta)) return { hecho: false, motivo: 'fuera de las specs' }
    regenerar(rutas, { ahora })
    return { hecho: true }
  }

  throw new Error(`acción desconocida: ${accion}`)
}

async function principal() {
  const accion = process.argv[2]
  try {
    const entrada = await leerEntrada()
    ejecutarHook(accion, entrada)
  } catch (e) {
    // Un fallo del panel nunca debe frenar el trabajo: se avisa y se sigue.
    process.stderr.write(`asdd-hook ${accion}: ${e.message}\n`)
  }
  process.exitCode = 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal()
}
