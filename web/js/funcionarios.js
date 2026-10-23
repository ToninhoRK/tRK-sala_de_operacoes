/* Sala de Operações · Funcionários: paradas, rotas, aparência, comportamento por estado e laço de simulação.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build, sem dependências). */
/* ---------- paradas (onde um funcionário pode estar) e rotas ---------- */
function stop(type,pos,face,z,acc){return {type,pos,face,z,acc,entry:acc.length?acc[acc.length-1]:pos}}
function stationStops(st){
  const {cx,cy,z,ay}=st;
  if(st.isCron){
    const w=stop('work',[cx+1.2,cy+.15],-1,z,[[cx+1.2,ay]]);
    return {home:w,side:w,visit:stop('visit',[cx+1.2,cy+.85],1,z,[[cx+1.2,ay]])};   // visitante fica ao lado do técnico, não no lugar dele
  }
  const dx=st.isJarvis?1.5:1.45;           // a mesa da diretoria é mais larga
  const seat=stop('seat',[cx,cy-.95],0,z,[[cx+dx,cy-.95],[cx+dx,ay]]);
  const side=stop('side',[cx+dx,cy-.05],-1,z,[[cx+dx,ay]]);
  const visit=stop('visit',[cx+dx+.05,cy+.75],1,z,[[cx+dx+.05,ay]]);   // visitante: à frente do colega, virado para ele (antes ia para o mesmo ponto do colega)
  return {home:seat,side,visit};
}
function route(A,B){
  // cada ponto: [x, y, naRede, idDaZona]. "naRede" = ponto de corredor/corredor-de-ligação, de onde dá para replanejar sem atravessar móveis.
  const out=[];
  const add=(p,net,z)=>{const l=out[out.length-1];
    if(!l||Math.hypot(l[0]-p[0],l[1]-p[1])>.01)out.push([p[0],p[1],!!net,z.id]); else if(net)l[2]=true};
  A.acc.forEach((p,i)=>add(p,i===A.acc.length-1,A.z));
  const ya=A.entry[1], yb=B.entry[1];
  if(A.z===B.z){ if(Math.abs(ya-yb)>.01){add([A.z.Lmid,ya],true,A.z);add([A.z.Lmid,yb],true,A.z)} }
  else { add([A.z.Lmid,ya],true,A.z);add([A.z.Lmid,CORR],true,A.z);add([B.z.Lmid,CORR],true,B.z);add([B.z.Lmid,yb],true,B.z) }
  const back=B.acc.slice().reverse();
  back.forEach((p,i)=>add(p,i===0,B.z)); add(B.pos,false,B.z);
  return out;
}
// Interrompe o trajeto atual no próximo ponto de rede e segue direto para a estação (sem esperar chegar ao destino antigo)
function replan(w,want){
  const idx=w.path.findIndex(p=>p[2]);
  if(idx<0)return false;                 // só falta o trecho final: replaneja ao chegar
  const wp=w.path[idx];
  const v={pos:[wp[0],wp[1]],acc:[],entry:[wp[0],wp[1]],z:ZONES[wp[3]]};
  const rest=route(v,want);
  if(rest.length&&Math.hypot(rest[0][0]-wp[0],rest[0][1]-wp[1])<.01)rest.shift();
  w.path=w.path.slice(0,idx+1).concat(rest); w.dest=want; return true;
}

/* ---------- funcionários ---------- */
const SKIN=['#F0C8A5','#E3B088','#C98F66','#9A6B4A','#7A4E36'];
const HAIR=['#17171B','#2E2118','#5A3C22','#8A8D91','#B9965A','#4A2B1C'];
const JACK=['#3B5876','#4C5E73','#5A6B7E','#2F5670','#46566A','#3E5A80'];
const SHIRT=['#F2F5F8','#CFE3F2','#E8EDF2','#BFD6E6'];
const TIE=['#7B2D3B','#1F6F82','#3C4A5E','#6A4C93','#2F5D50','#8A5A2B'];
function mkWorker(st){
  const R=mulberry(hash(st.id)), pk=a=>a[Math.floor(R()*a.length)];
  let fem=R()<.4, glasses=R()<.4, skin=pk(SKIN), hair=pk(HAIR), jk=pk(JACK), sh=pk(SHIRT), tie=pk(TIE);
  if(st.isJarvis){fem=false;glasses=true;skin='#E8B896';hair='#2A1D14';jk='#0F131A';sh='#F2F5F8'}   // Jarvis = robô prateado genérico (sem personagem de terceiros): corpo metálico, juntas grafite, viseira e núcleo ciano
  const IM=!!st.isJarvis, RED='#B9C3CD', RED2='#6E7A87', GOLD='#4A5663', GOLD2='#2E3842';   // RED/GOLD = metal prateado / juntas grafite (nomes mantidos do visual anterior)
  const tech=st.isCron;
  const pants=fem?'#27313F':'#1F2835', hose=fem?'#323C4C':pants;
  const root=document.createElementNS(NS,'g'); root.setAttribute('class','wk idle'); root.dataset.id=st.id;
  const leg=()=>IM?`<rect x="-2.4" y="0" width="4.8" height="16" rx="1.6" fill="${RED}" stroke="${RED2}" stroke-width=".5"/><rect x="-2.2" y="4.2" width="4.4" height="2.6" rx="1" fill="${GOLD}"/><rect x="-3" y="12.6" width="6.2" height="4.8" rx="1.4" fill="${GOLD}" stroke="${GOLD2}" stroke-width=".5"/>`:`<rect x="-2.2" y="0" width="4.4" height="${fem?15:16}" rx="1.5" fill="${hose}"/><rect x="-2.8" y="14" width="6" height="3.4" rx="1.4" fill="#0B0F15"/>`;
  const arm=()=>IM?`<rect x="-2.3" y="0" width="4.6" height="13" rx="2.2" fill="${RED}" stroke="${RED2}" stroke-width=".5"/><circle cx="0" cy="1" r="3.4" fill="${GOLD}" stroke="${GOLD2}" stroke-width=".5"/><rect x="-2.5" y="8.6" width="5" height="3.6" rx="1.2" fill="${GOLD}"/><circle cx="0" cy="14.2" r="2.6" fill="${GOLD}" stroke="${GOLD2}" stroke-width=".5"/>`:`<rect x="-2" y="0" width="4" height="13" rx="2" fill="${tech?'#2B3542':jk}" stroke="#A9C6DA" stroke-opacity=".3" stroke-width=".5"/><circle cx="0" cy="14.2" r="2.3" fill="${skin}"/>`;
  const hairBack=fem?`<path d="M-6.4 -40 Q-8 -30 -5 -28 L5 -28 Q8 -30 6.4 -40z" fill="${hair}"/>`:'';
  const hairTop=IM?'':fem?`<path d="M-6.3 -41 Q-6 -48.5 0 -48.5 Q6 -48.5 6.3 -41 Q2 -45 -2 -44.5 Q-5 -44 -6.3 -41z" fill="${hair}"/>`
                   :`<path d="M-6 -42 Q-6.2 -48.5 0 -48.5 Q6.2 -48.5 6 -42 Q3 -45.5 0 -45.3 Q-3 -45.5 -6 -42z" fill="${hair}"/>`;
  const body=IM
    ? `<rect x="-7.8" y="-36" width="15.6" height="19" rx="4" fill="${RED}" stroke="${RED2}" stroke-width=".7"/><path d="M-7.8 -33 Q0 -29.5 7.8 -33 L7.8 -36 Q0 -33 -7.8 -36z" fill="${GOLD}"/><path d="M-6.6 -24 L-2 -20 H2 L6.6 -24" fill="none" stroke="${GOLD}" stroke-width="1.3"/><rect x="-7.6" y="-20.4" width="15.2" height="3.4" rx="1.4" fill="${GOLD}" stroke="${GOLD2}" stroke-width=".5"/>`
    : tech
    ? `<rect x="-7.5" y="-36" width="15" height="19" rx="4" fill="#2B3542" stroke="#8FB3CC" stroke-opacity=".4" stroke-width=".6"/><path d="M-2.6 -36 L0 -31 L2.6 -36z" fill="${skin}"/><rect x="-7.5" y="-36" width="15" height="4" rx="2" fill="#3A4757"/>`
    : `<rect x="-7.5" y="-36" width="15" height="19" rx="4" fill="${jk}" stroke="#A9C6DA" stroke-opacity=".35" stroke-width=".6"/><path d="M-3.2 -36 L0 -27 L3.2 -36z" fill="${sh}"/>`+
      ((fem||st.isJarvis)?'':`<path d="M-1.2 -34.5 L1.2 -34.5 L1.9 -27 L0 -24.5 L-1.9 -27z" fill="${tie}"/>`);
  const skirt=fem?`<path d="M-7.5 -19 L7.5 -19 L9 -7 L-9 -7z" fill="${jk}"/>`:'';
  root.innerHTML=`<ellipse class="sh" cx="0" cy="1" rx="14" ry="6" fill="#9FD0E6" fill-opacity=".14" stroke="#9FD0E6" stroke-opacity=".28" stroke-width=".7"/>
  <g class="dust" style="display:none"><circle cx="0" cy="-2" r="3" fill="#9FD0E6"/><circle cx="-6" cy="-5" r="2.2" fill="#9FD0E6"/><circle cx="-11" cy="-3" r="1.6" fill="#9FD0E6"/></g>
  <g class="spr">
    <g class="legs"><g class="legL" transform="translate(-3,-18)">${leg()}</g><g class="legR" transform="translate(3,-18)">${leg()}</g></g>
    ${skirt}
    <g class="torso">${hairBack}${body}${IM?'<rect x="-4.2" y="-30.6" width="8.4" height="5.8" rx="1" fill="#16202B" stroke="#4A5663" stroke-width=".6"/><rect x="-3" y="-29.4" width="2" height="1.2" fill="#2BD4F2"/><rect x="-.4" y="-29.4" width="3.4" height="1.2" fill="#2BD4F2" opacity=".6"/><rect x="-3" y="-27.1" width="6" height="1" fill="#2BD4F2" opacity=".4"/>':'<rect class="lany" x="-2.8" y="-26" width="5.6" height="4.2" rx=".8"/>'}</g>
    <g class="armL" transform="translate(-8.6,-34)">${arm()}</g>
    <g class="armR" transform="translate(8.6,-34)">${arm()}</g>
    <g class="pasta" style="display:none"><rect x="-6.5" y="-31" width="13" height="9.5" rx="1" fill="#C9D3DD" stroke="#5B6B7C" stroke-width=".7"/><rect x="-6.5" y="-33" width="5.5" height="2.6" rx=".8" fill="#AEBBC8"/><path d="M-4 -27.5H4M-4 -25H2" stroke="#8FA1B5" stroke-width=".8"/></g>
    <g class="head">
      ${IM?`<path d="M0 -47.6 V-50.6" stroke="${RED2}" stroke-width=".9"/><circle cx="0" cy="-51.2" r="1.1" fill="#2BD4F2"/><rect x="-6.3" y="-47.8" width="12.6" height="12.4" rx="5" fill="${RED}" stroke="${RED2}" stroke-width=".7"/><rect x="-5" y="-44" width="10" height="5" rx="2.2" fill="#16202B"/><rect x="-7.1" y="-43.2" width="1.4" height="3.4" rx=".6" fill="${GOLD}"/><rect x="5.7" y="-43.2" width="1.4" height="3.4" rx=".6" fill="${GOLD}"/>`:`<circle cx="0" cy="-41.5" r="5.9" fill="${skin}"/>${hairTop}`}
      <g class="eyes">${IM?`<rect x="-4.1" y="-42.4" width="8.2" height="2" rx="1" fill="#7FF0FF"/><rect x="-4.1" y="-42.4" width="8.2" height="2" rx="1" fill="none" stroke="#2BD4F2" stroke-width=".5"/>`:`<circle cx="-2.1" cy="-41" r=".95" fill="#10151C"/><circle cx="2.1" cy="-41" r=".95" fill="#10151C"/>${glasses?`<g fill="none" stroke="#10151C" stroke-width=".7"><circle cx="-2.4" cy="-41" r="2"/><circle cx="2.4" cy="-41" r="2"/><path d="M-.4 -41H.4"/></g>`:''}`}</g>
    </g>
    <g class="tablet" style="display:none"><rect x="-6.5" y="-31" width="13" height="9" rx="1.2" fill="#0A1118" stroke="#2BD4F2" stroke-width=".9"/><path d="M-4 -28.5H3M-4 -26H1" stroke="#2BD4F2" stroke-width=".8"/></g>
    <g class="bub" transform="translate(0,-60)" style="display:none"><rect x="-13" y="-8" width="26" height="14" rx="4"/><g class="dots"><circle cx="-6" cy="-1" r="1.7"/><circle cx="0" cy="-1" r="1.7"/><circle cx="6" cy="-1" r="1.7"/></g><text class="ex" x="0" y="3" style="display:none">!</text></g>
  </g>`;
  root.addEventListener('click',()=>select(st.it.decor?'equipe:agidesk':st.id));
  const w={st,root,spr:root.querySelector('.spr'),legL:root.querySelector('.legL'),legR:root.querySelector('.legR'),armL:root.querySelector('.armL'),armR:root.querySelector('.armR'),
    legs:root.querySelector('.legs'),head:root.querySelector('.head'),eyes:root.querySelector('.eyes'),bub:root.querySelector('.bub'),dots:root.querySelector('.dots'),ex:root.querySelector('.ex'),
    tablet:root.querySelector('.tablet'),pastaEl:root.querySelector('.pasta'),carry:false,sh:root.querySelector('.sh'),dust:root.querySelector('.dust'),x:0,y:0,face:0,path:[],at:null,dest:null,run:0,timer:0,phase:rnd()*6,sit:0,status:'idle'};
  const run=st.it.status==='running'||st.isEquipe;
  const s0=run?st.stops.home:wanderPick(w,true);
  w.at=s0; w.x=s0.pos[0]; w.y=s0.pos[1]; w.face=s0.face; w.timer=rr(2,6);
  w.item=addItem(w.x+w.y,root);
  return w;
}
// parada já ocupada (ou já escolhida) por outro funcionário: não escolher, senão dois bonecos ficam no mesmo ponto
function livre(w,p){return !Object.values(WORKERS).some(o=>o!==w&&((o.dest&&same(o.dest,p))||(!o.path.length&&o.at&&same(o.at,p))))}
const pickFree=(w,arr)=>{const f=arr.filter(p=>livre(w,p));return f.length?pick(f):null};
function jarvisPick(w,first){
  const st=w.st,z=st.z,r=rnd();
  const stand=(t)=>Object.assign({},st.stops.side,{type:t});
  if(r<.30)return Object.assign({},st.stops.home);                                   // sentado, lendo
  if(r<.50){const s=pickFree(w,z.pois.filter(p=>p.type==='shelf'));if(s)return s}  // estante
  if(r<.62){const s=pickFree(w,z.pois.filter(p=>p.type==='poster'));if(s)return s}// analisa o quadro
  if(r<.72){const s=pickFree(w,z.pois.filter(p=>p.type==='cooler'));if(s)return s}// cafezinho
  if(r<.92){const x=z.x+rr(1.3,3.5);return stop('pace',[x,st.ay],rnd()<.5?-1:1,z,[])}   // anda pela sala
  return stand('side');                                                              // em pé ao lado da mesa
}
function wanderPick(w,first){
  if(w.st.isJarvis)return jarvisPick(w,first);
  const st=w.st,z=st.z; const r=rnd();
  const others=z.stations.filter(o=>o!==st);
  let s=null;
  if(r<.30)s=pickFree(w,z.pois.filter(p=>p.type==='shelf'));
  else if(r<.50)s=pickFree(w,z.pois.filter(p=>p.type==='printer'||p.type==='cooler'));
  else if(r<.80)s=pickFree(w,others.map(o=>o.stops.visit));
  else if(r<.88)s=pickFree(w,Object.values(STATIONS).filter(o=>o.z!==z).map(o=>o.stops.visit));
  else if(r<.94)s=pickFree(w,Object.values(ZONES).flatMap(zz=>zz.pois).filter(p=>p.type==='meeting'));
  if(!s)s=Object.assign({},st.stops.side,{type:st.isCron?'work':'side'});
  if(first&&(s.type==='visit'||s.type==='meeting'))s=Object.assign({},st.stops.side,{type:st.isCron?'work':'side'});
  return s;
}
function desired(w){
  const st=w.st,s=st.it.status;
  if(st.isEquipe)return st.stops.home;      // equipe: sempre sentada na mesa
  if(s==='running')return st.stops.home;
  if(s==='error')return st.stops.side;
  return null;
}
const same=(a,b)=>a.pos[0]===b.pos[0]&&a.pos[1]===b.pos[1];
const SPEED=1.25, K=1.32, RUN_OK=4.2, RUN_ERR=3.4;
function stepWorker(w,dt){
  w.phase+=dt;
  w.status=w.st.it.status;
  if(w.path.length){
    const wantNow=desired(w);
    if(wantNow&&!(w.dest&&same(w.dest,wantNow))){ if(replan(w,wantNow)){w.run=wantNow.type==='side'?RUN_ERR:RUN_OK;w.carry=false;w.pastaPend=null} }
    const [tx,ty]=w.path[0]; const dx=tx-w.x, dy=ty-w.y, d=Math.hypot(dx,dy), m=(w.run||SPEED)*dt;
    const sxm=dx-dy; if(Math.abs(sxm)>.05)w.face=sxm>0?1:-1;
    if(d<=m){w.x=tx;w.y=ty;w.path.shift();if(!w.path.length)arrive(w)}
    else{w.x+=dx/d*m;w.y+=dy/d*m}
    return;
  }
  const want=desired(w);
  if(want){ if(!same(w.at,want)){go(w,want);w.run=want.type==='side'?RUN_ERR:RUN_OK} w.carry=false; w.pastaPend=null; return }
  w.timer-=dt;
  if(w.timer<=0){
    let s=wanderPick(w,false),n=0; while(same(s,w.at)&&n++<4)s=wanderPick(w,false);
    if(same(s,w.at)){w.timer=rr(3,6);return}
    go(w,s);
  }
}
function go(w,s){w.dest=s;w.path=route(w.at,s);if(!w.path.length)arrive(w)}
const DUR={entrega:[3,4.5],poster:[6,10],pace:[3,6],shelf:[6,10],printer:[5,8],cooler:[4,7],visit:[6,11],meeting:[9,16],side:[4,8],seat:[3,6],work:[4,8]};
function arrive(w){
  const s=w.dest||w.at; w.at=s; w.dest=null; w.face=s.face; w.run=0;
  if(w.pastaPend){const p=w.pastaPend;w.pastaPend=null;go(w,p);return}      // entrega pedida no meio de um trajeto: segue para ela
  if(s.type==='entrega'){w.carry=false;PASTAS.entregues++}
  const d=(w.st.isJarvis&&s.type==='seat')?[9,18]:(DUR[s.type]||[4,8]); w.timer=rr(d[0],d[1]);
}
function poseOf(w){
  const s=w.at?w.at.type:'side', st=w.status;
  if(w.path.length)return w.run?'run':'walk';
  if(s==='seat')return (st==='running'||w.st.isEquipe)?'type':(w.st.isJarvis?'read':'sit');
  if(s==='poster')return 'think';
  if(s==='pace')return 'stand';
  if(s==='work')return st==='running'?'operate':(st==='error'?'alert':'stand');
  if(s==='side')return st==='error'?'alert':'stand';
  return {shelf:'reach',printer:'printer',cooler:'drink',visit:'talk',meeting:'talk',entrega:'talk'}[s]||'stand';
}
function renderWorker(w,t){
  const m=poseOf(w), ph=w.phase;
  const sitTarget=(m==='type'||m==='sit'||m==='read')?1:0;
  w.sit+=(sitTarget-w.sit)*.25;
  let legA=0,armL=0,armR=0,bob=0,headTilt=0,lean=0;
  const sw=Math.sin(ph*7.5);
  switch(m){
    case 'run': {const s2=Math.sin(ph*14);legA=s2*40;armL=-s2*55+12;armR=s2*55-12;bob=-Math.abs(s2)*2.8;lean=11;break}
    case 'walk': legA=sw*26; armL=-sw*22+4; armR=sw*22-4; bob=-Math.abs(sw)*1.4; break;
    case 'type': armL=14+Math.sin(ph*13)*5; armR=-14-Math.sin(ph*13+1.3)*5; headTilt=Math.sin(ph*1.7)*.6; break;
    case 'read': armL=34;armR=-34;headTilt=5+Math.sin(ph*.7)*.8;break;
    case 'think': armR=-105+Math.sin(ph*1.3)*5;armL=5;headTilt=-3+Math.sin(ph*.9)*2;break;
    case 'sit': armL=10; armR=-10; headTilt=Math.sin(ph*.8)*.5; break;
    case 'alert': armL=150+Math.sin(ph*9)*14; armR=-150-Math.sin(ph*9+1)*14; bob=-Math.abs(Math.sin(ph*5))*1.5; break;
    case 'reach': armR=-155; armL=6; break;
    case 'printer': armL=30+Math.sin(ph*4)*5; armR=-30-Math.sin(ph*4)*5; break;
    case 'drink': armR=-125+Math.sin(ph*2)*6; armL=5; break;
    case 'talk': armR=-70+Math.sin(ph*5)*22; armL=8; headTilt=Math.sin(ph*3)*.8; break;
    case 'operate': armL=40+Math.sin(ph*6)*8; armR=-40-Math.sin(ph*6+1)*8; break;
    default: bob=Math.sin(ph*1.6)*.4; armL=4; armR=-4;
  }
  const seated=w.sit>.5;
  w.legs.style.display=seated?'none':'';
  const seatY=6*K*w.sit;
  const flip=w.face<0?-1:1, fx=w.face===0?0:1.7;
  w.spr.setAttribute('transform',`translate(0 ${(seatY+bob*K).toFixed(2)}) scale(${flip*K} ${K}) rotate(${lean})`);
  w.legL.setAttribute('transform',`translate(-3 -18) rotate(${legA.toFixed(1)})`);
  w.legR.setAttribute('transform',`translate(3 -18) rotate(${(-legA).toFixed(1)})`);
  const as=seated?.7:1;
  w.armL.setAttribute('transform',`translate(-8.6 -34) rotate(${armL.toFixed(1)}) scale(1 ${as})`);
  w.armR.setAttribute('transform',`translate(8.6 -34) rotate(${armR.toFixed(1)}) scale(1 ${as})`);
  w.head.setAttribute('transform',`rotate(${headTilt.toFixed(2)} 0 -36)`);
  w.eyes.setAttribute('transform',`translate(${fx} 0)`);
  w.sh.setAttribute('opacity',seated?0:1);
  w.tablet.style.display=m==='read'?'':'none';
  w.pastaEl.style.display=w.carry?'':'none';
  w.dust.style.display=m==='run'?'':'none';
  if(m==='run'){w.dust.setAttribute('transform',`translate(${(-(w.face<0?-1:1)*10).toFixed(1)} 0)`);[...w.dust.children].forEach((c,i)=>c.setAttribute('opacity',(.12+.3*Math.abs(Math.sin(t*9-i*1.3))).toFixed(2)))}
  const stuck=estStuck(w.st.it);      // rodando sem ação, ou o Jarvis com pergunta esperando você: "?" no balão
  const run=(m==='type'||m==='operate')&&!w.st.isEquipe&&!stuck, err=m==='alert'||((m==='type'||m==='operate')&&stuck);
  if(stuck!==!!w.stuck){w.stuck=stuck;w.root.classList.toggle('stuck',stuck)}
  w.bub.style.display=(run||err)?'':'none';
  if(run||err){
    w.dots.style.display=run?'':'none'; w.ex.style.display=err?'':'none'; w.ex.textContent=stuck?'?':'!';
    if(run)[...w.dots.children].forEach((c,i)=>c.setAttribute('opacity',(.35+.65*Math.max(0,Math.sin(t*5-i*.9))).toFixed(2)));
    w.bub.setAttribute('transform',`translate(0 ${(-60-bob).toFixed(1)})`);
  }
  const [sx,sy]=P(w.x,w.y); w.root.setAttribute('transform',`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
  w.item.key=w.x+w.y; w.item.node.dataset.k=w.item.key;
  if(QS.has('debug'))(window.__SHELVES||[]).forEach(([a,b,c,d])=>{if(w.x>a-.2&&w.x<c+(+QS.get('shm')||.35)&&w.y>b-.15&&w.y<d+.15){window.__shelfHits=(window.__shelfHits||0)+1;window.__shelfMin=Math.min(window.__shelfMin??9,w.x-c)}});
}

/* ---------- pasta entre salas (cadeia de agentes, "fluxos" do layout.json) ----------
   Quando um agente da cadeia começa a rodar (ex.: rateio_o365), o funcionário da estação anterior (microsoft_365) leva uma
   pasta até a mesa dele: a entrega dos dados de uma etapa para a outra. Só se quem leva está livre (rodando ou em falha,
   ele fica na própria mesa: o dado manda). A pasta é cinza-azulada, fora das cores de estado. */
const PASTAS={pedidas:0,entregues:0};
function entregarPasta(a,b){
  const w=WORKERS[a], dst=STATIONS[b]; if(!w||!dst||a===b||CFG.anim==='desligada')return false;
  if(desired(w)||w.carry||w.pastaPend)return false;
  const alvo=Object.assign({},dst.stops.visit,{type:'entrega'});
  w.carry=true; PASTAS.pedidas++;
  if(w.path.length){ if(!replan(w,alvo))w.pastaPend=alvo }
  else go(w,alvo);
  w.run=0; return true;
}
// status anterior → atual (chamado pelo update): quem passou a rodar recebe a pasta de quem vem antes na cadeia
function pastasChecar(antes){
  ((STATE&&STATE.layout&&STATE.layout.flows)||[]).forEach(([a,b])=>{const st=STATIONS[b];
    if(st&&st.it.status==='running'&&antes[b]&&antes[b]!=='running')entregarPasta(a,b)});
}

/* ---------- laço de simulação ---------- */
let LAST=0, SIMT=0;
function sim(dt){SIMT+=dt;Object.values(WORKERS).forEach(w=>{stepWorker(w,dt);renderWorker(w,SIMT)});sortWorld();if(DBG)probe()}
let FR=0,FT=0,FMAX=0,FD=0;   // FR = voltas do laço (taxa da tela); FD = quadros desenhados de fato (o que aparece como fps)
let ACUM=0;
// fps no card Operação (sempre visível, sem cor e fora do veredito); ?fps=1 mostra também voltas do laço e o pior quadro no topo
function fpsMostrar(janela){
  const n=Math.round(FD*1000/janela), el=$('k-fps');
  if(el)el.textContent=CFG.anim==='desligada'?T('animação desligada','animation off'):n+' fps'+(CFG.anim==='reduzida'?T(' · reduzida',' · reduced'):'');
  if(QS.has('fps')){$('fps').style.display='';$('fps').textContent=Math.round(FR*1000/janela)+' voltas/s · '+n+' fps · script '+FMAX.toFixed(1)+' ms (pior quadro)'}
}
function loop(ts){const dt=Math.min(.1,(ts-LAST)/1000||0);LAST=ts;
  const t0=performance.now();
  if(built&&CFG.anim==='completa'){sim(dt);FD++}
  else if(built&&CFG.anim==='reduzida'){ACUM+=dt;if(ACUM>=1/15-.004){sim(Math.min(.1,ACUM));ACUM=0;FD++}}   // 15 quadros/s
  const c=performance.now()-t0; FMAX=Math.max(FMAX,c);
  FR++;
  if(ts-FT>=1000){ if(FT&&ts-FT<2500)fpsMostrar(ts-FT); FR=0;FD=0;FT=ts;FMAX=0 }   // janela longa = aba estava escondida (o navegador pausa): descarta, não mostra número falso
  requestAnimationFrame(loop)}
