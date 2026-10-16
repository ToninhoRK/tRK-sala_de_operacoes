/* Sala de Operações · Interface: zoom/pan, atualização com o /api/state, KPIs, feed, detalhe da estação e modo demonstração.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
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
  if(k.tendencia){const T=k.tendencia, ex=T.reduce((a,x)=>a+x.execucoes,0), fa=T.reduce((a,x)=>a+x.falhas,0);
    const P=PER(), su=k.sucesso||{};
    $('k-tend').innerHTML=spark(T,70,13)+' '+P+' d: '+ex+(su.pct!=null?' · <span class="'+(fa?'r':'')+'">'+fmtPct(su.pct)+' OK</span>':'');
    $('k-tend').title='Execuções por dia nos últimos '+P+' dias (hoje à direita); índice de sucesso '+fmtPct(su.pct)+' ('+(su.falhas||0)+' falha(s) em '+(su.execucoes||0)+' execuções, fora das janelas de manutenção): '+T.map(x=>x.dia.slice(8)+'/'+x.dia.slice(5,7)+' '+x.execucoes+(x.falhas?' ('+x.falhas+' falha)':'')).join(' · ')+(k.custo_usd!=null?' · custo estimado '+P+' d: US$ '+k.custo_usd.toFixed(2):'')}
  $('k-inerr').textContent=k.in_error?k.in_error+' de '+(k.agents+k.crons)+' em falha agora':'nenhuma em falha agora';
  $('k-last').textContent=k.last_activity?rel(k.last_activity):'—';
  renderFeed(s); renderClaude(s); renderVault(s); renderEquipe(s); if(typeof renderLista==='function')renderLista(s);
  const nt=$('notice'),ss=s.sem_setor||[],sd=s.saude||[], msgs=[];
  if(sd.length)msgs.push('⚠ Fonte de dados com problema: '+sd.map(x=>x.msg).join(' · '));
  if(ss.length)msgs.push('⚠ '+ss.length+' agente(s) sem setor definido, colocado(s) em NOVOS AGENTES: '+ss.join(', ')+'. Para escolher a sala: campo "setor" no agentes.json ou layout.json.');
  nt.style.display=msgs.length?'block':'none'; nt.textContent=msgs.join('\n'); nt.style.whiteSpace='pre-line';
  if(CFG.anim==='desligada')parado();
}

// atrasado = rotina que deveria ter rodado e não rodou (job com a próxima rodada vencida; agente com cadência vencida); falha e rodando têm prioridade
function fmtAtraso(s){s=Math.max(0,s|0);return s<3600?Math.max(1,Math.round(s/60))+' MIN':s<86400?Math.floor(s/3600)+'H'+(Math.floor(s%3600/60)?pad(Math.floor(s%3600/60)):''):Math.floor(s/86400)+' D'}
// texto do estado para leitor de tela e modo lista
function estadoTxt(it){return it.status==='manut'?'em manutenção':it.status==='error'?'falha':it.status==='running'?(it.sem_acao_s>=300?'rodando, sem ação':'rodando'):atrasado(it)?'atrasado':it.status==='ok'?'última execução OK':'sem histórico'}
// barras de execuções por dia (cinza) com a parte de falhas em vermelho; hoje à direita, um tom mais claro. Cinza: ciano é só "rodando"
function spark(t,w=112,h=26){
  let v=(t||[]).map(x=>Array.isArray(x)?x:[x.execucoes,x.falhas]); if(!v.length)return '';
  const mb=Math.max(1,Math.floor(w/3.5)); if(v.length>mb){const g=Math.ceil(v.length/mb),u=[];for(let i=v.length;i>0;i-=g){const p=v.slice(Math.max(0,i-g),i);u.unshift([p.reduce((a,x)=>a+x[0],0),p.reduce((a,x)=>a+x[1],0)])}v=u}   // período longo: cada barra soma alguns dias (hoje continua na última)
  const mx=Math.max(1,...v.map(x=>x[0])), bw=w/v.length;
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`+v.map((x,i)=>{
    const hh=x[0]?Math.max(2,x[0]/mx*(h-1)):1, hf=x[1]?Math.max(2,x[1]/mx*(h-1)):0, c=!x[0]?'#1E2A36':i===v.length-1?'#8597AB':'#4E6377';
    return `<rect x="${(i*bw+.5).toFixed(1)}" y="${(h-hh).toFixed(1)}" width="${(bw-1.5).toFixed(1)}" height="${hh.toFixed(1)}" fill="${c}"/>`+(hf?`<rect x="${(i*bw+.5).toFixed(1)}" y="${(h-hf).toFixed(1)}" width="${(bw-1.5).toFixed(1)}" height="${hf.toFixed(1)}" fill="#F25C60"/>`:'')}).join('')+'</svg>'}
function tendTxt(t){const ex=(t||[]).reduce((a,x)=>a+x[0],0), fa=(t||[]).reduce((a,x)=>a+x[1],0);return ex+' execuç'+(ex===1?'ão':'ões')+(fa?' · <span style="color:var(--red)">'+fa+' falha'+(fa>1?'s':'')+'</span>':'')}
function atrasado(it){return !!(it&&it.atrasado_s)&&it.status!=='error'&&it.status!=='running'}
// veredito da operação: FALHA > ATENÇÃO (sem ação, atrasado, fonte de dados com problema) > NORMAL
function veredito(s){
  const k=s.kpis, sd=(s.saude||[]).length, p=[], pl=(n,a,b)=>n+' '+(n>1?b:a);
  if(k.late)p.push(pl(k.late,'atrasado','atrasados')); if(k.stuck)p.push(pl(k.stuck,'sem ação','sem ação')); if(sd)p.push(pl(sd,'fonte com problema','fontes com problema'));
  if(k.in_error)return {t:'FALHA',c:'r',d:pl(k.in_error,'estação em falha','estações em falha')+(p.length?' · '+p.join(' · '):'')};
  if(p.length)return {t:'ATENÇÃO',c:'a',d:p.join(' · ')};
  return {t:'NORMAL',c:'g',d:k.running?pl(k.running,'agente rodando agora','agentes rodando agora'):'nada rodando agora'};
}
/* uso da assinatura Claude (sessão 5 h / semana 7 d): vem do statusLine do Claude Code; só atualiza quando uma sessão responde */
function fmtReset(ep){
  const d=new Date(ep*1000), n=new Date(), hm=pad(d.getHours())+':'+pad(d.getMinutes());
  if(d.toDateString()===n.toDateString())return hm;
  return ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()]+' '+hm;
}
function renderClaude(s){
  const u=s.claude_usage||null, age=u?u.age_s:0, velho=u&&age>1800;
  [['cs','five_hour'],['cw','seven_day']].forEach(([id,k])=>{
    const v=$('k-'+id+'-v'), b=$('k-'+id+'-b'), sub=$('k-'+id+'-s'), x=u&&u[k];
    if(!x){v.textContent='—';v.className='d';b.style.width='0';sub.textContent=u?'sem dados':'aguardando o Claude Code';return}
    if(x.reset_passou){v.textContent='—';v.className='d';b.style.width='0';sub.textContent='janela reiniciada\nleitura de '+(age<3600?Math.round(age/60)+' min':Math.round(age/3600)+' h')+' atrás';return}
    const p=x.pct; v.textContent=Math.round(p)+'%';
    const c=p>=90?'r':p>=70?'a':'g'; v.className=velho?'d':c;
    b.style.width=p+'%'; b.className=c==='g'?'':c;
    sub.textContent='usado · reinicia '+(x.resets_at?fmtReset(x.resets_at):'—')+'\nlido há '+(age<90?'instantes':age<3600?Math.round(age/60)+' min':Math.round(age/3600)+' h')+(velho?' (defasado)':'');
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
      if(sy){sx.textContent='EM ABERTO '+f(it.abertos);sy.textContent='ENCERRADOS HOJE '+f(it.encerrados)}
      else sx.textContent='ABERTO '+f(it.abertos)+' · HOJE '+f(it.encerrados);   // equipe em 2+ colunas: 2 linhas, como as outras estações
      return;
    }
    if(it.kind==='jarvis') t=JSTL[it.status];
    else if(it.status==='running') t=(it.sem_acao_s>=300?'SEM AÇÃO HÁ '+Math.round((it.sem_acao_s+el0)/60)+' MIN':'RODANDO '+mmss((it.elapsed_s||0)+el0));
    else if(it.status==='manut'){const d=parseTs(it.manutencao.ate+':00'),n=new Date();t='MANUT. ATÉ '+(d.toDateString()===n.toDateString()?pad(d.getHours())+':'+pad(d.getMinutes()):pad(d.getDate())+'/'+pad(d.getMonth()+1))}   // curto: o rótulo não pode crescer
    else if(atrasado(it)) t=(it.kind!=='cron'&&!it.last)?'ATRASADO · NUNCA RODOU':'ATRASADO HÁ '+fmtAtraso(it.atrasado_s+el0);
    else if(it.kind==='cron') t=it.status==='error'?'FALHA · '+fmtTs((it.last_run||'').replace('T',' ').slice(0,19)):(it.paused?'PAUSADO':(it.next_run?'PRÓX. '+fmtTs(it.next_run.replace('T',' ').slice(0,19)):'—'));
    else if(it.last) t=(it.status==='error'?'FALHA · ':'ÚLT. ')+fmtTs(it.last.ts);   // antigo: só o selo e o texto apagados (sufixo com dias alargava o rótulo e encostava na mesa vizinha)
    else t='SEM EXECUÇÕES';
    sx.textContent=t;
    g.classList.toggle('stuck',it.status==='running'&&it.sem_acao_s>=300);
    g.classList.toggle('late',atrasado(it)); g.classList.toggle('velho',!!it.antigo&&!atrasado(it)&&it.status!=='manut');
  });
  renderTV();
  const n=new Date(); $('clock').textContent=pad(n.getDate())+'/'+pad(n.getMonth()+1)+'/'+n.getFullYear()+'  '+pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
}
let LASTFEED='';
function renderFeed(s){
  const fj=JSON.stringify(s.feed); if(fj===LASTFEED)return; LASTFEED=fj;
  const nrun=s.feed.filter(e=>e.running).length; $('feedn').textContent=(s.feed.length-nrun)+' concluídos'+(nrun?' + '+nrun+' em execução':'');
  // execuções OK seguidas do mesmo agente/job viram uma linha só ("×6 · desde 09:00"); o selo só aparece na exceção (executando, erro, fallback); OK = ponto verde
  const fonte=FEEDF==='excecoes'?s.feed.filter(e=>e.running||e.code!==0||e.fallback):s.feed;
  document.querySelectorAll('#feedf button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===FEEDF)));
  const G=[]; fonte.forEach(e=>{const ok=!e.running&&e.code===0&&!e.fallback, u=G[G.length-1];
    if(ok&&u&&u.ok&&u.e.agent===e.agent){u.n++;u.ate=e.ts}else G.push({e,ok,n:1,ate:e.ts})});
  $('feedwrap').innerHTML=G.map(({e,ok,n,ate})=>{
    const isC=e.type==='cron';
    const chip=e.running?'<span class="chip running">EXECUTANDO</span>':e.code!==0?'<span class="chip error">'+(e.interrompida?'INTERROMPIDA':'ERRO')+'</span>':(e.fallback?'<span class="chip fb">FALLBACK</span>':'<i class="okp" title="OK"></i>');
    const sub=n>1?(n+' execuções OK · desde '+fmtTs(ate)):isC?('job agendado'+(e.dur?' · '+fmtDur(e.dur):'')):(e.interrompida?'sem registro no log · ':'')+modelShort(e.model)+(e.dur!=null?' · '+fmtDur(e.dur):'');
    return `<div class="row${ok?' okr':''}" data-id="${esc(e.agent)}" title="Clique para selecionar a estação"><span class="t">${fmtTs(e.ts)}</span><span class="n">${esc(label(e.agent))}${n>1?' <b class="xn">×'+n+'</b>':''}<small>${esc(sub)}</small></span>${chip}</div>`;
  }).join('')||(FEEDF==='excecoes'?'<div class="empty" style="padding:4px 18px">Nenhuma exceção (erro, fallback ou execução em andamento) nas últimas execuções.</div>':'')||'<div class="empty" style="padding:18px">Nenhuma atividade registrada.</div>';
}
// Detalhe da estação maior que o espaço: marca .mais (texto se apaga na borda de baixo) até a rolagem chegar ao fim.
function marcarRolagem(){const d=document.getElementById('detail');if(d)d.classList.toggle('mais',d.scrollTop+d.clientHeight<d.scrollHeight-4)}
document.addEventListener('DOMContentLoaded',()=>{const d=document.getElementById('detail');if(d)d.addEventListener('scroll',marcarRolagem,{passive:true});addEventListener('resize',marcarRolagem)});
function renderDetail(){
  const d=$('detail'); const it=all().find(x=>x.id===SEL); if(!it)return;
  let rows=''; const add=(k,v)=>rows+=`<dt>${k}</dt><dd>${v}</dd>`;
  const zt=((STATE.layout.zones.find(z=>z.id===it.setor))||{}).title;
  if(zt)add('Sala',esc(zt)+'<br><span style="color:var(--dim)">'+esc(it.setor_motivo||'')+'</span>');
  const P=PER();
  if(it.kind==='agent'||it.kind==='cron'){add('Responsável',esc(it.responsavel||'—'));
    if(it.manutencao)add('Manutenção','até '+fmtTs(it.manutencao.ate+':00')+(it.manutencao.motivo?' · '+esc(it.manutencao.motivo):'')+'<br><span style="color:var(--dim)">falha e atraso não alarmam nem contam no índice'+(it.status_real?'; estado real: '+esc(STL[it.status_real]||it.status_real):'')+'</span>')}
  if(it.kind==='agent'){
    add('Modelo',esc(it.model||'—')); add('Provedor',esc(it.provider||'—'));
    add('Skills',esc((it.skills||[]).join(', ')||'—')); add('Turnos máx.',esc(it.max_turns??'—'));
    add('Execuções',`${it.runs_today} hoje · ${it.runs_total} no histórico`);
    add('Últimos '+P+' dias',spark(it.tendencia)+'<br><span style="color:var(--dim)">'+tendTxt(it.tendencia)+'</span>');
    add('Sucesso '+P+' d',sucTxt(it.sucesso)+desdeTxt(it,P));
    const c=it.custo; add('Consumo '+P+' d',c?fmtTok(c.tokens)+' tokens · '+c.execucoes+' exec.'+(c.custo_usd>0?' · US$ '+c.custo_usd.toFixed(2):'')+'<br><span style="color:var(--dim)">'+(c.custo_usd>0?'custo estimado pelo Hermes':'custo estimado US$ 0 (modelo gratuito ou por assinatura)')+(c.aprox?'; parte com vínculo aproximado (execuções anteriores ao registro de início e fim)':'')+'</span>':'—');
    if(it.cadencia_h)add('Cadência','a cada '+(it.cadencia_h%24?it.cadencia_h+' h':(it.cadencia_h/24)+' dia'+(it.cadencia_h>24?'s':''))+(it.dias_uteis?' útil':'')+(atrasado(it)?' · <span style="color:var(--amber)">atrasado há '+fmtAtraso(it.atrasado_s).toLowerCase()+'</span>':' · em dia'));
    if(it.status==='running')add('Rodando há',mmss(it.elapsed_s||0)+' <span style="color:var(--dim)">(limite '+Math.round((it.timeout_s||1800)/60)+' min)</span>'+(it.sem_acao_s!=null?'<br>última ação há '+mmss(it.sem_acao_s)+(it.sem_acao_s>=300?' <span style="color:var(--amber)">sem ação: ferramenta demorando ou travado</span>':''):''));
    add('Última',it.last?`${fmtTs(it.last.ts)} · ${rel(it.last.ts)}<br>código ${it.last.code}${it.last.dur!=null?' · durou '+fmtDur(it.last.dur):''}${it.last.fallback?' · fallback':''}${it.last.interrompida?' · <span style="color:var(--red)">interrompida (sem registro no log)</span>':''}`:'—');
  } else if(it.kind==='equipe'){
    const eq=STATE.equipe||{}, f=v=>v==null?'—':v;
    add('Em aberto',f(it.abertos)+' <span style="color:var(--dim)">(todos os chamados da equipe)</span>');
    add('Sem responsável',f(it.sem_responsavel));
    add('Vencidos',f(it.vencidos)+' <span style="color:var(--dim)">(em aberto com o prazo já passado)</span>');
    add('Encerrados 7 d',f(it.encerrados_7d));
    add('Atendimento 7 d',it.atendimento_medio_h==null?'—':fmtDur(it.atendimento_medio_h*3600)+' médio · '+fmtDur(it.atendimento_mediano_h*3600)+' mediano <span style="color:var(--dim)">(abertura até encerramento)</span>');
    add('Encerrados hoje',f(it.encerrados)+' <span style="color:var(--dim)">(pela equipe)</span>');
    add('Lido há',eq.age_s==null?'—':(eq.age_s<90?'instantes':Math.round(eq.age_s/60)+' min')+(eq.velho?' (defasado)':''));
  } else if(it.kind==='jarvis'){
    add('Papel','Hermes principal: o modelo com quem você conversa e que aciona os agentes');
    add('Modelo em uso',esc(it.model||'—')); add('Origem da conversa',esc(it.source||'—'));
    add('Conversas ativas',String(it.active_sessions||0)+' <span style="color:var(--dim)">(mensagem nos últimos 90 s)</span>');
    add('Última atividade',it.last_activity?fmtTs(it.last_activity)+' · '+rel(it.last_activity):'—');
  } else {
    add('Agenda',esc(it.schedule||'—')); add('Próxima',it.next_run?fmtTs(it.next_run.replace('T',' ').slice(0,19)):'—');
    add('Última',it.last_run?fmtTs(it.last_run.replace('T',' ').slice(0,19))+' · '+esc(it.last_status||''):'—');
    add('Checagens hoje',`${it.checks_today}${it.failed_today?' · '+it.failed_today+' com falha':''}`);
    add('Últimos '+P+' dias',spark(it.tendencia)+'<br><span style="color:var(--dim)">'+tendTxt(it.tendencia)+' (só as que trabalharam ou falharam)</span>');
    add('Sucesso '+P+' d',sucTxt(it.sucesso)+desdeTxt(it,P));
  }
  const rec=(it.recent||[]).slice(0,5).map(e=>`<div class="mini"><span>${fmtTs(e.ts)}</span><span>${modelShort(e.model)}${e.dur!=null?' · '+fmtDur(e.dur):''}</span><span style="color:var(--${e.code?'red':'green'})">${e.code?(e.interrompida?'INTERR.':'ERRO'):'OK'}</span></div>`).join('');
  d.innerHTML=`<h2>Estação <span>${it.kind==='cron'?'AGENDADOR':(it.kind==='jarvis'?'HERMES PRINCIPAL':(it.kind==='equipe'?'EQUIPE AGIDESK':'AGENTE'))}</span></h2>
    <div class="nm">${esc(it.kind==='equipe'?it.name:label(it.id))} <span class="chip ${it.status}">${(it.kind==='jarvis'?JSTL:STL)[it.status]}</span></div>
    <div class="ds">${esc(it.desc)}</div><dl>${rows}</dl>${it.kind==='equipe'?'<div class="ds" style="margin-top:8px">Só totais da equipe: a Sala não mostra números por pessoa.</div>':''}${rec?'<h2 style="margin:14px 0 4px">Últimas execuções</h2>'+rec:''}`;
  marcarRolagem();
}
// período maior que o histórico disponível: diz desde quando há dados (jobs: a Sala guarda o histórico desde a instalação do vigia)
function desdeTxt(it,P){const d=it.historico_desde;if(!d)return '';const ini=new Date(Date.now()-(P-1)*864e5);ini.setHours(0,0,0,0);
  return new Date(d+'T00:00:00')>ini?'<br><span style="color:var(--dim)">histórico desde '+d.slice(8,10)+'/'+d.slice(5,7)+'</span>':''}
/* Modo TV: coluna "AGORA" em letra grande, só com o que importa de longe (falha, sem ação, rodando) e os totais */
function renderTV(){
  if(!temaTV(CFG.tema)||!STATE)return;
  const el0=(Date.now()-STATE._t)/1000, f=v=>v==null?'—':v;
  const L=[...STATE.agents,...STATE.crons].map(it=>{
    let o=null;
    if(it.status==='error')o={c:'error',p:0,t:'FALHA'+(it.kind==='cron'?(it.last_run?' · '+fmtTs(it.last_run.replace('T',' ').slice(0,19)):''):(it.last?' · '+fmtTs(it.last.ts):''))};
    else if(it.status==='running'&&it.sem_acao_s>=300)o={c:'stuck',p:1,t:'RODANDO · SEM AÇÃO HÁ '+Math.round((it.sem_acao_s+el0)/60)+' MIN'};
    else if(atrasado(it))o={c:'stuck',p:1,t:'ATRASADO HÁ '+fmtAtraso(it.atrasado_s+el0)+(it.kind==='cron'&&it.next_run?' · PREVISTO '+fmtTs(it.next_run.replace('T',' ').slice(0,19)):'')};
    else if(it.status==='running')o={c:'running',p:2,t:'RODANDO '+mmss((it.elapsed_s||0)+el0)};
    return o&&Object.assign(o,{n:label(it.id).toUpperCase()});
  }).filter(Boolean).sort((a,b)=>a.p-b.p||a.n.localeCompare(b.n));
  $('tvitens').innerHTML=L.length?L.map(o=>`<div class="it ${o.c}"><b>${esc(o.n).replace(/([_:·])/g,'$1<wbr>')}</b><span>${esc(o.t)}</span></div>`).join('')
    :'<div class="calmo">Agentes em ordem<br><span>nenhum agente rodando, com falha ou atrasado</span></div>';
  const e=STATE.equipe, v=STATE.vault; let r='';
  if(e)r+=`<div><label>Equipe · chamados</label><b>${f(e.abertos_total)}</b> em aberto · <b class="${e.sem_responsavel>0?'a':''}">${f(e.sem_responsavel)}</b> sem responsável${e.vencidos!=null?` · <b class="${e.vencidos>0?'a':''}">${e.vencidos}</b> vencidos`:''}</div>`;
  if(v&&v.total!=null)r+=`<div><label>Vault</label><b>${v.total.toLocaleString('pt-BR')}</b> notas · auditoria <b class="${v.auditoria&&v.auditoria.divergencias?'r':''}">${!v.auditoria?'—':v.auditoria.divergencias?v.auditoria.divergencias+' diverg.':'OK'}</b></div>`;
  $('tvrodape').innerHTML=r?'<h3>Equipe e vault</h3>'+r:'';
}
function setLive(ok){const p=$('live');p.classList.toggle('off',!ok);p.querySelector('span').textContent=ok?'AO VIVO':'SEM CONEXÃO'}

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
  if(QS.has('manut')&&rel){const d=new Date(Date.now()+2*864e5);rel.status='manut';rel.status_real='error';rel.antigo=false;rel.manutencao={ate:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' 18:00',motivo:'troca de credencial (exemplo)'}}   // ?demo=1&manut=1
  [...s.agents,...s.crons].forEach((x,j)=>{x.tendencia=Array.from({length:P},(_,i)=>[Math.max(0,Math.round(B7[m7(i)]/(j+2))+((i+j)%3===0?1:0)),i===P-1&&x.status==='error'?1:0]);
    const n=x.tendencia.reduce((a,v)=>a+v[0],0), f=x.tendencia.reduce((a,v)=>a+v[1],0); x.sucesso={execucoes:n,falhas:f,pct:n?Math.round(1000*(n-f)/n)/10:null,manutencao:x.status==='manut'?2:0};
    if(x.kind==='agent'){x.runs_today=Math.max(x.runs_today||0,x.tendencia[P-1][0]);x.runs_total=Math.max(x.runs_total||0,n)}   // detalhe coerente com o gráfico
    if(x.kind==='agent')x.custo={tokens:Math.round([412000,96000,1280000,58000,240000][j%5]*P/7),custo_usd:Math.round([0,0,3.42,0,0.61][j%5]*P/7*100)/100,execucoes:n,aprox:false}});
  if(s.equipe){s.equipe.vencidos=3;(s.equipe_estacao||[]).forEach(e=>{if(!e.decor)Object.assign(e,{vencidos:3,encerrados_7d:41,atendimento_medio_h:22.5,atendimento_mediano_h:9.2})})}
  s.kpis={running:3,runs_today:14,errors_today:1,in_error:1,late:[...s.agents,...s.crons].filter(atrasado).length,stuck:QS.has('travado')?1:0,agents:s.agents.length,crons:s.crons.length,last_activity:s.feed[0].ts,
    tendencia:Array.from({length:P},(_,i)=>({dia:dd(i),execucoes:i===P-1?14:B7[m7(i)],falhas:F7[m7(i)]})),custo_usd:Math.round(4.03*P/7*100)/100,manut:[...s.agents,...s.crons].filter(x=>x.manutencao).length};
  {const T=s.kpis.tendencia,n=T.reduce((a,x)=>a+x.execucoes,0),f=T.reduce((a,x)=>a+x.falhas,0);s.kpis.sucesso={execucoes:n,falhas:f,pct:Math.round(1000*(n-f)/n)/10}}
}
