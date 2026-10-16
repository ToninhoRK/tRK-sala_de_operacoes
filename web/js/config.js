/* Sala de Operações · Preferências de exibição e temas.
   Guardadas no navegador (localStorage "sala_cfg"); a URL tem prioridade e não grava (?tema=tv&anim=reduzida&rotulos=problemas),
   para a TV abrir sempre do mesmo jeito. O servidor continua só leitura: nada disto sai do navegador.
   Temas: "planta" (padrão), "tv" (mesma planta, legível de longe, sem painel lateral), "3d" (a mesma planta em 3D de
   verdade, planta3d.js) e "pixel" (a mesma planta em pixel art, planta_pixel.js). Trocar para o 3D ou o pixel art, ou sair
   deles, recarrega a página (os dois acompanham a montagem da planta). */
// temas que ligam o Modo TV e o pixel art ("pixeltv" = os dois juntos)
const temaTV=t=>t==='tv'||t==='pixeltv', temaPX=t=>t==='pixel'||t==='pixeltv';
const CFG_PADRAO={tema:'planta',anim:'completa',rotulos:'todos',nomes:'amigaveis',periodo:'7'};
const CFG_OPCOES={
  tema:{planta:T('Planta isométrica','Isometric floor plan'),tv:T('Modo TV','TV mode'),'3d':'3D',pixel:'Pixel art',pixeltv:T('Pixel art · Modo TV','Pixel art · TV mode')},
  anim:{completa:T('Completa','Full'),reduzida:T('Reduzida','Reduced'),desligada:T('Desligada','Off')},
  rotulos:{todos:T('Todos','All'),ativos:T('Nomes + rodando e falha','Names + running and failed'),problemas:T('Só rodando e falha','Only running and failed'),nenhum:T('Nenhum','None')},
  nomes:{amigaveis:T('Amigáveis','Friendly'),tecnicos:T('Técnicos (id do agente)','Technical (agent id)')},
  periodo:{'7':T('7 dias','7 days'),'15':T('15 dias','15 days'),'30':T('30 dias','30 days'),'60':T('60 dias','60 days'),'90':T('90 dias','90 days')},
};
const CFG_AJUDA=EN?{
  tema:'TV mode: no side panel, bigger numbers and labels, the cursor hides when idle. 3D: the same floor plan in real 3D (light, shadow, volume), same angle and labels. Pixel art: the same floor plan drawn in pixels (zoom with the mouse wheel or by clicking a room sign); "Pixel art · TV mode" combines both.',
  anim:'Reduced: figures at 15 frames/s and no decorative pulses (better for a TV or a slow computer). Off: nobody walks; each figure stays where its state puts it.',
  nomes:'Friendly: the names in the "nomes" field of layout.json. Technical: the agent id, as in agentes.json and the logs.',
  periodo:'How many days go into the trend, the success rate (OK runs ÷ runs, outside maintenance windows) and usage: at the top, in the station details, in the list and in the export. Jobs: the room keeps its own history since the watcher was installed; before that, only the last ~2 days.',
  rotulos:'Names + running and failed: every name, but the state line only on stations running or failed (the "LAST dd/mm" goes away). Only running and failed also hides the name of OK stations and stations with no history (the badge color stays).',
}:{
  tema:'Modo TV: sem o painel lateral, números e rótulos maiores, cursor some parado. 3D: a mesma planta em 3D de verdade (luz, sombra, volume), mesmo ângulo e rótulos. Pixel art: a mesma planta desenhada em pixels (aproxime com a roda do mouse ou clicando na placa da sala); "Pixel art · Modo TV" junta os dois.',
  anim:'Reduzida: bonecos a 15 quadros/s e sem os pulsos decorativos (melhor para TV ou computador fraco). Desligada: ninguém anda; cada boneco fica parado onde o estado manda.',
  nomes:'Amigáveis: os nomes do campo "nomes" do layout.json (ex.: Consulta AD). Técnicos: o id do agente, como no agentes.json e nos logs.',
  periodo:'Quantos dias entram na tendência, no índice de sucesso (execuções OK ÷ execuções, fora das janelas de manutenção) e no consumo: no topo, no detalhe da estação, na lista e na exportação. Jobs: a Sala guarda o próprio histórico desde a instalação do vigia; antes disso, só os últimos ~2 dias.',
  rotulos:'Nomes + rodando e falha: todos os nomes, mas a linha de estado só em quem está rodando ou em falha (some o "ÚLT. dd/mm"). Só rodando e falha esconde também o nome das estações OK e sem histórico (a cor do selo continua).',
};
const CFG=(()=>{let c={};try{c=JSON.parse(localStorage.getItem('sala_cfg')||'{}')}catch(e){}
  const o=Object.assign({},CFG_PADRAO);
  for(const k in CFG_PADRAO){if(CFG_OPCOES[k][c[k]])o[k]=c[k]; if(CFG_OPCOES[k][QS.get(k)])o[k]=QS.get(k)}
  return o})();
function cfgSalvar(){const g={};for(const k in CFG_PADRAO)g[k]=CFG[k];try{localStorage.setItem('sala_cfg',JSON.stringify(g))}catch(e){}}
function cfgAplicar(){
  const b=document.body;
  b.classList.toggle('tv',temaTV(CFG.tema));
  ['reduzida','desligada'].forEach(a=>b.classList.toggle('anim-'+a,CFG.anim===a));
  {const f=document.getElementById('k-fps'); if(f)f.textContent=CFG.anim==='desligada'?T('animação desligada','animation off'):T('medindo fps…','measuring fps…')}   // o número vem do laço, a cada segundo
  ['ativos','problemas','nenhum'].forEach(r=>b.classList.toggle('rot-'+r,CFG.rotulos===r));
  if(typeof cfgMenuSync==='function')cfgMenuSync();
}
function cfgMudar(k,v){
  if(k==='tema'&&((v==='3d')!==(CFG.tema==='3d')||temaPX(v)!==temaPX(CFG.tema))){CFG[k]=v;cfgSalvar();const u=new URLSearchParams(location.search);u.delete('tema');location.search=u.toString();if(!u.toString())location.reload();return}   // entrar ou sair do 3D ou do pixel art: recarrega
  if(k==='nomes'){CFG[k]=v;cfgSalvar();location.reload();return}
  if(k==='periodo'){CFG[k]=v;cfgSalvar();cfgMenuSync();if(typeof poll==='function')poll();return}   // o servidor recalcula para o período novo      // os rótulos da planta são montados uma vez: recarrega
  const animAntes=CFG.anim; CFG[k]=v; cfgSalvar(); cfgAplicar();
  if(k==='anim'&&built){ if(v==='desligada')parado(); else if(animAntes==='desligada')Object.values(WORKERS).forEach(w=>{w.timer=rr(1,4)}) }
}
// animação desligada: cada boneco vai direto para onde o estado manda (rodando = mesa; falha = de pé ao lado; demais = onde está)
function parado(){
  if(!built)return;
  Object.values(WORKERS).forEach(w=>{const want=desired(w)||w.dest||w.at; w.path=[]; w.carry=false; w.pastaPend=null; w.dest=null; w.at=want; w.x=want.pos[0]; w.y=want.pos[1]; w.face=want.face; w.run=0; w.status=w.st.it.status; renderWorker(w,SIMT)});
  sortWorld();
}
// menu CONFIGURAR (cabeçalho)
function cfgMenuMontar(){
  const m=$('cfgmenu'); if(!m)return;
  let h='';
  for(const k in CFG_OPCOES){
    h+=`<div class="grp"><div class="tt">${(EN?{tema:'Theme',anim:'Animation',rotulos:'Station labels',nomes:'Names',periodo:'Indicator period'}:{tema:'Tema',anim:'Animação',rotulos:'Rótulos das estações',nomes:'Nomes',periodo:'Período dos indicadores'})[k]}</div>`;
    for(const v in CFG_OPCOES[k])h+=`<label><input type="radio" name="cfg-${k}" value="${v}"> ${CFG_OPCOES[k][v]}</label>`;
    h+=`<div class="aj">${CFG_AJUDA[k]}</div></div>`;
  }
  h+=`<div class="grp"><div class="tt">${T('Som de alerta','Alert sound')}</div><label><input type="checkbox" id="cfg-som"> ${T('Tocar em falha, agente sem ação e fonte com problema','Play on failure, agent with no activity and data source problem')}</label></div>`;
  h+=`<div class="grp"><div class="tt">${T('Idioma','Language')}</div><div class="aj" id="cfg-lang">${T('Português, pelo idioma do navegador (outras línguas abrem em inglês).','English, from the browser language (Portuguese browsers open in Portuguese).')}</div></div>`;
  h+=`<div class="rod"><button id="cfg-padrao">${T('Restaurar padrão','Restore defaults')}</button><span>${T('Fica salvo neste navegador.','Saved in this browser.')}</span></div>`;
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
