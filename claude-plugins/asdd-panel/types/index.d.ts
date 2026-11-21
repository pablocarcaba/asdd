// Contrato del estado del panel ASDD.

export type Estado = 'borrador' | 'validada' | 'aprobada' | 'en_curso' | 'implementada'
export type Resultado = 'pendiente' | 'pasada' | 'avisos' | 'bloqueada' | 'no_aplica'

export type SpecPanel = {
  id: string | null
  titulo: string
  carpeta: string
  estado: Estado | null
  nivel: 'S' | 'M' | 'L' | null
  version: string | number | null
  puertas: Record<string, Resultado>
  tareas: { total: number; implementadas: number; enCurso: number }
  errores: number
}

export type AgentePanel = { id: string; tipo: string; descripcion: string | null; desde: string }

/** Lo que el panel guarda del estado-asdd.json (solo lo que dibuja). */
export type Vista = {
  generado: string
  fases: { estado: Estado; specs: number; tareas: number }[]
  sinEstado: number
  specs: SpecPanel[]
  agentes: AgentePanel[]
  avisos: number
}

/** Qué se ve: el estado, o por qué no hay estado. */
export type Carga =
  | { tipo: 'vacio' }
  | { tipo: 'ok'; vista: Vista; fichero: string }
  | { tipo: 'error'; mensaje: string; fichero: string }

export type Filtro = { estado: string; nivel: string }

declare module 'claude-code' {
  interface PluginState {
    'asdd-panel': { carga: Shaped<Carga>; filtro: Shaped<Filtro> }
  }
}
