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
  const SEP=EN?',':';', r=[], nc=l=>{let n=1,q=false;for(const ch of l){if(ch==='"')q=!q;else if(ch===SEP&&!q)n++}return n};
  const L=csvLista(STATE).replace(/^\ufeff/,'').split('\r\n').filter(Boolean), esp=1+STATE.agents.length+STATE.crons.length;
  if(L.length!==esp)r.push('csv: '+L.length+' linhas (esperado '+esp+')');
  L.forEach((l,i)=>{if(nc(l)!==nc(L[0]))r.push('csv: linha '+i+' com '+nc(l)+' colunas (cabeçalho '+nc(L[0])+')')});
  if(!new RegExp(T('Sucesso em ','Success in ')+(STATE.periodo_dias||7)+' d').test(L[0]))r.push('csv: sem a coluna de sucesso do período');
  const f=csvLista(Object.assign({},STATE,{agents:[Object.assign({},STATE.agents[0],{id:'=1+1;x'})],crons:[]})).split('\r\n')[1]||'';
  if(!f.startsWith('"\'=1+1;x"'))r.push('csv: texto com = não foi protegido: '+f.slice(0,20));
  return r;
}
// Painel lateral: com cada estação selecionada, a atividade recente continua legível (mín. 160 px). Só quando o painel aparece ao lado da planta.
function lateralAutoteste(){
  const fw=document.getElementById('feedwrap'), lat=document.getElementById('lateral');
  if(!fw||!lat||!lat.offsetParent||innerWidth<=1000||!STATE)return [];
  const antes=SEL, ruins=[];
  for(const it of (STATE.agents||[]).concat(STATE.crons||[])){select(it.id);const h=fw.getBoundingClientRect().height;if(h<160)ruins.push(it.id+' '+Math.round(h)+'px')}
  select(antes);
  return ruins.length?['painel lateral: atividade recente espremida ('+innerWidth+'x'+innerHeight+') com '+ruins.slice(0,6).join(', ')+(ruins.length>6?' e mais '+(ruins.length-6):'')]:[];
}
// Filtro da atividade recente: clicar em SÓ EXCEÇÕES deixa só exceções (nenhum ponto verde de OK) e marca o botão; TUDO volta a lista inteira.
function feedAutoteste(){
  const bE=document.querySelector('#feedf button[data-f="excecoes"]'), bT=document.querySelector('#feedf button[data-f="tudo"]'), fw=document.getElementById('feedwrap');
  if(!bE||!bT||!fw||!STATE||!(STATE.feed||[]).length)return [];
  const antes=FEEDF, guardado=(()=>{try{return localStorage.getItem('sala_feed')}catch(e){return null}})(), r=[];
  bT.click(); const nTudo=fw.querySelectorAll('.okp').length;
  bE.click();
  if(bE.getAttribute('aria-pressed')!=='true')r.push('filtro SÓ EXCEÇÕES: o botão não ficou marcado');
  if(fw.querySelectorAll('.okp').length)r.push('filtro SÓ EXCEÇÕES: a lista continuou com execuções OK ('+fw.querySelectorAll('.okp').length+' de '+nTudo+')');
  bT.click();
  if(nTudo&&!fw.querySelectorAll('.okp').length)r.push('filtro TUDO: as execuções OK não voltaram');
  (antes==='excecoes'?bE:bT).click();
  try{guardado==null?localStorage.removeItem('sala_feed'):localStorage.setItem('sala_feed',guardado)}catch(e){}
  return r;
}
// Tela JOBS: liga a tela, confere os 4 blocos, uma linha por job (tabela, grade e quadro dos 7 dias), P quadradinhos por linha,
// nada passando da largura, datas do eixo sem sobreposição, ordenação e CSV; volta para a visão que estava.
function jobsAutoteste(){
  const J=document.getElementById('jobs');
  if(!J||!STATE||!(STATE.crons||[]).length||typeof visaoLigar!=='function'||document.body.classList.contains('tv'))return [];   // Modo TV: sem a chave de visões (a TV mostra sempre a planta)
  const antes=VISAO, guard=(()=>{try{return localStorage.getItem('sala_visao')}catch(e){return null}})(), sort=JSORT, r=[];
  const n=STATE.crons.length, P=STATE.periodo_dias||7;
  visaoLigar('jobs');
  if(getComputedStyle(J).display==='none')r.push('JOBS: a tela não apareceu');
  ['jb-kpi','jb-prox','jb-hist','jb-tab'].forEach(id=>{if(!document.getElementById(id))r.push('JOBS: bloco '+id+' ausente')});
  const nt=J.querySelectorAll('.jtab tbody tr').length, ng=J.querySelectorAll('.jgrade .jlin:not(.eixo)').length, ns=J.querySelectorAll('.jsem tbody tr').length;
  if(nt!==n||ng!==n||ns!==n)r.push('JOBS: '+n+' jobs, mas tabela '+nt+', grade '+ng+', próximas '+ns);
  J.querySelectorAll('.jgrade .jlin').forEach(l=>{const q=l.querySelectorAll(l.classList.contains('eixo')?'em':'i').length;if(q!==P)r.push('JOBS: grade com '+q+' dias em '+(l.dataset.id||'eixo')+' (esperado '+P+')')});
  if(J.scrollWidth>J.clientWidth+2)r.push('JOBS: a tela passa da largura ('+J.scrollWidth+' px > '+J.clientWidth+' px, '+innerWidth+'x'+innerHeight+')');
  if(innerWidth>=1400)J.querySelectorAll('.jrolar').forEach(w=>{if(w.scrollWidth>w.clientWidth+2)r.push('JOBS: tabela com rolagem lateral em tela de '+innerWidth+' px ('+w.scrollWidth+' > '+w.clientWidth+')')});
  const E=[...J.querySelectorAll('.jlin.eixo em')].filter(e=>e.textContent).map(e=>{const R=document.createRange();R.selectNodeContents(e);return R.getBoundingClientRect()});
  for(let i=1;i<E.length;i++)if(E[i].left<E[i-1].right-0.5){r.push('JOBS: datas do eixo da grade sobrepostas ('+innerWidth+'x'+innerHeight+')');break}
  const b=J.querySelector('.jtab th button[data-k="nome"]');
  if(b){b.click();const a1=[...J.querySelectorAll('.jtab td.nm')].map(t=>t.textContent);J.querySelector('.jtab th button[data-k="nome"]').click();const a2=[...J.querySelectorAll('.jtab td.nm')].map(t=>t.textContent);
    const o=[...a1].sort((x,y)=>x.localeCompare(y,LOCALE)).join('|'), oi=[...a1].sort((x,y)=>y.localeCompare(x,LOCALE)).join('|');   // os dois cliques: uma ordem e a oposta
    if(!((a1.join('|')===o&&a2.join('|')===oi)||(a1.join('|')===oi&&a2.join('|')===o)))r.push('JOBS: ordenar pela coluna Job não ordenou')}
  const csv=csvJobs(STATE).split('\r\n').filter(Boolean);
  if(csv.length!==n+1)r.push('JOBS CSV: '+(csv.length-1)+' linhas para '+n+' jobs');
  JSORT=sort; visaoLigar(antes);
  try{guard==null?localStorage.removeItem('sala_visao'):localStorage.setItem('sala_visao',guard)}catch(e){}
  return r;
}
// Tela em inglês: passa pelas visões (OFFICE, LISTA, JOBS), pelo menu CONFIGURAR e pelo detalhe de cada estação e procura texto
// em português que sobrou sem tradução. Nomes e descrições vindos da configuração (salas, estações, agentes.json) são dados e saem
// da conta antes da busca.
function idiomaAutoteste(){
  if(!EN||!STATE||typeof visaoLigar!=='function')return [];
  const dados=new Set(), add=v=>{if(v&&typeof v==='string'&&v.length>1){dados.add(v);dados.add(v.toUpperCase())}};
  all().forEach(it=>{[label(it.id),it.id,it.name,it.desc,it.responsavel,it.model,it.provider,it.schedule,it.source,it.setor,it.manutencao&&it.manutencao.motivo].forEach(add);(it.skills||[]).forEach(add)});
  ((STATE.layout||{}).zones||[]).forEach(z=>add(z.title)); (STATE.sem_setor||[]).forEach(add);
  const vt=STATE.vault||{}; Object.keys(vt.por_tipo||{}).forEach(add); Object.keys((vt.auditoria||{}).categorias||{}).forEach(add);
  (STATE.feed||[]).forEach(e=>add(e.model));
  const D=[...dados].sort((a,b)=>b.length-a.length), textos=[];
  const colher=()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode()))if(!n.parentElement.closest('#dbg,#dbg3d,#dbgpx,script,style'))textos.push(n.nodeValue);
    document.querySelectorAll('[title],[aria-label]').forEach(e=>{if(!e.closest('#dbg'))textos.push(e.getAttribute('title')||'',e.getAttribute('aria-label')||'')})};
  const antes=VISAO, sel=SEL, guard=(()=>{try{return localStorage.getItem('sala_visao')}catch(e){return null}})();
  const tv=document.body.classList.contains('tv');
  (tv?['office']:['office','lista','jobs']).forEach(v=>{visaoLigar(v);colher()});
  visaoLigar(antes); try{guard==null?localStorage.removeItem('sala_visao'):localStorage.setItem('sala_visao',guard)}catch(e){}
  if(!tv)all().forEach(it=>{if(STATIONS[it.id]){select(it.id);textos.push($('detail').textContent)}});
  if(!tv){if(sel)select(sel);else limparSel()}
  const PT=/[ãõçáéíóúâêôà]|\b(de|da|em|sem|hoje|agora|falha|falhas|rodando|nenhum|nenhuma|atrasado|chamados|equipe|clique|dias|execuç\w*|última|próxima|estação)\b/i, ruins=new Set();
  textos.forEach(t=>{let s=t||'';for(const d of D)if(s.includes(d))s=s.split(d).join(' ');const m=s.match(PT);
    if(m){const i=Math.max(0,m.index-30);ruins.add(s.slice(i,m.index+40).replace(/\s+/g,' ').trim())}});
  return [...ruins].slice(0,10).map(x=>'IDIOMA: texto em português na tela em inglês: «'+x+'»');
}
function debugReport(){
  idiomaAutoteste().forEach(errPush);
  jobsAutoteste().forEach(errPush);
  csvAutoteste().forEach(errPush);
  feedAutoteste().forEach(errPush);
  lateralAutoteste().forEach(errPush);
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
