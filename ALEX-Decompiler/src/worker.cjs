'use strict';
const {parentPort,workerData} = require('node:worker_threads');
const {analyzeFile} = require('./analyzer.cjs');
(async()=>{
  try{
    const result=await analyzeFile(workerData.file,percent=>parentPort.postMessage({type:'progress',percent}));
    parentPort.postMessage({type:'done',result});
  }catch(err){parentPort.postMessage({type:'error',message:err instanceof Error?err.message:String(err)});}
})();
