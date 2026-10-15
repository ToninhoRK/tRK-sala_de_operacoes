/* Sala de Operações · Modo lista, filtro da atividade recente e teclado (Fase 7, 15/10/2026).
   Modo lista: as mesmas estações numa tabela ordenável (estado, nome, sala, última, hoje, 7 dias, consumo), boa para celular,
   leitor de tela e para achar uma estação rápido. Chave OFFICE | LISTA no cabeçalho (a opção ativa fica acesa) ou ?lista=1;
   fica salvo no navegador.
   Teclado: Tab percorre as estações da planta (e as linhas da lista); Enter ou espaço abre o detalhe; Esc fecha. */
let FEEDF=(()=>{try{return localStorage.getItem('sala_feed')==='excecoes'?'excecoes':'tudo'}catch(e){return 'tudo'}})();
let LSORT={k:'est',d:1};
const ORDEM_EST={error:0,stuck:1,late:2,running:3,ok:4,idle:5};
function estOrd(it){return it.status==='error'?0:(it.status==='running'&&it.sem_acao_s>=300)?1:atrasado(it)?2:ORDEM_EST[it.status]??5}
function ultTs(it){return it.kind==='cron'?(it.last_run||'').replace('T',' ').slice(0,19):(it.last?it.last.ts:'')}
function renderLista(s){
  if(!document.body.classList.contains('lista')||!s)return;
  const zt=id=>((s.layout.zones.find(z=>z.id===id))||{}).title||'';
  const L=[...s.agents,...s.crons].map(it=>({it,est:estOrd(it),nome:label(it.id),sala:zt(it.setor),ult:ultTs(it),hoje:it.kind==='cron'?(it.work_today||0):(it.runs_today||0),
    sem:(it.tendencia||[]).reduce((a,x)=>a+x[0],0),tok:(it.custo_7d||{}).tokens||0}));
  const k=LSORT.k, d=LSORT.d;
  L.sort((a,b)=>{const va=a[k],vb=b[k];return (typeof va==='string'?va.localeCompare(vb,'pt-BR'):va-vb)*d||a.est-b.est||a.nome.localeCompare(b.nome,'pt-BR')});
  const cls=['error','stuck','stuck','running','ok','idle'], txt=['FALHA','SEM AÇÃO','ATRASADO','RODANDO','OK','SEM HISTÓRICO'];
  const col=(id,t,tt)=>`<th scope="col" aria-sort="${LSORT.k===id?(LSORT.d>0?'ascending':'descending'):'none'}"><button data-k="${id}" title="${tt||'Ordenar'}">${t}${LSORT.k===id?(LSORT.d>0?' ▲':' ▼'):''}</button></th>`;
  $('lista').innerHTML=`<table><caption>Estações (${L.length}) · clique no título da coluna para ordenar · Enter abre o detalhe</caption><thead><tr>`+
    col('est','Estado')+col('nome','Estação')+col('sala','Sala')+col('ult','Última','Ordenar pela última execução')+col('hoje','Hoje')+col('sem','7 dias')+col('tok','Consumo 7 d','Tokens dos últimos 7 dias (agentes)')+
    `</tr></thead><tbody>`+L.map(r=>{const it=r.it;
      const ult=r.ult?fmtTs(r.ult)+(it.last&&it.last.dur!=null&&it.kind!=='cron'?' · '+fmtDur(it.last.dur):''):'—';
      return `<tr tabindex="0" data-id="${esc(it.id)}" class="${SEL===it.id?'sel':''}" aria-label="${esc(r.nome)}: ${esc(estadoTxt(it))}"><td><span class="chip ${cls[r.est]}">${txt[r.est]}</span></td><td class="nm">${esc(r.nome)}${it.kind==='cron'?' <small>job</small>':''}</td><td>${esc(r.sala)}</td><td>${ult}</td><td>${r.hoje||'<span class="z">0</span>'}</td><td>${spark(it.tendencia,56,14)} ${r.sem||''}</td><td>${it.custo_7d?fmtTok(r.tok):'—'}</td></tr>`}).join('')+`</tbody></table>`;
}
function listaLigar(on){
  document.body.classList.toggle('lista',on); try{localStorage.setItem('sala_lista',on?'1':'0')}catch(e){}
  document.querySelectorAll('#visao button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.v==='lista')===on))); if(on)renderLista(STATE); else setTimeout(()=>window.dispatchEvent(new Event('resize')),0);
}
function limparSel(){SEL=null;document.querySelectorAll('.st.selected').forEach(e=>e.classList.remove('selected'));
  $('detail').innerHTML='<h2>Estação</h2><div class="empty">Selecione uma estação (ou o funcionário dela) para ver modelo, histórico e agenda.</div>';renderLista(STATE)}
(function(){
  $('visao').addEventListener('click',e=>{const b=e.target.closest('button[data-v]');if(b)listaLigar(b.dataset.v==='lista')});
  $('lista').addEventListener('click',e=>{const b=e.target.closest('th button');
    if(b){const k=b.dataset.k;LSORT=LSORT.k===k?{k,d:-LSORT.d}:{k,d:k==='hoje'||k==='sem'||k==='tok'||k==='ult'?-1:1};renderLista(STATE);const nb=$('lista').querySelector(`th button[data-k="${k}"]`);if(nb)nb.focus();return}
    const r=e.target.closest('tr[data-id]'); if(r){select(r.dataset.id);renderLista(STATE)}});
  $('feedf').addEventListener('click',e=>{const b=e.target.closest('button[data-f]');if(!b)return;FEEDF=b.dataset.f;try{localStorage.setItem('sala_feed',FEEDF)}catch(_){}if(STATE)renderFeed(STATE)});
  document.addEventListener('keydown',e=>{
    const t=e.target;
    if((e.key==='Enter'||e.key===' ')&&t&&t.dataset&&t.dataset.id&&(t.matches('.st,tr[data-id],#feedwrap .row'))){e.preventDefault();select(t.dataset.id);if(t.matches('tr'))renderLista(STATE);return}
    if(e.key==='Escape'&&SEL&&!document.querySelector('#cfgmenu.on')&&!(document.getElementById('pop')||{}).classList?.contains('on'))limparSel();
  });
  let on=QS.has('lista'); if(!on){try{on=localStorage.getItem('sala_lista')==='1'}catch(e){}}
  if(on)listaLigar(true);
})();
