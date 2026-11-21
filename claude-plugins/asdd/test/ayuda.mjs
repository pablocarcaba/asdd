// Utilidades de prueba: proyectos ASDD temporales.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function proyectoTemporal(ficheros = {}) {
  const raiz = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'asdd-prueba-')))
  for (const [ruta, contenido] of Object.entries(ficheros)) {
    const destino = path.join(raiz, ruta)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, contenido)
  }
  return raiz
}

export function borrar(raiz) {
  fs.rmSync(raiz, { recursive: true, force: true })
}

export function spec({ id, titulo = 'Spec de prueba', estado = 'borrador', nivel = 'M', version = 1, puertas }) {
  const lineas = ['---', `id: ${id}`, `titulo: ${titulo}`, `estado: ${estado}`, `nivel: ${nivel}`, `version: ${version}`]
  if (puertas) lineas.push(`puertas: ${puertas}`)
  lineas.push('---', '', '# Requisitos', '')
  return lineas.join('\n')
}

export function tareas(lista) {
  const lineas = ['---', 'version: 1', 'tareas:']
  for (const t of lista) {
    lineas.push(`  - id: ${t.id}`, `    titulo: ${t.titulo ?? t.id}`, `    estado: ${t.estado}`)
    if (t.nivel) lineas.push(`    nivel: ${t.nivel}`)
    if (t.ola) lineas.push(`    ola: ${t.ola}`)
  }
  lineas.push('---', '', '# Tareas', '')
  return lineas.join('\n')
}

export const AHORA = new Date('2026-11-21T10:00:00.000Z')
