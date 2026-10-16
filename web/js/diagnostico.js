/* Sala de Operações · Diagnóstico do ?debug=1: testes de cena (vidro, parede, rotas, ordem) e relatório no bloco "dbg" da página.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
/* ---------- testes de cena do ?debug=1 (além das colisões de rótulo) ----------
   VIDRO: painel de vidro desenhado por cima de algo que está na frente dele (mesma sala, ou sala da frente) ou por baixo de algo que está atrás.
   PAREDE: rótulo/selo de estação por cima de placa, painel ou quadro. PLACA: placa maior que a parede.
   ATRAVESSA: boneco andando por dentro da pegada de um móvel. EMPILHADOS: dois bonecos parados no mesmo ponto. */
function convexClip(poly,clip){let Pp=poly;for(let i=0;i<clip.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],side=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const sg=Math.sign(clip.reduce((s,_,j)=>{const c=clip[j],d=clip[(j+1)%clip.length];return s+c[0]*d[1]-d[0]*c[1]},0))||1;const Q=[];
  for(let j=0;j<Pp.length;j++){const c=Pp[j],d=Pp[(j+1)%Pp.length],ic=side(c)*sg>=0,id=side(d)*sg>=0;if(ic)Q.push(c);if(ic!==id){const t=side(c)/(side(c)-side(d));Q.push([c[0]+t*(d[0]-c[0]),c[1]+t*(d[1]-c[1])])}}Pp=Q;if(Pp.length<3)return []}return Pp}
function area(Pp){let A=0;for(let i=0;i<Pp.length;i++){const a=Pp[i],b=Pp[(i+1)%Pp.length];A+=a[0]*b[1]-b[0]*a[1]}return Math.abs(A)/2}
function wallCheck(){
  const out=[], zoneAt=(x,y)=>Object.values(ZONES).find(z=>x>=z.x-.05&&x<=z.x+z.w+.05&&y>=z.y-.05&&y<=z.y+z.h+.05);
  const arr=WORLD.items.slice().sort((a,b)=>a.key-b.key), idx=new Map(arr.map((it,i)=>[it,i])), wk=new Map(Object.values(WORKERS).map(w=>[w.item,w]));
  const inf=arr.map(it=>{const w=wk.get(it);let z=it.z;if(w){const zz=zoneAt(w.x,w.y);z=zz?zz.id:null}
    const b=it.node.getBBox(), rect=[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]];
    return {it,z,nm:w?'boneco '+w.st.id:(it.decor?it.decor.kind:(it.tag||'objeto')),shape:it.clip?convexClip(rect,it.clip):rect,
      poly:it.tag==='vidro'?it.node.querySelector('polygon').getAttribute('points').split(' ').map(q=>q.split(',').map(Number)):null}});
  inf.filter(g=>g.poly).forEach(g=>{const zg=ZONES[g.z], gi=idx.get(g.it);
    inf.forEach(d=>{ if(d.poly||!d.z||!ZONES[d.z]||d.shape.length<3)return; const a=area(convexClip(d.shape,g.poly)); if(a<25)return;
      const zd=ZONES[d.z]; const frente=d.z===g.z||(g.it.wall==='back'?zd.y>=zg.y:(zd.x>zg.x||zd.y>zg.y+zg.h-1));
      if(frente&&d.it.decor&&d.it.decor.items.some(o=>o!==d.it&&idx.get(o)>gi&&area(convexClip(o.clip,g.poly))>0))return;   // emenda entre fatias: a fatia seguinte cobre
      if(frente!==(idx.get(d.it)>gi))out.push('VIDRO '+(frente?'SOBRE ':'ATRÁS DE ')+d.nm+' @'+d.z+' | vidro '+g.it.wall+' '+g.z+' | '+a.toFixed(0)+'px²')})});
  return out;
}
function decorCheck(){
  const out=[], R=labelRects();
  DECOR.filter(d=>d.a!=null).forEach(d=>{const pl=decorPoly(d,d.a);R.forEach(r=>{const a=polyRect(pl,r);if(a>=4)out.push('PAREDE '+d.kind+' de '+d.z.id+' sob "'+r.txt+'" ('+r.id+') '+a.toFixed(0)+'px²')});
    const fim=d.a+d.len, lim=d.side==='back'?d.z.x+d.z.w:d.z.y+d.z.h, ini=d.side==='back'?d.z.x:d.z.y; if(fim>lim+.01||d.a<ini-.01)out.push('PLACA/PAINEL '+d.kind+' de '+d.z.id+' sai da parede ('+(fim-lim).toFixed(2)+' un.)')});
  return out;
}
const PROBE={hits:{},stack:{},ordem:{}};
function probe(){
  const r=.18;
  Object.values(WORKERS).forEach(w=>{ if(!w.path.length)return;
    OBST.forEach(([t,a,b,c,d])=>{if(w.x>a-r&&w.x<c+r&&w.y>b-r&&w.y<d+r){const k=t+' ['+a.toFixed(1)+','+b.toFixed(1)+'–'+c.toFixed(1)+','+d.toFixed(1)+']';PROBE.hits[k]=(PROBE.hits[k]||0)+1}})});
  // ORDEM: boneco x painel de vidro (e o que está pendurado nele), por aritmética, a cada quadro: quem está atrás da parede tem de vir antes; quem está na sala, depois
  Object.values(WORKERS).forEach(w=>{const sx=w.x-w.y, k=w.x+w.y, hw=.47;
    Object.values(ZONES).forEach(z=>{
      (z.gBack||[]).forEach(([c,e,ck])=>{ if(sx+hw<=c-z.y||sx-hw>=e-z.y)return; const atras=w.y<z.y; if(atras&&w.y<z.y-4.4)return;
        const dentro=!atras&&w.x>=z.x&&w.x<=z.x+z.w&&w.y<=z.y+z.h; if(!atras&&!dentro)return;
        if(atras?k>ck:k<ck){const m=(atras?'boneco ATRÁS da parede dos fundos desenhado na frente':'vidro dos fundos SOBRE boneco')+' · '+z.id;PROBE.ordem[m]=(PROBE.ordem[m]||0)+1}});
      (z.gLeft||[]).forEach(([c,e,ck])=>{ if(sx+hw<=z.x-e||sx-hw>=z.x-c)return; const atras=w.x<z.x; if(atras&&w.x<z.x-4.4)return;
        const dentro=!atras&&w.y>=z.y&&w.y<=z.y+z.h&&w.x<=z.x+z.w; if(!atras&&!dentro)return;
        if(atras?k>ck:k<ck){const m=(atras?'boneco ATRÁS da parede esquerda desenhado na frente':'vidro da esquerda SOBRE boneco')+' · '+z.id;PROBE.ordem[m]=(PROBE.ordem[m]||0)+1}});
    })});
  const pa=Object.values(WORKERS).filter(w=>!w.path.length);
  for(let i=0;i<pa.length;i++)for(let j=i+1;j<pa.length;j++)if(Math.hypot(pa[i].x-pa[j].x,pa[i].y-pa[j].y)<.45){const k=pa[i].at.type+'/'+pa[j].at.type+' '+pa[i].x.toFixed(1)+','+pa[i].y.toFixed(1);PROBE.stack[k]=(PROBE.stack[k]||0)+1}
}
/* ---------- diagnóstico (?debug=1): colisões de texto/hex/mesa e estado dos funcionários ---------- */
// exportação CSV (?debug=1): linhas = estações + cabeçalho, mesmo número de colunas em todas, coluna de sucesso e proteção contra fórmula
function csvAutoteste(){
  if(!STATE||typeof csvLista!=='function')return ['csv: sem estado ou sem csvLista'];
  const r=[], nc=l=>{let n=1,q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===';'&&!q)n++}return n};
  const L=csvLista(STATE).replace(/^\ufeff/,'').split('\r\n').filter(Boolean), esp=1+STATE.agents.length+STATE.crons.length;
  if(L.length!==esp)r.push('csv: '+L.length+' linhas (esperado '+esp+')');
  L.forEach((l,i)=>{if(nc(l)!==nc(L[0]))r.push('csv: linha '+i+' com '+nc(l)+' colunas (cabeçalho '+nc(L[0])+')')});
  if(!new RegExp('Sucesso em '+(STATE.periodo_dias||7)+' d').test(L[0]))r.push('csv: sem a coluna de sucesso do período');
  const f=csvLista(Object.assign({},STATE,{agents:[Object.assign({},STATE.agents[0],{id:'=1+1;x'})],crons:[]})).split('\r\n')[1]||'';
  if(!f.startsWith('"\'=1+1;x"'))r.push('csv: texto com = não foi protegido: '+f.slice(0,20));
  return r;
}
function debugReport(){
  csvAutoteste().forEach(errPush);
  const R=(b,k,id,t)=>({k,x:b.x,y:b.y,w:b.width,h:b.height,id,t});
  const A=[];
  document.querySelectorAll('.lb').forEach(g=>{const id=g.dataset.id;g.querySelectorAll('text').forEach(t=>A.push(R(t.getBBox(),'label '+id,id,'label')))});
  document.querySelectorAll('.st:not(.lb)').forEach(g=>{const id=g.dataset.id;const hx=g.querySelector('.hex');if(hx)A.push(R(hx.getBBox(),'hex '+id,id,'hex'))});
  document.querySelectorAll('.desk').forEach(g=>A.push(R(g.getBBox(),'desk '+g.dataset.id,g.dataset.id,'desk')));
  const ov=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h, out=new Set();
  for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const a=A[i],b=A[j];if(a.id===b.id||(a.t==='desk'&&b.t==='desk')||(a.t==='hex'&&b.t==='hex'))continue;if(ov(a,b))out.add([a.k,b.k].sort().join('  X  '))}
  const W=Object.values(WORKERS).map(w=>`${w.st.id}: ${w.status} · ${poseOf(w)} · em ${w.at.type} · pos ${w.x.toFixed(1)},${w.y.toFixed(1)}`);
  const pre=document.createElement('pre');pre.id='dbg';
  pre.textContent='OVERLAPS '+out.size+'\n'+[...out].join('\n')+'\nESTANTE_INVASOES '+(window.__shelfHits||0)+' (menor distância '+((window.__shelfMin??9).toFixed(2))+')\nERROS '+(window.__errs||[]).length+'\n'+(window.__errs||[]).join('\n')+'\nWORKERS\n'+W.join('\n');
  const wc=wallCheck(), dc=decorCheck(), at=Object.entries(PROBE.hits).sort((a,b)=>b[1]-a[1]), em=Object.entries(PROBE.stack);
  pre.textContent+='\nVIDRO '+wc.length+'\n'+wc.join('\n')+'\nPAREDE '+dc.length+'\n'+dc.join('\n')
    +'\nATRAVESSA '+at.length+'\n'+at.map(([k,v])=>k+' · '+v+' quadros').join('\n')+'\nEMPILHADOS '+em.length+'\n'+em.map(([k,v])=>k+' · '+v+' quadros').join('\n')+'\nORDEM '+Object.keys(PROBE.ordem).length+'\n'+Object.entries(PROBE.ordem).map(([k,v])=>k+' · '+v+' quadros').join('\n');
  const sa=somAutoteste(); pre.textContent+='\nSOM '+sa.length+'\n'+sa.join('\n');
  pre.textContent+='\nTESTE\n'+(window.__log||[]).join('\n'); document.body.appendChild(pre);
}
