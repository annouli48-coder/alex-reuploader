/* The publicly distributed XML analyzer parses local Studio exports. Owner-only
   code is NEVER included here or sent to non-owner users. */
importScripts('/engine.js');
onmessage = function(ev) {
  if(!ev.data || ev.data.type!=='run') return;
  try {
    const result = analyzeXml(ev.data.source, value => postMessage({type:'progress',value}));
    postMessage({type:'done',result});
  } catch(error) {
    postMessage({type:'error',message:String(error?.message || error)});
  }
};
