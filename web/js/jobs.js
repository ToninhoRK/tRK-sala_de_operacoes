/* Sala de Operações · Tela JOBS (16/10/2026): os jobs agendados numa página só. Terceira opção da chave
   OFFICE | LISTA | JOBS no cabeçalho (ou ?jobs=1); fica salva no navegador. Quatro blocos:
   1. indicadores do período (jobs ativos, execuções, sucesso, falhas, duração média, próxima execução, agora);
   2. próximas execuções nos próximos 7 dias (as próximas em fila + um quadro job × dia com os horários);
   3. histórico em grade: uma linha por job, um quadradinho por dia do período (OK, falha, manutenção, sem execução);
   4. tabela por job, ordenável, com EXPORTAR CSV.
   Só os jobs agendados (os de apoio da própria Sala ficam de fora, como na planta). Dados do /api/state (versão 4):
   agenda_texto, proximas [["AAAA-MM-DD HH:MM", em manutenção]], diario [[OK, falhas, manutenção] | null], duracao
   {media_s, max_s, n, soma_s}, ultimas [[hora, duração s, falhou, manutenção]], sucesso, next_run, last_run.
   O histórico guarda só as execuções que trabalharam (mais de 5 s) ou falharam: as conferências rápidas ("é hora?") não entram. */
let JSORT={k:'nome',d:1}, JKEY='';   // mesma ordem (alfabética) nos três blocos; a tabela pode ser reordenada
const DSEM=EN?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['dom','seg','ter','qua','qui','sex','sáb'];
const jobsLigado=()=>document.body.classList.contains('jobs');
function jEm(ms){const m=Math.max(0,Math.round(ms/60000));if(m<1)return T('agora','now');const em=T('em ','in ');if(m<60)return em+m+' min';const h=Math.floor(m/60);
  if(h<24)return em+h+' h'+(m%60?' '+(m%60)+' min':'');return em+Math.floor(h/24)+' d'+(h%24?' '+(h%24)+' h':'')}
function jDiaRel(d,hoje){const a=new Date(d.getFullYear(),d.getMonth(),d.getDate()),b=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()),n=Math.round((a-b)/864e5);
  return n===0?T('hoje','today'):n===1?T('amanhã','tomorrow'):DSEM[d.getDay()]+' '+diaMes(d)}
const jHora=d=>pad(d.getHours())+':'+pad(d.getMinutes());
// horários de um dia, compactados: 08:00, 09:00 … 18:00 de hora em hora vira "08:00–18:00 · 11×"
function jHorarios(ds){
  if(!ds.length)return '';
  if(ds.length<=3)return ds.map(jHora).join(' · ');
  const p=ds[1]-ds[0], reg=ds.every((d,i)=>!i||d-ds[i-1]===p);
  return jHora(ds[0])+(reg?'–':' … ')+jHora(ds[ds.length-1])+' · '+ds.length+'×';
}
// Nome do job na tela JOBS com a inicial de cada palavra em maiúscula ("Job auditoria vault" -> "Job Auditoria Vault"; 16/10/2026).
// Siglas e maiúsculas do meio ficam (RH, O365, GitHub); conectivos (de, da, do, e...) ficam minúsculos
// fora da 1ª palavra. Com os nomes técnicos (CONFIGURAR) mostra o id como está.
const JMIN=/^(a|o|as|os|e|de|da|do|das|dos|em|na|no|nas|nos|para|por|com)$/i;
function jNome(id){const n=label(id);if(typeof CFG!=='undefined'&&CFG.nomes==='tecnicos')return n;
  return n.split(' ').map((w,i)=>i&&JMIN.test(w)?w.toLowerCase():w.charAt(0).toLocaleUpperCase(LOCALE)+w.slice(1)).join(' ')}
function jobsDados(s){
  return (s.crons||[]).map(c=>{const su=c.sucesso||{}, du=c.duracao||{};
    const prox=(c.proximas||[]).map(([t,m])=>({d:parseTs(t+':00'),m})).filter(x=>x.d&&!isNaN(x.d));
    return {c,nome:jNome(c.id),est:estOrd(c),prox,prox0:prox.length?+prox[0].d:Infinity,ult:(c.last_run||'').replace('T',' ').slice(0,19),
      ag:(EN?c.agenda_en:c.agenda_texto)||c.agenda_texto||c.schedule||'',resp:c.responsavel||'',ex:su.execucoes||0,fa:su.falhas||0,suc:su.pct??-1,
      dm:du.media_s??-1,dx:du.max_s??-1}});
}
function jKpis(s,J){
  const P=s.periodo_dias||7, ativos=J.filter(r=>r.c.enabled!==false&&!r.c.paused).length, pausados=J.length-ativos;
  const ex=J.reduce((a,r)=>a+r.ex,0), fa=J.reduce((a,r)=>a+r.fa,0), mn=J.reduce((a,r)=>a+((r.c.sucesso||{}).manutencao||0),0);
  const n=J.reduce((a,r)=>a+((r.c.duracao||{}).n||0),0), soma=J.reduce((a,r)=>a+((r.c.duracao||{}).soma_s||0),0);
  const mx=J.reduce((m,r)=>r.dx>(m?m.dx:-1)?r:m,null);
  const prox=J.filter(r=>r.prox.length).sort((a,b)=>a.prox0-b.prox0)[0];
  const err=J.filter(r=>r.c.status==='error').length, late=J.filter(r=>atrasado(r.c)).length, run=J.filter(r=>r.c.status==='running').length;
  const pct=ex?Math.round(1000*(ex-fa)/ex)/10:null, agora=new Date();
  const k=(t,v,sub,cls,tt)=>`<div${tt?` title="${esc(tt)}"`:''}><label>${t}</label><b class="${cls||''}">${v}</b><span>${sub||'&nbsp;'}</span></div>`;
  return k(T('Jobs ativos','Active jobs'),ativos,T('de ','of ')+J.length+(pausados?' · '+pausados+T(' pausado'+(pausados>1?'s':''),' paused'):''),ativos?'':'z')+
    k(T('Execuções · ','Runs · ')+P+' d',ex,mn?mn+T(' em manutenção',' under maintenance'):T('que trabalharam ou falharam','that did work or failed'),ex?'':'z',T('Execuções que trabalharam ou falharam no período. Conferências rápidas (só verificam se é hora, menos de 5 s) não contam'+(mn?'. '+mn+' dentro de janelas de manutenção ficam fora da conta':''),'Runs that did work or failed in the period. Quick checks (they only check whether it is time, under 5 s) do not count'+(mn?'. '+mn+' inside maintenance windows are not counted':'')))+
    k(T('Sucesso · ','Success · ')+P+' d',fmtPct(pct),ex?(ex-fa)+T(' de ',' of ')+ex+' OK':T('sem execução no período','no runs in the period'),pct==null?'z':fa?'r':'g',T('Execuções OK ÷ execuções no período, fora das janelas de manutenção','OK runs ÷ runs in the period, outside maintenance windows'))+
    k(T('Falhas · ','Failures · ')+P+' d',fa,fa?J.filter(r=>r.fa).map(r=>r.nome).join(', '):T('nenhuma','none'),fa?'r':'z')+
    k(T('Duração média','Average duration'),n?fmtDur(Math.round(soma/n)):'—',mx&&mx.dx>=0?T('máx. ','max ')+fmtDur(mx.dx)+' · '+mx.nome:T('sem execução com duração','no run with a duration'),n?'':'z',T('Execuções OK no período (as em manutenção ficam de fora)','OK runs in the period (those under maintenance are left out)'))+
    k(T('Próxima execução','Next run'),prox?jDiaRel(prox.prox[0].d,agora)+' '+jHora(prox.prox[0].d):'—',prox?esc(prox.nome)+' · '+jEm(prox.prox0-agora):T('nada agendado em 7 dias','nothing scheduled in 7 days'),prox?'':'z')+
    k(T('Agora','Now'),err||late?(err?err+T(' em falha',' failed'):'')+(err&&late?' · ':'')+(late?late+T(' atrasado'+(late>1?'s':''),' late'):''):run?run+T(' rodando',' running'):T('em dia','on time'),
      run&&(err||late)?run+T(' rodando',' running'):'',err?'r':late?'a':'g');
}
function jProximas(s,J){
  const agora=new Date(), todas=[];
  J.forEach(r=>r.prox.forEach(p=>todas.push({r,p})));
  todas.sort((a,b)=>a.p.d-b.p.d);
  const fila=todas.slice(0,6).map(({r,p})=>`<div data-id="${esc(r.c.id)}" title="${esc(r.ag)}${p.m?T(' · dentro de uma janela de manutenção',' · inside a maintenance window'):''}"><i>${jDiaRel(p.d,agora)} ${jHora(p.d)}</i> ${esc(r.nome)}${p.m?' <span class="chip manut">'+T('MANUT.','MAINT.')+'</span>':''} <small>${jEm(p.d-agora)}</small></div>`).join('');
  const dias=[...Array(7)].map((_,i)=>new Date(agora.getFullYear(),agora.getMonth(),agora.getDate()+i));
  const L=[...J].sort((a,b)=>a.nome.localeCompare(b.nome,LOCALE));
  const linhas=L.map(r=>{
    const cel=dias.map(d=>{const ps=r.prox.filter(p=>p.d.toDateString()===d.toDateString()), m=ps.some(p=>p.m);
      const tt=m?T('Dentro de uma janela de manutenção: falha e atraso não alarmam','Inside a maintenance window: failures and delays raise no alarm'):ps.length?ps.map(p=>jHora(p.d)).join(' · '):d.toDateString()===agora.toDateString()?T('Nenhuma execução restante hoje','No runs left today'):T('Não roda neste dia','Does not run on this day');
      return `<td class="${ps.length?'':'vz'}${m?' mn':''}" title="${tt}">${ps.length?jHorarios(ps.map(p=>p.d)):'—'}</td>`}).join('');
    const parado=r.c.enabled===false||r.c.paused;
    return `<tr data-id="${esc(r.c.id)}" tabindex="0"><td class="nm">${esc(r.nome)}<small>${esc(r.ag)}</small></td>${parado?`<td colspan="7" class="vz">${r.c.paused?T('pausado','paused'):T('desligado','disabled')}${T(': sem execuções agendadas',': no scheduled runs')}</td>`:cel}</tr>`}).join('');
  const cortado=J.some(r=>r.c.proximas_cortadas)?' <small>'+T('(lista cortada em 300 por job)','(list capped at 300 per job)')+'</small>':'';
  return `<div class="jfila">${fila||'<span class="vz">'+T('Nenhuma execução agendada nos próximos 7 dias.','No runs scheduled in the next 7 days.')+'</span>'}</div>`+
    `<div class="jrolar"><table class="jsem"><thead><tr><th>Job</th>${dias.map((d,i)=>`<th>${i<2?jDiaRel(d,agora)+' '+diaMes(d):jDiaRel(d,agora)}</th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>${cortado}`;
}
function jHistorico(s,J){
  const P=s.periodo_dias||7, hoje=new Date(), dia=i=>new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()-(P-1-i));
  const passo=P<=7?1:P<=15?2:P<=30?5:P<=60?10:15;
  const cols=`grid-template-columns:minmax(120px,190px) repeat(${P},minmax(3px,1fr));column-gap:${P>30?2:3}px`;
  const L=[...J].sort((a,b)=>a.nome.localeCompare(b.nome,LOCALE));
  const lin=L.map(r=>{const D=r.c.diario||[];
    return `<div class="jlin" data-id="${esc(r.c.id)}" style="${cols}"><span class="nm" title="${esc(r.ag)}">${esc(r.nome)}</span>`+[...Array(P)].map((_,i)=>{
      const v=D[i], d=dia(i), dt=DSEM[d.getDay()]+' '+diaMes(d);
      if(v==null)return `<i class="sd" title="${dt}: ${T('antes do histórico da Sala','before the room\'s history')}"></i>`;
      const [ok,fa,mn]=v, cls=fa?'fa':ok?'ok':mn?'mn':'';
      const t=[ok?ok+' OK':'',fa?fa+T(' falha'+(fa>1?'s':''),' failure'+(fa>1?'s':'')):'',mn?mn+T(' em manutenção',' under maintenance'):''].filter(Boolean).join(' · ')||T('nenhuma execução registrada','no run recorded');
      return `<i class="${cls}" title="${dt}: ${t}"></i>`}).join('')+`</div>`}).join('');
  const eixo=`<div class="jlin eixo" style="${cols}"><span></span>`+[...Array(P)].map((_,i)=>{const d=dia(i);
    return `<em>${i===P-1?T('hoje','today'):(P-1-i)%passo===0&&P-1-i>=passo/2?diaMes(d):''}</em>`}).join('')+`</div>`;
  const desde=s.kpis&&s.kpis.jobs_dados_desde;
  return `<div class="jgrade">${lin}${eixo}</div><div class="jleg"><span><i class="ok"></i>OK</span><span><i class="fa"></i>${T('FALHA (o dia com falha fica vermelho)','FAILED (a day with a failure turns red)')}</span>`+
    `<span><i class="mn"></i>${T('SÓ EM MANUTENÇÃO','MAINTENANCE ONLY')}</span><span><i></i>${T('SEM EXECUÇÃO REGISTRADA','NO RUN RECORDED')}</span><span><i class="sd"></i>${T('ANTES DO HISTÓRICO','BEFORE HISTORY')}${desde?T(' (dados desde ',' (data since ')+diaMes(desde)+')':''}</span></div>`+
    `<p class="jnota">${T('Conferências rápidas (o job só verifica se é hora, menos de 5 s) não ficam no histórico: um dia cinza pode ter tido conferências sem trabalho.','Quick checks (the job only checks whether it is time, under 5 s) are not kept in the history: a gray day may have had checks with no work.')}</p>`;
}
function jTabela(s,J){
  const P=s.periodo_dias||7, agora=new Date(), k=JSORT.k, d=JSORT.d;
  const L=[...J].sort((a,b)=>{const va=a[k==='prox'?'prox0':k],vb=b[k==='prox'?'prox0':k];
    return (typeof va==='string'?va.localeCompare(vb,LOCALE):(va===vb?0:va>vb?1:-1))*d||a.est-b.est||a.nome.localeCompare(b.nome,LOCALE)});
  const cls=['error','stuck','stuck','running','ok','idle','manut'];
  const col=(id,t,tt)=>`<th scope="col" aria-sort="${k===id?(d>0?'ascending':'descending'):'none'}"><button data-k="${id}" title="${tt||T('Ordenar','Sort')}">${t}${k===id?(d>0?' ▲':' ▼'):''}</button></th>`;
  return `<table class="jtab"><caption>Jobs (${L.length}) · ${T('clique no título da coluna para ordenar · Enter abre o detalhe','click a column title to sort · Enter opens the details')} <button id="jcsv" title="${T('Baixa esta tabela (com o período de '+P+' dias) num arquivo CSV que abre no Excel','Downloads this table (for the '+P+'-day period) as a CSV file that opens in Excel')}">${T('EXPORTAR CSV','EXPORT CSV')}</button></caption><thead><tr>`+
    col('est',T('Estado','State'))+col('nome','Job')+col('ag',T('Agendamento','Schedule'))+col('resp',T('Responsável','Owner'))+col('ult',T('Última','Last'))+col('prox',T('Próxima','Next'))+
    col('ex',P+T(' dias',' days'),T('Execuções que trabalharam ou falharam nos últimos '+P+' dias','Runs that did work or failed in the last '+P+' days'))+col('suc',T('Sucesso','Success'),T('Execuções OK ÷ execuções nos últimos '+P+' dias (fora das janelas de manutenção)','OK runs ÷ runs in the last '+P+' days (outside maintenance windows)'))+
    col('fa',T('Falhas','Failures'))+col('dm',T('Dur. média','Avg. dur.'),T('Duração média das execuções OK no período (fora das janelas de manutenção)','Average duration of OK runs in the period (outside maintenance windows)'))+col('dx',T('Dur. máx.','Max. dur.'),T('Duração da execução OK mais longa no período','Duration of the longest OK run in the period'))+`</tr></thead><tbody>`+
    L.map(r=>{const c=r.c;
      return `<tr tabindex="0" data-id="${esc(c.id)}" class="${SEL===c.id?'sel':''}" aria-label="${esc(r.nome)}: ${esc(estadoTxt(c))}"><td><span class="chip ${cls[r.est]}">${LISTA_EST[r.est]}</span></td>`+
        `<td class="nm">${esc(r.nome)}</td><td class="ag">${esc(r.ag)}</td><td class="rs">${esc(r.resp||'—')}</td><td>${r.ult?fmtTs(r.ult):'—'}</td>`+
        `<td>${r.prox.length?jDiaRel(r.prox[0].d,agora)+' '+jHora(r.prox[0].d)+' <small>'+jEm(r.prox0-agora)+'</small>':'—'}</td>`+
        `<td>${r.ex||'<span class="z">0</span>'}</td><td>${r.suc<0?'—':`<span${r.fa?' style="color:var(--red)"':''}>${fmtPct(r.suc)}</span>`}</td>`+
        `<td>${r.fa?`<span style="color:var(--red)">${r.fa}</span>`:'<span class="z">0</span>'}</td><td>${r.dm<0?'—':fmtDur(r.dm)}</td><td>${r.dx<0?'—':fmtDur(r.dx)}</td></tr>`}).join('')+`</tbody></table>`;
}
function renderJobs(s){
  if(!jobsLigado()||!s)return;
  const P=s.periodo_dias||7, min=Math.floor(Date.now()/60000);
  const chave=JSON.stringify([min,P,JSORT,SEL,typeof CFG!=='undefined'?CFG.nomes:'',s.kpis&&s.kpis.jobs_dados_desde,
    (s.crons||[]).map(c=>[c.id,c.status,c.atrasado_s?1:0,c.paused,c.enabled,c.last_run,c.proximas,c.diario,c.sucesso,c.duracao,c.manutencao,c.responsavel,c.titulo])]);
  if(chave===JKEY)return; JKEY=chave;     // a chave inclui ordenação, seleção e o minuto (contagem regressiva), não só os dados
  const J=jobsDados(s);
  if(!J.length){$('jobs').innerHTML='<p class="vz" style="padding:20px 0">'+T('Nenhum job agendado.','No scheduled jobs.')+'</p>';return}
  $('jobs').innerHTML=`<section id="jb-kpi"><h3>${T('Indicadores dos jobs','Job indicators')} <small>${T('últimos '+P+' dias · período no CONFIGURAR','last '+P+' days · period in SETTINGS')}</small></h3><div class="jkpis">${jKpis(s,J)}</div></section>`+
    `<section id="jb-prox"><h3>${T('Próximas execuções','Upcoming runs')} <small>${T('próximos 7 dias, pelo agendamento de cada job','next 7 days, from each job\'s schedule')}</small></h3>${jProximas(s,J)}</section>`+
    `<section id="jb-hist"><h3>${T('Histórico','History')} <small>${T('um quadradinho por dia · últimos '+P+' dias · hoje à direita','one square per day · last '+P+' days · today on the right')}</small></h3>${jHistorico(s,J)}</section>`+
    `<section id="jb-tab"><h3>${T('Por job','Per job')}</h3><div class="jrolar">${jTabela(s,J)}</div></section>`;
}
/* EXPORTAR CSV da tela JOBS: mesmas regras do da lista (português: ponto e vírgula e vírgula decimal; inglês: vírgula e ponto;
   BOM, apóstrofo antes de = + @). */
function csvJobs(s){
  const P=s.periodo_dias||7, SEP=EN?',':';', q=v=>{v=v==null?'':String(v);if(/^[=+@]/.test(v))v="'"+v;return /[",;\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}, dec=v=>v==null?'':decTxt(v);
  const H=EN?['Job (id)','Name','Schedule','Expression','Owner','State','Maintenance until','Last run','Next run','Runs in the next 7 d',
    'Runs in '+P+' d','Failures in '+P+' d','Success in '+P+' d (%)','Average duration (s)','Max. duration (s)']:['Job (id)','Nome','Agendamento','Expressão','Responsável','Estado','Manutenção até','Última execução','Próxima execução','Execuções nos próximos 7 d',
    'Execuções em '+P+' d','Falhas em '+P+' d','Sucesso em '+P+' d (%)','Duração média (s)','Duração máx. (s)'];
  const L=jobsDados(s).map(r=>{const c=r.c;return [c.id,r.nome,r.ag,c.schedule||'',r.resp,LISTA_EST[r.est],c.manutencao?c.manutencao.ate:'',r.ult,
    (c.proximas&&c.proximas[0]||[''])[0],(c.proximas||[]).length,r.ex,r.fa,dec(r.suc<0?null:r.suc),r.dm<0?'':r.dm,r.dx<0?'':r.dx].map(q).join(SEP)});
  return '\ufeff'+[H.map(q).join(SEP),...L].join('\r\n')+'\r\n';
}
function csvJobsBaixar(){
  if(!STATE)return; const d=new Date(), a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csvJobs(STATE)],{type:'text/csv;charset=utf-8'}));
  a.download='sala_jobs_'+d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+(STATE.periodo_dias||7)+'d.csv';
  document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0);
}
(function(){
  $('jobs').addEventListener('click',e=>{
    if(e.target.closest('#jcsv')){csvJobsBaixar();return}
    const b=e.target.closest('th button[data-k]');
    if(b){const k=b.dataset.k;JSORT=JSORT.k===k?{k,d:-JSORT.d}:{k,d:['ex','suc','fa','dm','dx','ult'].includes(k)?-1:1};renderJobs(STATE);
      const nb=$('jobs').querySelector(`th button[data-k="${k}"]`);if(nb)nb.focus();return}
    const r=e.target.closest('[data-id]'); if(r){select(r.dataset.id);renderJobs(STATE)}
  });
  $('jobs').addEventListener('keydown',e=>{const t=e.target;if((e.key==='Enter'||e.key===' ')&&t.matches('tr[data-id]')){e.preventDefault();select(t.dataset.id);renderJobs(STATE)}});
})();
