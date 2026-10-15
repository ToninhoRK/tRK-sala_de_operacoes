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

/* ---------- atualização com dados do servidor ---------- */
function all(){return STATE?[...STATE.agents,...STATE.crons,...(STATE.jarvis?[STATE.jarvis]:[]),...(STATE.equipe_estacao||[])]:[]}
function setStatusClass(g,status){
  const isWk=g.classList.contains('wk');
  const extra=['lb','desk','stuck'].filter(c=>g.classList.contains(c));
  g.setAttribute('class',[isWk?'wk':'st',status,...extra].join(' '));
}
function update(s){
  STATE=s; s._t=Date.now();
  all().forEach(it=>{
    if(STATIONS[it.id])STATIONS[it.id].it=it;
    document.querySelectorAll('.st[data-id="'+it.id+'"], .wk[data-id="'+it.id+'"]').forEach(g=>setStatusClass(g,it.status));
  });
  if(SEL)select(SEL);
  tick();
  document.querySelectorAll('.flow').forEach(f=>{const it=all().find(x=>x.id===f.dataset.src);f.classList.toggle('on',!!it&&it.status==='running')});
  const k=s.kpis;
  $('k-run').textContent=k.running; $('k-today').textContent=k.runs_today; $('k-err').textContent=k.errors_today;
  $('k-err').className=k.errors_today?'r':''; $('k-inerr').textContent=k.in_error; $('k-inerr').className=k.in_error?'r':'';
  $('k-tot').textContent='/ '+(k.agents+k.crons); $('k-last').textContent=k.last_activity?rel(k.last_activity):'—';
  renderFeed(s); renderClaude(s); renderVault(s); renderEquipe(s);
  const nt=$('notice'),ss=s.sem_setor||[],sd=s.saude||[], msgs=[];
  if(sd.length)msgs.push('⚠ Fonte de dados com problema: '+sd.map(x=>x.msg).join(' · '));
  if(ss.length)msgs.push('⚠ '+ss.length+' agente(s) sem setor definido, colocado(s) em NOVOS AGENTES: '+ss.join(', ')+'. Para escolher a sala: campo "setor" no agentes.json ou layout.json.');
  nt.style.display=msgs.length?'block':'none'; nt.textContent=msgs.join('\n'); nt.style.whiteSpace='pre-line';
  if(CFG.anim==='desligada')parado();
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
    sub.textContent='reinicia '+(x.resets_at?fmtReset(x.resets_at):'—')+'\nlido há '+(age<90?'instantes':age<3600?Math.round(age/60)+' min':Math.round(age/3600)+' h')+(velho?' (defasado)':'');
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
    else if(it.kind==='cron') t=it.status==='error'?'FALHA · '+fmtTs((it.last_run||'').replace('T',' ').slice(0,19)):(it.next_run?'PRÓX. '+fmtTs(it.next_run.replace('T',' ').slice(0,19)):'—');
    else if(it.last) t=(it.status==='error'?'FALHA · ':'ÚLT. ')+fmtTs(it.last.ts);
    else t='SEM EXECUÇÕES';
    sx.textContent=t;
    g.classList.toggle('stuck',it.status==='running'&&it.sem_acao_s>=300);
  });
  renderTV();
  const n=new Date(); $('clock').textContent=pad(n.getDate())+'/'+pad(n.getMonth()+1)+'/'+n.getFullYear()+'  '+pad(n.getHours())+':'+pad(n.getMinutes())+':'+pad(n.getSeconds());
}
let LASTFEED='';
function renderFeed(s){
  const fj=JSON.stringify(s.feed); if(fj===LASTFEED)return; LASTFEED=fj;
  const nrun=s.feed.filter(e=>e.running).length; $('feedn').textContent=(s.feed.length-nrun)+' concluídos'+(nrun?' + '+nrun+' em execução':'');
  $('feedwrap').innerHTML=s.feed.map(e=>{
    const isC=e.type==='cron';
    const chip=e.running?'<span class="chip running">EXECUTANDO</span>':e.code!==0?'<span class="chip error">ERRO</span>':(e.fallback?'<span class="chip fb">FALLBACK</span>':'<span class="chip ok">OK</span>');
    const sub=isC?('job agendado'+(e.dur?' · '+(e.dur>=60?Math.round(e.dur/60)+' min':e.dur+' s'):'')):modelShort(e.model);
    return `<div class="row" data-id="${esc(e.agent)}" title="Clique para selecionar a estação"><span class="t">${fmtTs(e.ts)}</span><span class="n">${esc(label(e.agent))}<small>${esc(sub)}</small></span>${chip}</div>`;
  }).join('')||'<div class="empty" style="padding:18px">Nenhuma atividade registrada.</div>';
}
function renderDetail(){
  const d=$('detail'); const it=all().find(x=>x.id===SEL); if(!it)return;
  let rows=''; const add=(k,v)=>rows+=`<dt>${k}</dt><dd>${v}</dd>`;
  const zt=((STATE.layout.zones.find(z=>z.id===it.setor))||{}).title;
  if(zt)add('Sala',esc(zt)+'<br><span style="color:var(--dim)">'+esc(it.setor_motivo||'')+'</span>');
  if(it.kind==='agent'){
    add('Modelo',esc(it.model||'—')); add('Provedor',esc(it.provider||'—'));
    add('Skills',esc((it.skills||[]).join(', ')||'—')); add('Turnos máx.',esc(it.max_turns??'—'));
    add('Execuções',`${it.runs_today} hoje · ${it.runs_total} no histórico`);
    if(it.status==='running')add('Rodando há',mmss(it.elapsed_s||0)+' <span style="color:var(--dim)">(limite '+Math.round((it.timeout_s||1800)/60)+' min)</span>'+(it.sem_acao_s!=null?'<br>última ação há '+mmss(it.sem_acao_s)+(it.sem_acao_s>=300?' <span style="color:var(--amber)">sem ação: ferramenta demorando ou travado</span>':''):''));
    add('Última',it.last?`${fmtTs(it.last.ts)} · ${rel(it.last.ts)}<br>código ${it.last.code}${it.last.fallback?' · fallback':''}`:'—');
  } else if(it.kind==='equipe'){
    const eq=STATE.equipe||{}, f=v=>v==null?'—':v;
    add('Em aberto',f(it.abertos)+' <span style="color:var(--dim)">(todos os chamados da equipe)</span>');
    add('Sem responsável',f(it.sem_responsavel));
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
  }
  const rec=(it.recent||[]).slice(0,5).map(e=>`<div class="mini"><span>${fmtTs(e.ts)}</span><span>${modelShort(e.model)}</span><span style="color:var(--${e.code?'red':'green'})">${e.code?'ERRO':'OK'}</span></div>`).join('');
  d.innerHTML=`<h2>Estação <span>${it.kind==='cron'?'AGENDADOR':(it.kind==='jarvis'?'HERMES PRINCIPAL':(it.kind==='equipe'?'EQUIPE AGIDESK':'AGENTE'))}</span></h2>
    <div class="nm">${esc(it.kind==='equipe'?it.name:label(it.id))} <span class="chip ${it.status}">${(it.kind==='jarvis'?JSTL:STL)[it.status]}</span></div>
    <div class="ds">${esc(it.desc)}</div><dl>${rows}</dl>${it.kind==='equipe'?'<div class="ds" style="margin-top:8px">Só totais da equipe: a Sala não mostra números por pessoa.</div>':''}${rec?'<h2 style="margin:14px 0 4px">Últimas execuções</h2>'+rec:''}`;
}
/* Modo TV: coluna "AGORA" em letra grande, só com o que importa de longe (falha, sem ação, rodando) e os totais */
function renderTV(){
  if(CFG.tema!=='tv'||!STATE)return;
  const el0=(Date.now()-STATE._t)/1000, f=v=>v==null?'—':v;
  const L=[...STATE.agents,...STATE.crons].map(it=>{
    let o=null;
    if(it.status==='error')o={c:'error',p:0,t:'FALHA'+(it.kind==='cron'?(it.last_run?' · '+fmtTs(it.last_run.replace('T',' ').slice(0,19)):''):(it.last?' · '+fmtTs(it.last.ts):''))};
    else if(it.status==='running'&&it.sem_acao_s>=300)o={c:'stuck',p:1,t:'RODANDO · SEM AÇÃO HÁ '+Math.round((it.sem_acao_s+el0)/60)+' MIN'};
    else if(it.status==='running')o={c:'running',p:2,t:'RODANDO '+mmss((it.elapsed_s||0)+el0)};
    return o&&Object.assign(o,{n:label(it.id).toUpperCase()});
  }).filter(Boolean).sort((a,b)=>a.p-b.p||a.n.localeCompare(b.n));
  $('tvitens').innerHTML=L.length?L.map(o=>`<div class="it ${o.c}"><b>${esc(o.n).replace(/([_:·])/g,'$1<wbr>')}</b><span>${esc(o.t)}</span></div>`).join('')
    :'<div class="calmo">Tudo em ordem<br><span>nenhum agente rodando ou com falha</span></div>';
  const e=STATE.equipe, v=STATE.vault; let r='';
  if(e)r+=`<div><label>Equipe · chamados</label><b>${f(e.abertos_total)}</b> em aberto · <b class="${e.sem_responsavel>0?'a':''}">${f(e.sem_responsavel)}</b> sem responsável</div>`;
  if(v&&v.total!=null)r+=`<div><label>Vault</label><b>${v.total.toLocaleString('pt-BR')}</b> notas · auditoria <b class="${v.auditoria&&v.auditoria.divergencias?'r':''}">${!v.auditoria?'—':v.auditoria.divergencias?v.auditoria.divergencias+' diverg.':'OK'}</b></div>`;
  $('tvrodape').innerHTML=r;
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
  if(aud)aud.sem_acao_s=QS.has('travado')?420:null;   // ?demo=1&travado=1: agente rodando sem ação (balão "?" âmbar)
  const now=new Date(), f=m=>{const d=new Date(now-m*60000);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':00'};
  if(con)con.last={ts:f(1),code:1,model:con.model,fallback:false};
  s.feed=[con&&{ts:f(1),agent:con.id,type:'agent',model:'nvidia/nemotron-3-super-120b-a12b',code:1,fallback:false},
          rot&&{ts:f(19),agent:rot.id,type:'agent',model:'claude-sonnet-5-5',code:0,fallback:true},
          cr&&{ts:f(35),agent:cr.id,type:'cron',code:0,dur:292}].filter(Boolean).concat(s.feed).slice(0,40);
  if(s.jarvis){const jr=QS.get('jarvis')==='running';s.jarvis.status=jr?'running':'ok';s.jarvis.active_sessions=jr?1:0}
  s.claude_usage={updated_at:0,age_s:120,five_hour:{pct:34,resets_at:Math.floor(Date.now()/1000)+9000,reset_passou:false},seven_day:{pct:78,resets_at:Math.floor(Date.now()/1000)+250000,reset_passou:false}};
  s.vault={total:900,age_s:60,por_tipo:{'tipo-a':349,'tipo-b':227,'tipo-c':151,'(sem tipo)':26,'tipo-d':24,'tipo-e':14},delta_hoje:7,delta_semana:31,dias_semana:7,auditoria:{divergencias:0,age_s:300,categorias:{}}};
  s.kpis={running:3,runs_today:14,errors_today:1,in_error:1,agents:s.agents.length,crons:s.crons.length,last_activity:s.feed[0].ts};
}
