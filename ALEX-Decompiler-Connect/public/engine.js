const SCRIPT_CLASSES = new Set(["Script", "LocalScript", "ModuleScript"]);
const MAX_SOURCE_CHARS = 2000000;
const MAX_SOURCE_TOTAL = 50000000;
function decodeEntities(input) {
  return input.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (full, ent) => {
    if (ent[0] === '#') {
      const hex = ent[1].toLowerCase() === 'x';
      const num = Number.parseInt(ent.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isInteger(num) && num > 0 && num <= 0x10ffff && !(num >= 0xd800 && num <= 0xdfff)) {
        return String.fromCodePoint(num);
      }
      return '\ufffd';
    }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[ent.toLowerCase()] || full;
  });
}
function xmlTag(raw) {
  const m = /^<\s*(\/?)\s*([\w:-]+)/.exec(raw);
  if (!m) return null;
  const attrs = {};
  if (!m[1]) {
    const body = raw.slice(m[0].length, raw.length - 1);
    for (const match of body.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[match[1]] = decodeEntities(match[2] ?? match[3]);
    }
  }
  return {name:m[2],closing:!!m[1],selfClose:/\/\s*>$/.test(raw),attrs};
}
function safeName(name) {
  const text = String(name || 'unnamed').normalize('NFKC')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
    .replace(/\.\.+/g, '_').replace(/^\.+/, '_').replace(/_{2,}/g, '_')
    .trim().slice(0, 65);
  return text || 'unnamed';
}
function analyzeXml(xml, progress = () => {}) {
  if (typeof xml !== 'string' || xml.length < 20 || !/^\s*(?:<\?xml\b[^>]*>\s*)?<roblox(?:\s|>)/i.test(xml.slice(0,2048))) {
    throw new Error('Not a supported Roblox XML place or model. Export as .rbxlx/.rbxmx from Studio.');
  }
  const records = [];
  const stack = [];
  const counts = {};
  const sources = [];
  let capture = null;
  let totalSourceChars = 0;
  let index = 0;
  let lastProgress = 0;
  const len = xml.length;
  while (index < len) {
    const next = xml.indexOf('<', index);
    if (next === -1) break;
    if (capture && next > index) {
      const remaining = MAX_SOURCE_CHARS - capture.value.length;
      if (remaining > 0) capture.value += decodeEntities(xml.slice(index,Math.min(next,index+remaining)));
      if (capture.value.length>=MAX_SOURCE_CHARS) capture.truncated=true;
    }
    if (xml.startsWith('<![CDATA[',next)) {
      const end = xml.indexOf(']]>',next+9);
      if (end < 0) throw new Error('Malformed XML CDATA section.');
      if (capture) {
        const frag=xml.slice(next+9,end);
        const rem=MAX_SOURCE_CHARS-capture.value.length;
        if (rem>0) capture.value+=frag.slice(0,rem);
        if (frag.length>rem) capture.truncated=true;
      }
      index=end+3;continue;
    }
    if (xml.startsWith('<!--',next)) {
      const end=xml.indexOf('-->',next+4);
      if(end<0)throw new Error('Malformed XML comment.');
      index=end+3;continue;
    }
    if (xml.startsWith('<!',next)||xml.startsWith('<?',next)) {
      const end=xml.indexOf('>',next+2);
      if(end<0)throw new Error('Malformed XML header.');
      index=end+1;continue;
    }
    // XML attributes in Roblox's serialized files are typically simple quoted strings.
    let end=next+1, quote='';
    while(end<len){const ch=xml[end];if(quote){if(ch===quote)quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='>')break;end++;}
    if(end>=len)throw new Error('Truncated XML tag.');
    const tag=xmlTag(xml.slice(next,end+1));
    if(tag){
      if(tag.closing){
        if (capture && tag.name===capture.tag) {
          const item=stack[stack.length-1];
          if(item){
            if(capture.name==='Name')item.name=capture.value.trim();
            if(capture.name==='Source'&&SCRIPT_CLASSES.has(item.className)) {
              const val=capture.value;
              if (val.trim()) {
                totalSourceChars+=val.length;
                if(totalSourceChars>MAX_SOURCE_TOTAL)throw new Error('Too much script data in this file (50M character limit).');
                item.source=val;
                item.sourceTruncated=capture.truncated;
              }
            }
          }
          capture=null;
        } else if(tag.name==='Item') {
          if(!stack.length)throw new Error('Invalid Roblox XML hierarchy.');
          stack.pop();
        }
      } else if(tag.name==='Item') {
        const parent=stack[stack.length-1]||null;
        const rec={id:records.length,className:tag.attrs.class||'Unknown',name:'',parentId:parent?parent.id:null,source:null,sourceTruncated:false};
        records.push(rec);stack.push(rec);
        counts[rec.className]=(counts[rec.className]||0)+1;
        if(tag.selfClose)stack.pop();
      } else if (stack.length && ['string','ProtectedString'].includes(tag.name)&&['Name','Source'].includes(tag.attrs.name)){
        capture={tag:tag.name,name:tag.attrs.name,value:'',truncated:false};
        if(tag.selfClose)capture=null;
      }
    }
    index=end+1;
    if(index-lastProgress>500000){progress(Math.min(99,Math.floor(index/len*100)));lastProgress=index;}
  }
  if(stack.length)throw new Error('Unbalanced Roblox XML Item nodes.');
  for(const rec of records){
    if(!rec.name)rec.name=rec.className;
    if(SCRIPT_CLASSES.has(rec.className)){
      const parts=[];let node=rec;let limit=0;
      while(node && limit++<150){parts.push(node.name);node=node.parentId===null?null:records[node.parentId];}
      sources.push({id:rec.id,className:rec.className,name:rec.name,path:parts.reverse().join('/'),source:rec.source,sourceTruncated:rec.sourceTruncated});
    }
  }
  progress(100);
  return {
    format:'Roblox XML',objects:records.length,scriptContainers:sources.length,
    readableScripts:sources.filter(s=>typeof s.source==='string').length,
    classes:counts,scripts:sources,
    note:'This reads source already saved in an authorized local XML place. It does not decompile bytecode or access a running Roblox game.'
  };
}

