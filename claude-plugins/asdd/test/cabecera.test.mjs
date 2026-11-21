import { test } from 'node:test'
import assert from 'node:assert/strict'

import { leerCabecera, parsearYaml, ErrorCabecera } from '../scripts/lib/cabecera.mjs'

test('lee la cabecera completa de una spec', () => {
  const md = `---
id: SPEC-001
titulo: "Alta de clientes: flujo web"   # comentario
estado: en curso
nivel: M
version: 3
puertas: { validacion: pasada, qa: pendiente, accesibilidad: n/a }
---
# Requisitos
`
  const { datos, lineas } = leerCabecera(md)
  assert.equal(lineas, 8)
  assert.deepEqual(datos, {
    id: 'SPEC-001',
    titulo: 'Alta de clientes: flujo web',
    estado: 'en curso',
    nivel: 'M',
    version: 3,
    puertas: { validacion: 'pasada', qa: 'pendiente', accesibilidad: 'n/a' },
  })
})

test('lee mapas y listas por sangría, también listas de mapas', () => {
  const datos = parsearYaml(
    `version: 2
puertas:
  validacion: pasada
  seguridad: 'con avisos de ''prueba'''
tareas:
  - id: T-001
    titulo: Crear entidad
    estado: implementada
    puertas: [qa]
  - id: T-002
    titulo: Endpoint # sin comillas
    estado: borrador
etiquetas:
- uno
- 2
vacio:
`.split('\n'),
  )
  assert.deepEqual(datos, {
    version: 2,
    puertas: { validacion: 'pasada', seguridad: "con avisos de 'prueba'" },
    tareas: [
      { id: 'T-001', titulo: 'Crear entidad', estado: 'implementada', puertas: ['qa'] },
      { id: 'T-002', titulo: 'Endpoint', estado: 'borrador' },
    ],
    etiquetas: ['uno', 2],
    vacio: null,
  })
})

test('un Markdown sin cabecera devuelve null', () => {
  assert.equal(leerCabecera('# Hola\n\ntexto'), null)
  assert.equal(leerCabecera(''), null)
})

test('admite BOM y saltos de línea de Windows', () => {
  const { datos } = leerCabecera('﻿---\r\nid: X\r\n---\r\n')
  assert.deepEqual(datos, { id: 'X' })
})

test('el # dentro de comillas o de una palabra no es comentario', () => {
  const datos = parsearYaml(['a: "uno # dos"', 'b: C#', 'url: http://x.y/z#k'])
  assert.deepEqual(datos, { a: 'uno # dos', b: 'C#', url: 'http://x.y/z#k' })
})

for (const [nombre, yaml, mensaje] of [
  ['cabecera sin cerrar', '---\nid: X\n', /no se cierra/],
  ['tabuladores', '---\nputs:\n\tqa: x\n---', /tabuladores/],
  ['clave repetida', '---\nid: A\nid: B\n---', /clave repetida: id/],
  ['__proto__', '---\n__proto__: x\n---', /clave no permitida/],
  ['__proto__ en línea', '---\np: { __proto__: x }\n---', /clave no permitida/],
  ['sangría rota', '---\na: 1\n   b: 2\n---', /sangría inesperada/],
  ['bloque literal', '---\na: |\n  texto\n---', /no admitida/],
  ['ancla', '---\na: &x 1\n---', /no admitida/],
  ['comillas sin cerrar', '---\na: "hola\n---', /comillas/],
  ['anidado en línea', '---\na: { b: [1] }\n---', /anidados/],
  ['cabecera que no es mapa', '---\n- a\n- b\n---', /mapa/],
  ['línea suelta', '---\nid: A\ntexto suelto\n---', /clave: valor/],
]) {
  test(`rechaza: ${nombre}`, () => {
    assert.throws(() => leerCabecera(yaml), err => err instanceof ErrorCabecera && mensaje.test(err.message))
  })
}

test('el error indica la línea del fichero', () => {
  assert.throws(() => leerCabecera('---\nid: A\nid: B\n---'), err => err.linea === 3)
})
