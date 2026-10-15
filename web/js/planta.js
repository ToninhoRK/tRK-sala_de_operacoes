/* Sala de Operações · Planta isométrica: monta salas, paredes de vidro, objetos de parede, painéis (vault, equipe), móveis e estações.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
/* ---------- construção da planta ---------- */
const ZONES={}, STATIONS={}, WORKERS={};
const DECOR=[], OBST=[];          // objetos pendurados nas paredes; pegadas dos móveis no piso (só para o teste de rotas do ?debug=1)
const obs=(t,a,b,c,d)=>OBST.push([t,a,b,c,d]);
const BINDER=['#3B5B78','#2E4A63','#5E7388','#8A6D3B','#3C6E71','#4A5568','#6B7C8F','#2B3A4A'];

function build(s){
  const svg=$('svg'); svg.innerHTML='';
  const L=s.layout, items={}; [...s.agents,...s.crons,...(s.jarvis?[s.jarvis]:[]),...(s.equipe_estacao||[])].forEach(x=>items[x.id]=x);
  PW=L.plant.w; PH=L.plant.h; OX=PH*S+40;
  [ZONES,STATIONS,WORKERS].forEach(o=>{for(const k in o)delete o[k]}); DECOR.length=0; OBST.length=0; window.__SHELVES=[];
  const top=L.zones.filter(z=>z.y===0), bot=L.zones.filter(z=>z.y>0);
  const topEnd=Math.max(...top.map(z=>z.y+z.h));
  CORR=bot.length?(topEnd+Math.min(...bot.map(z=>z.y)))/2:topEnd+.8;
  VB0=[0,0,(PW+PH)*S+80,(PW+PH)*H+OY+50]; VB=VB0.slice(); applyVB(); if(QS.has('vb')){VB=QS.get('vb').split(',').map(Number);applyVB()}   // ?vb=x,y,w,h: enquadra uma região (só para capturas de teste)
  svg.innerHTML=`<defs>
    <marker id="ar" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 8 4 0 8z" fill="#2A3A4B"/></marker>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FD6EE" stop-opacity=".16"/><stop offset="1" stop-color="#7FD6EE" stop-opacity=".03"/></linearGradient>
  </defs>`;
  const gBase=document.createElementNS(NS,'g'), gWall=document.createElementNS(NS,'g'), gOver=document.createElementNS(NS,'g');
  WORLD.el=document.createElementNS(NS,'g'); WORLD.items=[];
  svg.append(gBase,gWall,WORLD.el,gOver);

  // laje + grade
  let g=`<polygon points="${pts([P(0,PH,0),P(PW,PH,0),P(PW,PH,-12),P(0,PH,-12)])}" fill="#080C12" stroke="#1B2733"/>
    <polygon points="${pts([P(PW,0,0),P(PW,PH,0),P(PW,PH,-12),P(PW,0,-12)])}" fill="#05080C" stroke="#1B2733"/>
    <polygon points="${q(0,0,PW,PH)}" fill="#0A1119" stroke="#2A3A4B"/>`;
  for(let i=1;i<PW;i++)g+=`<line x1="${P(i,0)[0]}" y1="${P(i,0)[1]}" x2="${P(i,PH)[0]}" y2="${P(i,PH)[1]}" stroke="#0E1822"/>`;
  for(let j=1;j<PH;j++)g+=`<line x1="${P(0,j)[0]}" y1="${P(0,j)[1]}" x2="${P(PW,j)[0]}" y2="${P(PW,j)[1]}" stroke="#0E1822"/>`;
  gBase.appendChild(mk(g));

  // zonas
  L.zones.forEach(z=>{
    const cols=z.cols, rows=z.rows;
    z.cw=z.w/cols; z.ch=((z.hn||z.h)-2.4)/rows;
    z.Lmid=cols>1?z.x+z.cw:z.x+z.w-.75; z.Lleft=z.x+.75; z.Lright=z.x+z.w-.75;
    z.rowY=r=>z.y+2.4+(r+.5)*z.ch-.2;
    z.ay=r=>z.rowY(r)+1.7;
    z.stations=[]; z.pois=[]; z.isBottom=z.y>0; ZONES[z.id]=z; CURZ=z.id;
    gBase.appendChild(zoneFloor(z));
    zoneWalls(z);
    zoneProps(z);
  });

  // fluxos
  const pos={};
  L.zones.forEach(z=>z.items.forEach((id,i)=>{
    const r=Math.floor(i/z.cols), c=i%z.cols;
    pos[id]=[z.x+(c+.5)*z.cw, z.rowY(r), z, r];
  }));
  L.flows.forEach(([a,b],i)=>{
    if(!pos[a]||!pos[b])return;
    const [ax,ay]=pos[a],[bx,by]=pos[b];
    const p=document.createElementNS(NS,'polyline');
    p.setAttribute('points',pts([P(ax,ay),P(bx,ay),P(bx,by)]));p.setAttribute('class','flow');p.setAttribute('marker-end','url(#ar)');p.dataset.src=a;
    gBase.appendChild(p);
  });

  // estações
  L.zones.forEach(z=>z.items.forEach(id=>{
    CURZ=z.id; const it=items[id]; if(!it)return;
    const [cx,cy,,row]=pos[id];
    const st={id,it,cx,cy,z,row,isCron:it.kind==='cron',isJarvis:it.kind==='jarvis',isEquipe:it.kind==='equipe'};
    if(st.isCron)obs('rack',cx-.6,cy-.5,cx+.6,cy+.5); else if(st.isJarvis)obs('mesa',cx-1.1,cy-.6,cx+1.1,cy+.6); else obs('mesa',cx-1,cy-.55,cx+1,cy+.55);
    st.ay=z.ay(row);
    STATIONS[id]=st; z.stations.push(st);
    stationBody(st,gBase,gOver);
  }));
  // espaço vazio da zona (nº ímpar de estações): bebedouro
  L.zones.forEach(z=>{
    CURZ=z.id; if(z.cols>1&&z.items.length>0&&z.items.length%z.cols!==0){
      const r=z.rows-1,cx=z.x+((z.items.length%z.cols)+.5)*z.cw,cy=z.rowY(r);
      obs('bebedouro',cx-.3,cy-.3,cx+.3,cy+.3); addItem(cx+cy,mk(box(cx-.3,cy-.3,cx+.3,cy+.3,0,28,'#C4D0DC','#8F9DAC','#6F7C8A')+box(cx-.22,cy-.22,cx+.22,cy+.22,28,44,'#5DD6F0','#2BA9C4','#1E86A0','fill-opacity=".55"')));
      z.pois.push(stop('cooler',[cx+.95,cy+.2],-1,z,[[cx+.95,z.ay(r)]]));
    }
  });
  L.zones.forEach(z=>{ if(z.items.includes('jarvis'))z.pois.push(stop('poster',[z.Lleft,z.y+(z.hn||z.h)+2.9],-1,z,[[z.Lleft,nearestAisle(z,z.y+(z.hn||z.h)+2.9)]])) });
  // funcionários
  Object.values(STATIONS).forEach(st=>{st.stops=stationStops(st)});
  CURZ=null; fitDecor();
  Object.values(STATIONS).forEach(st=>{WORKERS[st.id]=mkWorker(st)});
  sortWorld();
  built=true;
  if(CFG.anim==='desligada')parado();
}

function zoneFloor(z){
  let h=`<polygon points="${q(z.x,z.y,z.x+z.w,z.y+z.h)}" fill="rgba(30,52,72,.7)" stroke="#34506A"/>`;
  for(let i=1;i<z.w;i+=2)h+=`<polygon points="${q(z.x+i,z.y,z.x+i+1,z.y+z.h)}" fill="rgba(255,255,255,.012)"/>`;
  return mk(h);
}
function zoneWalls(z){
  // Paredes de vidro em painéis de ~1,6 un., cada um no mundo com a própria chave de profundidade = INÍCIO do painel
  // (x+y do ponto mais ao fundo). Tudo o que está dentro da sala tem chave maior e é desenhado depois (na frente do vidro);
  // o que está atrás do vidro (outra sala, corredor) vem antes. Chave pelo MEIO do painel fazia o vidro cobrir placas,
  // quadros e estantes encostados nele.
  const WH=70, x0=z.x, x1=z.x+z.w, y0=z.y, y1=z.y+z.h, W=1.6;
  const chunks=(a,b)=>{const r=[];for(let t=a;t<b-.01;t+=W)r.push([t,Math.min(t+W,b)]);return r};
  const door=z.isBottom?[z.Lmid-.6,z.Lmid+.6]:null;
  const spans=door?[[x0,door[0]],[door[1],x1]]:[[x0,x1]];
  const cy='stroke="#2BD4F2" stroke-opacity=".55" stroke-width="1.6" fill="none"', fr='stroke="#2A4458" stroke-opacity=".7" stroke-width=".6"';
  // sala de baixo: o corredor entre as fileiras fica só 0,8 un. atrás da parede dos fundos; +0,6 na chave mantém quem anda nele atrás do vidro
  // (e o que está dentro da sala continua na frente: o item mais próximo da parede, a planta a 0,7 un., tem folga de ~1,2)
  const dk=z.isBottom?.6:0;
  z.gBack=[]; z.gLeft=[];
  if(door)z.gBack.push([door[0],door[1],door[0]+y0+dk]);          // vão da porta: sem vidro, mas placa pode passar por cima
  spans.forEach(([s0,s1])=>chunks(s0,s1).forEach(([a,b])=>{
    const k=a+y0+dk; z.gBack.push([a,b,k]);
    addItem(k, mk(
      `<polygon points="${plY(a,b,y0,0,WH)}" fill="url(#glass)" ${fr}/>
       <polygon points="${plY(a,b,y0,26,40)}" fill="#9FD3E6" fill-opacity=".045"/>
       <polyline points="${pts([P(a,y0,WH),P(b,y0,WH)])}" ${cy}/>`),'vidro').wall='back';
  }));
  z.gBack.sort((p,q)=>p[0]-q[0]);
  chunks(y0,y1).forEach(([a,b])=>{
    const k=x0+a; z.gLeft.push([a,b,k]);
    addItem(k, mk(
      `<polygon points="${plX(x0,a,b,0,WH)}" fill="url(#glass)" ${fr}/>
       <polygon points="${plX(x0,a,b,26,40)}" fill="#9FD3E6" fill-opacity=".045"/>
       <polyline points="${pts([P(x0,a,WH),P(x0,b,WH)])}" ${cy}/>`),'vidro').wall='left';
  });
  // parede da esquerda: painel do vault (DIRETORIA) ou quadro de barras decorativo (sai/muda de lugar se um rótulo cair em cima: fitDecor)
  if(z.items.includes('jarvis')){ if(z.hn&&z.h-z.hn>=4.5)vaultWall(z,z.y+z.hn+.2,145);   // termina 0,4 un. antes da cafeteira
    else{z.vaultCompact=true;vaultWall(z,y0+.4,100)} }      // DIRETORIA rasa (sem canto de convivência): painel compacto, sem estante, desliza para fora do selo (fitDecor)
  else wallDecor(z,'left',y0+3.75,64/S,26,54,a=>{const o=P(x0,a,0);return `<g transform="matrix(-1,.5,0,1,${o[0]},${o[1]})"><rect x="0" y="-54" width="64" height="28" rx="2" fill="#0A1118" stroke="#2A4458"/>`+
      [10,22,14,30,20,36].map((v,i)=>`<rect x="${6+i*9}" y="${-30-v*.55}" width="6" height="${v*.55}" fill="${i%3==2?'#4E6377':'#3A5166'}" opacity=".75"/>`).join('')+`</g>`},'quadro');
  if(z.tipo==='equipe')equipeWall(z);
  // placa do setor na parede dos fundos: sempre cabe na parede (sala estreita: começa mais à esquerda e comprime o texto)
  const nat=z.title.length*9.2+16, off=nat<=(z.w-.95)*S?.8:.4, len=Math.min(nat,(z.w-off-.15)*S);
  const tl=len<nat?` textLength="${(len-18).toFixed(1)}" lengthAdjust="spacingAndGlyphs"`:'';
  wallDecor(z,'back',x0+off,len/S,38,60,(a,dz)=>{const o=P(a,y0,-dz);return `<g class="plq" data-zone="${z.id}" transform="matrix(1,.5,0,1,${o[0]},${o[1]})"><title>${esc(z.title)}: clique para aproximar</title><rect class="plaque" x="0" y="-60" width="${len.toFixed(1)}" height="22" rx="2"/><text class="ptext" x="9" y="-44.5"${tl}>${esc(z.title)}</text></g>`},'placa');
}

/* OBJETOS PENDURADOS NA PAREDE (placa, painéis, quadro). Cada um é fatiado nos mesmos painéis de vidro da parede:
   cada fatia entra no mundo logo DEPOIS do seu painel de vidro (chave do painel + 0,005) e recortada nele (clipPath).
   Assim o vidro nunca passa por cima do objeto, e quem está na frente (bonecos, móveis) continua por cima dele.
   As fatias se sobrepõem 0,015 un. para não aparecer fresta na emenda. */
let CLIPN=0;
function wallDecor(z,side,a,len,z0,z1,draw,kind){const d={z,side,a,len,z0,z1,draw,kind,items:[]};DECOR.push(d);placeDecor(d,a);return d}
function decorPoly(d,a){const b=a+d.len,Z=d.z;return d.side==='back'?[P(a,Z.y,d.z0),P(b,Z.y,d.z0),P(b,Z.y,d.z1),P(a,Z.y,d.z1)]:[P(Z.x,a,d.z0),P(Z.x,b,d.z0),P(Z.x,b,d.z1),P(Z.x,a,d.z1)]}
function placeDecor(d,a,dz){
  d.items.forEach(dropItem); d.items=[]; d.a=a; if(a==null)return;
  if(dz!=null&&dz!==(d.dz||0)){d.z0-=dz-(d.dz||0);d.z1-=dz-(d.dz||0);d.dz=dz}   // dz px = quanto a placa desce na parede
  const z=d.z, b=a+d.len, E=.015, html=d.draw(a,d.dz||0);
  const ch=(d.side==='back'?z.gBack:z.gLeft).filter(([c,e])=>c<b-.001&&e>a+.001);
  ch.forEach(([c,e,k],i)=>{
    const lo=Math.max(a,c)-(i?E:0), hi=Math.min(b,e)+(i<ch.length-1?E:0);
    const poly=d.side==='back'?plY(lo,hi,z.y,d.z0-3,d.z1+3):plX(z.x,lo,hi,d.z0-3,d.z1+3), id='cp'+(++CLIPN);
    const it=addItem(k+.005,mk(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><polygon points="${poly}"/></clipPath><g clip-path="url(#${id})">${html}</g>`),'parede');
    it.z=z.id; it.decor=d; it.clip=poly.split(' ').map(q=>q.split(',').map(Number)); d.items.push(it);
  });
}
// área (px²) da interseção de um polígono convexo com um retângulo
function polyRect(poly,r){
  let Pp=poly; const X1=r.x+r.width, Y1=r.y+r.height;
  const E=[[p=>p[0]>=r.x,(a,b)=>{const t=(r.x-a[0])/(b[0]-a[0]);return[r.x,a[1]+t*(b[1]-a[1])]}],[p=>p[0]<=X1,(a,b)=>{const t=(X1-a[0])/(b[0]-a[0]);return[X1,a[1]+t*(b[1]-a[1])]}],
           [p=>p[1]>=r.y,(a,b)=>{const t=(r.y-a[1])/(b[1]-a[1]);return[a[0]+t*(b[0]-a[0]),r.y]}],[p=>p[1]<=Y1,(a,b)=>{const t=(Y1-a[1])/(b[1]-a[1]);return[a[0]+t*(b[0]-a[0]),Y1]}]];
  for(const [ins,cut] of E){const Q=[];for(let i=0;i<Pp.length;i++){const a=Pp[i],b=Pp[(i+1)%Pp.length],ia=ins(a),ib=ins(b);if(ia){Q.push(a);if(!ib)Q.push(cut(a,b))}else if(ib)Q.push(cut(a,b))}Pp=Q;if(Pp.length<3)return 0}
  let A=0;for(let i=0;i<Pp.length;i++){const a=Pp[i],b=Pp[(i+1)%Pp.length];A+=a[0]*b[1]-b[0]*a[1]}return Math.abs(A)/2;
}
// retângulos dos rótulos e selos. A linha de status muda de texto ("—" na montagem, depois "ÚLT. 14/10 14:35", "RODANDO 00:12"...):
// reserva a largura do texto mais longo (130 px) centrada, para a placa/quadro não ficar sob o rótulo depois da 1ª atualização.
function labelRects(){const R=[];document.querySelectorAll('.lb text, .st:not(.lb) .hex').forEach(t=>{const b=t.getBBox();let x=b.x,w=b.width;
  if(t.dataset.r&&w<130){x=b.x+b.width/2-65;w=130}R.push({x:x-2,y:b.y-1,width:w+4,height:b.height+2,id:t.closest('[data-id]').dataset.id,txt:t.textContent||'selo'})});return R}
// Placa ou quadro com rótulo/selo de estação por cima: desliza ao longo da parede até ficar livre; quadro sem lugar livre sai.
function fitDecor(){
  const R=labelRects(), hit=(d,a,dz=0)=>{const pl=decorPoly(d,a).map(([x,y])=>[x,y+dz]);return R.reduce((s,r)=>s+polyRect(pl,r),0)};
  DECOR.filter(d=>d.kind==='placa'||d.kind==='quadro'||(d.kind==='painel'&&d.z.vaultCompact)).forEach(d=>{
    const Z=d.z, lo=d.side==='back'?Z.x+.3:Z.y+.4, hi=(d.side==='back'?Z.x+Z.w:Z.y+Z.h)-d.len-.15;
    if(hit(d,d.a)<4&&d.a<=hi+1e-6)return;      // fica onde está só se não cobre rótulo E cabe na parede (sala rasa: o quadro passava do fim)
    const shelves=(window.__SHELVES||[]).filter(sh=>Math.abs(sh[0]-Z.x)<.01);
    let best=null;
    for(let a=lo;a<=hi+1e-6;a+=.1){
      if(d.kind!=='placa'&&shelves.some(sh=>a<sh[3]+.1&&a+d.len>sh[1]-.1))continue;
      if(d.kind==='placa'&&(Z.backBlocked||[]).some(([u,v])=>a<v&&a+d.len>u))continue;
      const h=hit(d,a), sc=h*1000+Math.abs(a-d.a); if(!best||sc<best.sc)best={a,sc,h};
    }
    if(best&&best.h<4){placeDecor(d,best.a);return}
    if(d.kind==='quadro'){placeDecor(d,null);return}
    // placa em sala estreita (sem para onde deslizar): desce na parede, sem invadir o painel da equipe (z até 37)
    const baixo=Z.tipo==='equipe'?[]:[12,24];
    for(const dz of baixo){for(let a=lo;a<=hi+1e-6;a+=.1){const h=hit(d,a,dz);if(h<4){placeDecor(d,a,dz);return}}}
    if(best)placeDecor(d,best.a);
  });
}
function zoomZone(id){
  const z=ZONES[id]; if(!z)return;
  let l=(z.x-(z.y+z.h))*S+OX-30, r=(z.x+z.w-z.y)*S+OX+30, t=(z.x+z.y)*H+OY-130, b=(z.x+z.w+z.y+z.h)*H+OY+60;
  let w=r-l, h=b-t; const k=VB0[3]/VB0[2];
  if(h/w<k){const nh=w*k;t-=(nh-h)/2;h=nh}else{const nw=h/k;l-=(nw-w)/2;w=nw}
  VB=[l,t,w,h]; applyVB();
}
/* PAREDE DE INDICADORES da DIRETORIA (parede da esquerda, que agora é a parede externa do prédio: a sala foi trocada de lugar com RH & PESSOAS
   para não ter sala vizinha com rótulos na frente). Só números; os textos são atualizados por renderVault().
   O texto segue a parede com matrix(1,-.5,0,1) a partir da ponta da frente (maior y), para ler da esquerda para a direita. */
function vaultWall(z,ya,W){
  // parede da esquerda, na altura do canto de convivência (acima dos sofás, até a cafeteira): ali não há mesa, selo nem boneco na frente.
  // Compacto (W<120, DIRETORIA rasa): só total e auditoria; as variações ficam no tooltip.
  const x0=z.x, F='font-family="ui-monospace,Menlo,Consolas,monospace"', C=W<120;
  wallDecor(z,'left',ya,W/S,6,65,a=>{const o=P(x0,a+W/S,0);return `<g transform="matrix(1,-.5,0,1,${o[0]},${o[1]})"><title data-v="t">notas do vault</title>
    <rect x="0" y="-65" width="${W}" height="59" rx="2.5" fill="#0A1118" stroke="#2A4458"/>
    <text x="7" y="-54" ${F} font-size="${C?8:9}" fill="#8FB0C4" letter-spacing=".4">${C?'NOTAS · VAULT':'NOTAS NO VAULT'}</text>
    <text data-v="n" x="7" y="-29" ${F} font-size="${C?24:28}" font-weight="700" fill="#E6F4FA">—</text>`+(C?'':`
    <text data-v="d1" x="${W-7}" y="-41" text-anchor="end" ${F} font-size="11.5" font-weight="700" fill="#2BD4F2"></text>
    <text data-v="d2" x="${W-7}" y="-29" text-anchor="end" ${F} font-size="10" fill="#8FB0C4"></text>`)+`
    <line x1="5" y1="-23" x2="${W-5}" y2="-23" stroke="#2A4458" stroke-width=".7"/>
    <text x="7" y="-11" ${F} font-size="${C?7.5:9}" fill="#8FB0C4" letter-spacing=".4">${C?'AUDIT.':'AUDITORIA'}</text>
    <circle data-v="led" cx="${C?40:70}" cy="-14.2" r="4.2" fill="#566A7B"/>
    <text data-v="a" x="${C?48:79}" y="-10.4" ${F} font-size="${C?10:11.5}" font-weight="700" fill="#9FB4C4">—</text>
    </g>`},'painel');
}
/* SALA GOVERNANÇA (equipe do Agidesk): painel na parede dos fundos, logo abaixo da placa, com os totais da equipe. Só números; textos atualizados por renderEquipe(). */
function equipeWall(z){
  const x0=z.x, W=Math.min(112,(z.w-.7)*S), F='font-family="ui-monospace,Menlo,Consolas,monospace"';
  wallDecor(z,'back',x0+.35,W/S,1,37,a=>{const o=P(a,z.y,0);return `<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})"><title data-e="t">equipe Governança de TI no Agidesk</title>
    <rect x="0" y="-37" width="${W}" height="35" rx="2" fill="#0A1118" stroke="#2A4458"/>
    <text x="5" y="-26.5" ${F} font-size="8" fill="#8FB0C4">EM ABERTO</text>
    <text data-e="ab" x="${W-5}" y="-25.5" text-anchor="end" ${F} font-size="12" font-weight="700" fill="#E6F4FA">—</text>
    <text x="5" y="-14.5" ${F} font-size="8" fill="#8FB0C4">SEM RESPONS.</text>
    <text data-e="sr" x="${W-5}" y="-13.5" text-anchor="end" ${F} font-size="12" font-weight="700" fill="#F2A93B">—</text>
    <text data-e="ts" x="5" y="-5" ${F} font-size="6.6" fill="#6F8496">—</text></g>`},'painel');
}
const setD=(attr,k,txt,fill)=>document.querySelectorAll('['+attr+'="'+k+'"]').forEach(e=>{if(txt!=null)e.textContent=txt;if(fill)e.setAttribute('fill',fill)});
function renderEquipe(s){
  if(!document.querySelector('[data-e="ab"]'))return;
  const e=s.equipe||null, f=v=>v==null?'—':String(v), E=(k,t,c)=>setD('data-e',k,t,c);
  if(!e){E('ab','—');E('sr','—');E('ts','aguardando leitura');return}
  E('ab',f(e.abertos_total)); E('sr',f(e.sem_responsavel),e.sem_responsavel>0?'#F2A93B':'#8FE0AE');
  const m=e.age_s; E('ts','lido há '+(m<90?'instantes':Math.round(m/60)+' min')+(e.velho?' · DEFASADO':''),e.velho?'#F2A93B':'#6F8496');
  E('t','Equipe Governança de TI no Agidesk: '+f(e.abertos_total)+' chamados em aberto, '+f(e.sem_responsavel)+' sem responsável (lido há '+(m<90?'instantes':Math.round(m/60)+' min')+')');
}
function renderVault(s){
  if(!document.querySelector('[data-v="n"]'))return;
  const v=s.vault||null, V=(k,t,c)=>setD('data-v',k,t,c);
  if(!v||v.total==null){V('n','—');V('d1','');V('d2','aguardando contagem');V('led',null,'#566A7B');V('a','—');return}
  V('n',v.total.toLocaleString('pt-BR'));
  const sg=x=>(x>0?'+':x<0?'−':'±')+Math.abs(x);
  if(v.delta_hoje==null){V('d1','');V('d2','desde hoje')}
  else{V('d1',sg(v.delta_hoje)+' hoje');V('d2',sg(v.delta_semana)+(v.dias_semana>=7?' em 7 dias':' em '+v.dias_semana+' d'))}
  const au=v.auditoria, vel=au&&au.age_s>5400;
  if(!au){V('led',null,'#566A7B');V('a','—','#9FB4C4')}
  else if(au.divergencias===0){V('led',null,vel?'#566A7B':'#46BE72');V('a','OK'+(vel?' (antiga)':''),vel?'#9FB4C4':'#8FE0AE')}
  else{V('led',null,vel?'#566A7B':'#EF4444');V('a',au.divergencias+' DIVERG.'+(vel?' (antiga)':''),vel?'#9FB4C4':'#F2B8B8')}
  V('t','Notas no vault: '+v.total.toLocaleString('pt-BR')+' (contagem de '+(v.age_s<90?'instantes':Math.round(v.age_s/60)+' min')+' atrás). Por tipo: '+Object.entries(v.por_tipo||{}).map(([k,x])=>k+' '+x).join(' · ')
    +(au?'. Auditoria conferida há '+(au.age_s<90?'instantes':Math.round(au.age_s/60)+' min')+': '+(au.divergencias===0?'nenhuma divergência':au.divergencias+' divergência(s) ('+Object.entries(au.categorias||{}).map(([k,x])=>k+' '+x).join(', ')+')'):''));
}

/* adereços fixos da sala: estantes, impressora, planta */
function meetingProps(z){
  const x0=z.x,x1=z.x+z.w,y0=z.y;
  if(z.w<7||z.h<10){meetingSmall(z);return}   // a mesa grande abaixo pede ~7 × 10 un.; sala menor (ex.: layout genérico) usa a compacta
  const cxm=x0+z.w/2-.75, tx0=cxm-.9, tx1=cxm+.9, ty0=y0+4.0, ty1=y0+9.0;
  // cadeiras do lado direito da mesa
  [0,1,2,3].forEach(i=>{const cy=ty0+.6+i*1.25,cx=tx1+.2; obs('cadeira',cx,cy-.3,cx+.6,cy+.3);
    addItem(cx+cy+.3,mk(box(cx,cy-.3,cx+.55,cy+.3,9,12,'#142233','#0B1520','#09111A')+box(cx+.45,cy-.3,cx+.6,cy+.3,12,30,'#1A2B3E','#0B1520','#09111A')))});
  // mesa com notebooks e um ponto de apresentação
  obs('mesa de reunião',tx0,ty0,tx1,ty1); let tb=box(tx0,ty0,tx1,ty1,0,21,'#27415A','#14222F','#0D1823');
  [[.5,.8],[.5,2.4],[.5,4.0]].forEach(([dx,dy])=>{tb+=`<polygon points="${q(tx0+dx,ty0+dy,tx0+dx+.5,ty0+dy+.4,21)}" fill="#DCE6EE" opacity=".8"/>`});
  tb+=`<polygon points="${q(cxm-.2,ty0+2.2,cxm+.2,ty0+2.7,21)}" fill="#5B6B7C" opacity=".7"/>`;
  addItem((tx0+tx1)/2+(ty0+ty1)/2,mk(tb));
  // quadro branco na parede dos fundos, centrado
  const o=P(x0+z.w/2-1.4,y0,0); z.backBlocked=[[x0+z.w/2-1.9,x0+z.w/2+1.9]];   // trecho do quadro branco: a placa não desliza para cima dele
  addItem(x0+z.w/2+y0+2.3,mk(`<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})"><rect x="0" y="-36" width="84" height="26" rx="2" fill="#DCE6EE" fill-opacity=".9" stroke="#8FA1B5"/><path d="M8 -29H44M8 -23H62M8 -17H34" stroke="#3B5B78" stroke-width="1.6" fill="none"/><path d="M52 -17 60 -29 70 -20" stroke="#C0392B" stroke-width="1.6" fill="none"/></g>`));
  // planta
  plantAt(x0+.8,y0+.8);           // canto esquerdo dos fundos: no direito ela ficava na porta (a pista de entrada passa ali)
  // sala larga (a REUNIÃO absorve a sobra de largura da fila): cantos de convivência com sofás e mesinha nos dois lados da mesa, para não sobrar piso vazio
  if(z.w>9){
    const ly=y0+Math.min(10.2,z.h-3.5);  // 0,6 un. abaixo do corredor da sala (z.ay(0)): antes o sofá da direita invadia a passagem
    const lounge=(xa,xb)=>{ if(xb-xa<1.6)return;
      sofaAt(xa,xb,ly,false);
      obs('mesinha',xa+.35,ly+1.5,xb-.35,ly+2.1); addItem((xa+xb)/2+ly+1.8,mk(box(xa+.35,ly+1.5,xb-.35,ly+2.1,0,8,'#1E3248','#10202F','#0B1621')));
      sofaAt(xa,xb,ly+2.6,true) };
    lounge(x0+1.0,Math.min(x0+3.2,tx0-1.5));
    lounge(Math.max(tx1+1.9,x1-3.2),x1-1.0);
  }
  // em pé, do lado esquerdo da mesa
  const ay=z.ay(0), sx=tx0-.95;
  [ty0+.9,ty0+2.7,ty0+4.5].forEach(y=>z.pois.push(stop('meeting',[sx,y],1,z,[[sx,ay]])));
}
function plantAt(px,py){
  obs('planta',px-.22,py-.22,px+.22,py+.22);
  addItem(px+py,mk(box(px-.22,py-.22,px+.22,py+.22,0,11,'#1E2D3D','#121D29','#0B141D')+[[0,16,14],[-.15,22,12],[.18,22,12],[0,29,10]].map(([dx,zz,r])=>{const c=P(px+dx,py,zz);return `<ellipse cx="${c[0]}" cy="${c[1]}" rx="${r*.8}" ry="${r*.55}" fill="#2F6B4F" stroke="#1C4733"/>`}).join('')));
}
// Sala de reunião pequena: mesa compacta entre a parede da esquerda e a pista/porta da direita (x1 − 0,75),
// acima do corredor da sala (z.ay(0)); 2 cadeiras à direita, 2 pontos de reunião em pé à esquerda. Nada fora da sala.
function meetingSmall(z){
  const x0=z.x,x1=z.x+z.w,y0=z.y,ay=z.ay(0);
  const fx0=x0+1.05, fx1=Math.min(x1-1.65,fx0+1.4), fy0=y0+Math.max(1.6,(ay-y0)/2-.9), fy1=Math.min(fy0+1.2,ay-.75);
  if(fx1-fx0<.6||fy1-fy0<.6){plantAt(x0+.8,y0+.8);return}
  if(fx1+.8<x1-1.0)[fy0+.3,fy1-.3].forEach(cy=>{const cx=fx1+.2; obs('cadeira',cx,cy-.3,cx+.55,cy+.3);
    addItem(cx+cy+.3,mk(box(cx,cy-.3,cx+.55,cy+.3,9,12,'#142233','#0B1520','#09111A')+box(cx+.45,cy-.3,cx+.6,cy+.3,12,30,'#1A2B3E','#0B1520','#09111A')))});
  obs('mesa de reunião',fx0,fy0,fx1,fy1);
  addItem((fx0+fx1)/2+(fy0+fy1)/2,mk(box(fx0,fy0,fx1,fy1,0,21,'#27415A','#14222F','#0D1823')+`<polygon points="${q(fx0+.3,fy0+.3,fx0+.75,fy0+.65,21)}" fill="#DCE6EE" opacity=".8"/>`));
  const o=P(x0+z.w/2-1.4,y0,0); z.backBlocked=[[x0+z.w/2-1.9,x0+z.w/2+1.9]];
  addItem(x0+z.w/2+y0+2.3,mk(`<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})"><rect x="0" y="-36" width="84" height="26" rx="2" fill="#DCE6EE" fill-opacity=".9" stroke="#8FA1B5"/><path d="M8 -29H44M8 -23H62M8 -17H34" stroke="#3B5B78" stroke-width="1.6" fill="none"/><path d="M52 -17 60 -29 70 -20" stroke="#C0392B" stroke-width="1.6" fill="none"/></g>`));
  if(fy0>y0+1.45)plantAt(x0+.8,y0+.8);
  const sx=fx0-.42; [fy0+.25,fy1-.25].forEach(y=>z.pois.push(stop('meeting',[sx,y],1,z,[[sx,ay]])));
}
function sofaAt(xa,xb,ya,frente){
  const yb=ya+.8; obs('sofá',xa,ya,xb,yb);
  addItem((xa+xb)/2+ya,mk(box(xa,ya,xb,yb,0,14,'#2C4258','#192838','#122030')+(frente?box(xa,yb-.22,xb,yb,14,30,'#2F4860','#1B2C3F','#14202F'):box(xa,ya-.02,xb,ya+.22,14,30,'#2F4860','#1B2C3F','#14202F'))));
}
function rackDecor(cx,cy){ obs('rack',cx-.5,cy-.45,cx+.5,cy+.45);
  const o=P(cx-.5,cy+.45,0); let r=box(cx-.5,cy-.45,cx+.5,cy+.45,0,56,'#1A2B3E','#0F1A27','#0A121A')+`<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})">`;
  for(let i=0;i<5;i++)r+=`<rect x="3" y="${-50+i*10}" width="24" height="6" fill="#070C12" stroke="#2A3A4B" stroke-width=".6"/><rect x="5.5" y="${-48+i*10}" width="3" height="2" fill="#5B6B7C" opacity=".7"/><rect x="12" y="${-48+i*10}" width="12" height="2" fill="#1B2733"/>`;
  addItem(cx+cy,mk(r+'</g>'));
}
function extraProps(z){
  // quando a sala é mais funda que as estações pedem, a sobra vira ambiente: servidores (agendador) ou convivência (café, sofás)
  if(!z.hn||z.h-z.hn<4.5)return;
  const x0=z.x,x1=z.x+z.w,y1=z.y+z.h,ye=z.y+z.hn+.5,E=y1-ye;
  if((z.items[0]||'').startsWith('cron:')){
    [[1.5,ye+1.1],[2.9,ye+1.1],[5.3,ye+1.1],[6.7,ye+1.1],[1.5,ye+3.7],[2.9,ye+3.7],[5.3,ye+3.7],[6.7,ye+3.7]].forEach(([dx,yy])=>{if(x0+dx+.6<x1-.9&&yy+.6<y1)rackDecor(x0+dx,yy)});
    return;
  }
  const xa=x0+1.3, xb=Math.min(x0+3.3,x1-1.1);
  sofaAt(xa,xb,ye+.3,false);
  obs('mesinha',xa+.35,ye+1.7,xb-.35,ye+2.4); addItem((xa+xb)/2+ye+2.0,mk(box(xa+.35,ye+1.7,xb-.35,ye+2.4,0,8,'#1E3248','#10202F','#0B1621')));
  if(E>=5)sofaAt(xa,xb,ye+3.0,true);
  if(E>=6.2){
    const yc=ye+4.9;                                         // cafeteira na parede da esquerda
    obs('cafeteira',x0,yc,x0+.55,yc+1.1); addItem(x0+.55+yc+1.1,mk(box(x0,yc,x0+.55,yc+1.1,0,14,'#C4D0DC','#8F9DAC','#6F7C8A')+box(x0+.05,yc+.2,x0+.5,yc+.9,14,30,'#22344A','#142130','#0C1621')+
      `<polygon points="${plX(x0+.5,yc+.3,yc+.5,20,26)}" fill="#2BD4F2"/>`));
    z.pois.push(stop('cooler',[z.Lleft+.3,yc+.55],-1,z,[[z.Lleft,yc+.55],[z.Lleft,nearestAisle(z,yc)]]));
  }
  plantAt(x0+2.2,y1-.7);
}
function zoneProps(z){
  if(z.tipo==='reuniao'){meetingProps(z);return}
  extraProps(z);
  const x0=z.x,x1=z.x+z.w,y0=z.y,y1=z.y+z.h;
  const shelves=z.vaultCompact?[]:[[y0+1.4,y0+3.2]]; if((z.hn||z.h)>9)shelves.push([y1-3.9,y1-2.1]);   // DIRETORIA rasa: a parede é do painel do vault
  shelves.forEach(([ya,yb])=>{
    // A estante encosta no vidro da esquerda, mas fica DENTRO da sala (na frente do vidro). Cada fatia de 0,6 un. entra no mundo
    // com a chave da sua borda da frente (x0+.5+y fim): assim sempre é desenhada depois dos painéis de vidro (1,6 un., chave = meio)
    // e ainda deixa passar à frente dela quem está em pé diante da estante.
    (window.__SHELVES=window.__SHELVES||[]).push([x0,ya,x0+SHELF_D,yb]); obs('estante',x0,ya,x0+SHELF_D,yb);
    const xf=x0+SHELF_D, n=Math.max(1,Math.round((yb-ya)/.6)), dy=(yb-ya)/n;
    for(let k=0;k<n;k++){
      const s0=ya+k*dy, s1=s0+dy;
      let h=box(x0,s0,x0+SHELF_D,s1,0,56,'#182636','#0D1620','#0F1A26'), b='';
      for(let r=0;r<3;r++){
        const zb=5+r*17;
        b+=`<polyline points="${pts([P(xf,s0,zb-1),P(xf,s1,zb-1)])}" stroke="#3A5166" stroke-width="1.2" fill="none"/>`;
        for(let y=s0+(k===0?.1:0);y<s1-(k===n-1?.12:.0)-.01;y+=.13){const hh=rr(8,14),w=Math.min(.09,s1-y);
          b+=`<polygon points="${pts([P(xf,y,zb),P(xf,y+w,zb),P(xf,y+w,zb+hh),P(xf,y,zb+hh)])}" fill="${pick(BINDER)}" stroke="#0B131C" stroke-width=".4"/>`;}
      }
      addItem(x0+SHELF_D+s1, mk(h+b));
    }
    z.pois.push(stop('shelf',[z.Lleft,(ya+yb)/2],-1,z,[[z.Lleft,nearestAisle(z,(ya+yb)/2)]]));
  });
  if(z.cols>1){
    const px=x1-1.5;
    obs('impressora',px,y0+.25,px+1,y0+.95); addItem(px+1+y0+.95, mk(   // chave pela quina da frente: a antiga (+1,8+0,5) passava na frente do vidro da sala vizinha
      box(px,y0+.25,px+1,y0+.95,0,16,'#22344A','#142130','#0C1621')+box(px+.12,y0+.32,px+.88,y0+.88,16,21,'#2D4660','#1A2A3D','#122030')+
      `<polygon points="${plY(px+.1,px+.4,y0+.95,9,12)}" fill="#2BD4F2" opacity=".8"/>`));
    z.pois.push(stop('printer',[z.Lright,y0+1.9],1,z,[[z.Lright,nearestAisle(z,y0+1.9)]]));
  }
  if(z.rows>=2){
    const ya=z.ay(0)+.7, yb=ya+.8;
    Array.from({length:z.cols},(_,c)=>[x0+c*z.cw+1.2,x0+(c+1)*z.cw-.8]).forEach(([xa,xb])=>{
      if(xb>x1-.9)return; obs('sofá',xa,ya,xb,yb);
      addItem((xa+xb)/2+ya, mk(box(xa,ya,xb,yb,0,14,'#2C4258','#192838','#122030')+box(xa,ya-.02,xb,ya+.22,14,30,'#2F4860','#1B2C3F','#14202F')));
    });
  }
  if(z.tipo!=='equipe')plantAt(x0+.9,y0+.7);   // na GOVERNANÇA esse canto é do painel da equipe (a planta tapava a linha "lido há")
}
function nearestAisle(z,y){let best=0,bd=1e9;for(let r=0;r<z.rows;r++){const d=Math.abs(z.ay(r)-y);if(d<bd){bd=d;best=r}}return z.ay(best)}

/* mesa + cadeira + monitor, ou rack (agendador); anel de status no piso; hexágono e rótulo em camada superior */
function stationBody(st,gBase,gOver){
  const {cx,cy,id,it,isCron}=st, c0=P(cx,cy);
  const gb=document.createElementNS(NS,'g'); gb.setAttribute('class','st idle'); gb.dataset.id=id;
  gb.innerHTML=`<polygon class="sel" points="${q(cx-1.9,cy-1.7,cx+1.9,cy+1.2)}"/>
    <ellipse class="ring" cx="${c0[0]}" cy="${c0[1]}" rx="${isCron?58:90}" ry="${isCron?29:45}"/>
    <ellipse class="pulse" cx="${c0[0]}" cy="${c0[1]}" rx="${isCron?58:90}" ry="${isCron?29:45}"/>`;
  gBase.appendChild(gb);

  let h='';
  const gs=document.createElementNS(NS,'g'); gs.setAttribute('class','st idle desk'); gs.dataset.id=id;
  if(st.isJarvis){
    addItem(cx+cy-1.0,mk(box(cx-.45,cy-1.35,cx+.45,cy-.55,10,13,'#0F1B2B','#091320','#07101A')+box(cx-.45,cy-1.55,cx+.45,cy-1.38,13,46,'#14263B','#091320','#07101A')+
      `<line x1="${P(cx,cy-.95,0)[0]}" y1="${P(cx,cy-.95,0)[1]}" x2="${P(cx,cy-.95,10)[0]}" y2="${P(cx,cy-.95,10)[1]}" stroke="#2A3A4B" stroke-width="2"/>`));
    h=box(cx-1.1,cy-.6,cx+1.1,cy+.6,0,22,'#1B2F4A','#0F1C2D','#0A1422');
    h+=`<polyline points="${pts([P(cx-1.1,cy+.6,22),P(cx+1.1,cy+.6,22)])}" stroke="#2BD4F2" stroke-opacity=".75" stroke-width="1.4" fill="none"/><polyline points="${pts([P(cx+1.1,cy-.6,22),P(cx+1.1,cy+.6,22)])}" stroke="#2BD4F2" stroke-opacity=".75" stroke-width="1.4" fill="none"/>`;
    [-.55,.5].forEach(mx=>{h+=box(mx+cx-.1,cy-.25,mx+cx+.1,cy-.15,22,27,'#16222F','#0B131C','#0B131C')+box(mx+cx-.42,cy-.25,mx+cx+.42,cy-.15,26,46,'#1A2A3B','#0E1823','#0A121A')+`<polygon class="rim" points="${plY(mx+cx-.36,mx+cx+.36,cy-.15,42,44.5)}"/>`});
    const o=P(cx-.5,cy+.6,0);
    h+=`<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})"><rect x="0" y="-19" width="30" height="9" rx="1" fill="#0A1118" stroke="#2BD4F2" stroke-opacity=".8" stroke-width=".6"/><text x="15" y="-12.4" font-family="ui-monospace,Menlo,monospace" font-size="6.2" font-weight="700" letter-spacing=".6" fill="#2BD4F2" text-anchor="middle">JARVIS</text></g>`;
    h+=`<polygon points="${q(cx+.35,cy+.05,cx+.85,cy+.37,22)}" fill="#C9D6E2" opacity=".8" stroke="#8FA1B5" stroke-width=".5"/>`;
    gs.innerHTML=h; addItem(cx+cy,gs);
  } else if(!isCron){
    const ch=mk(box(cx-.38,cy-1.3,cx+.38,cy-.55,10,13,'#142233','#0B1520','#09111A')+box(cx-.38,cy-1.48,cx+.38,cy-1.34,13,38,'#1A2B3E','#0B1520','#09111A')+
      `<line x1="${P(cx,cy-.9,0)[0]}" y1="${P(cx,cy-.9,0)[1]}" x2="${P(cx,cy-.9,10)[0]}" y2="${P(cx,cy-.9,10)[1]}" stroke="#2A3A4B" stroke-width="2"/>`);
    addItem(cx+cy-1.0,ch);
    h=box(cx-1,cy-.55,cx+1,cy+.55,0,22,'#203348','#111C28','#0B131C');
    h+=`<polyline points="${pts([P(cx+1,cy-.4,9),P(cx+1,cy+.4,9)])}" stroke="#34495E" stroke-width="1.2" fill="none"/><polyline points="${pts([P(cx+1,cy-.4,15),P(cx+1,cy+.4,15)])}" stroke="#34495E" stroke-width="1.2" fill="none"/>`;
    h+=box(cx-.1,cy-.22,cx+.1,cy-.1,22,27,'#16222F','#0B131C','#0B131C');
    h+=box(cx-.58,cy-.22,cx+.58,cy-.12,26,47,'#1A2A3B','#0E1823','#0A121A');
    h+=`<polygon class="rim" points="${plY(cx-.5,cx+.5,cy-.12,43,45.5)}"/><polygon class="rim" points="${plY(cx+.3,cx+.5,cy-.12,29,32)}"/>`;
    h+=`<polygon points="${q(cx+.15,cy+.1,cx+.7,cy+.42,22)}" fill="#C9D6E2" opacity=".8" stroke="#8FA1B5" stroke-width=".5"/><polygon points="${q(cx+.25,cy+.18,cx+.78,cy+.46,22.8)}" fill="#DCE6EE" opacity=".8" stroke="#8FA1B5" stroke-width=".5"/>`;
    h+=box(cx-.78,cy+.15,cx-.58,cy+.35,22,28,'#E6EEF6','#AEBBC8','#8895A3');
    gs.innerHTML=h; addItem(cx+cy,gs);
  } else {
    h=box(cx-.6,cy-.5,cx+.6,cy+.5,0,56,'#1A2B3E','#0F1A27','#0A121A');
    const o=P(cx-.6,cy+.5,0);
    h+=`<g transform="matrix(1,.5,0,1,${o[0]},${o[1]})">`;
    for(let i=0;i<5;i++)h+=`<rect x="4" y="${-50+i*10}" width="28" height="6" fill="#070C12" stroke="#2A3A4B" stroke-width=".6"/><rect class="led" x="7" y="${-48+i*10}" width="3" height="2"/><rect x="14" y="${-48+i*10}" width="14" height="2" fill="#1B2733"/>`;
    h+=`</g><polygon class="rim" points="${plY(cx-.5,cx+.5,cy+.5,53,55)}"/>`;
    gs.innerHTML=h; addItem(cx+cy,gs);
  }
  const av=P(cx,cy,isCron?84:78);
  const lb=P(cx+(isCron?.6:(st.isJarvis?1.1:1)),cy+(isCron?.5:(st.isJarvis?.6:.55))), lx=c0[0], ly=lb[1]+14;
  const ov=document.createElementNS(NS,'g'); ov.setAttribute('class','st idle'); ov.dataset.id=id;
  const tb=P(cx,cy,isCron?58:50);
  ov.innerHTML=`<line x1="${tb[0]}" y1="${tb[1]}" x2="${av[0]}" y2="${av[1]+11}" stroke="var(--c)" stroke-opacity=".5" stroke-dasharray="2 3"/><g class="avatar"><polygon class="hex" points="${hex(av[0],av[1],11)}"/>${glyph(av[0],av[1])}</g>
    <rect class="hit" x="${av[0]-24}" y="${av[1]-14}" width="48" height="28"/>`;
  gOver.appendChild(ov);
  const lg=document.createElementNS(NS,'g'); lg.setAttribute('class','st lb idle'); lg.dataset.id=id;
  lg.innerHTML=st.isEquipe&&it.decor?''
    :st.isEquipe
    ?`<text class="nm" x="${lx}" y="${ly}">${esc(it.name).toUpperCase()}</text><text class="sx" x="${lx}" y="${ly+14}" data-r="sx">—</text>`+(st.z.cols>1?'':`<text class="sx" x="${lx}" y="${ly+27}" data-r="sy">—</text>`)+`<title>Equipe Governança de TI: chamados em aberto e encerrados hoje (totais da equipe, sem números por pessoa)</title>`
    :`<text class="nm" x="${lx}" y="${ly}">${esc(label(id).toUpperCase())}</text><text class="sx" x="${lx}" y="${ly+14}" data-r="sx">—</text><title>${esc(label(id))}</title>`;
  gOver.appendChild(lg);
  [gb,gs,ov].forEach(e=>e.addEventListener('click',()=>select(it.decor?'equipe:agidesk':id)));   // mesa ilustrativa da equipe abre a estação da equipe
}
function glyph(x,y){
  const t=d=>`<path d="${d}" transform="translate(${x} ${y})"/>`;
  return `<g class="gl gl-run">${t('M-3 -4.5 4.5 0-3 4.5z')}</g><g class="gl gl-ok">${t('M-4.5 0 -1.2 3.2 4.5 -3.2')}</g><g class="gl gl-err">${t('M-3.6 -3.6 3.6 3.6M3.6 -3.6 -3.6 3.6')}</g><g class="gl gl-idle">${t('M-3.6 0H3.6')}</g><g class="gl gl-late">${t('M0 -4.6A4.6 4.6 0 1 1 -.01 -4.6M0 -2.6V0L2.3 1.5')}</g>`;
}
function hex(x,y,r){let a=[];for(let i=0;i<6;i++){const t=Math.PI/3*i+Math.PI/6;a.push((x+r*Math.cos(t)).toFixed(1)+','+(y+r*Math.sin(t)).toFixed(1))}return a.join(' ')}
function select(id){SEL=id;document.querySelectorAll('.st').forEach(e=>e.classList.toggle('selected',e.dataset.id===SEL&&!e.classList.contains('lb')));renderDetail()}
