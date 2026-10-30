'use strict';

const $ = id => document.getElementById(id);
const code = $('code');
const lines = $('lines');
const output = $('output');
const filenameLabel = $('filename');
const unsaved = $('unsaved');
const tabBar = $('tabs');
const DEFAULT_CODE = '-- ALEX Roblox Workspace\n-- Create a script, then paste into Roblox Studio.\nprint("Hello from ALEX!")';
const KEY_TABS = 'alex.desktop.tabs.v2';
const KEY_SETTINGS = 'alex.desktop.settings.v2';
const themes = {purple:'#a57aff',blue:'#64a9ff',green:'#5be1bd',red:'#ff839a'};
const backgrounds = {midnight:'#0d1220',black:'#03050a',slate:'#172234',plum:'#21172f'};
const MAX_RESTORE_CHARS = 1500000;
const templates = Object.freeze({
  player: [
    '-- LocalScript: StarterPlayerScripts',
    'local Players = game:GetService("Players")',
    'local player = Players.LocalPlayer',
    'if not player then return end',
    'print("Welcome, " .. player.DisplayName)',
    'player.CharacterAdded:Connect(function(character)',
    '    print("Character spawned:", character.Name)',
    'end)'
  ].join('\n'),
  part: [
    '-- Server Script: ServerScriptService (your own Roblox place)',
    'local TweenService = game:GetService("TweenService")',
    'local part = Instance.new("Part")',
    'part.Name = "ALEX_DemoPart"',
    'part.Anchored = true',
    'part.Position = Vector3.new(0, 12, 0)',
    'part.Size = Vector3.new(5, 1, 5)',
    'part.Material = Enum.Material.Neon',
    'part.Parent = workspace',
    'local info = TweenInfo.new(2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)',
    'TweenService:Create(part, info, {Position = Vector3.new(0, 20, 0)}):Play()'
  ].join('\n'),
  remote: [
    '-- Server Script: ServerScriptService',
    '-- Add a RemoteEvent named ALEX_Event to ReplicatedStorage first.',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local event = ReplicatedStorage:WaitForChild("ALEX_Event")',
    'event.OnServerEvent:Connect(function(player, message)',
    '    if typeof(message) ~= "string" then return end',
    '    print("Message from", player.Name, string.sub(message, 1, 100))',
    'end)',
    '-- From a LocalScript: event:FireServer("Hello!")'
  ].join('\n'),
  gui: [
    '-- LocalScript: StarterPlayerScripts',
    'local Players = game:GetService("Players")',
    'local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")',
    'local gui = Instance.new("ScreenGui")',
    'gui.Name = "ALEX_DemoUI"',
    'gui.ResetOnSpawn = false',
    'gui.Parent = playerGui',
    'local label = Instance.new("TextLabel")',
    'label.Size = UDim2.fromOffset(270, 50)',
    'label.Position = UDim2.new(0.5, -135, 0, 35)',
    'label.BackgroundColor3 = Color3.fromRGB(38, 28, 65)',
    'label.TextColor3 = Color3.fromRGB(238, 222, 255)',
    'label.Text = "Hello from ALEX!"',
    'label.TextScaled = true',
    'label.Parent = gui'
  ].join('\n')
});
const templateNames = {player:'player.client.luau',part:'tween.server.luau',remote:'remote.server.luau',gui:'interface.client.luau'};
const makeTab = (name='untitled.luau',content=DEFAULT_CODE,filename=null,dirty=true) => ({
  id:Date.now().toString(36)+Math.random().toString(36).slice(2,8),
  name,content,filename,dirty
});
let tabs = [makeTab()];
let activeId = tabs[0].id;
let settings = {theme:'purple',background:'midnight',fontSize:13,wrap:false,restore:true};
let historyWarned = false;

function current() { return tabs.find(t=>t.id===activeId) || tabs[0]; }
function log(message) {
  if (output.textContent.startsWith('Editor is ready')) output.textContent='';
  output.textContent += '['+new Date().toLocaleTimeString()+'] '+String(message)+'\n';
  if (output.textContent.length>40000) output.textContent=output.textContent.slice(-28000);
  output.scrollTop=output.scrollHeight;
}
function remember() {
  if (!settings.restore) { localStorage.removeItem(KEY_TABS); return; }
  try {
    const raw = JSON.stringify({tabs,activeId});
    if(raw.length<=MAX_RESTORE_CHARS) {
      localStorage.setItem(KEY_TABS,raw);
      historyWarned=false;
    } else if(!historyWarned) {
      historyWarned=true;
      log('Large files cannot be restored automatically. Save the script to disk before closing.');
    }
  } catch {
    if(!historyWarned) log('Local session storage is full. Save files to disk.');
    historyWarned=true;
  }
}
function renderLines() {
  const count=code.value.split('\n').length;
  lines.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');
  lines.scrollTop=code.scrollTop;
  $('editorStats').textContent=count.toLocaleString()+' line'+(count===1?'':'s')+' · '+code.value.length.toLocaleString()+' chars';
}
function updateStatus() {
  const tab=current();
  if(!tab) return;
  filenameLabel.textContent=tab.name;
  unsaved.style.visibility=tab.dirty?'visible':'hidden';
  $('documentStatus').textContent=tab.dirty?'Unsaved changes':'Saved to disk';
  $('panelFile').textContent=tab.name;
}
function syncCurrent() { const tab=current(); if(tab) tab.content=code.value; }
function renderTabs() {
  tabBar.replaceChildren();
  for(const tab of tabs) {
    const wrap=document.createElement('div');
    wrap.className='script-tab'+(tab.id===activeId?' active':'');
    const select=document.createElement('button');
    select.type='button';select.className='tab-select';
    select.setAttribute('role','tab');
    select.setAttribute('aria-selected',String(tab.id===activeId));
    select.textContent=tab.name+(tab.dirty?' •':'');
    select.title=tab.name;
    select.addEventListener('click',()=>setActive(tab.id));
    const close=document.createElement('button');
    close.type='button';close.className='tab-close';
    close.textContent='×';close.setAttribute('aria-label','Close '+tab.name);
    close.addEventListener('click',()=>{
      if(tab.dirty&&!window.confirm('Close '+tab.name+' without saving it to a file?'))return;
      syncCurrent();
      tabs=tabs.filter(t=>t.id!==tab.id);
      if(!tabs.length)tabs=[makeTab()];
      if(activeId===tab.id)activeId=tabs[0].id;
      paintActive();remember();
    });
    wrap.append(select,close);
    tabBar.append(wrap);
  }
  const plus=document.createElement('button');
  plus.className='tab-add';plus.type='button';
  plus.title='New Luau tab';plus.textContent='+';
  plus.addEventListener('click',()=>newScript());
  tabBar.append(plus);
}
function paintActive() {
  const tab=current();if(!tab)return;
  code.value=tab.content;
  updateStatus();renderLines();renderTabs();
}
function setActive(id) {
  if(activeId===id)return;
  syncCurrent();activeId=id;paintActive();remember();
}
function newScript(value='-- New Roblox Luau script\n',name='untitled.luau') {
  syncCurrent();
  if(tabs.length>=30){log('Too many open tabs (maximum 30). Close one first.');return;}
  const tab=makeTab(name,value);
  tabs.push(tab);activeId=tab.id;
  paintActive();showPanel('editor');code.focus();remember();
}
function edited() {
  const tab=current();if(!tab)return;
  tab.content=code.value;tab.dirty=true;
  updateStatus();renderLines();renderTabs();remember();
}
function restoreTabs() {
  try {
    const parsed=JSON.parse(localStorage.getItem(KEY_TABS)||'null');
    if(!parsed||!Array.isArray(parsed.tabs)||!parsed.tabs.length||parsed.tabs.length>30)return;
    if(!parsed.tabs.every(t=>t&&typeof t.id==='string'&&typeof t.name==='string'&&typeof t.content==='string'&&t.content.length<=8000000))return;
    tabs=parsed.tabs;activeId=tabs.some(t=>t.id===parsed.activeId)?parsed.activeId:tabs[0].id;
  } catch { log('Could not restore previous tabs.'); }
}
function applySettings() {
  const root=document.documentElement;
  root.style.setProperty('--alex-accent',themes[settings.theme]||themes.purple);
  root.style.setProperty('--alex-editor-bg',backgrounds[settings.background]||backgrounds.midnight);
  root.style.setProperty('--alex-font-size',settings.fontSize+'px');
  root.style.setProperty('--alex-line-height',Math.round(settings.fontSize*1.75)+'px');
  code.style.whiteSpace=settings.wrap?'pre-wrap':'pre';
  code.style.overflowWrap=settings.wrap?'anywhere':'normal';
  code.wrap=settings.wrap?'soft':'off';
  $('themeSelect').value=settings.theme;
  $('backgroundSelect').value=settings.background;
  $('fontSize').value=String(settings.fontSize);
  $('fontSizeValue').textContent=settings.fontSize+' px';
  $('wrapCode').checked=settings.wrap;
  $('saveTabs').checked=settings.restore;
  renderLines();
}
function saveSettings() {
  try {localStorage.setItem(KEY_SETTINGS,JSON.stringify(settings));}
  catch {log('Could not save appearance settings.');}
  applySettings();remember();
}
function showPanel(which) {
  for(const panel of ['editor','testLab','updates']) {
    $(panel==='editor'?'editorPanel':panel==='testLab'?'testLabPanel':'updatesPanel')
      .classList.toggle('hidden',panel!==which);
  }
  $('navEditor').classList.toggle('nav-selected',which==='editor');
  $('navTestLab').classList.toggle('nav-selected',which==='testLab');
  $('navUpdates').classList.toggle('nav-selected',which==='updates');
}
async function copyScript() {
  const src=code.value;
  if(!src.trim()){log('Nothing to copy. Open a file or create a script first.');return false;}
  try {
    await window.alexDesktop.copyText(src);
    log('Copied '+src.length.toLocaleString()+' Luau characters to clipboard.');
    return true;
  } catch(e) { log('Could not copy: '+e.message);return false; }
}
async function openResource(resource) {
  try {await window.alexDesktop.openResource(resource);}
  catch(e) {log('Could not open Roblox documentation: '+e.message);}
}
function showLab() {
  showPanel('testLab');
  log('Studio Test Lab: paste code into an owned experience. This app does not attach to Roblox Player.');
}
try {
  const obj=JSON.parse(localStorage.getItem(KEY_SETTINGS)||'null');
  if(obj&&typeof obj==='object') {
    if(themes[obj.theme])settings.theme=obj.theme;
    if(backgrounds[obj.background])settings.background=obj.background;
    if(Number.isInteger(obj.fontSize))settings.fontSize=Math.max(11,Math.min(26,obj.fontSize));
    if(typeof obj.wrap==='boolean')settings.wrap=obj.wrap;
    if(typeof obj.restore==='boolean')settings.restore=obj.restore;
  }
} catch {/* defaults */}
if(settings.restore)restoreTabs();
paintActive();applySettings();showPanel('editor');

$('newScript').addEventListener('click',()=>newScript());
document.querySelectorAll('.example').forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.dataset.template;
  if(templates[key])newScript(templates[key],templateNames[key]);
}));
code.addEventListener('input',edited);
code.addEventListener('scroll',()=>{lines.scrollTop=code.scrollTop;});
code.addEventListener('keydown',event=>{
  if(event.key==='Tab') {
    event.preventDefault();
    code.setRangeText('    ',code.selectionStart,code.selectionEnd,'end');edited();
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s') {
    event.preventDefault();$('save').click();
  }
});
document.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='1') {
    event.preventDefault();showPanel('editor');code.focus();
  }
});
$('clear').addEventListener('click',()=>{
  if(code.value&&!window.confirm('Clear the active script? This will make the tab unsaved.'))return;
  code.value='';edited();log('Current script cleared.');
});
$('clearLog').addEventListener('click',()=>{output.textContent='';});
$('open').addEventListener('click',async()=>{
  try {
    const result=await window.alexDesktop.openScript();
    if(!result)return;
    if(tabs.length>=30){log('Too many open tabs.');return;}
    const name=result.filename.split(/[\\/]/).pop();
    syncCurrent();const tab=makeTab(name,result.content,result.filename,false);
    tabs.push(tab);activeId=tab.id;paintActive();remember();showPanel('editor');
    log('Opened '+name+' ('+result.content.length.toLocaleString()+' characters).');
  } catch(e) {log('Open failed: '+e.message);}
});
$('save').addEventListener('click',async()=>{
  const tab=current();if(!tab)return;
  try {
    const result=await window.alexDesktop.saveScript({content:code.value,filename:tab.filename||tab.name});
    if(!result)return;
    tab.filename=result;tab.name=result.split(/[\\/]/).pop();
    tab.content=code.value;tab.dirty=false;
    paintActive();remember();log('Saved '+tab.name);
  } catch(e){log('Save failed: '+e.message);}
});
$('copy').addEventListener('click',copyScript);
$('copyQuick').addEventListener('click',copyScript);
$('execute').addEventListener('click',async()=>{if(await copyScript())showLab();});
$('openLab').addEventListener('click',showLab);
$('labCopy').addEventListener('click',copyScript);
$('labDocs').addEventListener('click',()=>openResource('docs'));
$('navEditor').addEventListener('click',()=>{showPanel('editor');code.focus();});
$('navTestLab').addEventListener('click',showLab);
$('navUpdates').addEventListener('click',()=>showPanel('updates'));
$('labBack').addEventListener('click',()=>showPanel('editor'));
$('updatesBack').addEventListener('click',()=>showPanel('editor'));
$('updatesMore').addEventListener('click',()=>openResource('updates'));
document.querySelectorAll('[data-resource]').forEach(btn=>btn.addEventListener('click',()=>openResource(btn.dataset.resource)));
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
  saveSettings();log('Appearance reset to defaults.');
});
