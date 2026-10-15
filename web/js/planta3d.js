/* Sala de Operações · Tema 3D: a MESMA planta (salas, vidro, móveis, painéis, bonecos, rótulos), desenhada em 3D de verdade.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build). Three.js r170 (MIT), cópia local
   em web/vendor/three/, carregado só quando o tema 3D está ativo.

   Como funciona (decisão de 15/10/2026: "a planta atual, só que em 3D de verdade: mesmo ângulo, mesmos móveis, mesmos bonecos
   andando, mesmas cores e rótulos"):
   - A planta continua sendo montada em SVG: é dela que saem rotas dos bonecos, rótulos, selos, diagnóstico e cliques.
   - Durante a montagem, cada ponto projetado (P), cada polígono (pts) e cada caixa (box) é anotado com a coordenada 3D.
     Depois: caixa = sólido iluminado; polígono = face 3D (piso, vidro, papéis, pastas da estante, bordas das telas);
     objeto pendurado (placa, painel do vault e da equipe, quadro, frente dos racks) = textura na parede, desenhada a partir
     do próprio SVG (os números ao vivo continuam atualizando); boneco = boneco 3D com as mesmas cores e os mesmos gestos.
   - Câmera ortográfica no MESMO ângulo da planta (2:1, 30° de elevação, 45° de giro): um ponto 3D cai exatamente no pixel
     em que a planta o desenharia. Por isso os rótulos, selos e balões continuam sendo os do SVG, por cima, no lugar certo,
     e zoom/arrastar/CENTRALIZAR funcionam iguais. O resto do SVG fica invisível (mas presente).
   - Luz: ambiente + direcional calculadas para que o topo, a face da esquerda e a da direita de cada caixa saiam com as mesmas
     três cores da planta; o ganho do 3D são as sombras, a oclusão real e o volume dos bonecos. */
const T3S=S*Math.SQRT2, T3Z=T3S*Math.cos(Math.PI/6);      // px da planta por unidade: na horizontal da tela (42,4) e na vertical (36,7)
// Luz em duas partes: T3L ilumina as faces que a câmera vê (topo 1,0 · esquerda 0,55 · direita 0,37 = as três cores da planta, junto com o ambiente T3A);
// T3L2 vem de trás e de cima e só ilumina topos: é ela que faz sombra, e a sombra cai PARA A FRENTE (para a câmera), onde dá para ver.
// Com uma luz só, vinda da frente, a sombra caía atrás dos móveis e não aparecia.
const T3L=[.293,.611,.733], T3A=.25, T3D=.409, T3L2=[-.45,.772,-.45], T3D2=.648;   // sombra: metade da luz do topo; cai ~0,6 un. à frente por unidade de altura
const T3FL=T3A+T3D*T3L[2], T3FR=T3A+T3D*T3L[0];
const T3={quer:CFG.tema==='3d',on:false,THREE:null,ren:null,cena:null,cam:null,mundo:null,cap:null,caixas:[],plantas:[],est:[],dono:null,
  naCaixa:0,din:[],decals:[],aneis:{},bonecos:{},clic:[],donos:new Set(),erro:null,montado:false,ult:0,ultDin:0,ultDec:0,pend:false};
const T3W=new WeakMap();
const P0=P, pts0=pts, box0=box, plantAt0=plantAt, stationBody0=stationBody, build0=build, applyVB0=applyVB;
const t3P=(x,y,z=0)=>{const r=P0(x,y,z);T3W.set(r,[x,y,z]);return r};
const t3pts=a=>{const s=pts0(a);if(!T3.naCaixa&&a.length>=2){const v=a.map(p=>T3W.get(p));if(v.every(Boolean)&&!T3.cap.has(s))T3.cap.set(s,{v,dono:T3.dono})}return s};
function t3box(x0,y0,x1,y1,z0,z1,top,l,r){T3.naCaixa++;try{const s=box0.apply(null,arguments);T3.caixas.push({x0,y0,x1,y1,z0,z1,top,l,r,dono:T3.dono});return s}finally{T3.naCaixa--}}
function t3plant(px,py){T3.plantas.push([px,py]);return plantAt0(px,py)}
function t3station(st,gB,gO){T3.dono=st.id;try{return stationBody0(st,gB,gO)}finally{T3.dono=null}}

build=function(s){
  if(!T3.quer)return build0(s);
  T3.cap=new Map(); T3.caixas=[]; T3.plantas=[]; T3.dono=null;
  P=t3P; pts=t3pts; box=t3box; plantAt=t3plant; stationBody=t3station;
  try{build0(s)}finally{P=P0;pts=pts0;box=box0;plantAt=plantAt0;stationBody=stationBody0}
  document.body.classList.add('t3');
  if(T3.THREE)t3Montar(); else T3.pend=true;
};
applyVB=function(){applyVB0(); if(T3.on)t3Camera()};

/* ---------- carregar o Three.js e criar o renderizador ---------- */
async function t3Iniciar(){
  try{
    const THREE=await import('/web/vendor/three/three.module.min.js'); T3.THREE=THREE;
    THREE.ColorManagement.enabled=false;                     // cores da planta como estão (sem conversão de espaço de cor)
    const st=document.querySelector('.stage'), cv=document.createElement('canvas'); cv.id='t3cv'; st.insertBefore(cv,st.firstChild);
    const ren=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
    ren.outputColorSpace=THREE.LinearSRGBColorSpace; ren.toneMapping=THREE.NoToneMapping; ren.setClearColor(0x000000,0);
    ren.shadowMap.enabled=true; ren.shadowMap.type=THREE.PCFSoftShadowMap; ren.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
    T3.ren=ren; T3.cena=new THREE.Scene();
    T3.cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,800);
    const d=[Math.cos(Math.PI/6)*Math.SQRT1_2,.5,Math.cos(Math.PI/6)*Math.SQRT1_2];
    T3.cam.position.set(d[0]*300,d[1]*300,d[2]*300); T3.cam.up.set(0,1,0); T3.cam.lookAt(0,0,0);
    T3.cena.add(new THREE.AmbientLight(0xffffff,T3A*Math.PI));
    const luz=new THREE.DirectionalLight(0xffffff,T3D*Math.PI); luz.position.set(...T3L); T3.cena.add(luz);
    const sol=new THREE.DirectionalLight(0xffffff,T3D2*Math.PI); T3.sol=sol; sol.castShadow=true;
    sol.shadow.mapSize.set(4096,4096); sol.shadow.bias=-.0004; sol.shadow.normalBias=.015;
    T3.cena.add(sol,sol.target);
    new ResizeObserver(()=>{if(T3.on)t3Camera()}).observe(st);
    t3Cliques();
    if(T3.pend||built)t3Montar();
    requestAnimationFrame(t3Quadro);
  }catch(e){
    T3.erro=String(e&&e.message||e); errPush('3D: '+T3.erro); T3.quer=false; document.body.classList.remove('t3');
    const f=$('faixa3d')||Object.assign(document.createElement('div'),{id:'faixa3d'}); f.textContent='3D indisponível neste navegador (WebGL): mostrando a planta.';
    document.querySelector('.stage').appendChild(f); t3Relatorio();
  }
}

/* ---------- câmera: o mesmo recorte do viewBox do SVG (preserveAspectRatio meet) ---------- */
function t3Camera(){
  const svg=$('svg'), r=svg.getBoundingClientRect(); if(!r.width||!r.height)return;
  const [vx,vy,vw,vh]=VB, k=Math.min(r.width/vw,r.height/vh), cx=vx+vw/2, cy=vy+vh/2;
  const L=cx-r.width/(2*k), R=cx+r.width/(2*k), Tp=cy-r.height/(2*k), B=cy+r.height/(2*k);
  Object.assign(T3.cam,{left:(L-OX)/T3S,right:(R-OX)/T3S,top:(OY-Tp)/T3S,bottom:(OY-B)/T3S}); T3.cam.updateProjectionMatrix();
  T3.ren.setSize(r.width,r.height,false); T3.ren.domElement.style.width=r.width+'px'; T3.ren.domElement.style.height=r.height+'px';
  T3.sujo=true;
}

/* ---------- montagem da cena a partir do que a planta anotou ---------- */
const t3V=(x,y,z)=>[x,z/T3Z,y];                        // planta (x, y, z em px) → Three (X, Y para cima, Z = y da planta)
function t3Cor(c){                                     // '#rrggbb', '#rgb', 'rgb()', 'rgba()' → [r,g,b,a] (0..1)
  if(!c||c==='none'||c.startsWith('url'))return null;
  let m=c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if(m){let h=m[1];if(h.length===3)h=h.split('').map(x=>x+x).join('');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255,1]}
  m=c.match(/rgba?\(([^)]+)\)/); if(m){const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return [p[0]/255,p[1]/255,p[2]/255,p.length>3?p[3]:1]}
  return null;
}
const t3Mix=(a,b,t)=>[a[0]*t+b[0]*(1-t),a[1]*t+b[1]*(1-t),a[2]*t+b[2]*(1-t)];
const T3PISO=t3Cor('#0A1119'), T3FUNDO=t3Cor('#14202C');
function t3Limpar(){
  const m=T3.mundo; if(!m)return;
  m.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)[].concat(o.material).forEach(x=>{if(x.map)x.map.dispose();x.dispose()})});
  T3.cena.remove(m);
}
function t3Montar(){
  const THREE=T3.THREE; if(!THREE||!T3.cap)return;
  t3Limpar(); T3.pend=false;
  const mundo=new THREE.Group(); T3.mundo=mundo; T3.cena.add(mundo);
  T3.din=[]; T3.decals=[]; T3.aneis={}; T3.bonecos={}; T3.clic=[]; T3.donos=new Set();
  const svg=$('svg'), filhos=[...svg.children], gOver=filhos[filhos.length-1];
  // sol: sombra cobrindo a planta inteira
  const c=t3V(PW/2,PH/2,0), R=Math.hypot(PW,PH)/2+3;
  T3.sol.position.set(c[0]+T3L2[0]*60,c[1]+T3L2[1]*60,c[2]+T3L2[2]*60); T3.sol.target.position.set(c[0],c[1],c[2]);
  Object.assign(T3.sol.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:1,far:140}); T3.sol.shadow.camera.updateProjectionMatrix();

  /* 1. caixas → um só sólido com cor por vértice (topo, esquerda e direita com as cores da planta) */
  const cx=[],cn=[],cc=[],cd=[], ed=[];
  const face=(a,b,c2,d2,n,cor,dono)=>{[a,b,c2,a,c2,d2].forEach(p=>{cx.push(...p);cn.push(...n);cc.push(...cor)});cd.push(dono,dono)};
  const cl=(cor,f)=>cor.slice(0,3).map(v=>Math.min(1,v/f));
  T3.caixas.forEach(b=>{
    if(b.x1-b.x0<.005||b.y1-b.y0<.005||b.z1-b.z0<.05)return;
    const top=t3Cor(b.top)||[.2,.2,.2,1], l=t3Cor(b.l)||top, r=t3Cor(b.r)||top, esc=top.slice(0,3).map(v=>v*.6);
    const V=(x,y,z)=>t3V(x,y,z), [x0,y0,x1,y1,z0,z1]=[b.x0,b.y0,b.x1,b.y1,b.z0,b.z1];
    const p000=V(x0,y0,z0),p100=V(x1,y0,z0),p110=V(x1,y1,z0),p010=V(x0,y1,z0),p001=V(x0,y0,z1),p101=V(x1,y0,z1),p111=V(x1,y1,z1),p011=V(x0,y1,z1);
    face(p001,p011,p111,p101,[0,1,0],top.slice(0,3),b.dono);                  // topo
    face(p010,p110,p111,p011,[0,0,1],cl(l,T3FL),b.dono);                       // frente-esquerda (y = y1)
    face(p100,p101,p111,p110,[1,0,0],cl(r,T3FR),b.dono);                       // frente-direita (x = x1)
    face(p000,p001,p101,p100,[0,0,-1],esc,b.dono); face(p000,p010,p011,p001,[-1,0,0],esc,b.dono); face(p000,p100,p110,p010,[0,-1,0],esc,b.dono);
    [[p000,p100],[p100,p110],[p110,p010],[p010,p000],[p001,p101],[p101,p111],[p111,p011],[p011,p001],[p000,p001],[p100,p101],[p110,p111],[p010,p011]].forEach(([a,q])=>ed.push(...a,...q));
    if(b.dono)T3.donos.add(b.dono);
    // assento solto no ar (cadeira): pé até o chão, se não houver outra caixa embaixo
    if(b.z0>4&&b.z0<16){const mx=(x0+x1)/2,my=(y0+y1)/2;
      if(!T3.caixas.some(o=>o!==b&&o.z1>=b.z0-.5&&o.z0<b.z0&&o.x0<=mx&&o.x1>=mx&&o.y0<=my&&o.y1>=my)){
        const pe=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,b.z0/T3Z,6),new THREE.MeshLambertMaterial({color:0x2A3A4B}));
        pe.position.set(mx,b.z0/T3Z/2,my); pe.castShadow=true; mundo.add(pe)}}
  });
  const gc=new THREE.BufferGeometry(); gc.setAttribute('position',new THREE.Float32BufferAttribute(cx,3)); gc.setAttribute('normal',new THREE.Float32BufferAttribute(cn,3)); gc.setAttribute('color',new THREE.Float32BufferAttribute(cc,3));
  gc.userData.donos=cd;
  const mc=new THREE.Mesh(gc,new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  mc.castShadow=mc.receiveShadow=true; mundo.add(mc); T3.clic.push(mc);
  const ge=new THREE.BufferGeometry(); ge.setAttribute('position',new THREE.Float32BufferAttribute(ed,3));
  mundo.add(new THREE.LineSegments(ge,new THREE.LineBasicMaterial({color:0x2A3A4B,transparent:true,opacity:.85})));

  /* 2. polígonos e linhas anotados → faces 3D (estáticas juntas; as que mudam com o estado ficam separadas) */
  const op={h:{p:[],n:[],c:[],d:[]},v:{p:[],n:[],c:[],d:[]}}, linhas={}, usados=[];
  const sobre=(bb,lista)=>lista.filter(o=>o.k===bb.k&&o.a<bb.b&&bb.a<o.b&&o.c<bb.d&&bb.c<o.d).length;
  svg.querySelectorAll('polygon,polyline').forEach(el=>{
    if(gOver.contains(el)||el.closest('.wk,clipPath,g[transform^="matrix"]'))return;
    const rec=T3.cap.get(el.getAttribute('points')); if(!rec||rec.v.length<2)return;
    const cs=getComputedStyle(el), din=/\b(rim|sel|flow|led)\b/.test(el.getAttribute('class')||'');   // só o que muda com o estado fica separado
    let vs=rec.v.map(([x,y,z])=>t3V(x,y,z)), rv=rec.v;
    // normal e deslocamento para a câmera (evita brigar com a face da caixa onde a peça está encostada)
    let n=[0,1,0];
    if(vs.length>=3){const a=vs[0],b=vs[1],c2=vs[2],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],w=[c2[0]-a[0],c2[1]-a[1],c2[2]-a[2]];
      n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];const L=Math.hypot(...n)||1;n=n.map(v=>v/L);if(n[0]+n[1]+n[2]<0){n=n.map(v=>-v);vs=vs.slice().reverse();rv=rv.slice().reverse()}}   // face virada para a câmera (a ordem dos vértices define a frente)
    const horiz=Math.abs(n[1])>.9;
    const xs=rv.map(v=>v[0]),ys=rv.map(v=>v[1]),zs=rv.map(v=>v[2]);
    const bb=horiz?{k:'h'+Math.round(zs[0]*10),a:Math.min(...xs),b:Math.max(...xs),c:Math.min(...ys),d:Math.max(...ys)}
                  :{k:(Math.abs(n[0])>.9?'x'+xs[0].toFixed(2):'y'+ys[0].toFixed(2)),a:Math.min(...(Math.abs(n[0])>.9?ys:xs)),b:Math.max(...(Math.abs(n[0])>.9?ys:xs)),c:Math.min(...zs),d:Math.max(...zs)};
    const off=.004+.002*sobre(bb,usados); usados.push(bb);
    const vo=vs.map(p=>[p[0]+n[0]*off,p[1]+n[1]*off,p[2]+n[2]*off]);
    const fo=+cs.fillOpacity*(+cs.opacity), fill=el.tagName==='polygon'?cs.fill:'none', cor=t3Cor(fill);
    const vidro=fill.startsWith('url');
    if(vs.length>=3&&(cor||vidro)){
      let a=vidro?1:cor[3]*fo, rgb=vidro?null:cor.slice(0,3);
      if(!vidro&&a>=.5&&a<1){rgb=t3Mix(rgb,horiz&&Math.abs(zs[0])<.01?T3PISO:T3FUNDO,a);a=1}   // translúcido forte sobre fundo conhecido: vira opaco
      if(vidro||din||a<1){ if(vidro||a>=.025){
        const g=new THREE.BufferGeometry(), pp=[], uv=[], z0=Math.min(...zs), z1=Math.max(...zs)||1;
        for(let i=1;i<vo.length-1;i++)[vo[0],vo[i],vo[i+1]].forEach((p,j)=>{pp.push(...p);const zi=rv[[0,i,i+1][j]][2];uv.push(0,(zi-z0)/((z1-z0)||1))});
        g.setAttribute('position',new THREE.Float32BufferAttribute(pp,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
        const mat=vidro?new THREE.MeshBasicMaterial({color:0x7FD6EE,transparent:true,opacity:.16,alphaMap:t3Grad(),side:THREE.DoubleSide,depthWrite:false})
          :new THREE.MeshBasicMaterial({color:new THREE.Color(...rgb),transparent:a<1||din,opacity:a,side:THREE.DoubleSide,depthWrite:!(a<1)});
        const m=new THREE.Mesh(g,mat); m.renderOrder=vidro?2:1; mundo.add(m);
        if(din)T3.din.push({el,m,tipo:'face'}); if(rec.dono){m.userData.dono=rec.dono;T3.clic.push(m)}
      }}else{
        const D=op[horiz?'h':'v'];
        for(let i=1;i<vo.length-1;i++){[vo[0],vo[i],vo[i+1]].forEach(p=>{D.p.push(...p);D.n.push(...n);D.c.push(...rgb)});D.d.push(rec.dono)}
      }
    }
    // contorno
    const sc=t3Cor(cs.stroke), so=+cs.strokeOpacity*(+cs.opacity);
    if(sc&&so*sc[3]>.06&&cs.display!=='none'){
      const lp=[]; const fech=el.tagName==='polygon';
      for(let i=0;i<vo.length-(fech?0:1);i++){const a=vo[i],b=vo[(i+1)%vo.length];lp.push(...a,...b)}
      if(din||el.classList.contains('flow')){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));
        const m=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:new THREE.Color(...sc.slice(0,3)),transparent:true,opacity:so*sc[3]}));mundo.add(m);T3.din.push({el,m,tipo:'linha'})}
      else{const k=cs.stroke+'|'+(so*sc[3]).toFixed(2);(linhas[k]=linhas[k]||{cor:sc,a:so*sc[3],p:[]}).p.push(...lp)}
    }
  });
  T3.nfaces=[T3.cap.size,svg.querySelectorAll('polygon,polyline').length,op.h.d.length,op.v.d.length,T3.din.length].join('/');
  ['h','v'].forEach(k=>{const D=op[k]; if(!D.p.length)return;
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(D.p,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(D.n,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(D.c,3)); g.userData.donos=D.d;
    // horizontais recebem luz e sombra (piso, tampos); verticais (pastas, bordas) ficam com a cor exata
    const m=new THREE.Mesh(g,k==='h'?new THREE.MeshLambertMaterial({vertexColors:true}):new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));
    m.receiveShadow=k==='h'; mundo.add(m); T3.clic.push(m)});
  Object.values(linhas).forEach(L=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(L.p,3));
    mundo.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:new THREE.Color(...L.cor.slice(0,3)),transparent:L.a<1,opacity:L.a})))});
  // grade da laje (linhas do SVG feitas direto com P, sem pts)
  const gp=[]; for(let i=1;i<PW;i++)gp.push(...t3V(i,0,0),...t3V(i,PH,0)); for(let j=1;j<PH;j++)gp.push(...t3V(0,j,0),...t3V(PW,j,0));
  {const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(gp.map((v,i)=>i%3===1?v+.002:v),3));mundo.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x0E1822})))}

  /* 3. plantas (folhas = elipses do SVG) */
  const folha=new THREE.MeshLambertMaterial({color:0x2F6B4F,flatShading:true}), gf=new THREE.IcosahedronGeometry(1,1);
  T3.plantas.forEach(([px,py])=>[[0,16,14],[-.15,22,12],[.18,22,12],[0,29,10]].forEach(([dx,zz,r])=>{
    const m=new THREE.Mesh(gf,folha), R=r*.8/T3S; m.scale.set(R,R*.8,R); m.position.set(...t3V(px+dx,py,zz)); m.castShadow=true; mundo.add(m)}));

  /* 4. objetos de parede e frentes (grupos com matrix() no SVG) → texturas no plano certo */
  const vistos=new Set();
  DECOR.filter(d=>d.a!=null&&d.items.length).forEach(d=>{const g=d.items[0].node.querySelector('g[clip-path] > g[transform]');if(g){vistos.add(g);t3Decal(g,d)}});
  svg.querySelectorAll('g[transform^="matrix("]').forEach(g=>{if(vistos.has(g)||gOver.contains(g)||g.closest('.wk,g[clip-path]'))return;t3Decal(g,null)});

  /* 5. estações: anel no piso (cor do estado, pulso em rodando/falha) */
  Object.values(STATIONS).forEach(st=>{
    const r=(st.isCron?58:90)/T3S, mat=new THREE.MeshBasicMaterial({color:0x5B6B7C,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide});
    const an=new THREE.Mesh(new THREE.RingGeometry(r-.012,r+.012,64),mat); an.rotation.x=-Math.PI/2; an.position.set(st.cx,.006,st.cy);
    const pu=new THREE.Mesh(new THREE.RingGeometry(r-.02,r+.02,64),mat.clone()); pu.rotation.x=-Math.PI/2; pu.position.set(st.cx,.007,st.cy);
    // luz como dado: poça de luz no piso, na cor do estado, só em quem pede atenção (rodando, falha, atrasado ou sem ação)
    const po=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:t3Poca(),color:0x2BD4F2,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    po.rotation.x=-Math.PI/2; po.position.set(st.cx,.009,st.cy+(st.isCron?0:.15)); po.scale.setScalar(st.isCron?3.8:5); po.renderOrder=1;
    mundo.add(an,pu,po); T3.aneis[st.id]={an,pu,po,gb:svg.querySelector('.st[data-id="'+CSS.escape(st.id)+'"]')};
  });

  /* 6. bonecos */
  Object.values(WORKERS).forEach(w=>{T3.bonecos[w.st.id]=t3Boneco(w);mundo.add(T3.bonecos[w.st.id].g)});
  T3.on=true; T3.montado=true; t3Camera(); t3Sync(true); t3Relatorio();
}
let T3POCA=null;
function t3Poca(){if(T3POCA)return T3POCA;const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);T3POCA=new T3.THREE.CanvasTexture(c);return T3POCA}
let T3GRAD=null;
function t3Grad(){if(T3GRAD)return T3GRAD;const c=document.createElement('canvas');c.width=2;c.height=64;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,64);
  g.addColorStop(0,'#fff');g.addColorStop(1,'#303030');x.fillStyle=g;x.fillRect(0,0,2,64);T3GRAD=new T3.THREE.CanvasTexture(c);return T3GRAD}   // vidro: .16 no alto, ~.03 embaixo (como o degradê da planta)

/* Objeto desenhado no SVG com matrix(±1,±.5,0,1,e,f): o conteúdo está em px "achatados" no plano de uma parede ou face.
   (1,.5) = plano y constante, avançando em +x; (-1,.5) = plano x constante, avançando em +y; os opostos voltam.
   Origem: nos objetos de parede (DECOR) o plano é a parede da sala; nos demais (frente de rack, quadro da reunião,
   plaquinha da mesa) a origem está no chão (z = 0). */
function t3Decal(g,d){
  const THREE=T3.THREE, m=(g.getAttribute('transform').match(/matrix\(([^)]+)\)/)||[])[1]; if(!m)return;
  const [a,b,,,e,f]=m.split(/[ ,]+/).map(Number), planoY=Math.sign(a)===Math.sign(b), dir=a>0?(planoY?1:-1):(planoY?-1:1);
  let x,y,z;
  if(d&&d.side==='back'){y=d.z.y;x=(e-OX)/S+y;z=(x+y)*H+OY-f}
  else if(d&&d.side==='left'){x=d.z.x;y=x-(e-OX)/S;z=(x+y)*H+OY-f}
  else{const u=(e-OX)/S,v=(f-OY)/H;x=(u+v)/2;y=(v-u)/2;z=0}
  let bb; try{bb=g.getBBox()}catch(_){return} if(!bb.width||!bb.height)return;
  const pad=1.5, bx=bb.x-pad, by=bb.y-pad, bw=bb.width+2*pad, bh=bb.height+2*pad;
  const ex=planoY?[dir/S,0,0]:[0,0,dir/S];                         // por px local: ao longo da parede (planta: x ou y)
  const pt=(lx,ly)=>{const X=x+ex[0]*lx, Y=y+ex[2]*lx, Zp=z-ly;return t3V(X,Y,Zp)};
  const nrm=planoY?[0,0,1]:[1,0,0], o=.006;
  const cs=[pt(bx,by),pt(bx+bw,by),pt(bx+bw,by+bh),pt(bx,by+bh)].map(p=>[p[0]+nrm[0]*o,p[1]+nrm[1]*o,p[2]+nrm[2]*o]);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([...cs[0],...cs[1],...cs[2],...cs[0],...cs[2],...cs[3]],3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,1,0,0,1,1,0,0,0],2));
  const mat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const mesh=new THREE.Mesh(geo,mat); mesh.renderOrder=3; mesh.visible=false; T3.mundo.add(mesh);
  const dono=(g.closest('[data-id]')||{}).dataset?.id||null, plq=g.classList.contains('plq')?g.dataset.zone:null;
  if(dono||plq){mesh.userData.dono=dono;mesh.userData.zona=plq;T3.clic.push(mesh)}
  const vivo=!!g.querySelector('[class],[data-v],[data-e]')||!!g.closest('.st');
  const D={g,mesh,bb:[bx,by,bw,bh],vivo,txt:'',gen:0}; T3.decals.push(D); t3Rasterizar(D);
}
const T3PROPS=['fill','fill-opacity','stroke','stroke-opacity','stroke-width','opacity','font-family','font-size','font-weight','letter-spacing','text-anchor','display'];
function t3Serial(D){
  const g=D.g, c=g.cloneNode(true); c.removeAttribute('transform'); c.removeAttribute('class');
  const o=[...g.querySelectorAll('*')], k=[...c.querySelectorAll('*')];
  o.forEach((e,i)=>{const n=k[i]; if(e.tagName==='title'){n.remove();return}
    const cs=getComputedStyle(e); n.removeAttribute('class'); n.setAttribute('style',T3PROPS.map(p=>p+':'+cs.getPropertyValue(p)).join(';')+';visibility:visible')});
  const [bx,by,bw,bh]=D.bb, R=4;
  return `<svg xmlns="${NS}" width="${Math.ceil(bw*R)}" height="${Math.ceil(bh*R)}" viewBox="${bx} ${by} ${bw} ${bh}">${new XMLSerializer().serializeToString(c)}</svg>`;
}
function t3Rasterizar(D){
  const s=t3Serial(D); if(s===D.txt)return; D.txt=s; const gen=++D.gen;
  const img=new Image();
  img.onload=()=>{if(gen!==D.gen)return;
    const cv=document.createElement('canvas'); cv.width=img.width; cv.height=img.height; cv.getContext('2d').drawImage(img,0,0);
    const old=D.mesh.material.map, tx=new T3.THREE.CanvasTexture(cv); tx.anisotropy=8; tx.generateMipmaps=true;
    D.mesh.material.map=tx; D.mesh.material.needsUpdate=true; D.mesh.visible=true; if(old)old.dispose(); T3.sujo=true; T3.decalsOk=(T3.decalsOk||0)+1};
  img.onerror=()=>errPush('3D: textura de parede não desenhou');
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
}

/* ---------- bonecos 3D: mesmas cores e proporções do boneco da planta (px × K → unidades) ---------- */
const t3h=px=>px*K/T3S, t3v=px=>px*K/T3Z;
function t3Boneco(w){
  const THREE=T3.THREE, R=mulberry(hash(w.st.id)), pk=a=>a[Math.floor(R()*a.length)];
  // mesma sequência de sorteio do mkWorker (funcionarios.js): mesma pessoa, mesmas cores
  let fem=R()<.4, oc=R()<.4, skin=pk(SKIN), hair=pk(HAIR), jk=pk(JACK), sh=pk(SHIRT), tie=pk(TIE);
  const IM=!!w.st.isJarvis, tech=w.st.isCron, MET='#B9C3CD', JUN='#4A5663';
  const pants=fem?'#27313F':'#1F2835', hose=fem?'#323C4C':pants;
  const M={}, mat=c=>M[c]||(M[c]=new THREE.MeshLambertMaterial({color:c}));
  const bx=(w2,h2,d2,c,x=0,y=0,z=0,pai)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w2,h2,d2),typeof c==='string'?mat(c):c);m.position.set(x,y,z);m.castShadow=true;(pai||g).add(m);return m};
  const g=new THREE.Group(), corpo=new THREE.Group(); g.add(corpo); g.userData.dono=w.st.it.decor?'equipe:agidesk':w.st.id;
  const corT=IM?MET:tech?'#2B3542':jk, corP=IM?MET:tech?'#2B3542':hose, sapato=IM?JUN:'#151B24';
  const prof=t3h(9);
  // pernas: coxa + canela, articuladas no quadril e no joelho
  const perna=lado=>{const q=new THREE.Group(); q.position.set(lado*t3h(3),t3v(18),0); corpo.add(q);
    bx(t3h(4.4),t3v(9),t3h(5),corP,0,-t3v(4.5),0,q);
    const j=new THREE.Group(); j.position.set(0,-t3v(9),0); q.add(j);
    bx(t3h(4.2),t3v(8),t3h(4.6),IM?MET:hose,0,-t3v(4),0,j); bx(t3h(5.6),t3v(2.4),t3h(8),sapato,0,-t3v(8.6),t3h(1.2),j);
    if(IM)bx(t3h(4.8),t3v(2.4),t3h(5.2),JUN,0,-t3v(.2),0,j);
    return {q,j}};
  const pL=perna(-1), pR=perna(1);
  const tronco=new THREE.Group(); tronco.position.set(0,t3v(18),0); corpo.add(tronco);
  if(fem&&!IM)bx(t3h(16),t3v(12),prof*1.15,jk,0,t3v(5),0,tronco);                       // saia
  bx(t3h(15),t3v(19),prof,corT,0,t3v(8.5),0,tronco);                                    // tronco
  const fz=prof/2+.003;
  if(IM){bx(t3h(8.4),t3v(5.8),.01,'#16202B',0,t3v(14.4),fz,tronco); const vis=new THREE.Mesh(new THREE.BoxGeometry(t3h(6),t3v(1.2),.01),new THREE.MeshBasicMaterial({color:0x2BD4F2}));vis.position.set(0,t3v(15.5),fz+.004);tronco.add(vis);
    bx(t3h(15.4),t3v(3.4),prof*1.04,JUN,0,t3v(0),0,tronco)}
  else if(tech){bx(t3h(4),t3v(4),.01,skin,0,t3v(15),fz,tronco); bx(t3h(15.2),t3v(4),prof*1.02,'#3A4757',0,t3v(16),0,tronco)}
  else{bx(t3h(5.6),t3v(8),.01,sh,0,t3v(13),fz,tronco); if(!fem&&!IM)bx(t3h(2.4),t3v(8.5),.012,tie,0,t3v(11.5),fz+.002,tronco)}
  const crach=IM?null:bx(t3h(4.4),t3v(4),.012,'#5B6B7C',t3h(-3.6),t3v(6),fz+.002,tronco);  // crachá: cor do estado (como o da planta)
  // braços (ombro) e mãos
  const braco=lado=>{const a=new THREE.Group(); a.position.set(lado*t3h(9.6),t3v(16),0); tronco.add(a);
    bx(t3h(4),t3v(13),t3h(4.4),IM?MET:tech?'#2B3542':jk,0,-t3v(6.5),0,a); bx(t3h(3.4),t3v(3),t3h(3.6),IM?JUN:skin,0,-t3v(14),0,a); if(IM)bx(t3h(5),t3v(3.6),t3h(5),JUN,0,-t3v(.6),0,a); return a};
  const bL=braco(-1), bR=braco(1);
  const tablet=bx(t3h(13),t3v(1),t3h(9),'#0A1118',0,t3v(9),prof/2+t3h(5),tronco); tablet.visible=false;
  const pasta=bx(t3h(13),t3v(10),t3h(2),'#C9D3DD',0,t3v(9),prof/2+t3h(2.5),tronco); pasta.visible=false;   // pasta entre salas
  // cabeça
  const cab=new THREE.Group(); cab.position.set(0,t3v(19),0); tronco.add(cab);
  const hw=t3h(12.6), hh=t3v(12.6), hd=t3h(11.5);
  bx(hw,hh,hd,IM?MET:skin,0,hh/2,0,cab);
  if(IM){const vz=new THREE.Mesh(new THREE.BoxGeometry(t3h(10),t3v(5),.012),new THREE.MeshBasicMaterial({color:0x16202B}));vz.position.set(0,hh*.45,hd/2+.004);cab.add(vz);
    const ol=new THREE.Mesh(new THREE.BoxGeometry(t3h(8.2),t3v(2),.012),new THREE.MeshBasicMaterial({color:0x7FF0FF}));ol.position.set(0,hh*.45,hd/2+.01);cab.add(ol);
    bx(t3h(.9),t3v(3),t3h(.9),'#6E7A87',0,hh+t3v(1.5),0,cab); const an=new THREE.Mesh(new THREE.SphereGeometry(t3h(1.2),8,6),new THREE.MeshBasicMaterial({color:0x2BD4F2}));an.position.set(0,hh+t3v(3.4),0);cab.add(an)}
  else{
    bx(hw*1.04,t3v(3.4),hd*1.04,hair,0,hh-t3v(1.4),0,cab);                                   // cabelo (topo)
    bx(hw*1.04,hh*(fem?1.15:.62),t3h(2.4),hair,0,fem?hh*.42:hh*.62,-hd/2-t3h(.9),cab);         // nuca / cabelo comprido
    [-1,1].forEach(s=>{bx(t3h(1.9),t3v(1.9),.01,'#10151C',s*t3h(2.1),hh*.48,hd/2+.004,cab);
      if(oc){const ar=new THREE.Mesh(new THREE.TorusGeometry(t3h(2),t3h(.35),4,12),mat('#10151C'));ar.position.set(s*t3h(2.4),hh*.48,hd/2+.01);cab.add(ar)}});
  }
  return {g,corpo,tronco,cab,pL,pR,bL,bR,tablet,pasta,crach,ang:null,px:null,py:null};
}
const T3ESTCOR={running:'#2BD4F2',ok:'#7ED68B',error:'#F25C60',stuck:'#F2A93B',idle:'#5B6B7C'};
function t3Estado(el){if(!el)return 'idle';const c=el.classList;return c.contains('error')?'error':(c.contains('stuck')||c.contains('late'))?'stuck':c.contains('running')?'running':c.contains('ok')?'ok':'idle'}
function t3Pose(w,b,t){
  const m=poseOf(w), ph=w.phase, sw=Math.sin(ph*7.5);
  let legA=0,armL=0,armR=0,bob=0,tilt=0,lean=0;
  switch(m){
    case 'run':{const s2=Math.sin(ph*14);legA=s2*40;armL=-s2*55+12;armR=s2*55-12;bob=-Math.abs(s2)*2.8;lean=11;break}
    case 'walk':legA=sw*26;armL=-sw*22+4;armR=sw*22-4;bob=-Math.abs(sw)*1.4;break;
    case 'type':armL=14+Math.sin(ph*13)*5;armR=-14-Math.sin(ph*13+1.3)*5;tilt=Math.sin(ph*1.7)*.6;break;
    case 'read':armL=34;armR=-34;tilt=5+Math.sin(ph*.7)*.8;break;
    case 'think':armR=-105+Math.sin(ph*1.3)*5;armL=5;tilt=-3+Math.sin(ph*.9)*2;break;
    case 'sit':armL=10;armR=-10;tilt=Math.sin(ph*.8)*.5;break;
    case 'alert':armL=150+Math.sin(ph*9)*14;armR=-150-Math.sin(ph*9+1)*14;bob=-Math.abs(Math.sin(ph*5))*1.5;break;
    case 'reach':armR=-155;armL=6;break;
    case 'printer':armL=30+Math.sin(ph*4)*5;armR=-30-Math.sin(ph*4)*5;break;
    case 'drink':armR=-125+Math.sin(ph*2)*6;armL=5;break;
    case 'talk':armR=-70+Math.sin(ph*5)*22;armL=8;tilt=Math.sin(ph*3)*.8;break;
    case 'operate':armL=40+Math.sin(ph*6)*8;armR=-40-Math.sin(ph*6+1)*8;break;
    default:bob=Math.sin(ph*1.6)*.4;armL=4;armR=-4;
  }
  const rad=Math.PI/180, s=Math.max(0,Math.min(1,w.sit||0)), anda=m==='walk'||m==='run';
  // sentado: coxa na horizontal, canela para baixo, quadril na altura do assento (13 px)
  const queda=(t3v(18)-13/T3Z)*s;
  b.corpo.position.y=-queda-bob*K/T3Z;
  b.pL.q.rotation.x=anda?legA*rad:-Math.PI/2*s; b.pR.q.rotation.x=anda?-legA*rad:-Math.PI/2*s;
  b.pL.j.rotation.x=Math.PI/2*s; b.pR.j.rotation.x=Math.PI/2*s;
  if(anda){b.bL.rotation.x=-legA*.8*rad;b.bR.rotation.x=legA*.8*rad}
  else{b.bL.rotation.x=-armL*rad;b.bR.rotation.x=armR*rad}
  b.bL.rotation.z=0; b.bR.rotation.z=0;
  b.tronco.rotation.x=lean*rad; b.cab.rotation.z=tilt*rad*.5;
  b.tablet.visible=m==='read'; b.pasta.visible=!!w.carry;
  // direção: andando = para onde vai; parado = de três quartos para a câmera, como o boneco da planta (0 = de frente; -1 = virado para a esquerda da tela; 1 = para a direita)
  let ang=b.ang;
  if(b.px!=null){const dx=w.x-b.px,dy=w.y-b.py;if(Math.hypot(dx,dy)>.002)ang=Math.atan2(dx,dy)}
  if(!w.path.length||b.ang==null){const tp=w.at?w.at.type:'';
    ang=w.face<0?0:w.face>0?Math.PI/2:Math.PI/4}
  if(b.ang==null)b.ang=ang; else{let d=ang-b.ang;d=Math.atan2(Math.sin(d),Math.cos(d));b.ang+=d*Math.min(1,.25)}
  b.g.rotation.y=b.ang; b.g.position.set(w.x,0,w.y); b.px=w.x; b.py=w.y;
  if(b.crach)b.crach.material=b.crach.material.color.getHexString()===T3ESTCOR[t3Estado(w.root)].slice(1).toLowerCase()?b.crach.material:new T3.THREE.MeshBasicMaterial({color:T3ESTCOR[t3Estado(w.root)]});
}

/* ---------- a cada quadro: bonecos, anéis, faces e texturas que mudam com o estado ---------- */
function t3Sync(tudo){
  const agora=performance.now();
  if(tudo||agora-T3.ultDin>100){T3.ultDin=agora;
    T3.din.forEach(({el,m,tipo})=>{const vis=el.checkVisibility?el.checkVisibility({visibilityProperty:false}):true, cs=getComputedStyle(el);
      m.visible=vis&&cs.display!=='none'; if(!m.visible)return;
      const c=t3Cor(tipo==='linha'?cs.stroke:cs.fill); if(!c)return; m.material.color.setRGB(c[0],c[1],c[2]);
      m.material.opacity=c[3]*(+(tipo==='linha'?cs.strokeOpacity:cs.fillOpacity))*(+cs.opacity)});
    const t=agora/1000, anima=CFG.anim==='completa';
    Object.values(T3.aneis).forEach(({an,pu,po,gb})=>{const e=t3Estado(gb), c=T3ESTCOR[e];
      const forte={error:1,stuck:.95,running:.55}[e]||0; po.visible=forte>0;
      if(forte){po.material.color.set(c); po.material.opacity=forte*(anima?(.8+.2*Math.sin(t*(e==='error'?6:2.4))):1)}
      an.material.color.set(c); an.material.opacity=(e==='ok'||e==='idle')?.12:.3;
      const pulsa=anima&&(e==='running'||e==='error'); pu.visible=pulsa;
      if(pulsa){const k=(t/(e==='error'?1.1:2.2))%1; pu.material.color.set(c); pu.material.opacity=.6*(1-k); pu.scale.setScalar(1+k*.35)}});
  }
  if(tudo||agora-T3.ultDec>1000){T3.ultDec=agora; T3.decals.forEach(D=>{if(D.vivo)t3Rasterizar(D)})}
}
function t3Quadro(ts){
  requestAnimationFrame(t3Quadro);
  if(!T3.on||!T3.montado||document.hidden)return;
  const passo=CFG.anim==='completa'?0:CFG.anim==='reduzida'?66:250;
  if(ts-T3.ult<passo)return; T3.ult=ts;
  Object.values(WORKERS).forEach(w=>{const b=T3.bonecos[w.st.id];if(b)t3Pose(w,b,ts/1000)});
  t3Sync(false);
  T3.ren.render(T3.cena,T3.cam); T3.quadros=(T3.quadros||0)+1;
}

/* ---------- clique no 3D: mesa/rack abre a estação; placa aproxima a sala; boneco abre a estação dele ---------- */
function t3Cliques(){
  const svg=$('svg'); let p0=null;
  svg.addEventListener('pointerdown',e=>{p0=[e.clientX,e.clientY]});
  svg.addEventListener('click',e=>{
    if(!T3.on||e.target!==svg||!p0||Math.hypot(e.clientX-p0[0],e.clientY-p0[1])>5)return;
    const THREE=T3.THREE, r=svg.getBoundingClientRect(), rc=new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),T3.cam);
    const alvos=[...T3.clic,...Object.values(T3.bonecos).map(b=>b.g)];
    for(const h of rc.intersectObjects(alvos,true)){
      let o=h.object, dono=o.userData.dono, zona=o.userData.zona;
      if(!dono&&o.geometry.userData.donos&&h.faceIndex!=null)dono=o.geometry.userData.donos[Math.floor(h.faceIndex/2)]||o.geometry.userData.donos[h.faceIndex];
      while(!dono&&!zona&&o.parent){o=o.parent;dono=o.userData.dono;zona=o.userData.zona}
      if(zona){zoomZone(zona);return} if(dono&&STATIONS[dono]){select(dono);return} if(dono==='equipe:agidesk'){select(dono);return}
    }
  });
}

/* ---------- relatório para o teste automático (?debug=1) ---------- */
// sonda de sombra: brilho do piso logo à frente de um rack, com e sem sombra (prova que a sombra aparece onde a câmera vê)
function t3Sonda(){
  const THREE=T3.THREE, st=Object.values(STATIONS).find(s=>s.isCron); if(!st)return null;
  const rt=new THREE.WebGLRenderTarget(512,512), pts=[[.75,.65],[1.1,1.0],[.2,1.2],[1.2,.2],[3,3]].map(([a,c])=>{const v=new THREE.Vector3(st.cx+a,0.01,st.cy+c).project(T3.cam);return [Math.round((v.x+1)/2*511),Math.round((v.y+1)/2*511)]});
  const b=new Uint8Array(4), ler=()=>{T3.ren.setRenderTarget(rt);T3.ren.render(T3.cena,T3.cam);const r=pts.map(([x,y])=>{T3.ren.readRenderTargetPixels(rt,x,y,1,1,b);return b[0]+b[1]+b[2]});T3.ren.setRenderTarget(null);return r.join('/')};
  const com=ler(); T3.sol.castShadow=false; T3.mundo.traverse(o=>{if(o.material)[].concat(o.material).forEach(m=>m.needsUpdate=true)}); const sem=ler();
  T3.sol.castShadow=true; T3.mundo.traverse(o=>{if(o.material)[].concat(o.material).forEach(m=>m.needsUpdate=true)});
  rt.dispose();
  return [com,sem];
}
function t3Relatorio(){
  if(!DBG)return; let p=$('dbg3d'); if(!p){p=document.createElement('pre');p.id='dbg3d';p.style.display='none';document.body.appendChild(p)}
  const esp=Object.keys(STATIONS).length, com=Object.keys(STATIONS).filter(id=>T3.donos.has(id)).length;
  p.textContent=['WEBGL '+(T3.erro?'falha':T3.on?'ok':'—'),'ESTACOES '+com,'ESPERADAS '+esp,'CAIXAS '+T3.caixas.length,'FACES '+T3.nfaces,'DECALS '+T3.decals.length,
    'BONECOS '+Object.keys(T3.bonecos).length+' DE '+Object.keys(WORKERS).length,'SOMBRA '+(T3.sol&&T3.sol.shadow.map?'ok':'—')+(T3.sonda?' com '+T3.sonda[0]+' sem '+T3.sonda[1]:''),'QUADROS '+(T3.quadros||0),'ERROS '+window.__errs.filter(x=>x.startsWith('3D')).length].join('\n');
}
if(T3.quer){document.body.classList.add('t3');t3Iniciar(); if(DBG){setInterval(t3Relatorio,1000);setTimeout(()=>{if(T3.on)T3.sonda=t3Sonda()},3000)}}
