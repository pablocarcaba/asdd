// Dashboard web en solo lectura: un HTML estático con el estado incrustado.
// Sin servidor, sin peticiones de red (CSP default-src 'none') y sin editor:
// las specs solo cambian en git.

import crypto from 'node:crypto'

const ESTILO = `
:root{--fondo:#f7f7f5;--panel:#fff;--texto:#1d1d1b;--suave:#6b6b66;--borde:#e2e2dc;
--borrador:#8a8a84;--validada:#2f6fb3;--aprobada:#7a4fb8;--en_curso:#b7791f;--implementada:#2f855a;
--pasada:#2f855a;--avisos:#b7791f;--bloqueada:#c53030;--pendiente:#8a8a84;--no_aplica:#b5b5ae}
@media (prefers-color-scheme:dark){:root{--fondo:#161615;--panel:#1f1f1d;--texto:#ecece8;--suave:#a3a39c;
--borde:#33332f;--borrador:#9a9a93;--validada:#6aa5e8;--aprobada:#b18ee6;--en_curso:#e0a84a;--implementada:#5cc28c;
--pasada:#5cc28c;--avisos:#e0a84a;--bloqueada:#f07171;--pendiente:#9a9a93;--no_aplica:#6b6b66}}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);
font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 10px}
.suave{color:var(--suave);font-size:13px}
.pipeline{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.fase{flex:1 1 140px;background:var(--panel);border:1px solid var(--borde);border-top:4px solid var(--c);
border-radius:8px;padding:10px 12px}
.fase b{display:block;font-size:26px}
.filtros{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
select{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--borde);background:var(--panel);color:var(--texto)}
.tabla{overflow-x:auto;background:var(--panel);border:1px solid var(--borde);border-radius:8px}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--borde);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--suave)}
tr:last-child td{border-bottom:0}
.chip{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--c);color:var(--c);white-space:nowrap}
.puertas{display:flex;gap:4px;flex-wrap:wrap}
ul{margin:0;padding-left:18px}.vacio{color:var(--suave);padding:12px}
`

const GUION = `
(function(){
var d=JSON.parse(document.getElementById('datos').textContent);
var NOMBRE={borrador:'Borrador',validada:'Validada',aprobada:'Aprobada',en_curso:'En curso',implementada:'Implementada'};
var PUERTA={validacion:'Validación',qa:'QA',seguridad:'Seguridad',accesibilidad:'Accesibilidad'};
function el(t,txt,cls){var e=document.createElement(t);if(txt!=null)e.textContent=txt;if(cls)e.className=cls;return e}
function chip(txt,clave){var c=el('span',txt,'chip');c.style.setProperty('--c','var(--'+clave+')');return c}
document.getElementById('generado').textContent='Generado: '+new Date(d.generado).toLocaleString('es');
var p=document.getElementById('pipeline');
d.fases.forEach(function(f,i){var c=el('div',null,'fase');c.style.setProperty('--c','var(--'+f.estado+')');
c.appendChild(el('span',(i+1)+'. '+NOMBRE[f.estado],'suave'));c.appendChild(el('b',String(f.specs)));
var t=d.resumen.tareas.porEstado[f.estado];c.appendChild(el('span',t+' tarea'+(t===1?'':'s'),'suave'));p.appendChild(c)});
if(d.resumen.sinEstado)p.appendChild((function(){var c=el('div',null,'fase');c.style.setProperty('--c','var(--bloqueada)');
c.appendChild(el('span','Sin estado','suave'));c.appendChild(el('b',String(d.resumen.sinEstado)));return c})());
var fe=document.getElementById('f-estado'),fn=document.getElementById('f-nivel');
function pinta(){var tb=document.getElementById('specs');tb.textContent='';
var lista=d.specs.filter(function(s){return(!fe.value||(s.estado||'')===fe.value)&&(!fn.value||s.nivel===fn.value)});
if(!lista.length){var tr=el('tr');var td=el('td','No hay specs con ese filtro.','vacio');td.colSpan=6;tr.appendChild(td);tb.appendChild(tr);return}
lista.forEach(function(s){var tr=el('tr');tr.appendChild(el('td',s.id||'—'));
var tt=el('td');tt.appendChild(el('div',s.titulo));tt.appendChild(el('div',s.carpeta,'suave'));tr.appendChild(tt);
var te=el('td');te.appendChild(s.estado?chip(NOMBRE[s.estado],s.estado):chip('sin estado','bloqueada'));tr.appendChild(te);
tr.appendChild(el('td',s.nivel||'—'));
var tp=el('td');var pu=el('div',null,'puertas');Object.keys(s.puertas).forEach(function(k){pu.appendChild(chip((PUERTA[k]||k)+': '+s.puertas[k].replace('_',' '),s.puertas[k]))});tp.appendChild(pu);tr.appendChild(tp);
var ta=el('td');var hechas=s.tareas.porEstado.implementada;ta.appendChild(el('div',s.tareas.total?hechas+' / '+s.tareas.total+' implementadas':'—'));
if(s.tareas.fallidas)ta.appendChild(chip(s.tareas.fallidas+' fallida'+(s.tareas.fallidas===1?'':'s'),'bloqueada'));
var ab=(s.tareas.porOla||[]).filter(function(o){return o.implementadas<o.total});
if((s.tareas.porOla||[]).length>1)ta.appendChild(el('div',ab.length?'Oleadas abiertas: '+ab.map(function(o){return o.ola+' '+o.implementadas+'/'+o.total}).join(' · '):'Todas las oleadas completas','suave'));
if(s.errores.length)ta.appendChild(el('div',s.errores.length+' aviso'+(s.errores.length===1?'':'s'),'suave'));tr.appendChild(ta);
tb.appendChild(tr)})}
fe.addEventListener('change',pinta);fn.addEventListener('change',pinta);pinta();
var ag=document.getElementById('agentes');
if(!d.agentes.length)ag.appendChild(el('li','Ningún agente en marcha.','suave'));
d.agentes.forEach(function(a){ag.appendChild(el('li',a.tipo+(a.descripcion?' — '+a.descripcion:'')+' (desde '+new Date(a.desde).toLocaleTimeString('es')+')'))});
var av=document.getElementById('avisos');
if(!d.avisos.length)av.appendChild(el('li','Sin avisos.','suave'));
d.avisos.forEach(function(a){av.appendChild(el('li',a.fichero+': '+a.mensaje))});
})();
`

/** JSON seguro dentro de <script>: sin "<" que pueda cerrar la etiqueta. */
function jsonIncrustable(estado) {
  return JSON.stringify(estado).replace(/[<\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

export function generarHtml(estado) {
  const hash = crypto.createHash('sha256').update(GUION).digest('base64')
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`
  const opcionesEstado = ['borrador', 'validada', 'aprobada', 'en_curso', 'implementada']
    .map(e => `<option value="${e}">${e.replace('_', ' ')}</option>`)
    .join('')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Estado ASDD</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
<h1>Estado del pipeline ASDD</h1>
<div class="suave"><span id="generado"></span> · Solo lectura: las specs se cambian en git, con aprobación de la persona.</div>
<div class="pipeline" id="pipeline"></div>
<h2>Specs</h2>
<div class="filtros">
<label>Estado <select id="f-estado"><option value="">todos</option>${opcionesEstado}</select></label>
<label>Nivel <select id="f-nivel"><option value="">todos</option><option>S</option><option>M</option><option>L</option></select></label>
</div>
<div class="tabla"><table>
<thead><tr><th>Id</th><th>Título</th><th>Estado</th><th>Nivel</th><th>Puertas</th><th>Tareas</th></tr></thead>
<tbody id="specs"></tbody>
</table></div>
<h2>Agentes en marcha</h2>
<ul id="agentes"></ul>
<h2>Avisos</h2>
<ul id="avisos"></ul>
</main>
<script type="application/json" id="datos">${jsonIncrustable(estado)}</script>
<script>${GUION}</script>
</body>
</html>
`
}
