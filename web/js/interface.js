/* Sala de Operações · Interface: zoom/pan, atualização com o /api/state, KPIs, feed, detalhe da estação e modo demonstração.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
// por que a estação está nesta sala (vem do servidor em português)
function motivoTxt(m){m=m||'';if(!EN)return m;return m==='campo setor'?'"setor" field':m.startsWith('padrão')?'default (no sector set)':m.startsWith('prefixo ')?'prefix '+m.slice(8):m}
/* ---------- zoom / pan ---------- */
function applyVB(){$('svg').setAttribute('viewBox',VB.join(' '))}
function initPan(){
  const svg=$('svg'); let drag=null;
  svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();
    const k=Math.exp(e.deltaY*0.0015), nw=Math.min(VB0[2],Math.max(VB0[2]/4,VB[2]*k)), nh=nw*VB0[3]/VB0[2];
    const fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
    VB=[VB[0]+(VB[2]-nw)*fx,VB[1]+(VB[3]-nh)*fy,nw,nh];applyVB()},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.target.closest('.st,.wk,.plq'))return;drag={x:e.clientX,y:e.clientY,vb:VB.slice()};svg.setPointerCapture(e.pointerId)});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const r=svg.getBoundingClientRect(),k=drag.vb[2]/r.width;
    VB=[drag.vb[0]-(e.clientX-drag.x)*k,drag.vb[1]-(e.clientY-drag.y)*k,drag.vb[2],drag.vb[3]];applyVB()});
  svg.addEventListener('pointerup',()=>drag=null);
  svg.addEventListener('dblclick',()=>{VB=VB0.slice();applyVB()});
  $('fit').addEventListener('click',()=>{VB=VB0.slice();applyVB()});
  svg.addEventListener('click',e=>{const p=e.target.closest&&e.target.closest('.plq');if(p)zoomZone(p.dataset.zone)});
  $('feedwrap').addEventListener('click',e=>{const r=e.target.closest('.row');if(r&&r.dataset.id&&STATIONS[r.dataset.id])select(r.dataset.id)});
}
initPan();
// painel lateral recolhível (telas menores): fica salvo no navegador
if(localStorage.getItem('sala_lateral')==='0')document.body.classList.add('semlat');
$('lat').addEventListener('click',()=>{const f=document.body.classList.toggle('semlat');localStorage.setItem('sala_lateral',f?'0':'1');setTimeout(()=>window.dispatchEvent(new Event('resize')),0)});

/* ---------- atualização com dados do servidor ---------- */
function all(){return STATE?[...STATE.agents,...STATE.crons,...(STATE.jarvis?[STATE.jarvis]:[]),...(STATE.equipe_estacao||[])]:[]}
function setStatusClass(g,status){
  const isWk=g.classList.contains('wk');
  const extra=['lb','desk','stuck'].filter(c=>g.classList.contains(c));
  g.setAttribute('class',[isWk?'wk':'st',status,...extra].join(' '));
}
function update(s){
  const antes={}; Object.values(STATIONS).forEach(st=>{antes[st.id]=st.it&&st.it.status});   // para a pasta entre salas
  STATE=s; s._t=Date.now();
  all().forEach(it=>{
    if(STATIONS[it.id])STATIONS[it.id].it=it;
    const late=atrasado(it);
    document.querySelectorAll('.st:not(.lb)[data-id="'+it.id+'"]').forEach(g=>{if(!g.hasAttribute('tabindex')){g.setAttribute('tabindex','0');g.setAttribute('role','button')}g.setAttribute('aria-label',label(it.id)+': '+estadoTxt(it))});
    document.querySelectorAll('.st[data-id="'+it.id+'"], .wk[data-id="'+it.id+'"]').forEach(g=>{setStatusClass(g,it.status);g.classList.toggle('late',late);g.classList.toggle('velho',!!it.antigo&&!late&&it.status!=='manut');g.classList.toggle('stuck',it.status==='running'&&it.sem_acao_s>=300)});
  });
  if(SEL)select(SEL);
  if(built)pastasChecar(antes);
  tick();
  document.querySelectorAll('.flow').forEach(f=>{const it=all().find(x=>x.id===f.dataset.src);f.classList.toggle('on',!!it&&it.status==='running')});
  const k=s.kpis, ver=veredito(s), num=(id,v,cls)=>{const e=$(id);e.textContent=v;e.className=v?cls:'z'};   // zero apagado: só número diferente de zero chama atenção
  $('k-op-v').textContent=ver.t; $('k-op-v').className=ver.c; $('k-op-s').textContent=ver.d; $('k-op').className='kpi op-'+ver.c;
  num('k-run',k.running,'c'); num('k-today',k.runs_today,''); num('k-err',k.errors_today,'r');
  if(k.tendencia){const TD=k.tendencia, ex=TD.reduce((a,x)=>a+x.execucoes,0), fa=TD.reduce((a,x)=>a+x.falhas,0);
    const P=PER(), su=k.sucesso||{};
    $('k-tend').innerHTML=spark(TD,70,13)+' '+P+' d: '+ex+(su.pct!=null?' · <span class="'+(fa?'r':'')+'">'+fmtPct(su.pct)+' OK</span>':'');
    $('k-tend').title=T('Execuções por dia nos últimos '+P+' dias (hoje à direita); índice de sucesso '+fmtPct(su.pct)+' ('+(su.falhas||0)+' falha(s) em '+(su.execucoes||0)+' execuções, fora das janelas de manutenção): ',
      'Runs per day over the last '+P+' days (today on the right); success rate '+fmtPct(su.pct)+' ('+(su.falhas||0)+' failure(s) in '+(su.execucoes||0)+' runs, outside maintenance windows): ')
      +TD.map(x=>diaMes(x.dia)+' '+x.execucoes+(x.falhas?' ('+x.falhas+T(' falha',' failed')+')':'')).join(' · ')+(k.custo_usd!=null?T(' · custo estimado ',' · estimated cost ')+P+' d: US$ '+k.custo_usd.toFixed(2):'')}
  $('k-inerr').textContent=k.in_error?T(k.in_error+' de '+(k.agents+k.crons)+' em falha agora',k.in_error+' of '+(k.agents+k.crons)+' failed now'):T('nenhuma em falha agora','none failed now');
  $('k-last').textContent=k.last_activity?rel(k.last_activity):'—';
  renderFeed(s); renderClaude(s); renderVault(s); renderEquipe(s); if(typeof renderLista==='function')renderLista(s); if(typeof renderJobs==='function')renderJobs(s);
  const nt=$('notice'),ss=s.sem_setor||[],sd=s.saude||[], msgs=[];
  if(sd.length)msgs.push(T('⚠ Fonte de dados com problema: ','⚠ Data source with a problem: ')+sd.map(x=>EN&&x.msg_en||x.msg).join(' · '));
  if(ss.length)msgs.push(T('⚠ '+ss.length+' agente(s) sem setor definido, colocado(s) em NOVOS AGENTES: ','⚠ '+ss.length+' agent(s) with no sector, placed in NOVOS AGENTES: ')+ss.join(', ')+T('. Para escolher a sala: campo "setor" no agentes.json ou layout.json.','. To choose the room: the "setor" field in agentes.json or layout.json.'));
  nt.style.display=msgs.length?'block':'none'; nt.textContent=msgs.join('\n'); nt.style.whiteSpace='pre-line';
  if(CFG.anim==='desligada')parado();
}

// atrasado = rotina que deveria ter rodado e não rodou (job com a próxima rodada vencida; agente com cadência vencida); falha e rodando têm prioridade
function fmtAtraso(s){s=Math.max(0,s|0);return s<3600?Math.max(1,Math.round(s/60))+' MIN':s<86400?Math.floor(s/3600)+'H'+(Math.floor(s%3600/60)?pad(Math.floor(s%3600/60))+T('','M'):''):Math.floor(s/86400)+' D'}   // 1H30 (inglês: 1H30M)
// texto do estado para leitor de tela e modo lista
function estadoTxt(it){return it.status==='manut'?T('em manutenção','under maintenance'):it.status==='error'?T('falha','failed'):it.status==='running'?(it.sem_acao_s>=300?T('rodando, sem ação','running, no activity'):T('rodando','running')):atrasado(it)?T('atrasado','late'):it.status==='ok'?T('última execução OK','last run OK'):T('sem histórico','no history')}
// barras de execuções por dia (cinza) com a parte de falhas em vermelho; hoje à direita, um tom mais claro. Cinza: ciano é só "rodando"
function spark(t,w=112,h=26){
  let v=(t||[]).map(x=>Array.isArray(x)?x:[x.execucoes,x.falhas]); if(!v.length)return '';
  const mb=Math.max(1,Math.floor(w/3.5)); if(v.length>mb){const g=Math.ceil(v.length/mb),u=[];for(let i=v.length;i>0;i-=g){const p=v.slice(Math.max(0,i-g),i);u.unshift([p.reduce((a,x)=>a+x[0],0),p.reduce((a,x)=>a+x[1],0)])}v=u}   // período longo: cada barra soma alguns dias (hoje continua na última)
  const mx=Math.max(1,...v.map(x=>x[0])), bw=w/v.length;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`+v.map((x,i)=>{
    const hh=x[0]?Math.max(2,x[0]/mx*(h-1)):1, hf=x[1]?Math.max(2,x[1]/mx*(h-1)):0, c=!x[0]?'#1E2A36':i===v.length-1?'#8597AB':'#4E6377';
    return `<rect x="${(i*bw+.5).toFixed(1)}" y="${(h-hh).toFixed(1)}" width="${(bw-1.5).toFixed(1)}" height="${hh.toFixed(1)}" fill="${c}"/>`+(hf?`<rect x="${(i*bw+.5).toFixed(1)}" y="${(h-hf).toFixed(1)}" width="${(bw-1.5).toFixed(1)}" height="${hf.toFixed(1)}" fill="#F25C60"/>`:'')}).join('')+'</svg>'}
function tendTxt(t){const ex=(t||[]).reduce((a,x)=>a+x[0],0), fa=(t||[]).reduce((a,x)=>a+x[1],0);return ex+T(' execuç'+(ex===1?'ão':'ões'),' run'+(ex===1?'':'s'))+(fa?' · <span style="color:var(--red)">'+fa+T(' falha'+(fa>1?'s':''),' failure'+(fa>1?'s':''))+'</span>':'')}
function atrasado(it){return !!(it&&it.atrasado_s)&&it.status!=='error'&&it.status!=='running'}
// veredito da operação: FALHA > ATENÇÃO (sem ação, atrasado, fonte de dados com problema) > NORMAL
function veredito(s){
  const k=s.kpis, sd=(s.saude||[]).length, p=[], pl=(n,a,b)=>n+' '+(n>1?b:a);
  if(k.late)p.push(pl(k.late,T('atrasado','late'),T('atrasados','late'))); if(k.stuck)p.push(pl(k.stuck,T('sem ação','with no activity'),T('sem ação','with no activity'))); if(sd)p.push(pl(sd,T('fonte com problema','source with a problem'),T('fontes com problema','sources with a problem')));
  if(k.in_error)return {t:T('FALHA','FAILURE'),c:'r',d:pl(k.in_error,T('estação em falha','station failed'),T('estações em falha','stations failed'))+(p.length?' · '+p.join(' · '):'')};
  if(p.length)return {t:T('ATENÇÃO','ATTENTION'),c:'a',d:p.join(' · ')};
  return {t:'NORMAL',c:'g',d:k.running?pl(k.running,T('agente rodando agora','agent running now'),T('agentes rodando agora','agents running now')):T('nada rodando agora','nothing running now')};
}
/* uso da assinatura Claude (sessão 5 h / semana 7 d): vem do statusLine do Claude Code; só atualiza quando uma sessão responde */
function fmtReset(ep){
  const d=new Date(ep*1000), n=new Date(), hm=pad(d.getHours())+':'+pad(d.getMinutes());
  if(d.toDateString()===n.toDateString())return hm;
  return (EN?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['dom','seg','ter','qua','qui','sex','sáb'])[d.getDay()]+' '+hm;
}
function renderClaude(s){
  const u=s.claude_usage||null, age=u?u.age_s:0, velho=u&&age>1800;
  [['cs','five_hour'],['cw','seven_day']].forEach(([id,k])=>{
    const v=$('k-'+id+'-v'), b=$('k-'+id+'-b'), sub=$('k-'+id+'-s'), x=u&&u[k];
    if(!x){v.textContent='—';v.className='d';b.style.width='0';sub.textContent=u?T('sem dados','no data'):T('aguardando o Claude Code','waiting for Claude Code');return}
    if(x.reset_passou){const ag=age<3600?Math.round(age/60)+' min':Math.round(age/3600)+' h';v.textContent='—';v.className='d';b.style.width='0';sub.textContent=T('janela reiniciada\nleitura de '+ag+' atrás','window reset\nread '+ag+' ago');return}
    const p=x.pct; v.textContent=Math.round(p)+'%';
    const c=p>=90?'r':p>=70?'a':'g'; v.className=velho?'d':c;
    b.style.width=p+'%'; b.className=c==='g'?'':c;
    const ag=age<3600?Math.round(age/60)+' min':Math.round(age/3600)+' h', rs=x.resets_at?fmtReset(x.resets_at):'—';
    sub.textContent=T('usado · reinicia '+rs+'\nlido há '+(age<90?'instantes':ag)+(velho?' (defasado)':''),'used · resets '+rs+'\nread '+(age<90?'just now':ag+' ago')+(velho?' (stale)':''));
  });
}
function tick(){
  if(!STATE)return;
  const el0=(Date.now()-STATE._t)/1000;
  all().forEach(it=>{
    const g=document.querySelector('.st.lb[data-id="'+it.id+'"]'); if(!g)return;
    const sx=g.querySelector('[data-r=sx]'); let t;
    if(it.kind==='equipe'){
      if(it.decor)return;
      const sy=g.querySelector('[data-r=sy]'), f=v=>v==null?'—':v;
      if(sy){sx.textContent=T('EM ABERTO ','OPEN ')+f(it.abertos);sy.textContent=T('ENCERRADOS HOJE ','CLOSED TODAY ')+f(it.encerrados)}
      else sx.textContent=T('ABERTO ','OPEN ')+f(it.abertos)+T(' · HOJE ',' · TODAY ')+f(it.encerrados);   // equipe em 2+ colunas: 2 linhas, como as outras estações
      return;
    }
    if(it.kind==='jarvis') t=JSTL[it.status];
    else if(it.status==='running') t=(it.sem_acao_s>=300?T('SEM AÇÃO HÁ ','NO ACTIVITY FOR ')+Math.round((it.sem_acao_s+el0)/60)+' MIN':T('RODANDO ','RUNNING ')+mmss((it.elapsed_s||0)+el0));
    else if(it.status==='manut'){const d=parseTs(it.manutencao.ate+':00'),n=new Date();t=T('MANUT. ATÉ ','MAINT. UNTIL ')+(d.toDateString()===n.toDateString()?pad(d.getHours())+':'+pad(d.getMinutes()):diaMes(d))}   // curto: o rótulo não pode crescer
    else if(atrasado(it)) t=(it.kind!=='cron'&&!it.last)?T('ATRASADO · NUNCA RODOU','LATE · NEVER RAN'):T('ATRASADO HÁ ','LATE BY ')+fmtAtraso(it.atrasado_s+el0);
    else if(it.kind==='cron') t=it.status==='error'?T('FALHA · ','FAILED · ')+fmtTs((it.last_run||'').replace('T',' ').slice(0,19)):(it.paused?T('PAUSADO','PAUSED'):(it.next_run?T('PRÓX. ','NEXT ')+fmtTs(it.next_run.replace('T',' ').slice(0,19)):'—'));
    else if(it.last) t=(it.status==='error'?T('FALHA · ','FAILED · '):T('ÚLT. ','LAST '))+fmtTs(it.last.ts);   // antigo: só o selo e o texto apagados (sufixo com dias alargava o rótulo e encostava na mesa vizinha)
    else t=T('SEM EXECUÇÕES','NO RUNS');
    sx.textContent=t;
    g.classList.toggle('stuck',it.status==='running'&&it.sem_acao_s>=300);
    g.classList.toggle('late',atrasado(it)); g.classList.toggle('velho',!!it.antigo&&!atrasado(it)&&it.status!=='manut');
  });
  renderTV();
  const n=new Date(); $('clock').textContent=diaMes(n)+'/'+n.getFullYear()+'  '+pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
}
let LASTFEED='';
function renderFeed(s){
  const fj=FEEDF+'|'+JSON.stringify(s.feed); if(fj===LASTFEED)return; LASTFEED=fj;   // o filtro entra na chave: sem ele, TUDO/SÓ EXCEÇÕES não redesenhava (bug de 16/10/2026)
  const nrun=s.feed.filter(e=>e.running).length; $('feedn').textContent=(s.feed.length-nrun)+T(' concluídos',' done')+(nrun?' + '+nrun+T(' em execução',' running'):'');
  // execuções OK seguidas do mesmo agente/job viram uma linha só ("×6 · desde 09:00"); o selo só aparece na exceção (executando, erro, fallback); OK = ponto verde
  const fonte=FEEDF==='excecoes'?s.feed.filter(e=>e.running||e.code!==0||e.fallback):s.feed;
  document.querySelectorAll('#feedf button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===FEEDF)));
  const G=[]; fonte.forEach(e=>{const ok=!e.running&&e.code===0&&!e.fallback, u=G[G.length-1];
    if(ok&&u&&u.ok&&u.e.agent===e.agent){u.n++;u.ate=e.ts}else G.push({e,ok,n:1,ate:e.ts})});
  $('feedwrap').innerHTML=G.map(({e,ok,n,ate})=>{
    const isC=e.type==='cron';
    const chip=e.running?'<span class="chip running">'+T('EXECUTANDO','RUNNING')+'</span>':e.code!==0?'<span class="chip error">'+(e.interrompida?T('INTERROMPIDA','INTERRUPTED'):T('ERRO','ERROR'))+'</span>':(e.fallback?'<span class="chip fb">FALLBACK</span>':'<i class="okp" title="OK"></i>');
    const sub=n>1?(n+T(' execuções OK · desde ',' OK runs · since ')+fmtTs(ate)):isC?(T('job agendado','scheduled job')+(e.dur?' · '+fmtDur(e.dur):'')):(e.interrompida?T('sem registro no log · ','not in the log · '):'')+modelShort(e.model)+(e.dur!=null?' · '+fmtDur(e.dur):'');
    return `<div class="row${ok?' okr':''}" data-id="${esc(e.agent)}" title="${T('Clique para selecionar a estação','Click to select the station')}"><span class="t">${fmtTs(e.ts)}</span><span class="n">${esc(label(e.agent))}${n>1?' <b class="xn">×'+n+'</b>':''}<small>${esc(sub)}</small></span>${chip}</div>`;
  }).join('')||(FEEDF==='excecoes'?'<div class="empty" style="padding:4px 18px">'+T('Nenhuma exceção (erro, fallback ou execução em andamento) nas últimas execuções.','No exceptions (error, fallback or run in progress) in the latest runs.')+'</div>':'')||'<div class="empty" style="padding:18px">'+T('Nenhuma atividade registrada.','No activity recorded.')+'</div>';
}
// Detalhe da estação maior que o espaço: marca .mais (texto se apaga na borda de baixo) até a rolagem chegar ao fim.
function marcarRolagem(){const d=document.getElementById('detail');if(d)d.classList.toggle('mais',d.scrollTop+d.clientHeight<d.scrollHeight-4)}
document.addEventListener('DOMContentLoaded',()=>{const d=document.getElementById('detail');if(d)d.addEventListener('scroll',marcarRolagem,{passive:true});addEventListener('resize',marcarRolagem)});
function renderDetail(){
  const d=$('detail'); const it=all().find(x=>x.id===SEL); if(!it)return;
  let rows=''; const add=(k,v)=>rows+=`<dt>${k}</dt><dd>${v}</dd>`;
  const zt=((STATE.layout.zones.find(z=>z.id===it.setor))||{}).title;
  if(zt)add(T('Sala','Room'),esc(zt)+'<br><span style="color:var(--dim)">'+esc(motivoTxt(it.setor_motivo))+'</span>');
  const P=PER();
  if(it.kind==='agent'||it.kind==='cron'){add(T('Responsável','Owner'),esc(it.responsavel||'—'));
    if(it.manutencao)add(T('Manutenção','Maintenance'),T('até ','until ')+fmtTs(it.manutencao.ate+':00')+(it.manutencao.motivo?' · '+esc(it.manutencao.motivo):'')+'<br><span style="color:var(--dim)">'+T('falha e atraso não alarmam nem contam no índice','failures and delays raise no alarm and do not count in the rate')+(it.status_real?T('; estado real: ','; real state: ')+esc(STL[it.status_real]||it.status_real):'')+'</span>')}
  if(it.kind==='agent'){
    add(T('Modelo','Model'),esc(it.model||'—')); add(T('Provedor','Provider'),esc(it.provider||'—'));
    add('Skills',esc((it.skills||[]).join(', ')||'—')); add(T('Turnos máx.','Max turns'),esc(it.max_turns??'—'));
    add(T('Execuções','Runs'),T(`${it.runs_today} hoje · ${it.runs_total} no histórico`,`${it.runs_today} today · ${it.runs_total} in history`));
    add(T('Últimos '+P+' dias','Last '+P+' days'),spark(it.tendencia)+'<br><span style="color:var(--dim)">'+tendTxt(it.tendencia)+'</span>');
    add(T('Sucesso ','Success ')+P+' d',sucTxt(it.sucesso)+desdeTxt(it,P));
    const c=it.custo; add(T('Consumo ','Usage ')+P+' d',c?fmtTok(c.tokens)+' tokens · '+c.execucoes+T(' exec.',' runs')+(c.custo_usd>0?' · US$ '+c.custo_usd.toFixed(2):'')+'<br><span style="color:var(--dim)">'+(c.custo_usd>0?T('custo estimado pelo Hermes','cost estimated by Hermes'):T('custo estimado US$ 0 (modelo gratuito ou por assinatura)','estimated cost US$ 0 (free or subscription model)'))+(c.aprox?T('; parte com vínculo aproximado (execuções anteriores ao registro de início e fim)','; partly matched approximately (runs before start/end logging)'):'')+'</span>':'—');
    if(it.cadencia_h){const dd=it.cadencia_h/24;add(T('Cadência','Cadence'),T('a cada ','every ')+(it.cadencia_h%24?it.cadencia_h+' h':dd+T(' dia'+(dd>1?'s':''),(it.dias_uteis?' business':'')+' day'+(dd>1?'s':'')))+(it.dias_uteis?T(' útil',''):'')+(atrasado(it)?' · <span style="color:var(--amber)">'+T('atrasado há ','late by ')+fmtAtraso(it.atrasado_s).toLowerCase()+'</span>':T(' · em dia',' · on time')))}
    if(it.status==='running')add(T('Rodando há','Running for'),mmss(it.elapsed_s||0)+' <span style="color:var(--dim)">('+T('limite ','limit ')+Math.round((it.timeout_s||1800)/60)+' min)</span>'+(it.sem_acao_s!=null?'<br>'+T('última ação há ','last action ')+mmss(it.sem_acao_s)+T('',' ago')+(it.sem_acao_s>=300?' <span style="color:var(--amber)">'+T('sem ação: ferramenta demorando ou travado','no activity: slow tool or stuck')+'</span>':''):''));
    add(T('Última','Last'),it.last?`${fmtTs(it.last.ts)} · ${rel(it.last.ts)}<br>${T('código','exit code')} ${it.last.code}${it.last.dur!=null?T(' · durou ',' · took ')+fmtDur(it.last.dur):''}${it.last.fallback?' · fallback':''}${it.last.interrompida?' · <span style="color:var(--red)">'+T('interrompida (sem registro no log)','interrupted (not in the log)')+'</span>':''}`:'—');
  } else if(it.kind==='equipe'){
    const eq=STATE.equipe||{}, f=v=>v==null?'—':v;
    add(T('Em aberto','Open'),f(it.abertos)+' <span style="color:var(--dim)">'+T('(todos os chamados da equipe)','(all the team\'s tickets)')+'</span>');
    add(T('Sem responsável','Unassigned'),f(it.sem_responsavel));
    add(T('Vencidos','Overdue'),f(it.vencidos)+' <span style="color:var(--dim)">'+T('(em aberto com o prazo já passado)','(open and past the due date)')+'</span>');
    add(T('Encerrados 7 d','Closed 7 d'),f(it.encerrados_7d));
    add(T('Atendimento 7 d','Resolution 7 d'),it.atendimento_medio_h==null?'—':fmtDur(it.atendimento_medio_h*3600)+T(' médio · ',' average · ')+fmtDur(it.atendimento_mediano_h*3600)+T(' mediano',' median')+' <span style="color:var(--dim)">'+T('(abertura até encerramento)','(opened to closed)')+'</span>');
    add(T('Encerrados hoje','Closed today'),f(it.encerrados)+' <span style="color:var(--dim)">'+T('(pela equipe)','(by the team)')+'</span>');
    add(T('Lido há','Read'),eq.age_s==null?'—':(eq.age_s<90?T('instantes','just now'):T(Math.round(eq.age_s/60)+' min',Math.round(eq.age_s/60)+' min ago'))+(eq.velho?T(' (defasado)',' (stale)'):''));
  } else if(it.kind==='jarvis'){
    add(T('Papel','Role'),T('Hermes principal: o modelo com quem você conversa e que aciona os agentes','Main Hermes: the model you talk to and that triggers the agents'));
    add(T('Modelo em uso','Model in use'),esc(it.model||'—')); add(T('Origem da conversa','Conversation source'),esc(it.source||'—'));
    add(T('Conversas ativas','Active conversations'),String(it.active_sessions||0)+' <span style="color:var(--dim)">'+T('(mensagem nos últimos 90 s)','(message in the last 90 s)')+'</span>');
    add(T('Última atividade','Last activity'),it.last_activity?fmtTs(it.last_activity)+' · '+rel(it.last_activity):'—');
  } else {
    add(T('Agenda','Schedule'),esc(it.schedule||'—')); add(T('Próxima','Next'),it.next_run?fmtTs(it.next_run.replace('T',' ').slice(0,19)):'—');
    add(T('Última','Last'),it.last_run?fmtTs(it.last_run.replace('T',' ').slice(0,19))+' · '+esc(it.last_status||''):'—');
    add(T('Checagens hoje','Checks today'),`${it.checks_today}${it.failed_today?' · '+it.failed_today+T(' com falha',' failed'):''}`);
    add(T('Últimos '+P+' dias','Last '+P+' days'),spark(it.tendencia)+'<br><span style="color:var(--dim)">'+tendTxt(it.tendencia)+T(' (só as que trabalharam ou falharam)',' (only runs that did work or failed)')+'</span>');
    add(T('Sucesso ','Success ')+P+' d',sucTxt(it.sucesso)+desdeTxt(it,P));
  }
  const rec=(it.recent||[]).slice(0,5).map(e=>`<div class="mini"><span>${fmtTs(e.ts)}</span><span>${modelShort(e.model)}${e.dur!=null?' · '+fmtDur(e.dur):''}</span><span style="color:var(--${e.code?'red':'green'})">${e.code?(e.interrompida?T('INTERR.','INTERR.'):T('ERRO','ERROR')):'OK'}</span></div>`).join('');
  d.innerHTML=`<h2>${T('Estação','Station')} <span>${it.kind==='cron'?T('AGENDADOR','SCHEDULER'):(it.kind==='jarvis'?T('HERMES PRINCIPAL','MAIN HERMES'):(it.kind==='equipe'?T('EQUIPE AGIDESK','AGIDESK TEAM'):T('AGENTE','AGENT')))}</span></h2>
    <div class="nm">${esc(it.kind==='equipe'?it.name:label(it.id))} <span class="chip ${it.status}">${(it.kind==='jarvis'?JSTL:STL)[it.status]}</span></div>
    <div class="ds">${esc(it.desc)}</div><dl>${rows}</dl>${it.kind==='equipe'?'<div class="ds" style="margin-top:8px">'+T('Só totais da equipe: a Sala não mostra números por pessoa.','Team totals only: the room does not show numbers per person.')+'</div>':''}${rec?'<h2 style="margin:14px 0 4px">'+T('Últimas execuções','Latest runs')+'</h2>'+rec:''}`;
  marcarRolagem();
}
// período maior que o histórico disponível: diz desde quando há dados (jobs: a Sala guarda o histórico desde a instalação do vigia)
function desdeTxt(it,P){const d=it.historico_desde;if(!d)return '';const ini=new Date(Date.now()-(P-1)*864e5);ini.setHours(0,0,0,0);
  return new Date(d+'T00:00:00')>ini?'<br><span style="color:var(--dim)">'+T('histórico desde ','history since ')+diaMes(d)+'</span>':''}
/* Modo TV: coluna "AGORA" em letra grande, só com o que importa de longe (falha, sem ação, rodando) e os totais */
function renderTV(){
  if(!temaTV(CFG.tema)||!STATE)return;
  const el0=(Date.now()-STATE._t)/1000, f=v=>v==null?'—':v;
  const L=[...STATE.agents,...STATE.crons].map(it=>{
    let o=null;
    if(it.status==='error')o={c:'error',p:0,t:T('FALHA','FAILED')+(it.kind==='cron'?(it.last_run?' · '+fmtTs(it.last_run.replace('T',' ').slice(0,19)):''):(it.last?' · '+fmtTs(it.last.ts):''))};
    else if(it.status==='running'&&it.sem_acao_s>=300)o={c:'stuck',p:1,t:T('RODANDO · SEM AÇÃO HÁ ','RUNNING · NO ACTIVITY FOR ')+Math.round((it.sem_acao_s+el0)/60)+' MIN'};
    else if(atrasado(it))o={c:'stuck',p:1,t:T('ATRASADO HÁ ','LATE BY ')+fmtAtraso(it.atrasado_s+el0)+(it.kind==='cron'&&it.next_run?T(' · PREVISTO ',' · DUE ')+fmtTs(it.next_run.replace('T',' ').slice(0,19)):'')};
    else if(it.status==='running')o={c:'running',p:2,t:T('RODANDO ','RUNNING ')+mmss((it.elapsed_s||0)+el0)};
    return o&&Object.assign(o,{n:label(it.id).toUpperCase()});
  }).filter(Boolean).sort((a,b)=>a.p-b.p||a.n.localeCompare(b.n));
  $('tvitens').innerHTML=L.length?L.map(o=>`<div class="it ${o.c}"><b>${esc(o.n).replace(/([_:·])/g,'$1<wbr>')}</b><span>${esc(o.t)}</span></div>`).join('')
    :'<div class="calmo">'+T('Agentes em ordem<br><span>nenhum agente rodando, com falha ou atrasado</span>','All agents in order<br><span>no agent running, failed or late</span>')+'</div>';
  const e=STATE.equipe, v=STATE.vault; let r='';
  if(e)r+=`<div><label>${T('Equipe · chamados','Team · tickets')}</label><b>${f(e.abertos_total)}</b> ${T('em aberto','open')} · <b class="${e.sem_responsavel>0?'a':''}">${f(e.sem_responsavel)}</b> ${T('sem responsável','unassigned')}${e.vencidos!=null?` · <b class="${e.vencidos>0?'a':''}">${e.vencidos}</b> ${T('vencidos','overdue')}`:''}</div>`;
  if(v&&v.total!=null)r+=`<div><label>Vault</label><b>${v.total.toLocaleString(LOCALE)}</b> ${T('notas · auditoria','notes · audit')} <b class="${v.auditoria&&v.auditoria.divergencias?'r':''}">${!v.auditoria?'—':v.auditoria.divergencias?v.auditoria.divergencias+T(' diverg.',' mismatch.'):'OK'}</b></div>`;
  $('tvrodape').innerHTML=r?'<h3>'+T('Equipe e vault','Team and vault')+'</h3>'+r:'';
}
function setLive(ok){const p=$('live');p.classList.toggle('off',!ok);p.querySelector('span').textContent=ok?T('AO VIVO','LIVE'):T('SEM CONEXÃO','OFFLINE')}

/* ---------- modo demonstração ---------- */
function demo(s){
  $('demo').style.display='block';
  // usa os agentes de exemplo do pacote; com os dados reais (sem os exemplos) usa os primeiros agentes/cron da lista
  const ag=s.agents, A=(id,i)=>ag.find(x=>x.id===id)||ag[i]||null;
  const rot=A('rotina_exemplo',0), aud=A('auditoria_exemplo',1), con=A('consulta_exemplo',2), rel=A('relatorio_exemplo',3);
  const cr=s.crons.find(x=>x.id==='cron:rotina-diaria-exemplo')||s.crons[0]||null;
  const set=(a,st,ex)=>{if(a){a.status=st;if(ex)a.elapsed_s=ex}};
  set(rot,'running',134); set(aud,'running',41); set(cr,'running',140); set(con,'error'); set(rel,'idle');
  if(aud)aud.sem_acao_s=QS.has('travado')?420:null;
  if(QS.has('atrasado')){const j=s.crons.find(x=>x!==cr);if(j){j.status='ok';j.atrasado_s=5400;const d=new Date(Date.now()-5400e3);j.next_run=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':00'}
    else if(rel){const d=new Date(Date.now()-2*864e5);rel.status='ok';rel.cadencia_h=24;rel.atrasado_s=86400;rel.last={ts:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':00',code:0,model:rel.model,fallback:false}}}   // sem outro job (layout do repositório): um agente diário que não roda há 2 dias   // ?demo=1&atrasado=1: rotina atrasada   // ?demo=1&travado=1: agente rodando sem ação (balão "?" âmbar)
  const now=new Date(), f=m=>{const d=new Date(now-m*60000);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':00'};
  if(con)con.last={ts:f(1),code:1,model:con.model,fallback:false};
  s.feed=[con&&{ts:f(1),agent:con.id,type:'agent',model:'nvidia/nemotron-3-super-120b-a12b',code:1,fallback:false},
          rot&&{ts:f(19),agent:rot.id,type:'agent',model:'claude-sonnet-5-5',code:0,fallback:true},
          cr&&{ts:f(35),agent:cr.id,type:'cron',code:0,dur:292}].filter(Boolean).concat(s.feed).slice(0,40);
  if(s.jarvis){const jr=QS.get('jarvis')==='running';s.jarvis.status=jr?'running':'ok';s.jarvis.active_sessions=jr?1:0}
  s.claude_usage={updated_at:0,age_s:120,five_hour:{pct:34,resets_at:Math.floor(Date.now()/1000)+9000,reset_passou:false},seven_day:{pct:78,resets_at:Math.floor(Date.now()/1000)+250000,reset_passou:false}};
  s.vault={total:900,age_s:60,por_tipo:{'tipo-a':349,'tipo-b':227,'tipo-c':151,'(sem tipo)':26,'tipo-d':24,'tipo-e':14},delta_hoje:7,delta_semana:31,dias_semana:7,auditoria:{divergencias:0,age_s:300,categorias:{}}};
  // demonstração: período, consumo e equipe simulados (determinísticos, para as capturas; com 7 dias, os mesmos números de antes)
  const P=s.periodo_dias||7, dd=i=>{const d=new Date(Date.now()-(P-1-i)*864e5);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}, B7=[9,12,0,0,11,15,14], F7=[0,1,0,0,0,2,1], m7=i=>((i-(P-7))%7+7)%7;
  if(QS.has('manut')&&rel){const d=new Date(Date.now()+2*864e5);rel.status='manut';rel.status_real='error';rel.antigo=false;rel.manutencao={ate:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' 18:00',motivo:T('troca de credencial (exemplo)','credential rotation (example)')}}   // ?demo=1&manut=1
  const jf=s.crons.find(x=>x.status!=='running'&&x.status!=='error');   // um job com uma falha há 5 dias (o quadradinho vermelho da tela JOBS)
  [...s.agents,...s.crons].forEach((x,j)=>{x.tendencia=Array.from({length:P},(_,i)=>[Math.max(0,Math.round(B7[m7(i)]/(j+2))+((i+j)%3===0?1:0))+(x===jf&&i===P-6?1:0),(i===P-1&&x.status==='error')||(x===jf&&i===P-6)?1:0]);
    const n=x.tendencia.reduce((a,v)=>a+v[0],0), f=x.tendencia.reduce((a,v)=>a+v[1],0); x.sucesso={execucoes:n,falhas:f,pct:n?Math.round(1000*(n-f)/n)/10:null,manutencao:x.status==='manut'?2:0};
    if(x.kind==='agent'){x.runs_today=Math.max(x.runs_today||0,x.tendencia[P-1][0]);x.runs_total=Math.max(x.runs_total||0,n)}   // detalhe coerente com o gráfico
    if(x.kind==='agent')x.custo={tokens:Math.round([412000,96000,1280000,58000,240000][j%5]*P/7),custo_usd:Math.round([0,0,3.42,0,0.61][j%5]*P/7*100)/100,execucoes:n,aprox:false}});
  // tela JOBS na demonstração: histórico por dia e duração saem da mesma tendência simulada (os números batem entre grade, cards e tabela)
  s.crons.forEach((c,j)=>{const TD=c.tendencia||[], ok=TD.reduce((a,v)=>a+v[0]-v[1],0), med=[292,48,15,130][j%4];
    c.diario=TD.map((v,i)=>[v[0]-v[1],v[1],c.manutencao&&i>=P-2?1:0]); c.duracao={media_s:med,max_s:Math.round(med*1.8),n:ok,soma_s:med*ok};
    if(!c.last_run){const d=new Date(Date.now()-(j+1)*47*60000);c.last_run=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':00'}
    if(!c.responsavel)c.responsavel=['Equipe Exemplo','Analista Exemplo'][j%2]});
  if(s.equipe){s.equipe.vencidos=3;(s.equipe_estacao||[]).forEach(e=>{if(!e.decor)Object.assign(e,{vencidos:3,encerrados_7d:41,atendimento_medio_h:22.5,atendimento_mediano_h:9.2})})}
  s.kpis={running:3,runs_today:14,errors_today:1,in_error:1,late:[...s.agents,...s.crons].filter(atrasado).length,stuck:QS.has('travado')?1:0,agents:s.agents.length,crons:s.crons.length,last_activity:s.feed[0].ts,
    tendencia:Array.from({length:P},(_,i)=>({dia:dd(i),execucoes:i===P-1?14:B7[m7(i)],falhas:F7[m7(i)]})),custo_usd:Math.round(4.03*P/7*100)/100,manut:[...s.agents,...s.crons].filter(x=>x.manutencao).length};
  s.kpis.jobs_dados_desde=dd(0);
  {const TD=s.kpis.tendencia,n=TD.reduce((a,x)=>a+x.execucoes,0),f=TD.reduce((a,x)=>a+x.falhas,0);s.kpis.sucesso={execucoes:n,falhas:f,pct:Math.round(1000*(n-f)/n)/10}}
}
