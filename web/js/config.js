/* Sala de Operações · Preferências de exibição e temas.
   Guardadas no navegador (localStorage "sala_cfg"); a URL tem prioridade e não grava (?tema=tv&anim=reduzida&rotulos=problemas),
   para a TV abrir sempre do mesmo jeito. O servidor continua só leitura: nada disto sai do navegador.
   Temas: "planta" (padrão), "tv" (mesma planta, legível de longe, sem painel lateral) e "3d" (a mesma planta em 3D de
   verdade, planta3d.js). Trocar para o 3D ou sair dele recarrega a página (o 3D anota a montagem da planta). */
const CFG_PADRAO={tema:'planta',anim:'completa',rotulos:'todos',nomes:'amigaveis'};
const CFG_OPCOES={
  tema:{planta:'Planta isométrica',tv:'Modo TV','3d':'3D'},
  anim:{completa:'Completa',reduzida:'Reduzida',desligada:'Desligada'},
  rotulos:{todos:'Todos',ativos:'Nomes + rodando e falha',problemas:'Só rodando e falha',nenhum:'Nenhum'},
  nomes:{amigaveis:'Amigáveis',tecnicos:'Técnicos (id do agente)'},
};
const CFG_AJUDA={
  tema:'Modo TV: sem o painel lateral, números e rótulos maiores, cursor some parado. 3D: a mesma planta em 3D de verdade (luz, sombra, volume), mesmo ângulo e rótulos.',
  anim:'Reduzida: bonecos a 15 quadros/s e sem os pulsos decorativos (melhor para TV ou computador fraco). Desligada: ninguém anda; cada boneco fica parado onde o estado manda.',
  nomes:'Amigáveis: os nomes do campo "nomes" do layout.json (ex.: Consulta AD). Técnicos: o id do agente, como no agentes.json e nos logs.',
  rotulos:'Nomes + rodando e falha: todos os nomes, mas a linha de estado só em quem está rodando ou em falha (some o "ÚLT. dd/mm"). Só rodando e falha esconde também o nome das estações OK e sem histórico (a cor do selo continua).',
};
const CFG=(()=>{let c={};try{c=JSON.parse(localStorage.getItem('sala_cfg')||'{}')}catch(e){}
  const o=Object.assign({},CFG_PADRAO);
  for(const k in CFG_PADRAO){if(CFG_OPCOES[k][c[k]])o[k]=c[k]; if(CFG_OPCOES[k][QS.get(k)])o[k]=QS.get(k)}
  return o})();
function cfgSalvar(){const g={};for(const k in CFG_PADRAO)g[k]=CFG[k];try{localStorage.setItem('sala_cfg',JSON.stringify(g))}catch(e){}}
function cfgAplicar(){
  const b=document.body;
  b.classList.toggle('tv',CFG.tema==='tv');
  ['reduzida','desligada'].forEach(a=>b.classList.toggle('anim-'+a,CFG.anim===a));
  ['ativos','problemas','nenhum'].forEach(r=>b.classList.toggle('rot-'+r,CFG.rotulos===r));
  if(typeof cfgMenuSync==='function')cfgMenuSync();
}
function cfgMudar(k,v){
  if(k==='tema'&&(v==='3d')!==(CFG.tema==='3d')){CFG[k]=v;cfgSalvar();const u=new URLSearchParams(location.search);u.delete('tema');location.search=u.toString();if(!u.toString())location.reload();return}   // entrar ou sair do 3D: recarrega
  if(k==='nomes'){CFG[k]=v;cfgSalvar();location.reload();return}      // os rótulos da planta são montados uma vez: recarrega
  const animAntes=CFG.anim; CFG[k]=v; cfgSalvar(); cfgAplicar();
  if(k==='anim'&&built){ if(v==='desligada')parado(); else if(animAntes==='desligada')Object.values(WORKERS).forEach(w=>{w.timer=rr(1,4)}) }
}
// animação desligada: cada boneco vai direto para onde o estado manda (rodando = mesa; falha = de pé ao lado; demais = onde está)
function parado(){
  if(!built)return;
  Object.values(WORKERS).forEach(w=>{const want=desired(w)||w.dest||w.at; w.path=[]; w.dest=null; w.at=want; w.x=want.pos[0]; w.y=want.pos[1]; w.face=want.face; w.run=0; w.status=w.st.it.status; renderWorker(w,SIMT)});
  sortWorld();
}
// menu CONFIGURAR (cabeçalho)
function cfgMenuMontar(){
  const m=$('cfgmenu'); if(!m)return;
  let h='';
  for(const k in CFG_OPCOES){
    h+=`<div class="grp"><div class="tt">${{tema:'Tema',anim:'Animação',rotulos:'Rótulos das estações',nomes:'Nomes'}[k]}</div>`;
    for(const v in CFG_OPCOES[k])h+=`<label><input type="radio" name="cfg-${k}" value="${v}"> ${CFG_OPCOES[k][v]}</label>`;
    h+=`<div class="aj">${CFG_AJUDA[k]}</div></div>`;
  }
  h+=`<div class="grp"><div class="tt">Som de alerta</div><label><input type="checkbox" id="cfg-som"> Tocar em falha, agente sem ação e fonte com problema</label></div>`;
  h+=`<div class="rod"><button id="cfg-padrao">Restaurar padrão</button><span>Fica salvo neste navegador.</span></div>`;
  m.innerHTML=h;
  m.addEventListener('change',e=>{const t=e.target;
    if(t.id==='cfg-som'){if(t.checked!==SOM.on)somLigar(t.checked);return}
    if(t.name&&t.name.startsWith('cfg-'))cfgMudar(t.name.slice(4),t.value)});
  $('cfg-padrao').addEventListener('click',()=>{for(const k in CFG_PADRAO)CFG[k]=CFG_PADRAO[k];cfgSalvar();cfgAplicar();if(built&&CFG.anim!=='desligada')Object.values(WORKERS).forEach(w=>{w.timer=rr(1,4)})});
  $('cfg').addEventListener('click',e=>{e.stopPropagation();m.classList.toggle('on');cfgMenuSync()});
  document.addEventListener('click',e=>{if(!e.target.closest('#cfgmenu,#cfg'))m.classList.remove('on')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')m.classList.remove('on')});
  if(QS.has('menu')){m.classList.add('on');cfgMenuSync()}     // ?menu=1: abre o menu (capturas de teste)
}
function cfgMenuSync(){
  const m=$('cfgmenu'); if(!m||!m.firstChild)return;
  for(const k in CFG_OPCOES)m.querySelectorAll(`input[name="cfg-${k}"]`).forEach(i=>{i.checked=i.value===CFG[k]});
  const s=$('cfg-som'); if(s&&typeof SOM!=='undefined')s.checked=SOM.on;
}
// Modo TV: cursor some depois de 4 s parado
let CFG_OCIOSO=null;
document.addEventListener('mousemove',()=>{document.body.classList.remove('ocioso');clearTimeout(CFG_OCIOSO);CFG_OCIOSO=setTimeout(()=>document.body.classList.add('ocioso'),4000)});
cfgAplicar();
