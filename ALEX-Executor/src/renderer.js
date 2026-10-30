'use strict';
const $ = id => document.getElementById(id);
const code = $('code');
const lines = $('lines');
const output = $('output');
const filenameLabel = $('filename');
const unsaved = $('unsaved');
const tabBar = $('tabs');
const DEFAULT_CODE = '-- Welcome to ALEX Executor\nprint("Hello from ALEX!")';
const KEY_TABS = 'alex.desktop.tabs.v2';
const KEY_SETTINGS = 'alex.desktop.settings.v2';
const themes = { purple:'#9961ee', blue:'#449ef5', green:'#34bc96', red:'#ee5b82' };
const backgrounds = { midnight:'#0e0c19', black:'#030306', slate:'#172032', plum:'#21112e' };
const makeTab = (name='untitled.luau',content=DEFAULT_CODE,filename=null) =>
    ({id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),name,content,filename,dirty:!!content});
let tabs = [makeTab()];
let activeId = tabs[0].id;
let settings = {theme:'purple',background:'midnight',fontSize:13,wrap:false,restore:true};

function remember() {
  if(!settings.restore) { localStorage.removeItem(KEY_TABS); return; }
  try {
    const text=JSON.stringify({tabs,activeId});
    if(text.length<=1500000) localStorage.setItem(KEY_TABS,text);
    else log('Large scripts are not stored in session history; please save to a file.');
  } catch { log('Unable to store local session history.'); }
}
function current() { return tabs.find(x=>x.id===activeId) || tabs[0]; }
function renderLines() {
  const count=code.value.split('\n').length;
  lines.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');
  lines.scrollTop=code.scrollTop;
}
function log(message) {
  if(output.textContent.startsWith('Editor is ready')) output.textContent='';
  output.textContent+='['+new Date().toLocaleTimeString()+'] '+String(message)+'\n';
  output.scrollTop=output.scrollHeight;
}
function syncCurrent() { const t=current(); if(t) t.content=code.value; }
function renderTabs() {
  tabBar.replaceChildren();
  for(const tab of tabs) {
    const item=document.createElement('div');
    item.className='script-tab'+(tab.id===activeId?' active':'');
    const switcher=document.createElement('button');
    switcher.type='button';
    switcher.className='tab-select';
    switcher.setAttribute('role','tab');
    switcher.setAttribute('aria-selected',String(tab.id===activeId));
    switcher.textContent=tab.name+(tab.dirty?' •':'');
    switcher.addEventListener('click',()=>setActive(tab.id));
    const close=document.createElement('button');
    close.type='button';
    close.className='tab-close';
    close.textContent='×';
    close.setAttribute('aria-label','Close '+tab.name);
    close.addEventListener('click',()=>{
      if(tab.dirty && !confirm('Close '+tab.name+' without saving it to a file?')) return;
      tabs=tabs.filter(t=>t.id!==tab.id);
      if(!tabs.length) tabs.push(makeTab('untitled.luau','-- New ALEX script\n'));
      if(tab.id===activeId) activeId=tabs[0].id;
      paintActive();
      remember();
    });
    item.append(switcher,close);
    tabBar.append(item);
  }
  const add=document.createElement('button');
  add.type='button';add.className='tab-add';add.textContent='+';
  add.title='New script tab';add.setAttribute('aria-label','New script tab');
  add.addEventListener('click',()=>newScript());
  tabBar.append(add);
}
function paintActive() {
  const tab=current();
  if(!tab) return;
  filenameLabel.textContent=tab.name;
  code.value=tab.content;
  unsaved.style.visibility=tab.dirty?'visible':'hidden';
  renderLines();
  renderTabs();
}
function setActive(id) {
  if(activeId===id) return;
  syncCurrent();
  activeId=id;
  paintActive();
  remember();
}
function newScript(value='-- New ALEX script\n') {
  syncCurrent();
  const tab=makeTab('untitled.luau',value);
  tabs.push(tab);activeId=tab.id;
  paintActive();code.focus();remember();
}
function edited() {
  const tab=current();
  if(!tab) return;
  tab.content=code.value;
  tab.dirty=true;
  unsaved.style.visibility='visible';
  renderLines();renderTabs();remember();
}
function restoreTabs() {
  try{
    const raw=localStorage.getItem(KEY_TABS);
    if(!raw) return;
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed.tabs)||!parsed.tabs.length||parsed.tabs.length>30) return;
    if(!parsed.tabs.every(t=>t && typeof t.id==='string' && typeof t.name==='string'
     && typeof t.content==='string' && t.content.length<2000000)) return;
    tabs=parsed.tabs;
    activeId=tabs.some(t=>t.id===parsed.activeId)?parsed.activeId:tabs[0].id;
  }catch{log('Could not restore previous tabs.');}
}
function applySettings() {
  const root=document.documentElement;
  root.style.setProperty('--alex-accent',themes[settings.theme]||themes.purple);
  root.style.setProperty('--alex-editor-bg',backgrounds[settings.background]||backgrounds.midnight);
  root.style.setProperty('--alex-font-size',String(settings.fontSize)+'px');
  root.style.setProperty('--alex-line-height',String(Math.round(settings.fontSize*1.75))+'px');
  code.style.whiteSpace=settings.wrap?'pre-wrap':'pre';
  code.style.overflowWrap=settings.wrap?'anywhere':'normal';
  $('themeSelect').value=settings.theme;
  $('backgroundSelect').value=settings.background;
  $('fontSize').value=String(settings.fontSize);
  $('fontSizeValue').textContent=settings.fontSize+' px';
  $('wrapCode').checked=settings.wrap;
  $('saveTabs').checked=settings.restore;
  renderLines();
}
function saveSettings() {
  try{localStorage.setItem(KEY_SETTINGS,JSON.stringify(settings));}catch{log('Could not save appearance preferences.');}
  applySettings();remember();
}
try {
  const obj=JSON.parse(localStorage.getItem(KEY_SETTINGS)||'null');
  if(obj&&typeof obj==='object') {
    if(themes[obj.theme]) settings.theme=obj.theme;
    if(backgrounds[obj.background]) settings.background=obj.background;
    if(Number.isInteger(obj.fontSize)) settings.fontSize=Math.max(11,Math.min(26,obj.fontSize));
    if(typeof obj.wrap==='boolean') settings.wrap=obj.wrap;
    if(typeof obj.restore==='boolean') settings.restore=obj.restore;
  }
}catch{ /* keep defaults */ }
if(settings.restore) restoreTabs();
paintActive();
applySettings();
$('newScript').addEventListener('click',()=>newScript());
document.querySelectorAll('.example').forEach(btn=>btn.addEventListener('click',()=>newScript(btn.dataset.code)));
code.addEventListener('input',edited);
code.addEventListener('scroll',()=>{lines.scrollTop=code.scrollTop;});
code.addEventListener('keydown',event=>{
  if(event.key==='Tab'){event.preventDefault();code.setRangeText('    ',code.selectionStart,code.selectionEnd,'end');edited();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){
    event.preventDefault();$('save').click();
  }
});
$('clear').addEventListener('click',()=>{code.value='';edited();});
$('clearLog').addEventListener('click',()=>{output.textContent='';});
$('open').addEventListener('click',async()=>{
  try{
    const result=await window.alexDesktop.openScript();
    if(!result) return;
    const name=result.filename.split(/[\\/]/).pop();
    const tab=makeTab(name,result.content,result.filename);
    tab.dirty=false;syncCurrent();tabs.push(tab);activeId=tab.id;
    paintActive();remember();log('Opened '+name);
  }catch(e){log('Open failed: '+e.message);}
});
$('save').addEventListener('click',async()=>{
  const tab=current();if(!tab)return;
  try{
    const result=await window.alexDesktop.saveScript({content:code.value,filename:tab.filename});
    if(!result)return;
    tab.filename=result;tab.name=result.split(/[\\/]/).pop();
    tab.content=code.value;tab.dirty=false;
    paintActive();remember();log('Saved '+tab.name);
  }catch(e){log('Save failed: '+e.message);}
});
$('attach').addEventListener('click',()=>log('No Roblox Player attach/injection engine. For code execution in your own place, use ALEX Test Lab.'));
$('execute').addEventListener('click',()=>log('NOT EXECUTED. This Electron editor has no Roblox Player runtime. Use ALEX Test Lab to execute scripts in your private game.'));
const modal=$('settingsDialog');
$('settingsOpen').addEventListener('click',()=>modal.showModal());
$('settingsClose').addEventListener('click',()=>modal.close());
modal.addEventListener('click',event=>{if(event.target===modal)modal.close();});
$('themeSelect').addEventListener('change',e=>{settings.theme=e.target.value;saveSettings();});
$('backgroundSelect').addEventListener('change',e=>{settings.background=e.target.value;saveSettings();});
$('fontSize').addEventListener('input',e=>{settings.fontSize=Number(e.target.value);saveSettings();});
$('wrapCode').addEventListener('change',e=>{settings.wrap=e.target.checked;saveSettings();});
$('saveTabs').addEventListener('change',e=>{settings.restore=e.target.checked;saveSettings();});
$('settingsReset').addEventListener('click',()=>{
  settings={theme:'purple',background:'midnight',fontSize:13,wrap:false,restore:true};
  saveSettings();log('Settings reset to defaults.');
});
