/* Sala de Operações · Modo lista, filtro da atividade recente e teclado (Fase 7, 15/10/2026).
   Modo lista: as mesmas estações numa tabela ordenável (estado, nome, sala, responsável, última, hoje, período, sucesso, consumo),
   com EXPORTAR CSV (ponto e vírgula, para o Excel em português), boa para celular,
   leitor de tela e para achar uma estação rápido. Chave OFFICE | LISTA no cabeçalho (a opção ativa fica acesa) ou ?lista=1;
   fica salvo no navegador.
   Teclado: Tab percorre as estações da planta (e as linhas da lista); Enter ou espaço abre o detalhe; Esc fecha. */
let FEEDF=(()=>{try{return localStorage.getItem('sala_feed')==='excecoes'?'excecoes':'tudo'}catch(e){return 'tudo'}})();
let LSORT={k:'est',d:1};
const ORDEM_EST={error:0,stuck:1,late:2,running:3,ok:4,idle:5,manut:6};
function estOrd(it){return it.status==='manut'?6:it.status==='error'?0:(it.status==='running'&&it.sem_acao_s>=300)?1:atrasado(it)?2:ORDEM_EST[it.status]??5}
function ultTs(it){return it.kind==='cron'?(it.last_run||'').replace('T',' ').slice(0,19):(it.last?it.last.ts:'')}
function renderLista(s){
  if(!document.body.classList.contains('lista')||!s)return;
  const zt=id=>((s.layout.zones.find(z=>z.id===id))||{}).title||'';
  const L=[...s.agents,...s.crons].map(it=>({it,est:estOrd(it),nome:label(it.id),sala:zt(it.setor),ult:ultTs(it),hoje:it.kind==='cron'?(it.work_today||0):(it.runs_today||0),
    sem:(it.tendencia||[]).reduce((a,x)=>a+x[0],0),tok:(it.custo||{}).tokens||0,resp:it.responsavel||'',suc:(it.sucesso||{}).pct??-1}));
  const k=LSORT.k, d=LSORT.d;
  L.sort((a,b)=>{const va=a[k],vb=b[k];return (typeof va==='string'?va.localeCompare(vb,LOCALE):va-vb)*d||a.est-b.est||a.nome.localeCompare(b.nome,LOCALE)});
  const cls=['error','stuck','stuck','running','ok','idle','manut'], txt=LISTA_EST, P=s.periodo_dias||7;
  const col=(id,t,tt)=>`<th scope="col" aria-sort="${LSORT.k===id?(LSORT.d>0?'ascending':'descending'):'none'}"><button data-k="${id}" title="${tt||T('Ordenar','Sort')}">${t}${LSORT.k===id?(LSORT.d>0?' ▲':' ▼'):''}</button></th>`;
  $('lista').innerHTML=`<table><caption>${T('Estações','Stations')} (${L.length}) · ${T('clique no título da coluna para ordenar · Enter abre o detalhe','click a column title to sort · Enter opens the details')} <button id="csv" title="${T('Baixa esta tabela (com o período de '+P+' dias) num arquivo CSV que abre no Excel','Downloads this table (for the '+P+'-day period) as a CSV file that opens in Excel')}">${T('EXPORTAR CSV','EXPORT CSV')}</button></caption><thead><tr>`+
    col('est',T('Estado','State'))+col('nome',T('Estação','Station'))+col('sala',T('Sala','Room'))+col('resp',T('Responsável','Owner'))+col('ult',T('Última','Last'),T('Ordenar pela última execução','Sort by last run'))+col('hoje',T('Hoje','Today'))+col('sem',P+T(' dias',' days'),T('Execuções nos últimos '+P+' dias','Runs in the last '+P+' days'))+col('suc',T('Sucesso','Success'),T('Execuções OK ÷ execuções nos últimos '+P+' dias (fora das janelas de manutenção)','OK runs ÷ runs in the last '+P+' days (outside maintenance windows)'))+col('tok',T('Consumo ','Usage ')+P+' d',T('Tokens dos últimos '+P+' dias (agentes)','Tokens in the last '+P+' days (agents)'))+
    `</tr></thead><tbody>`+L.map(r=>{const it=r.it;
      const ult=r.ult?fmtTs(r.ult)+(it.last&&it.last.dur!=null&&it.kind!=='cron'?' · '+fmtDur(it.last.dur):''):'—';
      return `<tr tabindex="0" data-id="${esc(it.id)}" class="${SEL===it.id?'sel':''}" aria-label="${esc(r.nome)}: ${esc(estadoTxt(it))}"><td><span class="chip ${cls[r.est]}">${txt[r.est]}</span></td><td class="nm">${esc(r.nome)}${it.kind==='cron'?' <small>job</small>':''}</td><td>${esc(r.sala)}</td><td>${esc(r.resp||'—')}</td><td>${ult}</td><td>${r.hoje||'<span class="z">0</span>'}</td><td>${spark(it.tendencia,56,14)} ${r.sem||''}</td><td>${r.suc<0?'—':`<span${it.sucesso.falhas?' style="color:var(--red)"':''}>${fmtPct(r.suc)}</span>`}</td><td>${it.custo?fmtTok(r.tok):'—'}</td></tr>`}).join('')+`</tbody></table>`;
}
const LISTA_EST=EN?['FAILED','NO ACTIVITY','LATE','RUNNING','OK','NO HISTORY','MAINTENANCE']:['FALHA','SEM AÇÃO','ATRASADO','RODANDO','OK','SEM HISTÓRICO','MANUTENÇÃO'];
/* EXPORTAR CSV: a tabela inteira (todas as estações, sem filtro), período do CONFIGURAR. Ponto e vírgula e vírgula decimal
   (Excel em português; em inglês, vírgula e ponto), BOM UTF-8 para os acentos; texto que começa com = + @ ganha apóstrofo (não vira fórmula). */
function csvLista(s){
  const P=s.periodo_dias||7, zt=id=>((s.layout.zones.find(z=>z.id===id))||{}).title||'';
  const SEP=EN?',':';', q=v=>{v=v==null?'':String(v);if(/^[=+@]/.test(v))v="'"+v;return /[",;\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}, dec=v=>v==null?'':decTxt(v);
  const H=EN?['Station (id)','Name','Type','Room','Owner','State','Maintenance until','Last run','Runs today','Runs in '+P+' d','Failures in '+P+' d','Success in '+P+' d (%)','Tokens in '+P+' d','Estimated cost in '+P+' d (US$)']:['Estação (id)','Nome','Tipo','Sala','Responsável','Estado','Manutenção até','Última execução','Execuções hoje','Execuções em '+P+' d','Falhas em '+P+' d','Sucesso em '+P+' d (%)','Tokens em '+P+' d','Custo estimado em '+P+' d (US$)'];
  const L=[...s.agents,...s.crons].map(it=>{const su=it.sucesso||{}, c=it.custo;
    return [it.id,label(it.id),it.kind==='cron'?'job':T('agente','agent'),zt(it.setor),it.responsavel||'',LISTA_EST[estOrd(it)],it.manutencao?it.manutencao.ate:'',ultTs(it),
      it.kind==='cron'?(it.work_today||0):(it.runs_today||0),su.execucoes??'',su.falhas??'',dec(su.pct),c?c.tokens:'',c?dec(c.custo_usd):''].map(q).join(SEP)});
  return '\ufeff'+[H.map(q).join(SEP),...L].join('\r\n')+'\r\n';
}
function csvBaixar(){
  if(!STATE)return; const d=new Date(), a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csvLista(STATE)],{type:'text/csv;charset=utf-8'}));
  a.download='sala_operacoes_'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+(STATE.periodo_dias||7)+'d.csv';
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0);
}
/* Chave OFFICE | LISTA | JOBS: uma visão por vez (classes lista/jobs no body), salva no navegador (sala_visao). */
let VISAO='office';
function visaoLigar(v){
  VISAO=v==='lista'||v==='jobs'?v:'office';
  document.body.classList.toggle('lista',VISAO==='lista'); document.body.classList.toggle('jobs',VISAO==='jobs');
  try{localStorage.setItem('sala_visao',VISAO);localStorage.removeItem('sala_lista')}catch(e){}
  document.querySelectorAll('#visao button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===VISAO)));
  if(VISAO==='lista')renderLista(STATE); else if(VISAO==='jobs'){JKEY='';renderJobs(STATE)} else setTimeout(()=>window.dispatchEvent(new Event('resize')),0);
}
function listaLigar(on){visaoLigar(on?'lista':'office')}
function limparSel(){SEL=null;document.querySelectorAll('.st.selected').forEach(e=>e.classList.remove('selected'));
  $('detail').innerHTML='<h2>'+T('Estação','Station')+'</h2><div class="empty">'+T('Selecione uma estação (ou o funcionário dela) para ver modelo, histórico e agenda.','Select a station (or its employee) to see the model, history and schedule.')+'</div>';renderLista(STATE)}
(function(){
  $('visao').addEventListener('click',e=>{const b=e.target.closest('button[data-v]');if(b)visaoLigar(b.dataset.v)});
  $('lista').addEventListener('click',e=>{if(e.target.closest('#csv')){csvBaixar();return}
    const b=e.target.closest('th button');
    if(b){const k=b.dataset.k;LSORT=LSORT.k===k?{k,d:-LSORT.d}:{k,d:k==='hoje'||k==='sem'||k==='tok'||k==='ult'?-1:1};renderLista(STATE);const nb=$('lista').querySelector(`th button[data-k="${k}"]`);if(nb)nb.focus();return}
    const r=e.target.closest('tr[data-id]'); if(r){select(r.dataset.id);renderLista(STATE)}});
  $('feedf').addEventListener('click',e=>{const b=e.target.closest('button[data-f]');if(!b)return;FEEDF=b.dataset.f;try{localStorage.setItem('sala_feed',FEEDF)}catch(_){}if(STATE)renderFeed(STATE)});
  document.addEventListener('keydown',e=>{
    const t=e.target;
    if((e.key==='Enter'||e.key===' ')&&t&&t.dataset&&t.dataset.id&&(t.matches('.st,tr[data-id],#feedwrap .row'))){e.preventDefault();select(t.dataset.id);if(t.matches('tr'))renderLista(STATE);return}
    if(e.key==='Escape'&&SEL&&!document.querySelector('#cfgmenu.on')&&!(document.getElementById('pop')||{}).classList?.contains('on'))limparSel();
  });
  let v=QS.has('jobs')?'jobs':QS.has('lista')?'lista':null;
  if(!v){try{v=localStorage.getItem('sala_visao')||(localStorage.getItem('sala_lista')==='1'?'lista':null)}catch(e){}}   // sala_lista: versões antes da tela JOBS
  if(v&&v!=='office')setTimeout(()=>visaoLigar(v),0);      // depois do jobs.js carregar
})();
