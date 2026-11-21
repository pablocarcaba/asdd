// Panel lateral del pipeline ASDD.
//
// Lee el estado-asdd.json que generan los hooks del plugin "asdd" y lo dibuja:
// pipeline con recuentos por fase, filtros por estado y nivel, puertas por
// spec y agentes en marcha. Solo lectura: no escribe ningún fichero.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AgentePanel, Carga, Estado, Filtro, Resultado, SpecPanel, Vista } from '../types'

const PANEL = 'asdd-panel'
const TITULO = 'Pipeline ASDD'
const CONFIG = '.claude/asdd.config.json'
const ESTADO_POR_DEFECTO = '.claude/state/estado-asdd.json'
const SPECS_POR_DEFECTO = '.claude/specs'
const CADA_MS = 3000

export const ESTADOS: Estado[] = ['borrador', 'validada', 'aprobada', 'en_curso', 'implementada']
const NOMBRE: Record<Estado, string> = {
  borrador: 'Borrador',
  validada: 'Validada',
  aprobada: 'Aprobada',
  en_curso: 'En curso',
  implementada: 'Implementada',
}
const COLOR: Record<Estado, string> = {
  borrador: 'inactive',
  validada: 'suggestion',
  aprobada: 'permission',
  en_curso: 'warning',
  implementada: 'success',
}
const PUERTA: Record<string, string> = { validacion: 'val', qa: 'qa', seguridad: 'seg', accesibilidad: 'acc' }
const SIMBOLO: Record<Resultado, [string, string | undefined]> = {
  pasada: ['✓', 'success'],
  avisos: ['!', 'warning'],
  bloqueada: ['✗', 'error'],
  pendiente: ['·', undefined],
  no_aplica: ['–', undefined],
}

// Cambia la etiqueta si cambia la forma: descarta lo que guardó una versión anterior.
const carga = atom({ plugin: 'asdd-panel', key: 'carga' } as const, { tipo: 'vacio' } as Carga, { shape: 'carga-1' })
const filtro = atom({ plugin: 'asdd-panel', key: 'filtro' } as const, { estado: '', nivel: '' } as Filtro, {
  shape: 'filtro-1',
})

/** Ruta relativa segura: nada absoluto, ni ~, ni "..". */
export function rutaRelativaSegura(ruta: unknown): string | null {
  if (typeof ruta !== 'string' || ruta.trim() === '') return null
  if (/^([/\\~]|[a-zA-Z]:)/.test(ruta)) return null
  if (ruta.split(/[/\\]/).includes('..')) return null
  return ruta
}

const texto = (v: unknown, max = 200): string | null => (v == null ? null : String(v).slice(0, max))
const numero = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/** Convierte el JSON del generador en lo que dibuja el panel, sin fiarse de su forma. */
export function aVista(datos: unknown): Vista {
  const d = objeto(datos)
  if (d.formato !== 1) throw new Error('formato de estado desconocido: regenera con asdd-estado.mjs')
  const porEstado = objeto(objeto(objeto(d.resumen).tareas).porEstado)
  const fases = ESTADOS.map(estado => {
    const f = objeto(lista(d.fases).find(x => objeto(x).estado === estado))
    return { estado, specs: numero(f.specs), tareas: numero(porEstado[estado]) }
  })
  const specs: SpecPanel[] = lista(d.specs).map(x => {
    const s = objeto(x)
    const tareas = objeto(s.tareas)
    const t = objeto(tareas.porEstado)
    const puertas: Record<string, Resultado> = {}
    for (const [k, r] of Object.entries(objeto(s.puertas))) {
      if (typeof r === 'string' && r in SIMBOLO) puertas[k.slice(0, 40)] = r as Resultado
    }
    const estado = ESTADOS.includes(s.estado as Estado) ? (s.estado as Estado) : null
    const nivel = s.nivel === 'S' || s.nivel === 'M' || s.nivel === 'L' ? s.nivel : null
    return {
      id: texto(s.id, 60),
      titulo: texto(s.titulo) ?? '',
      carpeta: texto(s.carpeta) ?? '',
      estado,
      nivel,
      version: typeof s.version === 'number' ? s.version : texto(s.version, 30),
      puertas,
      tareas: {
        origen: tareas.origen === 'cabecera' || tareas.origen === 'cuerpo' ? tareas.origen : null,
        total: numero(tareas.total),
        implementadas: numero(t.implementada),
        enCurso: numero(t.en_curso),
        pendientes: numero(tareas.pendientes),
        fallidas: numero(tareas.fallidas),
        olas: lista(tareas.porOla).slice(0, 500).map(x => {
          const o = objeto(x)
          return { ola: texto(o.ola, 20) ?? '—', total: numero(o.total), implementadas: numero(o.implementadas) }
        }),
      },
      errores: lista(s.errores).length,
    }
  })
  const agentes: AgentePanel[] = lista(d.agentes).map(x => {
    const a = objeto(x)
    return {
      id: texto(a.id, 100) ?? '',
      tipo: texto(a.tipo, 100) ?? 'agente',
      descripcion: texto(a.descripcion),
      desde: texto(a.desde, 40) ?? '',
    }
  })
  return {
    generado: texto(d.generado, 40) ?? '',
    fases,
    sinEstado: numero(objeto(d.resumen).sinEstado),
    tareasPendientes: numero(objeto(objeto(d.resumen).tareas).pendientes),
    tareasFallidas: numero(objeto(objeto(d.resumen).tareas).fallidas),
    specs,
    agentes,
    avisos: lista(d.avisos).length,
  }
}

export function filtrar(specs: SpecPanel[], f: Filtro): SpecPanel[] {
  return specs.filter(
    s =>
      (f.estado === '' || (f.estado === 'sin_estado' ? s.estado === null : s.estado === f.estado)) &&
      (f.nivel === '' || s.nivel === f.nivel),
  )
}

/** Oleadas sin terminar y cuántas están completas. */
export function resumenOlas(olas: SpecPanel['tareas']['olas']): { abiertas: string[]; completas: number } {
  const abiertas = olas.filter(o => o.implementadas < o.total).map(o => `${o.ola} ${o.implementadas}/${o.total}`)
  return { abiertas, completas: olas.length - abiertas.length }
}

function hora(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

// Variables del módulo: se reinician al recargar, y está bien (se vuelve a leer).
  let ficheroEstado = ESTADO_POR_DEFECTO
  let marca = ''
  let reloj: Timer | undefined

  async function esProyectoAsdd($: EngineInterface): Promise<boolean> {
    return (await $.fs.exists(CONFIG)) || (await $.fs.exists(SPECS_POR_DEFECTO))
  }

  async function cargar($: EngineInterface, { forzar = false } = {}): Promise<void> {
    try {
      ficheroEstado = ESTADO_POR_DEFECTO
      if (await $.fs.exists(CONFIG)) {
        const config = objeto(JSON.parse(await $.fs.read(CONFIG)))
        if (config.estado !== undefined) {
          const ruta = rutaRelativaSegura(config.estado)
          if (!ruta) throw new Error(`"estado" en ${CONFIG} debe ser una ruta relativa dentro del proyecto`)
          ficheroEstado = ruta
        }
      }
      if (!(await $.fs.exists(ficheroEstado))) {
        marca = ''
        await update($, carga, (): Carga => ({
          tipo: 'error',
          fichero: ficheroEstado,
          mensaje: 'Aún no hay estado. Se genera al escribir una spec, o a mano con asdd-estado.mjs.',
        }))
        return
      }
      const st = await $.fs.stat(ficheroEstado)
      const nueva = `${ficheroEstado}:${st.mtimeMs}:${st.size}`
      if (!forzar && nueva === marca) return
      marca = nueva
      const vista = aVista(JSON.parse(await $.fs.read(ficheroEstado)))
      await update($, carga, (): Carga => ({ tipo: 'ok', vista, fichero: ficheroEstado }))
    } catch (err) {
      marca = ''
      const mensaje = err instanceof Error ? err.message : String(err)
      await update($, carga, (): Carga => ({ tipo: 'error', fichero: ficheroEstado, mensaje }))
    }
  }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const respuesta = await next(e)
    await $.command.register({ name: 'asdd-panel', description: 'Abre el panel con el estado del pipeline ASDD' })
    if (await esProyectoAsdd($)) {
      await cargar($, { forzar: true })
      reloj?.cancel()
      reloj = $.clock.every(CADA_MS, () => void cargar($))
      void $.ui.open({ id: PANEL, title: TITULO })
    }
    return respuesta
  })

  on('command.run', { command: 'asdd-panel' }, async $ => {
    await cargar($, { forzar: true })
    if (!reloj) reloj = $.clock.every(CADA_MS, () => void cargar($))
    await $.ui.open({ id: PANEL, title: TITULO })
    return { text: 'Panel del pipeline ASDD abierto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const { Box, Text, Select } = $.ui.resolve(e)
    const c = await read($, carga)
    const f = await read($, filtro)

    if (c.tipo === 'vacio') {
      return (
        <Box flexDirection="column">
          <Text dimColor>Este proyecto no usa ASDD (no hay {CONFIG} ni {SPECS_POR_DEFECTO}).</Text>
        </Box>
      )
    }
    if (c.tipo === 'error') {
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="warning">{c.mensaje}</Text>
          <Text dimColor>Fichero: {c.fichero}</Text>
        </Box>
      )
    }

    const v = c.vista
    const visibles = filtrar(v.specs, f)
    const opcionesEstado = [
      { value: '', label: 'Todos los estados' },
      ...ESTADOS.map(estado => ({ value: estado, label: NOMBRE[estado] })),
      { value: 'sin_estado', label: 'Sin estado' },
    ]
    const opcionesNivel = [
      { value: '', label: 'Todos los niveles' },
      { value: 'S', label: 'Nivel S' },
      { value: 'M', label: 'Nivel M' },
      { value: 'L', label: 'Nivel L' },
    ]

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Pipeline</Text>
          {v.fases.map((fase, i) => (
            <Box key={`fase-${fase.estado}`} flexDirection="row" gap={1}>
              <Text dimColor>{i === 0 ? ' ' : '→'}</Text>
              <Text color={COLOR[fase.estado]} bold={fase.specs > 0}>
                {NOMBRE[fase.estado].padEnd(13)}
              </Text>
              <Text bold={fase.specs > 0}>{String(fase.specs).padStart(3)}</Text>
              <Text dimColor>
                spec{fase.specs === 1 ? '' : 's'} · {fase.tareas} tarea{fase.tareas === 1 ? '' : 's'}
              </Text>
            </Box>
          ))}
          {(v.tareasPendientes > 0 || v.tareasFallidas > 0) && (
            <Text dimColor>
              {'  '}Tareas sin estado: {v.tareasPendientes} pendiente{v.tareasPendientes === 1 ? '' : 's'}
              {v.tareasFallidas > 0 ? ` · ${v.tareasFallidas} fallida${v.tareasFallidas === 1 ? '' : 's'}` : ''}
            </Text>
          )}
          {v.sinEstado > 0 && (
            <Text color="error">
              {'  '}Sin estado{'     '}
              {String(v.sinEstado).padStart(3)} spec{v.sinEstado === 1 ? '' : 's'}
            </Text>
          )}
        </Box>

        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Select
            key="filtro-estado"
            label="Estado"
            options={opcionesEstado}
            value={f.estado}
            onSelect={valor => void update($, filtro, actual => ({ ...actual, estado: valor }))}
          />
          <Select
            key="filtro-nivel"
            label="Nivel"
            options={opcionesNivel}
            value={f.nivel}
            onSelect={valor => void update($, filtro, actual => ({ ...actual, nivel: valor }))}
          />
        </Box>

        <Box flexDirection="column">
          <Text bold>
            Specs ({visibles.length}
            {visibles.length !== v.specs.length ? ` de ${v.specs.length}` : ''})
          </Text>
          {visibles.length === 0 && <Text dimColor>Ninguna spec con este filtro.</Text>}
          {visibles.map(s => (
            <Box key={`spec-${s.carpeta}`} flexDirection="column" marginTop={1}>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                <Text bold>{s.id ?? '—'}</Text>
                <Text>{s.titulo}</Text>
              </Box>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {s.estado ? (
                  <Text color={COLOR[s.estado]}>{NOMBRE[s.estado]}</Text>
                ) : (
                  <Text color="error">Sin estado</Text>
                )}
                <Text dimColor>
                  · nivel {s.nivel ?? '—'} · v{s.version ?? '—'}
                  {s.tareas.total > 0 ? ` · ${s.tareas.implementadas}/${s.tareas.total} tareas` : ''}
                </Text>
              </Box>
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {Object.entries(s.puertas).map(([puerta, r]) => (
                  <Text color={SIMBOLO[r][1]} dimColor={!SIMBOLO[r][1]}>
                    {PUERTA[puerta] ?? puerta} {SIMBOLO[r][0]}
                  </Text>
                ))}
              </Box>
              {s.tareas.olas.length > 1 &&
                (() => {
                  const { abiertas, completas } = resumenOlas(s.tareas.olas)
                  return (
                    <Text dimColor>
                      Oleadas: {abiertas.length > 0 ? abiertas.slice(0, 6).join(' · ') : 'todas completas'}
                      {abiertas.length > 6 ? ` · +${abiertas.length - 6}` : ''}
                      {abiertas.length > 0 && completas > 0 ? ` · ${completas} completa${completas === 1 ? '' : 's'}` : ''}
                    </Text>
                  )
                })()}
              {s.tareas.fallidas > 0 && (
                <Text color="error">
                  {s.tareas.fallidas} tarea{s.tareas.fallidas === 1 ? '' : 's'} fallida{s.tareas.fallidas === 1 ? '' : 's'} [!]
                </Text>
              )}
              {s.errores > 0 && (
                <Text color="warning">
                  {s.errores} aviso{s.errores === 1 ? '' : 's'} en la cabecera
                </Text>
              )}
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          <Text bold>Agentes en marcha ({v.agentes.length})</Text>
          {v.agentes.length === 0 && <Text dimColor>Ninguno.</Text>}
          {v.agentes.map(a => (
            <Box key={`agente-${a.id}`} flexDirection="row" gap={1} flexWrap="wrap">
              <Text color="claude">●</Text>
              <Text>{a.tipo}</Text>
              <Text dimColor>
                {a.descripcion ? `${a.descripcion} · ` : ''}desde {hora(a.desde)}
              </Text>
            </Box>
          ))}
        </Box>

        <Box flexDirection="column">
          {v.avisos > 0 && (
            <Text color="warning">
              {v.avisos} aviso{v.avisos === 1 ? '' : 's'} en las cabeceras: asdd-estado.mjs --comprobar
            </Text>
          )}
          <Text dimColor>
            Actualizado {hora(v.generado)} · {c.fichero} · solo lectura
          </Text>
        </Box>
      </Box>
    )
  })
}
