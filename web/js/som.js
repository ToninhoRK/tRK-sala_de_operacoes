/* Sala de Operações · Som de alerta (só na página).
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
/* ---------- som de alerta (só na página; outros canais, Teams/e-mail, ficam no roadmap) ----------
   Compara cada leitura com a anterior e toca UMA vez por evento: falha nova de agente/job (status vira erro ou o contador de
   falhas de hoje sobe), agente que passa a ficar 5 min sem ação, fonte de dados que passa a dar problema; som suave quando
   uma falha volta a OK. A 1ª leitura só guarda a base (abrir a página não toca pelos erros antigos).
   LIGADO POR PADRÃO (decisão de 15/10/2026); desligar fica salvo no navegador. Regra do navegador que a página não
   contorna: o áudio só sai depois de alguma interação com a página (clique ou tecla), salvo em site que o Chrome já
   considera de uso frequente ou aberto com --autoplay-policy=no-user-gesture-required (TV). A página tenta ativar ao abrir
   e, se o navegador segurar, ativa sozinha no 1º clique ou tecla em qualquer lugar; o botão continua "LIGADO", só com a
   borda âmbar enquanto o navegador não liberou. */
const SOM={on:localStorage.getItem('sala_som')!=='0',ctx:null,prev:null,ult:0};
function somFoto(s){
  const it={};
  (s.agents||[]).forEach(a=>it[a.id]={st:a.status,err:a.errors_today||0,stuck:a.status==='running'&&a.sem_acao_s>=300,late:atrasado(a)});
  (s.crons||[]).forEach(c=>it[c.id]={st:c.status,err:c.failed_today||0,stuck:false,late:atrasado(c)});
  if(s.jarvis)it.jarvis={st:s.jarvis.aguardando?'running':'ok',err:0,stuck:!!s.jarvis.aguardando,late:false};   // pergunta esperando você: um aviso (sem e-mail: o vigia não olha o Jarvis)
  return {it,saude:new Set((s.saude||[]).map(x=>x.fonte))};
}
function somEventos(a,b){              // a = foto anterior, b = atual; devolve [[tipo,id],...] com tipo falha | aviso | volta
  const ev=[];                         // bad = está em falha até voltar a OK (erro → rodando → ok também conta como "voltou")
  Object.entries(b.it).forEach(([id,c])=>{const p=a&&a.it[id]; c.bad=c.st==='error'||(!!p&&!!p.bad&&c.st!=='ok'); if(!p||c.st==='manut')return;   // em manutenção: nada toca
    if((c.st==='error'&&p.st!=='error')||c.err>p.err)ev.push(['falha',id]);
    else if((c.stuck&&!p.stuck)||(c.late&&!p.late))ev.push(['aviso',id]);
    else if(p.bad&&c.st==='ok')ev.push(['volta',id]);});
  if(!a)return ev;
  b.saude.forEach(f=>{if(!a.saude.has(f))ev.push(['aviso','saude:'+f])});
  return ev;
}
function somCtx(){
  const C=window.AudioContext||window.webkitAudioContext; if(!C)return null;
  if(!SOM.ctx)SOM.ctx=new C(); if(SOM.ctx.state==='suspended')SOM.ctx.resume().then(somBotao,()=>{});
  return SOM.ctx;
}
function somTocar(tipo){
  const c=somCtx(); if(!c||c.state!=='running')return false;
  const notas={falha:[[880,0],[660,.2],[880,.4],[660,.6]],aviso:[[587,0],[587,.25]],volta:[[523,0],[784,.14]]}[tipo]||[];
  const vol=tipo==='volta'?.08:.16, t0=c.currentTime+.02;
  notas.forEach(([f,t])=>{const o=c.createOscillator(),g=c.createGain();o.type=tipo==='falha'?'triangle':'sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,t0+t);g.gain.linearRampToValueAtTime(vol,t0+t+.015);g.gain.exponentialRampToValueAtTime(.0005,t0+t+.18);
    o.connect(g).connect(c.destination);o.start(t0+t);o.stop(t0+t+.2)});
  return true;
}
function somBotao(){if(typeof cfgMenuSync==='function')cfgMenuSync(); const b=$('som'); if(!b)return; const pend=SOM.on&&(!SOM.ctx||SOM.ctx.state!=='running');
  b.textContent=SOM.on?T('SOM: LIGADO','SOUND: ON'):T('SOM: DESLIGADO','SOUND: OFF'); b.classList.toggle('on',SOM.on&&!pend); b.classList.toggle('pend',pend);
  b.title=pend?T('Som ligado. O navegador só libera o áudio depois do primeiro clique ou tecla nesta página (regra do navegador); isso acontece sozinho.','Sound on. The browser only allows audio after the first click or key press on this page (browser rule); this happens on its own.'):T('Som de alerta: toca quando um agente ou job falha, quando um agente fica 5 min sem ação ou quando uma fonte de dados dá problema; um som curto e mais suave quando volta ao normal. Clique para desligar.','Alert sound: plays when an agent or job fails, when an agent goes 5 min with no activity or when a data source has a problem; a short, softer sound when things are back to normal. Click to turn off.')}
function somLigar(v){SOM.on=v;localStorage.setItem('sala_som',v?'1':'0');if(v){somCtx();setTimeout(()=>{somTocar('falha');somBotao()},60)}somBotao()}
function somChecar(s){
  if(DEMO)return;                      // dados simulados: não toca
  const f=somFoto(s), a=SOM.prev; SOM.prev=f; const ev=somEventos(a,f);   // sempre calcula (mantém o "em falha" de cada um), mesmo com o som desligado
  if(!a||!SOM.on||!ev.length)return;
  const tipo=['falha','aviso','volta'].find(t=>ev.some(e=>e[0]===t));   // vários eventos na mesma leitura: um som só, o mais grave
  somTocar(tipo);
}
if($('som')){
  $('som').addEventListener('click',e=>{e.stopPropagation();
    if(SOM.on&&(!SOM.ctx||SOM.ctx.state!=='running')){somCtx();setTimeout(()=>{somTocar('falha');somBotao()},60);return}   // ligado mas o navegador ainda segurava: este clique só libera
    somLigar(!SOM.on)});
  ['pointerdown','keydown','touchstart'].forEach(t=>document.addEventListener(t,()=>{if(SOM.on&&(!SOM.ctx||SOM.ctx.state!=='running'))somCtx()},{passive:true}));
  if(SOM.on&&!DBG)somCtx();       // tenta ativar ao abrir (o navegador libera em site de uso frequente)
  somBotao();
}
// teste de lógica do som (?debug=1): eventos esperados para leituras fictícias; vai para o contador SOM do diagnóstico
function somAutoteste(){
  const F=(it,sd)=>({it,saude:new Set(sd||[])}), r=[];
  const casos=[
    ['erro novo',F({a:{st:'ok',err:0}}),F({a:{st:'error',err:1}}),'falha'],
    ['erro de novo (já estava em erro)',F({a:{st:'error',err:1,bad:true}}),F({a:{st:'error',err:2}}),'falha'],
    ['continua em erro, sem falha nova',F({a:{st:'error',err:1,bad:true}}),F({a:{st:'error',err:1}}),''],
    ['voltou a OK',F({a:{st:'error',err:1,bad:true}}),F({a:{st:'ok',err:1}}),'volta'],
    ['erro → rodando (ainda não voltou)',F({a:{st:'error',err:1,bad:true}}),F({a:{st:'running',err:1}}),''],
    ['rodando depois de erro → OK',F({a:{st:'running',err:1,bad:true}}),F({a:{st:'ok',err:1}}),'volta'],
    ['OK normal → rodando → OK',F({a:{st:'running',err:0,bad:false}}),F({a:{st:'ok',err:0}}),''],
    ['passou a ficar sem ação',F({a:{st:'running',err:0,stuck:false}}),F({a:{st:'running',err:0,stuck:true}}),'aviso'],
    ['continua sem ação',F({a:{st:'running',err:0,stuck:true}}),F({a:{st:'running',err:0,stuck:true}}),''],
    ['fonte de dados com problema',F({},[]),F({},['jobs.json']),'aviso'],
    ['rotina passou a ficar atrasada',F({a:{st:'ok',err:0,late:false}}),F({a:{st:'ok',err:0,late:true}}),'aviso'],
    ['continua atrasada',F({a:{st:'ok',err:0,late:true}}),F({a:{st:'ok',err:0,late:true}}),''],
    ['agente novo já em erro (sem base)',F({}),F({b:{st:'error',err:1}}),''],
    ['virada do dia (contador zera)',F({a:{st:'ok',err:3}}),F({a:{st:'ok',err:0}}),''],
    ['falha → manutenção (sem som)',F({a:{st:'error',err:1,bad:true}}),F({a:{st:'manut',err:1}}),''],
    ['falha nova dentro da manutenção',F({a:{st:'manut',err:1,bad:true}}),F({a:{st:'manut',err:2}}),''],
    ['fim da manutenção já OK',F({a:{st:'manut',err:1,bad:true}}),F({a:{st:'ok',err:1}}),'volta'],
  ];
  casos.forEach(([n,a,b,esp])=>{const ev=somEventos(a,b).map(e=>e[0]).join(',');if(ev!==esp)r.push('som: '+n+' → "'+ev+'" (esperado "'+esp+'")')});
  // Jarvis: pergunta passa a esperar você = um aviso; continua esperando = nada; respondida = nada (não é falha que "voltou")
  const J=a=>somFoto({jarvis:{aguardando:a}});
  [['Jarvis passou a aguardar você',J(false),J(true),'aviso'],['Jarvis continua aguardando',J(true),J(true),''],['pergunta respondida',J(true),J(false),'']]
    .forEach(([n,a,b,esp])=>{const ev=somEventos(a,b).map(e=>e[0]).join(',');if(ev!==esp)r.push('som: '+n+' → "'+ev+'" (esperado "'+esp+'")')});
  return r;
}
