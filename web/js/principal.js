/* Sala de Operações · Início: consulta ao /api/state, laço principal e popup "o que o agente está fazendo".
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
async function poll(){
  if(document.hidden&&built&&!DBG&&(!SOM.on||Date.now()-SOM.ult<10000))return;   // aba escondida: sem consulta; com o som ligado, 1 consulta a cada 10 s para o alerta tocar
  SOM.ult=Date.now();
  try{const r=await fetch('/api/state?dias='+CFG.periodo,{cache:'no-store'});const s=await r.json();if(DEMO)demo(s);
    const sig=JSON.stringify(s.layout.zones.map(z=>[z.id,z.items,z.w,z.h]));
    TITULOS=titulosDe(s);
    if(!built||sig!==SIG){const first=!built;SIG=sig;build(s);STATE=s;update(s);const ff=first?+(QS.get('ff')||0):0;for(let t=0;t<ff;t+=.1)sim(.1)
      if(first&&QS.get('sala'))zoomZone(QS.get('sala'));   // ?sala=operacoes: abre aproximado numa sala
      const tr=QS.get('testrun');
      if(first&&tr&&WORKERS[tr]){const w=WORKERS[tr];STATIONS[tr].it.status=QS.get('as')||'running';const want=STATIONS[tr].stops[QS.get('as')==='error'?'side':'home'];
        const L=['antes: '+(w.path.length?'andando':'parado')+' em '+w.at.type+' pos '+w.x.toFixed(1)+','+w.y.toFixed(1)+' dest '+(w.dest?w.dest.type:'-')];
        let arr=null,maxStep=0,px=w.x,py=w.y,dist=0,runT=0;
        for(let t=0;t<(+QS.get('testfor')||70);t+=.1){sim(.1);const d=Math.hypot(w.x-px,w.y-py);maxStep=Math.max(maxStep,d);dist+=d;px=w.x;py=w.y;if(poseOf(w)==='run')runT+=.1;if(arr===null&&!w.path.length&&same(w.at,want)){arr=t}}
        L.push('chegou em '+(arr===null?'NUNCA':arr.toFixed(1)+' s')+' | correndo '+runT.toFixed(1)+' s | distância '+dist.toFixed(1)+' | maior passo/frame '+maxStep.toFixed(2)+' | pose final '+poseOf(w));
        window.__log=L}
      // ?testpasta=a,b (ou =1: o primeiro fluxo com as duas estações): pede a entrega e mede o trajeto da pasta
      const tp=QS.get('testpasta')||QS.get('pasta');
      if(first&&tp){const fl=(s.layout.flows||[]).filter(([a,b])=>WORKERS[a]&&WORKERS[b]), par=tp.includes(',')?tp.split(','):(fl[0]||[]);
        const [a,b]=par, w=WORKERS[a];
        if(w&&QS.has('testpasta')&&desired(w))STATIONS[a].it.status='ok';   // teste: quem leva precisa estar livre (na demonstração a origem pode estar rodando ou em falha)
        const ok=!!w&&entregarPasta(a,b);
        if(QS.has('testpasta')){const L=window.__log=window.__log||[];
          if(!ok)L.push('pasta '+a+' > '+b+': NÃO SAIU ('+(w?'ocupado':'sem estação')+')');
          else{let arr=null,dist=0,px=w.x,py=w.y,zonas=new Set([w.st.z.id]),comPasta=0;
            for(let t=0;t<(+QS.get('testfor')||90);t+=.1){sim(.1);dist+=Math.hypot(w.x-px,w.y-py);px=w.x;py=w.y;if(w.carry)comPasta+=.1;
              const zz=Object.values(ZONES).find(z=>w.x>=z.x&&w.x<=z.x+z.w&&w.y>=z.y&&w.y<=z.y+z.h);if(zz)zonas.add(zz.id);
              if(arr===null&&!w.carry&&w.at&&w.at.type==='entrega'){arr=t;break}}
            L.push('pasta '+a+' > '+b+': entregue em '+(arr===null?'NUNCA':arr.toFixed(1)+' s')+' | distância '+dist.toFixed(1)+' | salas '+[...zonas].join('/')+' | com a pasta '+comPasta.toFixed(1)+' s | pose '+poseOf(w)+' | entregues '+PASTAS.entregues)}}}
    }
    update(s);somChecar(s);setLive(true)}catch(e){errPush(String(e&&e.stack||e));setLive(false)}
}
cfgMenuMontar();
if(QS.has('debug')){poll().then(()=>setTimeout(debugReport,300))}
else{poll();setInterval(poll,1000);if(DEMO)setInterval(()=>{if(!built||!STATE)return;const fl=(STATE.layout.flows||[]).filter(([a,b])=>WORKERS[a]&&WORKERS[b]);if(fl.length){const [a,b]=fl[Math.floor(SIMT/40)%fl.length];entregarPasta(a,b)}},40000);setInterval(tick,1000);requestAnimationFrame(loop);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()})}

/* popup "o que o agente está fazendo": clique no boneco/estação de um agente; só nomes de ferramenta e hora */
let POP=null, POPT=null;
function fecharPop(){const p=$('pop'); if(p)p.style.display='none'; POP=null; clearInterval(POPT)}
async function atualizarPop(){
  if(!POP)return;
  try{
    const r=await fetch('/api/atividade?agent='+encodeURIComponent(POP),{cache:'no-store'}); const a=await r.json(); if(!POP)return;
    let b='';
    if(a.erro) b='<div class="warn">'+esc(EN&&a.erro_en||a.erro)+'</div>';
    else{
      b+='<div class="meta">'+(a.live?T('EM EXECUÇÃO · ','RUNNING · '):T('ÚLTIMA EXECUÇÃO · ','LAST RUN · '))+a.total+T(' ações',' actions')+(a.sessao?'':T(' · sem sessão encontrada',' · no session found'))+'</div>';
      if(a.parado_ha_s>=120) b+='<div class="meta warn">'+T('sem ação há '+Math.round(a.parado_ha_s/60)+' min (ferramenta demorando?)','no activity for '+Math.round(a.parado_ha_s/60)+' min (slow tool?)')+'</div>';
      b+=a.events.map((e,i)=>'<div class="ln'+(i===a.events.length-1?' last':'')+'"><span>'+esc(e.t)+'</span><span>'+esc(e.tool)+'</span></div>').join('')||'<div class="meta">'+T('Nenhuma ação registrada.','No actions recorded.')+'</div>';
      b+='<div class="meta" style="padding-top:6px">'+T('vínculo aproximado (modelo + horário)','approximate match (model + time)')+'</div>';
    }
    $('popbd').innerHTML=b;
  }catch(e){}
}
function abrirPop(id,x,y){
  const it=all().find(i=>i.id===id); if(!it||it.kind!=='agent'){fecharPop();return}
  let p=$('pop');
  if(!p){p=document.createElement('div');p.id='pop';p.innerHTML='<div class="hd"><b id="poptt"></b><button id="popx" title="Fechar">×</button></div><div class="bd" id="popbd"></div>';document.body.appendChild(p);$('popx').addEventListener('click',fecharPop)}
  $('poptt').textContent=label(id).toUpperCase(); $('popbd').innerHTML='<div class="meta">carregando…</div>';
  p.style.display='block';
  p.style.left=Math.max(8,Math.min(x+14,innerWidth-p.offsetWidth-8))+'px'; p.style.top=Math.max(8,Math.min(y+14,innerHeight-p.offsetHeight-8))+'px';
  POP=id; clearInterval(POPT); atualizarPop(); POPT=setInterval(atualizarPop,3000);
}
/* Painel AO VIVO (23/10/2026; padrão, CONFIGURAR > Atividade do agente): o que o modo ao vivo do terminal
   mostra, mas com raciocínio, respostas e comandos completos (do resultado, só o começo), num painel largo à direita que não bloqueia
   a Sala. Os cortes são feitos no servidor (/api/atividade?modo=vivo); aqui tudo passa por esc(). Fecha no × ou no Esc;
   clicar noutro agente troca o painel. Na demonstração (?demo=1) as linhas são fictícias, geradas aqui. */
let VIVO=null, VIVOT=null, VIVOK='';
const VIVOTIPO={raciocinio:['🧠',T('raciocínio','reasoning')],resposta:['💭',T('resposta com chamada de ferramenta','reply with a tool call')],
  final:['✎',T('resposta final redigida','final reply drafted')],cmd:['▶',''],resultado:['✔',T('resultado','result')]};
function vivoLinha(e){
  const [ic,nm]=VIVOTIPO[e.k]||['·',String(e.k)];
  let cab=nm, txt=e.txt||'';
  if(e.k==='cmd')cab=e.tool||'?';
  if(e.k==='resultado'){cab=nm+(e.tool?' ('+e.tool+')':'')+' · '+e.n+' '+(e.n===1?T('linha','line'):T('linhas','lines'));txt=txt?T('começa com: ','starts with: ')+txt:T('(vazio)','(empty)')}
  return '<div class="vl k-'+esc(e.k)+'"><span class="vt">'+esc(e.t)+'<i>+'+(+e.el||0)+'s</i></span><span class="vi" aria-hidden="true">'+ic+'</span><div class="vx"><b>'+esc(cab)+'</b>'+(txt?'<span>'+esc(txt)+'</span>':'')+'</div></div>';
}
function vivoDemo(id){            // demonstração: passos fictícios, que avançam com o tempo enquanto a estação "roda"
  const it=all().find(i=>i.id===id)||{}, run=it.status==='running';
  const P=[['raciocinio','',T('O pedido é um total. Vou rodar a consulta de exemplo e conferir o número antes de responder.','The request is a total. I will run the sample query and check the number before answering.')],
    ['cmd','terminal','python3 ~/exemplo/consulta_exemplo.py --total'],['resultado','terminal',T('[consulta de exemplo] 3 registros encontrados','[sample query] 3 records found'),4],
    ['raciocinio','',T('O script devolveu 3. Confiro também por categoria para não somar duas vezes.','The script returned 3. I also check by category so nothing is counted twice.')],
    ['cmd','terminal','python3 ~/exemplo/consulta_exemplo.py '+T('--por-categoria','--by-category')],['resultado','terminal',T('categoria A: 2','category A: 2'),3],
    ['resposta','',T('Os números batem; vou redigir a resposta.','The numbers match; drafting the answer.')],['final','',T('Total de registros de exemplo: 3 (A: 2, B: 1).','Sample records in total: 3 (A: 2, B: 1).')]];
  const n=run?Math.min(P.length-1,2+Math.floor(Date.now()/4000)%(P.length-2)):P.length, t0=Date.now()/1000-n*4;
  const ev=P.slice(0,n).map(([k,tool,txt,nl],i)=>({k,tool,txt,n:nl,el:i*4,t:new Date((t0+i*4)*1000).toTimeString().slice(0,8)}));
  return {agent:id,live:run,modo:'vivo',total:ev.length,events:ev,sessao:'demo'};
}
function vivoRender(a){
  const bd=$('vivobd'); if(!bd)return;
  const k=JSON.stringify(a); if(k===VIVOK)return; VIVOK=k;
  const noFim=bd.scrollHeight-bd.scrollTop-bd.clientHeight<40;      // quem rolou para cima para ler não é puxado para baixo
  let m='';
  if(a.erro){$('vivost').textContent='';$('vivometa').innerHTML='<span class="warn">'+esc(EN&&a.erro_en||a.erro)+'</span>';bd.innerHTML='';return}
  $('vivost').textContent=a.live?T('EM EXECUÇÃO','RUNNING'):T('ÚLTIMA EXECUÇÃO','LAST RUN');
  $('vivost').className=a.live?'run':'';
  m=a.total+' '+T('linhas','lines')+(a.total>a.events.length?' · '+T('mostrando as últimas ','showing the last ')+a.events.length:'')+(a.sessao?'':' · '+T('sem sessão encontrada','no session found'));
  if(a.parado_ha_s>=120)m+=' · <span class="warn">'+T('sem ação há '+Math.round(a.parado_ha_s/60)+' min (ferramenta demorando?)','no activity for '+Math.round(a.parado_ha_s/60)+' min (slow tool?)')+'</span>';
  $('vivometa').innerHTML=m;
  bd.innerHTML=a.events.map(vivoLinha).join('')||'<div class="meta">'+T('Nenhuma ação registrada.','No actions recorded.')+'</div>';
  if(noFim)bd.scrollTop=bd.scrollHeight;
}
async function atualizarVivo(){
  if(!VIVO)return; const id=VIVO;
  try{const a=DEMO?vivoDemo(id):await (await fetch('/api/atividade?modo=vivo&agent='+encodeURIComponent(id),{cache:'no-store'})).json();
    if(VIVO===id)vivoRender(a)}catch(e){}
}
function vivoPosicionar(){const p=$('vivo'),h=document.querySelector('header');if(p)p.style.top=Math.max(0,h?h.getBoundingClientRect().bottom:0)+'px'}
function abrirVivo(id){
  const it=all().find(i=>i.id===id); if(!it||it.kind!=='agent')return false;
  let p=$('vivo');
  if(!p){p=document.createElement('div');p.id='vivo';p.setAttribute('role','complementary');
    p.innerHTML='<div class="hd"><b id="vivott"></b><span id="vivost"></span><button id="vivox" title="'+T('Fechar (Esc)','Close (Esc)')+'" aria-label="'+T('Fechar','Close')+'">×</button></div><div class="meta" id="vivometa"></div><div class="bd" id="vivobd" aria-live="off"></div><div class="ft">'+T('Ao vivo: raciocínio, respostas e comandos completos; do resultado, só o começo. app_key mascarada, pasta pessoal como ~, nomes e e-mails omitidos quando o pedido não pede lista. Vínculo aproximado (modelo + horário).','Live: full reasoning, replies and commands; only the start of each result. app_key masked, home folder as ~, names and e-mails left out unless the request asks for a list. Approximate match (model + time).')+'</div>';
    document.body.appendChild(p);$('vivox').addEventListener('click',fecharVivo)}
  p.setAttribute('aria-label',T('Atividade ao vivo de ','Live activity of ')+label(id));
  $('vivott').textContent=label(id).toUpperCase(); $('vivobd').innerHTML='<div class="meta">'+T('carregando…','loading…')+'</div>'; $('vivometa').textContent=''; $('vivost').textContent='';
  VIVOK=''; p.style.display='flex'; vivoPosicionar();
  VIVO=id; clearInterval(VIVOT); atualizarVivo(); VIVOT=setInterval(atualizarVivo,1500); return true;
}
function fecharVivo(){const p=$('vivo'); if(p)p.style.display='none'; VIVO=null; clearInterval(VIVOT)}
function atividadeTrocar(){const id=VIVO||POP; if(!id)return; fecharVivo(); fecharPop(); abrirAtividade(id,innerWidth/2,innerHeight/3)}
function abrirAtividade(id,x,y){if(CFG.atividade==='vivo'){fecharPop();abrirVivo(id)}else{fecharVivo();abrirPop(id,x,y)}}
addEventListener('resize',vivoPosicionar);
document.addEventListener('click',e=>{
  const g=e.target.closest&&e.target.closest('.st,.wk');
  if(g&&g.dataset.id){abrirAtividade(g.dataset.id,e.clientX,e.clientY)}
  else if(!e.target.closest('#pop')) fecharPop();          // o painel ao vivo não fecha com clique fora: não é modal
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){fecharPop();fecharVivo()}});
if(QS.get('vivo'))setTimeout(function abrirQuandoMontar(){if(!built)return setTimeout(abrirQuandoMontar,200);abrirVivo(QS.get('vivo'))},0);   // ?vivo=<agente>: abre o painel (capturas e testes)
