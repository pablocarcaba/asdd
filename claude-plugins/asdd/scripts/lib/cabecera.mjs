// Lector de cabeceras YAML (front matter) sin dependencias.
//
// Entiende el subconjunto que usa el formato de estado ASDD:
//   - mapas por sangría            clave: valor
//   - listas por sangría           - valor   /   - clave: valor
//   - mapas y listas en línea      { a: b, c: d }   [a, b]
//   - escalares: texto, "comillas", 'simples', números, true/false, null/~
//   - comentarios con #
// Cualquier otra cosa (anclas, bloques | >, etiquetas !) se rechaza con un
// error que indica la línea, para que el agente o la persona lo corrija.

export class ErrorCabecera extends Error {
  constructor(mensaje, linea) {
    super(linea ? `línea ${linea}: ${mensaje}` : mensaje)
    this.name = 'ErrorCabecera'
    this.linea = linea
  }
}

const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Separa la cabecera del cuerpo de un Markdown.
 * @returns {{ datos: object, lineas: number } | null} null si no hay cabecera
 */
export function leerCabecera(texto) {
  const lineas = String(texto).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)
  if (lineas[0].trimEnd() !== '---') return null
  let fin = -1
  for (let i = 1; i < lineas.length; i++) {
    const l = lineas[i].trimEnd()
    if (l === '---' || l === '...') {
      fin = i
      break
    }
  }
  if (fin === -1) throw new ErrorCabecera('la cabecera YAML no se cierra con ---', 1)
  const datos = parsearYaml(lineas.slice(1, fin), 2)
  if (datos !== null && (typeof datos !== 'object' || Array.isArray(datos))) {
    throw new ErrorCabecera('la cabecera debe ser un mapa clave: valor', 2)
  }
  return { datos: datos ?? {}, lineas: fin + 1 }
}

/** Parsea líneas YAML (subconjunto). `primera` es el número de la primera línea. */
export function parsearYaml(lineas, primera = 1) {
  const fichas = []
  lineas.forEach((bruta, i) => {
    const n = primera + i
    const sinComentario = quitarComentario(bruta, n)
    if (sinComentario.trim() === '') return
    const sangria = sinComentario.match(/^[ \t]*/)[0]
    if (sangria.includes('\t')) throw new ErrorCabecera('usa espacios, no tabuladores, para sangrar', n)
    fichas.push({ sangria: sangria.length, texto: sinComentario.slice(sangria.length), n })
  })
  if (fichas.length === 0) return null
  const [valor, pos] = parsearBloque(fichas, 0, fichas[0].sangria)
  if (pos < fichas.length) throw new ErrorCabecera('sangría inesperada', fichas[pos].n)
  return valor
}

function esElemento(texto) {
  return texto === '-' || texto.startsWith('- ')
}

function parsearBloque(fichas, pos, sangria) {
  return esElemento(fichas[pos].texto)
    ? parsearLista(fichas, pos, sangria)
    : parsearMapa(fichas, pos, sangria)
}

function parsearMapa(fichas, pos, sangria) {
  const mapa = {}
  while (pos < fichas.length) {
    const f = fichas[pos]
    if (f.sangria < sangria) break
    if (f.sangria > sangria) throw new ErrorCabecera('sangría inesperada', f.n)
    if (esElemento(f.texto)) break
    const entrada = partirEntrada(f.texto)
    if (!entrada) throw new ErrorCabecera(`se esperaba "clave: valor" y hay "${f.texto}"`, f.n)
    const { clave, resto } = entrada
    if (CLAVES_PROHIBIDAS.has(clave)) throw new ErrorCabecera(`clave no permitida: ${clave}`, f.n)
    if (Object.hasOwn(mapa, clave)) throw new ErrorCabecera(`clave repetida: ${clave}`, f.n)
    pos++
    if (resto !== '') {
      mapa[clave] = parsearValorEnLinea(resto, f.n)
      continue
    }
    const sig = fichas[pos]
    if (sig && sig.sangria > sangria) {
      ;[mapa[clave], pos] = parsearBloque(fichas, pos, sig.sangria)
    } else if (sig && sig.sangria === sangria && esElemento(sig.texto)) {
      // YAML admite la lista a la misma sangría que su clave.
      ;[mapa[clave], pos] = parsearLista(fichas, pos, sangria)
    } else {
      mapa[clave] = null
    }
  }
  return [mapa, pos]
}

function parsearLista(fichas, pos, sangria) {
  const lista = []
  while (pos < fichas.length) {
    const f = fichas[pos]
    if (f.sangria < sangria) break
    if (f.sangria > sangria) throw new ErrorCabecera('sangría inesperada', f.n)
    if (!esElemento(f.texto)) break
    const resto = f.texto.slice(1).trimStart()
    if (resto === '') {
      pos++
      const sig = fichas[pos]
      if (sig && sig.sangria > sangria) {
        let valor
        ;[valor, pos] = parsearBloque(fichas, pos, sig.sangria)
        lista.push(valor)
      } else {
        lista.push(null)
      }
    } else if (!/^[{["']/.test(resto) && partirEntrada(resto)) {
      // "- clave: valor" abre un mapa cuya sangría es la del texto tras el guion.
      const desplazamiento = f.texto.length - resto.length
      fichas[pos] = { ...f, sangria: f.sangria + desplazamiento, texto: resto }
      let valor
      ;[valor, pos] = parsearMapa(fichas, pos, f.sangria + desplazamiento)
      lista.push(valor)
    } else {
      lista.push(parsearValorEnLinea(resto, f.n))
      pos++
    }
  }
  return [lista, pos]
}

/** "clave: resto" → { clave, resto }, o null si la línea no es una entrada. */
function partirEntrada(texto) {
  let clave
  let i
  if (texto[0] === '"' || texto[0] === "'") {
    const cierre = texto.indexOf(texto[0], 1)
    if (cierre === -1) return null
    clave = texto.slice(1, cierre)
    i = cierre + 1
    if (texto[i] !== ':') return null
  } else {
    const m = texto.match(/^([^:{}[\],#&*!|>'"%@`][^:]*?)\s*:(?=\s|$)/)
    if (!m) return null
    clave = m[1]
    i = m[0].length - 1
  }
  if (texto[i + 1] !== undefined && texto[i + 1] !== ' ') return null
  return { clave: clave.trim(), resto: texto.slice(i + 1).trim() }
}

function parsearValorEnLinea(texto, n) {
  if (texto.startsWith('{')) {
    if (!texto.endsWith('}')) throw new ErrorCabecera('falta cerrar }', n)
    const mapa = {}
    for (const parte of partirPorComas(texto.slice(1, -1), n)) {
      const entrada = partirEntrada(parte) ?? (parte.endsWith(':') ? { clave: parte.slice(0, -1).trim(), resto: '' } : null)
      if (!entrada) throw new ErrorCabecera(`se esperaba "clave: valor" dentro de { } y hay "${parte}"`, n)
      if (CLAVES_PROHIBIDAS.has(entrada.clave)) throw new ErrorCabecera(`clave no permitida: ${entrada.clave}`, n)
      if (Object.hasOwn(mapa, entrada.clave)) throw new ErrorCabecera(`clave repetida: ${entrada.clave}`, n)
      mapa[entrada.clave] = entrada.resto === '' ? null : parsearEscalar(entrada.resto, n)
    }
    return mapa
  }
  if (texto.startsWith('[')) {
    if (!texto.endsWith(']')) throw new ErrorCabecera('falta cerrar ]', n)
    return partirPorComas(texto.slice(1, -1), n).map(p => parsearEscalar(p, n))
  }
  return parsearEscalar(texto, n)
}

function partirPorComas(texto, n) {
  const partes = []
  let actual = ''
  let comilla = null
  for (const c of texto) {
    if (comilla) {
      actual += c
      if (c === comilla) comilla = null
    } else if (c === '"' || c === "'") {
      comilla = c
      actual += c
    } else if (c === '{' || c === '[') {
      throw new ErrorCabecera('no se admiten mapas o listas anidados en línea', n)
    } else if (c === ',') {
      partes.push(actual.trim())
      actual = ''
    } else {
      actual += c
    }
  }
  if (comilla) throw new ErrorCabecera('comillas sin cerrar', n)
  if (actual.trim() !== '') partes.push(actual.trim())
  else if (partes.length > 0) throw new ErrorCabecera('coma sobrante', n)
  return partes
}

function parsearEscalar(texto, n) {
  const t = texto.trim()
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new ErrorCabecera('comillas sin cerrar', n)
    try {
      return JSON.parse(t)
    } catch {
      throw new ErrorCabecera(`texto entre comillas no válido: ${t}`, n)
    }
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new ErrorCabecera('comillas sin cerrar', n)
    const dentro = t.slice(1, -1)
    if (/(^|[^'])'([^']|$)/.test(dentro)) throw new ErrorCabecera(`texto entre comillas no válido: ${t}`, n)
    return dentro.replace(/''/g, "'")
  }
  if (/^[&*!|>%@`]/.test(t)) throw new ErrorCabecera(`sintaxis YAML no admitida: ${t}`, n)
  if (t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null
  if (t === 'true' || t === 'True' || t === 'TRUE') return true
  if (t === 'false' || t === 'False' || t === 'FALSE') return false
  if (/^[-+]?\d+$/.test(t)) return Number(t)
  if (/^[-+]?(\d+\.\d*|\.\d+)$/.test(t)) return Number(t)
  return t
}

function quitarComentario(linea, n) {
  let comilla = null
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (comilla) {
      if (c === comilla) comilla = null
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s:\-[{,]/.test(linea[i - 1]))) {
      comilla = c
    } else if (c === '#' && (i === 0 || /\s/.test(linea[i - 1]))) {
      return linea.slice(0, i).trimEnd()
    }
  }
  return linea.trimEnd()
}
