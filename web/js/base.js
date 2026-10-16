/* Sala de Operações · Base: parâmetros da URL, constantes da planta, utilitários, sorteio determinístico, formatação, geometria e lista de profundidade.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
// erros de qualquer arquivo da página vão para o diagnóstico (?debug=1); no máximo 50
window.__errs=[]; const errPush=m=>{if(window.__errs.length<50)window.__errs.push(m)};
window.addEventListener('error',e=>errPush(e.message+' @'+String(e.filename||'').split('/').pop()+':'+e.lineno));
const QS = new URLSearchParams(location.search);
const DEMO = QS.has('demo'), DBG = QS.has('debug');
const S=30, H=15, OY=112;
const SHELF_D=.3;                  // profundidade das estantes (un.); o corredor da parede esquerda fica em Lleft = x0+.75
let OX=0, PW=24, PH=16, CORR=14.4;
const NS='http://www.w3.org/2000/svg';
let P=(x,y,z=0)=>   // let (não const): o tema 3D troca P e pts durante a montagem para anotar a coordenada 3D de cada ponto
  [(x-y)*S+OX,(x+y)*H+OY-z];
let pts=a=>a.map(p=>p.map(v=>+v.toFixed(1)).join(',')).join(' ');
const q=(x0,y0,x1,y1,z=0)=>pts([P(x0,y0,z),P(x1,y0,z),P(x1,y1,z),P(x0,y1,z)]);
const $=id=>document.getElementById(id);
const mk=(h,cls)=>{const g=document.createElementNS(NS,'g');if(cls)g.setAttribute('class',cls);g.innerHTML=h;return g};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let VB0=[0,0,1,1], VB=[0,0,1,1];
let STATE=null, SEL=QS.get('sel'), built=false, SIG='';

/* ---------- aleatório determinístico (permite reproduzir uma cena) ---------- */
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const rnd=mulberry(QS.has('seed')?+QS.get('seed'):((Math.random()*4294967296)>>>0));
const rr=(a,b)=>a+rnd()*(b-a);
const pick=a=>a[Math.floor(rnd()*a.length)];
const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};

/* ---------- formatação ---------- */
function modelShort(m){
  if(!m) return '—'; const l=m.toLowerCase();
  let r=l.match(/claude-([a-z]+)-(\d+)-(\d+)/); if(r) return (r[1]+' '+r[2]+'.'+r[3]).toUpperCase();
  if(l.includes('nemotron')){const b=l.match(/(\d+)b/);return 'NEMOTRON'+(b?' '+b[1]+'B':'')}
  return l.split('/').pop().slice(0,16).toUpperCase();
}
const pad=n=>String(n).padStart(2,'0');
const parseTs=s=>s?new Date(s.replace(' ','T')):null;
function fmtTs(s){const d=parseTs(s);if(!d||isNaN(d))return '—';const n=new Date();
  const hm=pad(d.getHours())+':'+pad(d.getMinutes());
  return d.toDateString()===n.toDateString()?hm:pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+hm}
function rel(s){const d=parseTs(s);if(!d||isNaN(d))return '—';const m=Math.max(0,(Date.now()-d)/60000);
  if(m<1)return 'agora';if(m<60)return 'há '+Math.round(m)+' min';if(m<1440)return 'há '+Math.round(m/60)+' h';return 'há '+Math.round(m/1440)+' d'}
function mmss(sec){sec=Math.max(0,Math.floor(sec));return pad(Math.floor(sec/60))+':'+pad(sec%60)}
const STL={running:'EM EXECUÇÃO',ok:'OK',error:'FALHA',idle:'SEM EXEC.',manut:'MANUTENÇÃO'};
// período dos indicadores (CONFIGURAR > Período): o servidor devolve em periodo_dias
const PER=()=>(typeof STATE!=='undefined'&&STATE&&STATE.periodo_dias)||+((typeof CFG!=='undefined'&&CFG.periodo)||7);
const fmtPct=v=>v==null?'—':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
function sucTxt(su){if(!su||!su.execucoes)return 'sem execuções no período'+(su&&su.manutencao?' · '+su.manutencao+' em manutenção (fora da conta)':'');
  return fmtPct(su.pct)+' OK · '+(su.execucoes-su.falhas)+' de '+su.execucoes+(su.falhas?' · <span style="color:var(--red)">'+su.falhas+' falha'+(su.falhas>1?'s':'')+'</span>':'')+(su.manutencao?' · '+su.manutencao+' em manutenção (fora da conta)':'')}
const JSTL={running:'ATENDENDO VOCÊ',ok:'DISPONÍVEL',idle:'DISPONÍVEL',error:'DISPONÍVEL'};
const labelTec=id=>id.replace('cron:govti-','cron · ').replace('office365','o365').replace(/-/g,' ');
// nomes amigáveis: campo "nomes" do layout.json (o servidor manda em "titulo"); CONFIGURAR > Nomes > Técnicos volta ao id
let TITULOS={};
function titulosDe(s){const t={};[...(s.agents||[]),...(s.crons||[])].forEach(x=>{if(x.titulo)t[x.id]=x.titulo});return t}
const label=id=>(typeof CFG!=='undefined'&&CFG.nomes==='tecnicos'?'':TITULOS[id])||labelTec(id);
const fmtDur=s=>s==null?'':s<60?Math.round(s)+' s':s<3600?Math.round(s/60)+' min':(s/3600).toFixed(1).replace('.',',')+' h';
const fmtTok=n=>n>=1e6?(n/1e6).toFixed(1).replace('.',',')+' mi':n>=1e3?Math.round(n/1e3)+' mil':String(n||0);

/* ---------- geometria ---------- */
function box(x0,y0,x1,y1,z0,z1,top,l,r,extra=''){
  return `<polygon points="${q(x0,y0,x1,y1,z1)}" fill="${top}" stroke="#2A3A4B" stroke-width=".8" ${extra}/>
  <polygon points="${pts([P(x0,y1,z0),P(x1,y1,z0),P(x1,y1,z1),P(x0,y1,z1)])}" fill="${l}" stroke="#2A3A4B" stroke-width=".8"/>
  <polygon points="${pts([P(x1,y0,z0),P(x1,y1,z0),P(x1,y1,z1),P(x1,y0,z1)])}" fill="${r}" stroke="#2A3A4B" stroke-width=".8"/>`;
}
const plY=(x0,x1,y,z0,z1)=>pts([P(x0,y,z0),P(x1,y,z0),P(x1,y,z1),P(x0,y,z1)]);      // plano y=const
const plX=(x,y0,y1,z0,z1)=>pts([P(x,y0,z0),P(x,y1,z0),P(x,y1,z1),P(x,y0,z1)]);      // plano x=const

/* ---------- mundo: itens estáticos + funcionários, ordenados por profundidade ---------- */
const WORLD={el:null,items:[]};
let CURZ=null;                     // sala em construção (vai para cada item: os testes do ?debug=1 usam)
function addItem(key,node,tag){node.dataset.k=key;const it={key,node,tag:tag||'',z:CURZ};WORLD.items.push(it);WORLD.el.appendChild(node);return it}
function dropItem(it){it.node.remove();const i=WORLD.items.indexOf(it);if(i>=0)WORLD.items.splice(i,1)}
function sortWorld(){
  const arr=WORLD.items.slice().sort((a,b)=>a.key-b.key);
  for(let i=0;i<arr.length;i++){const n=arr[i].node;if(WORLD.el.children[i]!==n)WORLD.el.insertBefore(n,WORLD.el.children[i]||null)}
}
