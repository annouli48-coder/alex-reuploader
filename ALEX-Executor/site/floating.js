/* Floating editor shell for installed ALEX Code PWA. Not an overlay on Roblox Player. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const editorWindow=document.querySelector('.workspace-window');
  if(!editorWindow) return;
  const originalParent=editorWindow.parentElement;
  const anchor=document.createComment('ALEX editor original position');
  originalParent.insertBefore(anchor,editorWindow);
  const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||
    matchMedia('(max-width:820px)').matches;
  const launcher=document.createElement('button');
  launcher.id='alex-launcher';launcher.type='button';
  launcher.setAttribute('aria-label','Open floating ALEX code editor');
  launcher.textContent='A';
  launcher.hidden=!isMobile;
  const floating=document.createElement('section');
  floating.id='alex-floating';floating.hidden=true;
  floating.setAttribute('role','dialog');
  floating.setAttribute('aria-label','ALEX floating code editor');
  floating.innerHTML=[
    '<div class="alex-float-header" id="alex-drag">',
    '<span class="alex-panel-logo">A</span><strong>ALEX <span>CODE EDITOR</span></strong>',
    '<button id="alex-float-settings" type="button" aria-label="Settings">⚙</button>',
    '<button id="alex-maximize" type="button" aria-label="Maximize">□</button>',
    '<button id="alex-float-close" type="button" aria-label="Minimize">×</button></div>',
    '<div class="alex-float-content"></div>',
    '<div id="alex-resize" role="separator" aria-label="Drag to resize window" tabindex="0">◢</div>'
  ].join('');
  document.body.append(launcher,floating);
  const modal=document.createElement('dialog');
  modal.id='alex-appearance';
  modal.innerHTML=[
    '<div class="alex-settings-head"><strong>⚙ ALEX SETTINGS</strong><button id="alex-settings-close" type="button">×</button></div>',
    '<label for="alex-theme">Accent color</label><select id="alex-theme">',
    '<option value="purple">Purple</option><option value="blue">Electric blue</option>',
    '<option value="green">Emerald</option><option value="red">Crimson</option></select>',
    '<label for="alex-bg">Code background</label><select id="alex-bg">',
    '<option value="midnight">Midnight</option><option value="black">Pitch black</option>',
    '<option value="slate">Slate</option><option value="plum">Purple fog</option></select>',
    '<label for="alex-font">Code text size <output id="alex-font-val">13 px</output></label>',
    '<input id="alex-font" type="range" min="11" max="26" value="13">',
    '<label class="alex-check"><input id="alex-wrap" type="checkbox"> Wrap long code lines</label>',
    '<p>These preferences stay on your device. Execution inside Roblox Player is not available from a website.</p>',
    '<button id="alex-settings-reset" type="button">Reset settings</button>'
  ].join('');
  document.body.append(modal);
  const themes={purple:'#a66cff',blue:'#4099ee',green:'#39d29e',red:'#ed638e'};
  const backgrounds={midnight:'#0c0813',black:'#030306',slate:'#142337',plum:'#261035'};
  const defaults={theme:'purple',background:'midnight',fontSize:13,wrap:false};
  let settings={...defaults};
  try {
    const saved=JSON.parse(localStorage.getItem('alex.settings.v1')||'null');
    if(saved && typeof saved==='object') {
      if(themes[saved.theme])settings.theme=saved.theme;
      if(backgrounds[saved.background])settings.background=saved.background;
      if(Number.isInteger(saved.fontSize))settings.fontSize=Math.min(26,Math.max(11,saved.fontSize));
      if(typeof saved.wrap==='boolean')settings.wrap=saved.wrap;
    }
  } catch {}
  function apply(){
    document.documentElement.style.setProperty('--alex-ui-accent',themes[settings.theme]);
    document.documentElement.style.setProperty('--alex-code-bg',backgrounds[settings.background]);
    $('code-input').style.fontSize=settings.fontSize+'px';
    $('code-input').style.whiteSpace=settings.wrap?'pre-wrap':'pre';
    $('code-input').style.overflowWrap=settings.wrap?'anywhere':'normal';
    $('alex-theme').value=settings.theme;
    $('alex-bg').value=settings.background;
    $('alex-font').value=settings.fontSize;
    $('alex-font-val').textContent=settings.fontSize+' px';
    $('alex-wrap').checked=settings.wrap;
  }
  function save(){try{localStorage.setItem('alex.settings.v1',JSON.stringify(settings));}catch{}apply();}
  apply();
  $('alex-theme').onchange=e=>{settings.theme=e.target.value;save();};
  $('alex-bg').onchange=e=>{settings.background=e.target.value;save();};
  $('alex-font').oninput=e=>{settings.fontSize=Number(e.target.value);save();};
  $('alex-wrap').onchange=e=>{settings.wrap=e.target.checked;save();};
  $('alex-settings-reset').onclick=()=>{settings={...defaults};save();};
  $('alex-settings-close').onclick=()=>modal.close();
  const settingsButton=document.createElement('button');
  settingsButton.type='button';settingsButton.textContent='⚙ Settings';
  document.querySelector('.workspace-buttons')?.append(settingsButton);
  settingsButton.onclick=()=>modal.showModal();
  $('alex-float-settings').onclick=()=>modal.showModal();
  function open(){
    floating.hidden=false;
    floating.querySelector('.alex-float-content').append(editorWindow);
    launcher.setAttribute('aria-expanded','true');
    $('code-input').focus();
  }
  function close(){
    floating.hidden=true;
    anchor.parentElement.insertBefore(editorWindow,anchor.nextSibling);
    launcher.setAttribute('aria-expanded','false');
  }
  launcher.onclick=()=>floating.hidden?open():close();
  $('alex-float-close').onclick=close;
  launcher.setAttribute('aria-expanded','false');
  const limit=(value,min,max)=>Math.min(max,Math.max(min,value));
  function confine() {
    const r=floating.getBoundingClientRect();
    if(r.right>innerWidth)floating.style.left=Math.max(2,innerWidth-r.width-2)+'px';
    if(r.bottom>innerHeight)floating.style.top=Math.max(2,innerHeight-r.height-2)+'px';
  }
  let expanded=false,previous={};
  $('alex-maximize').onclick=()=>{
    if(!expanded){
      previous={left:floating.style.left,top:floating.style.top,width:floating.style.width,height:floating.style.height};
      floating.style.left='2vw';floating.style.top='2dvh';floating.style.width='96vw';floating.style.height='96dvh';
    }else{
      for(const field of ['left','top','width','height'])floating.style[field]=previous[field]||'';
      confine();
    }
    expanded=!expanded;
  };
  let dragState=null;
  const header=$('alex-drag'),handle=$('alex-resize');
  header.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button')||expanded)return;
    const r=floating.getBoundingClientRect();
    dragState={id:e.pointerId,kind:'move',x:e.clientX,y:e.clientY,left:r.left,top:r.top};
    header.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointerdown',e=>{
    if(expanded)return;
    e.preventDefault();
    const r=floating.getBoundingClientRect();
    dragState={id:e.pointerId,kind:'size',x:e.clientX,y:e.clientY,w:r.width,h:r.height};
    handle.setPointerCapture(e.pointerId);
  });
  function moving(e){
    if(!dragState||e.pointerId!==dragState.id)return;
    const dx=e.clientX-dragState.x,dy=e.clientY-dragState.y;
    if(dragState.kind==='move'){
      floating.style.left=limit(dragState.left+dx,2,Math.max(2,innerWidth-floating.offsetWidth-2))+'px';
      floating.style.top=limit(dragState.top+dy,2,Math.max(2,innerHeight-floating.offsetHeight-2))+'px';
    }else{
      floating.style.width=limit(dragState.w+dx,Math.min(innerWidth-4,280),innerWidth-4)+'px';
      floating.style.height=limit(dragState.h+dy,Math.min(innerHeight-4,290),innerHeight-4)+'px';
      confine();
    }
  }
  for(const el of [header,handle]){
    el.addEventListener('pointermove',moving);
    el.addEventListener('pointerup',e=>{if(dragState&&dragState.id===e.pointerId)dragState=null;});
    el.addEventListener('pointercancel',()=>dragState=null);
  }
  handle.addEventListener('keydown',e=>{
    const change={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];
    if(!change)return;
    e.preventDefault();
    const r=floating.getBoundingClientRect();
    floating.style.width=limit(r.width+change[0],280,innerWidth-4)+'px';
    floating.style.height=limit(r.height+change[1],290,innerHeight-4)+'px';
    confine();
  });
  window.addEventListener('resize',()=>{if(!floating.hidden)confine();});
})();
