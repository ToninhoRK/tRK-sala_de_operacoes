/* Sala de Operações · Tema Pixel art: a MESMA planta (salas, vidro, móveis, painéis, estações, rótulos), em pixel art.
   Scripts clássicos carregados em ordem pelo index.html: compartilham o escopo global (sem build).

   Como funciona (decisões de 15/10/2026: pixel de 3 px, mesma paleta, rótulos em resolução normal, opção no CONFIGURAR,
   nunca padrão; o caminho "cena 3D reduzida" foi reprovado por ficar ruim de ver):
   - A planta continua sendo montada em SVG (rotas, rótulos, selos, diagnóstico, cliques nos rótulos).
   - Cada peça do SVG (piso, vidro, mesa, estante, painel...) é redesenhada, uma vez, numa tela de baixa resolução
     (1 pixel da arte = TPXK px da planta), sem suavização, com contorno escuro de 1 pixel em volta de cada móvel.
     A ordem de desenho é a da própria planta (lista de profundidade), então quem está na frente continua na frente.
   - Bonecos não vêm do SVG: são sprites desenhados à mão por código (mesma pessoa, mesmas cores e gestos do boneco da planta).
   - O que muda com o estado (tela da mesa, anel no piso, LEDs do rack, fluxos) é redesenhado 10 vezes por segundo.
   - Textos (placas, painéis do vault e da equipe) e a camada de rótulos/selos ficam no SVG por cima, nítidos.
   - A tela é ampliada com image-rendering: pixelated e acompanha zoom/arrastar/CENTRALIZAR (mesmo viewBox). */
const TPXK=2.5;                                   // px da planta por pixel da arte (o boneco da planta, ~67 px, vira ~27 pixels)
const TPX={quer:temaPX(CFG.tema),on:false,cv:null,ctx:null,img:null,FB:null,OWN:null,W:0,H:0,BG:null,spr:new WeakMap(),piso:[],
  donos:[null],dIdx:new Map(),erro:null,ult:0,ultViv:0,ultDec:0,quadros:0,itens:0,bonecos:0,estacoes:new Set(),cache:new Map()};

/* ---------- cores: a paleta da Sala, um pouco mais clara (sem suavização a cena escura apaga; aprovado no protótipo) ---------- */
// clareia só os tons escuros, pela luminosidade (HSL): matiz e saturação ficam; cores de estado (claras) não mudam
const TPXLC=new Map();
let TPXEXP=.56;                                       // .56 nos móveis; o piso (fundo) usa .72, mais escuro: móvel e cadeira se destacam dele
function tpxLuz(r,g,b){const k=(r<<16|g<<8|b)+TPXEXP*1e8; let v=TPXLC.get(k); if(v)return v;
  const R=r/255,G=g/255,B=b/255,mx=Math.max(R,G,B),mn=Math.min(R,G,B),L=(mx+mn)/2,d=mx-mn;
  let h=0,s=0; if(d){s=L>.5?d/(2-mx-mn):d/(mx+mn); h=mx===R?((G-B)/d+(G<B?6:0)):mx===G?(B-R)/d+2:(R-G)/d+4; h/=6}
  const L2=L<.5?.5*Math.pow(2*L,TPXEXP):L;
  const f=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p};
  if(!s)v=[L2,L2,L2]; else{const q=L2<.5?L2*(1+s):L2+s-L2*s,p=2*L2-q;v=[f(p,q,h+1/3),f(p,q,h),f(p,q,h-1/3)]}
  v=v.map(x=>Math.round(x*255)); TPXLC.set(k,v); return v}
function tpxRGBA(c,a){                              // texto de cor → [r,g,b,a 0..1] já clareado; null se não houver cor
  if(!c||c==='none'||c==='transparent')return null;
  if(c.startsWith('url'))return [127,214,238,.09];   // vidro (degradê #glass): tom médio
  let m=c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i), r,g,b,al=1;
  if(m){let h=m[1];if(h.length===3)h=h.split('').map(x=>x+x).join('');r=parseInt(h.slice(0,2),16);g=parseInt(h.slice(2,4),16);b=parseInt(h.slice(4,6),16)}
  else{m=c.match(/rgba?\(([^)]+)\)/); if(!m)return null; const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); [r,g,b]=p; if(p.length>3)al=p[3]}
  const L=tpxLuz(r|0,g|0,b|0); return [L[0],L[1],L[2],al*(a==null?1:a)];
}
const tpxHex=h=>{const c=tpxRGBA(h);return (255<<24|c[2]<<16|c[1]<<8|c[0])>>>0};
const TPXK0=tpxHex('#05080D');                       // contorno

/* ---------- buffer de desenho (sprite): pixels com alfa, polígonos, linhas ---------- */
class TpxBuf{
  constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h;this.d=new Uint32Array(w*h)}
  px(X,Y,r,g,b,a){X=X-this.x|0;Y=Y-this.y|0;if(X<0||Y<0||X>=this.w||Y>=this.h||a<=0)return;
    const i=Y*this.w+X,o=this.d[i],oa=(o>>>24)/255;
    if(a>=.999||!oa){this.d[i]=((Math.round(a*255)<<24)|(b<<16)|(g<<8)|r)>>>0;return}
    const na=a+oa*(1-a),f=a/na, mix=(s,dd)=>Math.round(s*f+dd*(1-f));
    this.d[i]=((Math.round(na*255)<<24)|(mix(b,o>>16&255)<<16)|(mix(g,o>>8&255)<<8)|mix(r,o&255))>>>0}
  poly(p,c){                                        // preenchimento por linhas (regra par-ímpar, centro do pixel)
    let y0=1e9,y1=-1e9; p.forEach(q=>{if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1]});
    for(let Y=Math.floor(y0);Y<=Math.ceil(y1);Y++){const yc=Y+.5,xs=[];
      for(let i=0,j=p.length-1;i<p.length;j=i++){const [ax,ay]=p[i],[bx,by]=p[j];if((ay>yc)!==(by>yc))xs.push(ax+(yc-ay)/(by-ay)*(bx-ax))}
      xs.sort((a,b)=>a-b);
      for(let k=0;k+1<xs.length;k+=2)for(let X=Math.ceil(xs[k]-.5);X<=Math.floor(xs[k+1]-.5);X++)this.px(X,Y,c[0],c[1],c[2],c[3])}
  }
  linha(a,b,c,larg=1,tr=null){                      // tr = [traço, vão, deslocamento] (tracejado, em pixels)
    let [x0,y0]=a,[x1,y1]=b; const n=Math.max(1,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))));
    for(let i=0;i<=n;i++){const t=i/n, X=Math.round(x0+(x1-x0)*t-.5), Y=Math.round(y0+(y1-y0)*t-.5);
      if(tr){const s=(i+tr[2])%(tr[0]+tr[1]);if((s<0?s+tr[0]+tr[1]:s)>=tr[0])continue}
      this.px(X,Y,c[0],c[1],c[2],c[3]); if(larg>1)this.px(X,Y-1,c[0],c[1],c[2],c[3])}
  }
  contorno(){                                         // contorno escuro de 1 pixel em volta do que é sólido + luz de 1 pixel na borda de cima
    const w=this.w,h=this.h, s0=i=>(this.d[i]>>>24)>=110;
    for(let y=h-1;y>=1;y--)for(let x=0;x<w;x++){const i=y*w+x;if(s0(i)&&!s0(i-w)){const c=this.d[i],L=v=>Math.min(255,Math.round(v*1.22+14));
      this.d[i]=((c&0xFF000000)|(L(c>>16&255)<<16)|(L(c>>8&255)<<8)|L(c&255))>>>0}}   // borda de cima mais clara: separa móvel escuro do piso
    const o=this.d.slice(),sol=i=>(o[i]>>>24)>=110;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(sol(i))continue;
      if((x>0&&sol(i-1))||(x<w-1&&sol(i+1))||(y>0&&sol(i-w))||(y<h-1&&sol(i+w)))this.d[i]=TPXK0}
  }
}

/* ---------- do SVG para formas em pixels da arte ---------- */
const TPXSEL='polygon,polyline,rect,ellipse,circle,line,path';
function tpxMat(el,inv){return inv.multiply(el.getScreenCTM())}
function tpxXY(m,x,y){return [(m.a*x+m.c*y+m.e)/TPXK,(m.b*x+m.d*y+m.f)/TPXK]}
function tpxFormas(raiz,inv,opc={}){
  const out=[], els=(raiz.matches&&raiz.matches(TPXSEL)?[raiz]:[]).concat([...raiz.querySelectorAll(TPXSEL)]);
  const opac=new Map(), op=e=>{let o=1;for(let x=e;x&&x!==raiz.parentNode&&x.nodeType===1;x=x.parentNode){if(!opac.has(x))opac.set(x,+getComputedStyle(x).opacity);o*=opac.get(x)}return o};
  for(const el of els){
    if(el.closest('text,title,clipPath,defs,marker,.wk'))continue;
    const cl=el.getAttribute('class')||''; if(/\b(pulse|hit)\b/.test(cl))continue;
    if(el.checkVisibility&&!el.checkVisibility({visibilityProperty:false,opacityProperty:false}))continue;   // display:none no próprio ou num pai
    const cs=getComputedStyle(el), o=op(el); if(o<.02)continue;
    const m=tpxMat(el,inv), esc=Math.sqrt(Math.abs(m.a*m.d-m.b*m.c));
    const fill=el.tagName==='polyline'||el.tagName==='line'?null:tpxRGBA(cs.fill,+cs.fillOpacity*o);
    const sw=parseFloat(cs.strokeWidth)*esc, stroke=sw>=1?tpxRGBA(cs.stroke,+cs.strokeOpacity*o):null;   // traço fino (< 1 px da planta: arestas das caixas) some; o contorno do móvel substitui
    let polys=[], fechado=true;
    const T=(x,y)=>tpxXY(m,x,y), g=n=>el[n].baseVal.value;
    switch(el.tagName){
      case 'polygon':case 'polyline':polys=[[...el.points].map(p=>T(p.x,p.y))];fechado=el.tagName==='polygon';break;
      case 'line':polys=[[T(g('x1'),g('y1')),T(g('x2'),g('y2'))]];fechado=false;break;
      case 'rect':{const x=g('x'),y=g('y'),w=g('width'),h=g('height');polys=[[T(x,y),T(x+w,y),T(x+w,y+h),T(x,y+h)]];break}
      case 'circle':case 'ellipse':{const cx=g('cx'),cy=g('cy'),rx=el.tagName==='circle'?g('r'):g('rx'),ry=el.tagName==='circle'?g('r'):g('ry');
        const n=Math.max(12,Math.min(40,Math.round((rx+ry)*esc/TPXK*1.5)));polys=[Array.from({length:n},(_,i)=>T(cx+rx*Math.cos(i/n*2*Math.PI),cy+ry*Math.sin(i/n*2*Math.PI)))];break}
      case 'path':{const d=el.getAttribute('d')||'', partes=d.split(/(?=M)/).filter(s=>s.trim());
        partes.forEach(sp=>{const t=document.createElementNS(NS,'path');t.setAttribute('d',sp);el.parentNode.insertBefore(t,el);
          try{const L=t.getTotalLength(),n=Math.max(4,Math.min(60,Math.round(L*esc/TPXK)));polys.push(Array.from({length:n+1},(_,i)=>{const q=t.getPointAtLength(L*i/n);return T(q.x,q.y)}))}catch(_){}
          t.remove()});
        fechado=/z\s*$/i.test(d.trim());break}
    }
    let tr=null; if(stroke&&cs.strokeDasharray&&cs.strokeDasharray!=='none'){const a=cs.strokeDasharray.split(/[ ,]+/).map(parseFloat);
      if(a.length>=2)tr=[Math.max(1,Math.round(a[0]*esc/TPXK)),Math.max(1,Math.round(a[1]*esc/TPXK)),Math.round(-parseFloat(cs.strokeDashoffset||0)*esc/TPXK)]}
    polys.forEach(p=>{if(p.length)out.push({p,fill:fill&&fill[3]>.01&&p.length>=3?fill:null,stroke:stroke&&stroke[3]>.06?stroke:null,larg:sw/TPXK>=1.5?2:1,fechado,tr})});
  }
  return out;
}
function tpxRaster(raiz,inv,opc={}){
  const F=tpxFormas(raiz,inv,opc); if(!F.length)return null;
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; F.forEach(f=>f.p.forEach(([x,y])=>{if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y}));
  const b=new TpxBuf(Math.floor(x0)-2,Math.floor(y0)-2,Math.ceil(x1-x0)+5,Math.ceil(y1-y0)+5);
  F.forEach(f=>{if(f.fill)b.poly(f.p,f.fill);
    if(f.stroke){const p=f.p;for(let i=0;i<p.length-1;i++)b.linha(p[i],p[i+1],f.stroke,f.larg,f.tr);if(f.fechado&&p.length>2)b.linha(p[p.length-1],p[0],f.stroke,f.larg,f.tr)}});
  if(opc.contorno)b.contorno();
  return b;
}

/* ---------- montagem: fundo (laje, piso das salas, grade) uma vez; peças do mundo sob demanda ---------- */
const P_build=build, P_applyVB=applyVB;
build=function(s){
  P_build(s);
  if(!TPX.quer)return;
  document.body.classList.add('tpx');
  try{tpxMontar()}catch(e){tpxFalha(e)}
};
applyVB=function(){P_applyVB(); if(TPX.on)tpxCamera()};
function tpxFalha(e){
  TPX.erro=String(e&&e.message||e); errPush('Pixel: '+TPX.erro); TPX.quer=false; TPX.on=false; document.body.classList.remove('tpx');
  if(TPX.cv)TPX.cv.style.display='none';
  const f=$('faixa3d')||Object.assign(document.createElement('div'),{id:'faixa3d'}); f.textContent=T('Pixel art indisponível neste navegador: mostrando a planta.','Pixel art is not available in this browser: showing the floor plan.');
  document.querySelector('.stage').appendChild(f); tpxRelatorio();
}
function tpxDono(el){
  const d=el.closest&&el.closest('[data-id]'), p=el.querySelector&&el.querySelector('.plq');
  const k=d?'id:'+d.dataset.id:p?'zona:'+p.dataset.zone:null; if(!k)return 0;
  if(!TPX.dIdx.has(k)){TPX.dIdx.set(k,TPX.donos.length);TPX.donos.push(k)}
  return TPX.dIdx.get(k);
}
function tpxMontar(){
  const svg=$('svg');
  if(!TPX.cv){const st=document.querySelector('.stage'), cv=document.createElement('canvas'); cv.id='pxcv'; st.insertBefore(cv,st.firstChild);
    TPX.cv=cv; TPX.ctx=cv.getContext('2d'); new ResizeObserver(()=>{if(TPX.on)tpxCamera()}).observe(st); tpxCliques(); requestAnimationFrame(tpxQuadro)}
  TPX.W=Math.ceil(VB0[2]/TPXK); TPX.H=Math.ceil(VB0[3]/TPXK); TPX.cv.width=TPX.W; TPX.cv.height=TPX.H;
  TPX.img=TPX.ctx.createImageData(TPX.W,TPX.H); TPX.FB=new Uint32Array(TPX.img.data.buffer); TPX.OWN=new Uint16Array(TPX.W*TPX.H);
  TPX.spr=new WeakMap(); TPX.donos=[null]; TPX.dIdx=new Map(); TPX.estacoes=new Set(); TPX.cache.clear();
  const inv=svg.getScreenCTM().inverse(), filhos=[...svg.children].filter(e=>e.tagName==='g'), gBase=filhos[0];
  // fundo: tudo do gBase que não muda (laje, grade, piso das salas). Estações (.st: anel, seleção) e fluxos mudam: vão para TPX.piso
  const bg=new TpxBuf(0,0,TPX.W,TPX.H); bg.d.fill(tpxHex('#070A0F'));
  TPX.piso=[]; TPXEXP=.72;
  try{[...gBase.children].forEach(n=>{
    if(n.matches('.st')||n.matches('.flow')){TPX.piso.push({n,s:null,anel:n.querySelector('.ring')});return}
    tpxFormas(n,inv).forEach(f=>{if(f.fill)bg.poly(f.p,f.fill);if(f.stroke){const p=f.p;for(let i=0;i<p.length-1;i++)bg.linha(p[i],p[i+1],f.stroke,f.larg,f.tr);if(f.fechado&&p.length>2)bg.linha(p[p.length-1],p[0],f.stroke,f.larg,f.tr)}});
  })}finally{TPXEXP=.56}
  TPX.BG=bg.d; TPX.inv=inv;
  TPX.on=true; tpxCamera(); tpxRelatorio();
}
function tpxPeca(n,forcar){                          // sprite de uma peça do mundo (cache; as que mudam com o estado são refeitas)
  let s=TPX.spr.get(n);
  const vivo=s?s.vivo:(n.matches('.st')||!!n.querySelector('.rim,.led,.st')?1:n.querySelector('[data-v],[data-e]')?2:0);
  if(!s||forcar){
    const tag=(WORLD.items.find(i=>i.node===n)||{}).tag||'';
    const b=tpxRaster(n,TPX.inv,{contorno:tag!=='vidro'});
    s={b,vivo,dono:tpxDono(n),cls:n.getAttribute('class')}; TPX.spr.set(n,s); TPX.itens++;
    if(n.matches('.st[data-id]'))TPX.estacoes.add(n.dataset.id);
  }
  return s;
}

/* ---------- câmera: a tela da arte cobre a planta inteira; posição e escala seguem o viewBox (preserveAspectRatio meet) ---------- */
function tpxCamera(){
  const svg=$('svg'), st=document.querySelector('.stage'), r=svg.getBoundingClientRect(), rs=st.getBoundingClientRect(); if(!r.width||!r.height)return;
  const [vx,vy,vw,vh]=VB, k=Math.min(r.width/vw,r.height/vh), cx=vx+vw/2, cy=vy+vh/2;
  const cv=TPX.cv; cv.style.left=(r.left-rs.left+r.width/2-cx*k)+'px'; cv.style.top=(r.top-rs.top+r.height/2-cy*k)+'px';
  cv.style.width=(TPX.W*TPXK*k)+'px'; cv.style.height=(TPX.H*TPXK*k)+'px';
}

/* ---------- desenho na tela ---------- */
function tpxCopiar(b,dono,dx=0,dy=0){
  if(!b)return; const FB=TPX.FB,OWN=TPX.OWN,W=TPX.W,H=TPX.H,d=b.d,bw=b.w;
  for(let y=0;y<b.h;y++){const Y=b.y+y+dy;if(Y<0||Y>=H)continue;const lin=Y*W;
    for(let x=0;x<bw;x++){const c=d[y*bw+x];if(!c)continue;const X=b.x+x+dx;if(X<0||X>=W)continue;const a=c>>>24,i=lin+X;
      if(a>=250){FB[i]=c|0xFF000000;if(dono)OWN[i]=dono}
      else{const o=FB[i],f=a/255,g=1-f;FB[i]=(0xFF000000|(Math.round((c>>16&255)*f+(o>>16&255)*g)<<16)|(Math.round((c>>8&255)*f+(o>>8&255)*g)<<8)|Math.round((c&255)*f+(o&255)*g))>>>0;if(dono&&a>=110)OWN[i]=dono}}}
}
function tpxPf(X,Y,c,a=1){X|=0;Y|=0;if(X<0||Y<0||X>=TPX.W||Y>=TPX.H)return;const i=Y*TPX.W+X;
  if(a>=1){TPX.FB[i]=c;return}const o=TPX.FB[i],g=1-a;TPX.FB[i]=(0xFF000000|(Math.round((c>>16&255)*a+(o>>16&255)*g)<<16)|(Math.round((c>>8&255)*a+(o>>8&255)*g)<<8)|Math.round((c&255)*a+(o&255)*g))>>>0}
function tpxQuadro(ts){
  requestAnimationFrame(tpxQuadro);
  if(!TPX.on||!built||document.hidden)return;
  const passo=CFG.anim==='completa'?0:CFG.anim==='reduzida'?66:250;
  if(ts-TPX.ult<passo)return; TPX.ult=ts;
  try{tpxDesenhar(ts)}catch(e){tpxFalha(e)}
}
function tpxDesenhar(ts){
  const FB=TPX.FB, t=ts/1000, viv=ts-TPX.ultViv>100, dec=ts-TPX.ultDec>1000; if(viv)TPX.ultViv=ts; if(dec)TPX.ultDec=ts;
  FB.set(TPX.BG); TPX.OWN.fill(0);
  // piso que muda: anel e seleção das estações, fluxos; pulso do anel desenhado aqui (rodando, falha, atrasado)
  TPX.piso.forEach(p=>{
    const cl=p.n.getAttribute('class'); if(!p.s||(viv&&(cl!==p.cls||/\b(on|running)\b/.test(cl)))){p.s=tpxRaster(p.n,TPX.inv,{});p.dono=tpxDono(p.n);p.cls=cl}
    tpxCopiar(p.s,p.dono);
    if(p.anel&&CFG.anim==='completa'){const c=p.n.classList, e=c.contains('error')?1.1:(c.contains('running')||c.contains('late'))?2.2:0;
      if(e){const k=(t/e)%1, cs=getComputedStyle(p.anel), cor=tpxRGBA(cs.stroke); if(cor){
        const g=n=>p.anel[n].baseVal.value, cx=g('cx')/TPXK, cy=g('cy')/TPXK, rx=g('rx')/TPXK*(1+k*.35), ry=g('ry')/TPXK*(1+k*.35), N=Math.round((rx+ry)*2.2), cc=tpxPack(cor);
        for(let i=0;i<N;i++){const a=i/N*2*Math.PI;tpxPf(cx+rx*Math.cos(a),cy+ry*Math.sin(a),cc,.65*(1-k))}}}}
  });
  // mundo, na ordem de profundidade da planta
  let nb=0; const baloes=[];
  for(const n of WORLD.el.children){
    if(n.classList.contains('wk')){const w=WORKERS[n.dataset.id];if(w){tpxBoneco(w,t,baloes);nb++}continue}
    const s=tpxPeca(n,false), mudou=n.getAttribute('class')!==s.cls;   // refaz só o que mudou de estado ou está piscando (rodando)
    if((s.vivo===1&&viv&&(mudou||n.classList.contains('running')))||(s.vivo===2&&dec))tpxCopiar(tpxPeca(n,true).b,s.dono); else tpxCopiar(s.b,s.dono);
  }
  baloes.forEach(f=>f());
  TPX.bonecos=nb;
  TPX.ctx.putImageData(TPX.img,0,0); TPX.quadros++;
}
const tpxPack=c=>(0xFF000000|(c[2]<<16)|(c[1]<<8)|c[0])>>>0;

/* ---------- bonecos: sprites desenhados à mão (mesma pessoa e mesmas cores do boneco da planta; gestos por pose) ---------- */
const TPXEST={running:'#2BD4F2',ok:'#7ED68B',error:'#F25C60',stuck:'#F2A93B',idle:'#5B6B7C',manut:'#9C8BD9'};
function tpxPessoa(st){
  if(TPX.cache.has('p:'+st.id))return TPX.cache.get('p:'+st.id);
  const R=mulberry(hash(st.id)), pk=a=>a[Math.floor(R()*a.length)];     // mesma sequência de sorteio do mkWorker
  let fem=R()<.4, oc=R()<.4, pele=pk(SKIN), cab=pk(HAIR), terno=pk(JACK), cam=pk(SHIRT), grav=pk(TIE);
  const p={fem:fem&&!st.isJarvis,oc,pele,cab,terno,cam,grav,robo:!!st.isJarvis,tec:!!st.isCron};
  if(p.tec)p.terno='#2B3542';
  TPX.cache.set('p:'+st.id,p); return p;
}
function tpxSprite(p,pose,f,lado,cor,carga){
  const k=[p.pele,p.cab,p.terno,p.cam,p.grav,p.fem,p.oc,p.robo,p.tec,pose,f,lado,cor,carga].join('|'); if(TPX.cache.has(k))return TPX.cache.get(k);
  const B=new TpxBuf(-14,-34,28,40), C=(h,m=1)=>{const c=tpxRGBA(h);return [Math.min(255,c[0]*m|0),Math.min(255,c[1]*m|0),Math.min(255,c[2]*m|0),1]};
  const R=(x,y,w,h,c)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)B.px(x+i,y+j,c[0],c[1],c[2],1)}, X=(x,y,c)=>B.px(x,y,c[0],c[1],c[2],1);
  const robo=p.robo, MET=C('#B9C3CD'), JUN=C('#4A5663');
  const T=robo?MET:C(p.terno), Ts=robo?C('#B9C3CD',.75):C(p.terno,.72), Ta=robo?C('#B9C3CD',.88):C(p.terno,.86);
  const S=C(p.pele), Ss=C(p.pele,.8), Hc=C(p.cab), Hs=C(p.cab,1.35), Wc=C(p.cam), G=C(p.grav), Z=C('#11161D'), Sap=robo?JUN:C('#1A1F27');
  const calca=robo?C('#B9C3CD',.8):C(p.fem?'#323C4C':'#1F2835');
  const sent=pose==='type'||pose==='sit'||pose==='read', lean=pose==='run'?1:0;
  // pernas
  if(!sent){let le=0,ld=0,xe=0,xd=0;
    if(pose==='walk'){le=f===1?1:0;ld=f===3?1:0}
    if(pose==='run'){le=[2,0,0,1][f];ld=[0,1,2,0][f];xe=[-1,0,1,0][f];xd=[1,0,-1,0][f]}
    R(-3+xe,-8,2,8-le,calca);R(-3+xe,-1-le,2,1,Sap);R(1+xd,-8,2,8-ld,calca);R(1+xd,-1-ld,2,1,Sap);
    if(p.fem&&!robo){R(-4,-9,8,3,T);R(-4,-9,8,1,Ts)}}
  const bx=lean;
  // tronco
  R(bx-4,-17,8,9,T); R(bx+2,-17,2,9,Ts);
  if(robo){R(bx-2,-15,4,3,Z);X(bx-1,-14,C('#2BD4F2'));X(bx,-14,C('#2BD4F2'));R(bx-4,-9,8,1,JUN)}
  else if(p.tec){R(bx-4,-17,8,1,C('#3A4757'));X(bx-1,-17,S);X(bx,-17,S)}
  else{R(bx-2,-17,4,1,Wc);X(bx-2,-16,Wc);X(bx+1,-16,Wc);
    if(!p.fem){R(bx-1,-16,2,5,G);X(bx-1,-11,C(p.grav,.7));X(bx,-11,C(p.grav,.7))}else{R(bx-1,-16,2,3,Wc)}}
  if(cor&&!robo)R(bx-4+1,-12,2,2,C(cor));                       // crachá na cor do estado
  // braços
  const braco=(lado2,modo,dy)=>{const x=lado2<0?bx-6:bx+4, sx=lado2<0?-1:1, mao=robo?JUN:S;
    if(modo==='baixo'){R(x,-17+dy,2,6,Ta);R(x,-11+dy,2,2,mao)}
    else if(modo==='alto'){R(x,-20+dy,2,3,Ta);R(x+sx,-25+dy,2,5,Ta);R(x+sx,-28+dy,2,3,mao)}
    else if(modo==='frente'){R(x,-17,2,4,Ta);R(lado2<0?bx-4:bx+2,-13+dy,2,2,mao)}
    else if(modo==='queixo'){R(x,-17,2,3,Ta);R(x-sx,-15,2,2,Ta);R(lado2<0?bx-3:bx+1,-18+dy,2,2,mao)}
    else if(modo==='gesto'){R(x,-17,2,3,Ta);R(x+sx,-16+dy,2,2,Ta);R(x+2*sx,-17+dy,2,2,mao)}
    else if(modo==='copo'){R(x,-17,2,3,Ta);R(x-sx,-16,2,2,Ta);R(lado2<0?bx-3:bx+1,-19,2,2,mao);R(lado2<0?bx-3:bx+1,-21,2,2,C('#E6EEF6'))}};
  switch(pose){
    case 'alert':braco(-1,'alto',f?0:-1);braco(1,'alto',f?-1:0);break;
    case 'type':case 'operate':case 'printer':braco(-1,'frente',f?-1:0);braco(1,'frente',f?0:-1);break;
    case 'sit':braco(-1,'frente',0);braco(1,'frente',0);break;
    case 'read':braco(-1,'frente',0);braco(1,'frente',0);R(bx-4,-15,8,4,C('#0A1118'));R(bx-3,-14,5,1,C('#2BD4F2'));break;
    case 'run':braco(-1,'baixo',[-2,0,1,0][f]);braco(1,'baixo',[1,0,-2,0][f]);break;
    case 'walk':braco(-1,'baixo',f===1?-1:0);braco(1,'baixo',f===3?-1:0);break;
    case 'think':braco(-1,'baixo',0);braco(1,'queixo',0);break;
    case 'reach':braco(-1,'baixo',0);braco(1,'alto',0);break;
    case 'drink':braco(-1,'baixo',0);braco(1,'copo',0);break;
    case 'talk':braco(-1,'baixo',0);braco(1,'gesto',f?-1:0);break;
    default:braco(-1,'baixo',0);braco(1,'baixo',0);
  }
  if(carga){const x=bx-4;R(x,-19,3,1,C('#8FA1B5'));R(x,-18,8,7,C('#C9D3DD'));R(x+7,-18,1,7,C('#8FA1B5'));R(x,-12,8,1,C('#8FA1B5'));   // pasta (cinza-azulada: nenhuma cor de estado)
    R(x+1,-18,5,1,C('#F2F5F8'));R(x+2,-15,4,1,C('#5B6B7C'));R(x-1,-15,1,2,robo?JUN:S);R(x+8,-15,1,2,robo?JUN:S)}            // papel saindo, etiqueta, mãos segurando
  // cabeça
  const hx=lean;
  if(robo){R(hx-3,-25,7,7,MET);R(hx+3,-25,1,7,C('#B9C3CD',.75));R(hx-3,-22,7,2,Z);R(hx-2,-22,5,1,C('#7FF0FF'));X(hx,-26,JUN);X(hx,-27,JUN);X(hx,-28,C('#2BD4F2'))}
  else{R(hx-3,-24,6,7,S);R(hx+2,-24,1,7,Ss);
    R(hx-3,-25,6,2,Hc);R(hx-2,-26,4,1,Hc);X(hx-3,-23,Hc);X(hx+2,-23,Hc);X(hx-1,-25,Hs);X(hx,-25,Hs);
    if(p.fem){R(hx-4,-23,1,6,Hc);R(hx+3,-23,1,6,Hc)}
    const ol=lado===0?0:1;            // de lado: olhos 1 pixel para a frente (o espelho cuida do lado esquerdo)
    if(p.oc){R(hx-3+ol,-21,6,1,C('#3A4450'))}
    X(hx-2+ol,-21,Z);X(hx+1+ol,-21,Z);
    if(pose==='alert')R(hx-1,-19,2,1,Z)}
  B.contorno();
  if(lado<0){const d=B.d.slice();for(let y=0;y<B.h;y++)for(let x=0;x<B.w;x++)B.d[y*B.w+x]=d[y*B.w+(B.w-1-x)]; B.x=-(B.x+B.w)+1}
  TPX.cache.set(k,B); return B;
}
function tpxBoneco(w,t,baloes){
  const m=poseOf(w), [sx,sy]=P(w.x,w.y), X=Math.round(sx/TPXK), Y=Math.round(sy/TPXK), sent=w.sit>.5;
  const est=w.root.classList.contains('manut')?'manut':w.root.classList.contains('error')?'error':(w.root.classList.contains('stuck')||w.root.classList.contains('late'))?'stuck':w.root.classList.contains('running')?'running':w.root.classList.contains('ok')?'ok':'idle';
  const ph=w.phase, f=m==='walk'?Math.floor(ph*8)%4:m==='run'?Math.floor(ph*12)%4:m==='alert'?Math.floor(ph*4)%2:m==='talk'?Math.floor(ph*3)%2:(m==='type'||m==='operate'||m==='printer')?Math.floor(ph*6)%2:0;
  const dono=tpxDono(w.root);
  if(!sent){const sc=tpxHex('#04070B');for(let i=-5;i<=5;i++)for(let j=-1;j<=1;j++)if(i*i/25+j*j<=1.1)tpxPf(X+i,Y+j,sc,.45)}
  if(m==='run'){const dc=tpxHex('#9FD0E6'),dx=-(w.face<0?-1:1);[[6,-1],[9,-2],[12,-1]].forEach(([a,b],i)=>tpxPf(X+dx*a,Y+b,dc,.15+.3*Math.abs(Math.sin(t*9-i*1.3))))}
  const spr=tpxSprite(tpxPessoa(w.st),m,f,w.face,w.st.isJarvis?null:TPXEST[est],!!w.carry);
  tpxCopiar(spr,dono,X,Y+(sent?3:0));
  const stuck=w.st.it.status==='running'&&w.st.it.sem_acao_s>=300;
  const run=(m==='type'||m==='operate')&&!w.st.isEquipe&&!stuck, err=m==='alert'||((m==='type'||m==='operate')&&stuck);
  if(run||err)baloes.push(()=>tpxBalao(X,Y+(sent?3:0)-33,run?'digita':stuck?'?':'!',stuck?TPXEST.stuck:err?TPXEST.error:TPXEST.running,t));
}
function tpxBalao(x,y,tipo,cor,t){
  const w=13,h=8,x0=x-6,K=TPXK0,fundo=tpxHex('#0A1118'),c=tpxHex(cor);
  for(let j=-1;j<=h;j++)for(let i=-1;i<=w;i++){const borda=j<0||i<0||j===h||i===w;if(borda&&(j<0||j===h)&&(i<0||i===w))continue;tpxPf(x0+i,y+j,borda?K:(j===0||i===0||j===h-1||i===w-1)?c:fundo)}
  tpxPf(x0+5,y+h,c);tpxPf(x0+6,y+h,c);tpxPf(x0+5,y+h+1,K);tpxPf(x0+6,y+h+1,K);
  if(tipo==='digita'){const n=Math.floor(t*4)%3;for(let d=0;d<3;d++){const a=d===n?1:.45;[[0,0],[1,0],[0,1],[1,1]].forEach(([i,j])=>tpxPf(x0+3+d*3+i,y+3+j,c,a))}}
  else{const L=tipo==='!'?['.##.','.##.','.##.','....','.##.']:['###.','..##','.##.','....','.##.'];L.forEach((r,j)=>[...r].forEach((ch,i)=>{if(ch==='#')tpxPf(x0+5+i,y+1+j,c)}))}
}

/* ---------- clique: o que está sob o cursor na arte (mesa, boneco, placa) ---------- */
function tpxCliques(){
  const svg=$('svg'); let p0=null;
  svg.addEventListener('pointerdown',e=>{p0=[e.clientX,e.clientY]});
  svg.addEventListener('click',e=>{
    if(!TPX.on||e.target!==svg||!p0||Math.hypot(e.clientX-p0[0],e.clientY-p0[1])>5)return;
    const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const u=pt.matrixTransform(svg.getScreenCTM().inverse());
    const X=Math.floor(u.x/TPXK), Y=Math.floor(u.y/TPXK); if(X<0||Y<0||X>=TPX.W||Y>=TPX.H)return;
    const k=TPX.donos[TPX.OWN[Y*TPX.W+X]]; if(!k)return;
    e.stopPropagation();                // senão o clique no documento fecha o popup que acabou de abrir
    if(k.startsWith('zona:'))zoomZone(k.slice(5));
    else{const id=k.slice(3), st=STATIONS[id]; select(st&&st.it.decor?'equipe:agidesk':id); if(st&&st.it.kind==='agent')abrirPop(id,e.clientX,e.clientY)}
  });
}

/* ---------- relatório para o teste automático (?debug=1) ---------- */
function tpxRelatorio(){
  if(!DBG)return; let p=$('dbgpx'); if(!p){p=document.createElement('pre');p.id='dbgpx';p.style.display='none';document.body.appendChild(p)}
  const esp=Object.values(STATIONS).length, com=Object.keys(STATIONS).filter(id=>TPX.estacoes.has(id)).length;
  p.textContent=['PIXEL '+(TPX.erro?'falha':TPX.on?'ok':'—'),'ESTACOES '+com,'ESPERADAS '+esp,'BONECOS '+TPX.bonecos+' DE '+Object.keys(WORKERS).length,
    'RECORTES_OCULTOS '+[...document.querySelectorAll('#svg clipPath *')].filter(e=>getComputedStyle(e).visibility==='hidden').length,   // recorte invisível = placa sem texto
    'PECAS '+TPX.itens,'TELA '+TPX.W+'x'+TPX.H,'QUADROS '+TPX.quadros,'ERROS '+window.__errs.filter(x=>x.startsWith('Pixel')).length].join('\n');
}
if(TPX.quer){document.body.classList.add('tpx'); if(DBG)setInterval(tpxRelatorio,500)}
