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
    if(a.erro) b='<div class="warn">'+esc(a.erro)+'</div>';
    else{
      b+='<div class="meta">'+(a.live?'EM EXECUÇÃO · ':'ÚLTIMA EXECUÇÃO · ')+a.total+' ações'+(a.sessao?'':' · sem sessão encontrada')+'</div>';
      if(a.parado_ha_s>=120) b+='<div class="meta warn">sem ação há '+Math.round(a.parado_ha_s/60)+' min (ferramenta demorando?)</div>';
      b+=a.events.map((e,i)=>'<div class="ln'+(i===a.events.length-1?' last':'')+'"><span>'+esc(e.t)+'</span><span>'+esc(e.tool)+'</span></div>').join('')||'<div class="meta">Nenhuma ação registrada.</div>';
      b+='<div class="meta" style="padding-top:6px">vínculo aproximado (modelo + horário)</div>';
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
document.addEventListener('click',e=>{
  const g=e.target.closest&&e.target.closest('.st,.wk');
  if(g&&g.dataset.id){abrirPop(g.dataset.id,e.clientX,e.clientY)}
  else if(!e.target.closest('#pop')) fecharPop();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharPop()});
