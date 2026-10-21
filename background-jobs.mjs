// ALEX V1.9 — durable, single-replica background queue.
// The .rbxl file never reaches this module: only explicit asset IDs do.
// Requires Node 22+ and a Railway persistent volume for the SQLite file.
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class BackgroundStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS bg_sessions (
        user_id TEXT PRIMARY KEY, sid TEXT NOT NULL, csrf TEXT NOT NULL,
        sealed_cookie TEXT NOT NULL, updated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bg_jobs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL,
        group_id TEXT NOT NULL, description TEXT NOT NULL,
        fingerprint TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS bg_jobs_owner ON bg_jobs(user_id, created DESC);
      CREATE TABLE IF NOT EXISTS bg_items (
        job_id TEXT NOT NULL REFERENCES bg_jobs(id), ordinal INTEGER NOT NULL,
        old_id TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued', operation TEXT NOT NULL DEFAULT '',
        new_id TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0, next_due INTEGER NOT NULL DEFAULT 0,
        started INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(job_id, old_id)
      );
      CREATE INDEX IF NOT EXISTS bg_items_pending ON bg_items(status, next_due);
      CREATE TABLE IF NOT EXISTS daily_usage (
        user_id TEXT NOT NULL, day TEXT NOT NULL, used INTEGER NOT NULL,
        PRIMARY KEY(user_id, day)
      );
    `);
    // A request may have reached Roblox immediately before the server died.
    // Never blindly resubmit such an ambiguous upload: manual review prevents duplicates.
    this.db.prepare("UPDATE bg_items SET status='review',message='Server restarted while submitting; check Roblox Creator Dashboard before retrying.' WHERE status='submitting'").run();
    this.db.prepare("UPDATE bg_jobs SET status='finished',updated=? WHERE status='running' AND NOT EXISTS (SELECT 1 FROM bg_items WHERE bg_items.job_id=bg_jobs.id AND bg_items.status IN ('queued','submitting','processing'))").run(Date.now());
  }
  rememberSession(session, sealed) {
    this.db.prepare(`INSERT INTO bg_sessions(user_id,sid,csrf,sealed_cookie,updated) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET sid=excluded.sid,csrf=excluded.csrf,sealed_cookie=excluded.sealed_cookie,updated=excluded.updated`)
      .run(session.userId, session.sid, session.csrf, sealed, Date.now());
  }
  latestSession(userId, sid) {
    return this.db.prepare('SELECT * FROM bg_sessions WHERE user_id=? AND sid=?').get(userId,sid);
  }
  sessionFor(userId) {
    return this.db.prepare('SELECT * FROM bg_sessions WHERE user_id=?').get(userId);
  }
  revokeSession(userId) {
    this.db.prepare('DELETE FROM bg_sessions WHERE user_id=?').run(userId);
    this.db.prepare("UPDATE bg_jobs SET status='paused', updated=? WHERE user_id=? AND status='running'").run(Date.now(), userId);
  }
  create(userId, data) {
    const existing=this.db.prepare("SELECT id FROM bg_jobs WHERE user_id=? AND status='running' LIMIT 1").get(userId);
    if (existing) throw Object.assign(new Error('You already have a background job. Stop or finish it before starting another.'),{status:409});
    const id = randomBytes(16).toString('hex');
    const now=Date.now();
    const items = data.items;
    const addJob=this.db.prepare('INSERT INTO bg_jobs VALUES(?,?,?,?,?,?,?,?)');
    const addItem=this.db.prepare('INSERT INTO bg_items(job_id,ordinal,old_id,name,kind) VALUES(?,?,?,?,?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      addJob.run(id,userId,'running',data.groupId||'',data.description||'',data.fileFingerprint||'',now,now);
      for(let i=0;i<items.length;i++) addItem.run(id,i,items[i].oldId,items[i].displayName,items[i].assetType);
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
    return id;
  }
  list(userId) {
    return this.db.prepare(`SELECT id,status,created,updated FROM bg_jobs
      WHERE user_id=? ORDER BY created DESC LIMIT 10`).all(userId);
  }
  view(userId,id) {
    const job=this.db.prepare('SELECT * FROM bg_jobs WHERE id=? AND user_id=?').get(id,userId);
    if(!job) return null;
    const counts=this.db.prepare('SELECT status, COUNT(*) AS n FROM bg_items WHERE job_id=? GROUP BY status').all(id);
    const mapped=this.db.prepare("SELECT old_id AS oldId,new_id AS newId FROM bg_items WHERE job_id=? AND status='succeeded' ORDER BY ordinal").all(id);
    const statusCounts=Object.fromEntries(counts.map(c=>[c.status,c.n]));
    const total=counts.reduce((n,c)=>n+c.n,0);
    const complete=(statusCounts.succeeded||0)+(statusCounts.skipped||0)+(statusCounts.failed||0)+(statusCounts.review||0)+(statusCounts.canceled||0);
    return { id:job.id,status:job.status,created:job.created,updated:job.updated,
      fingerprint:job.fingerprint,total,complete,counts:statusCounts,mapped };
  }
  stop(userId,id) {
    const result=this.db.prepare("UPDATE bg_jobs SET status='canceled',updated=? WHERE user_id=? AND id=? AND status IN ('running','paused')").run(Date.now(),userId,id);
    if(result.changes) this.db.prepare("UPDATE bg_items SET status='canceled' WHERE job_id=? AND status='queued'").run(id);
    return result.changes>0;
  }
  resume(userId,id) {
    const result=this.db.prepare("UPDATE bg_jobs SET status='running',updated=? WHERE user_id=? AND id=? AND status='paused'").run(Date.now(),userId,id);
    return result.changes>0;
  }
  next() {
    return this.db.prepare(`SELECT i.*,j.user_id,j.group_id,j.description,j.status AS job_status
      FROM bg_items i JOIN bg_jobs j ON j.id=i.job_id
      WHERE j.status='running' AND i.status IN ('queued','processing') AND i.next_due<=?
      ORDER BY CASE i.status WHEN 'processing' THEN 0 ELSE 1 END,j.created,i.ordinal LIMIT 1`).get(Date.now());
  }
  markSubmitting(item) {
    this.db.prepare("UPDATE bg_items SET status='submitting', attempts=attempts+1 WHERE job_id=? AND old_id=? AND status='queued'").run(item.job_id,item.old_id);
  }
  operation(item,op) {
    this.db.prepare("UPDATE bg_items SET status='processing',operation=?,next_due=?,started=? WHERE job_id=? AND old_id=?").run(op,Date.now()+2500,Date.now(),item.job_id,item.old_id);
  }
  defer(item,ms,msg) {
    this.db.prepare("UPDATE bg_items SET next_due=?,message=? WHERE job_id=? AND old_id=?").run(Date.now()+ms,String(msg).slice(0,300),item.job_id,item.old_id);
  }
  requeue(item,ms,msg) {
    this.db.prepare("UPDATE bg_items SET status='queued', next_due=?,message=? WHERE job_id=? AND old_id=?").run(Date.now()+ms,String(msg).slice(0,300),item.job_id,item.old_id);
  }
  finish(item,status,message,newId='') {
    this.db.prepare("UPDATE bg_items SET status=?,new_id=?,message=?,next_due=0 WHERE job_id=? AND old_id=?")
      .run(status,newId,String(message||'').slice(0,300),item.job_id,item.old_id);
    this.db.prepare('UPDATE bg_jobs SET updated=? WHERE id=?').run(Date.now(),item.job_id);
    const pending=this.db.prepare("SELECT COUNT(*) AS n FROM bg_items WHERE job_id=? AND status IN ('queued','processing','submitting')").get(item.job_id).n;
    if (!pending) this.db.prepare("UPDATE bg_jobs SET status='finished' WHERE id=? AND status='running'").run(item.job_id);
  }
  used(userId,day) {
    return this.db.prepare('SELECT used FROM daily_usage WHERE user_id=? AND day=?').get(userId,day)?.used||0;
  }
  charge(userId,day,limit) {
    this.db.prepare('INSERT OR IGNORE INTO daily_usage(user_id,day,used) VALUES(?,?,0)').run(userId,day);
    return this.db.prepare('UPDATE daily_usage SET used=used+1 WHERE user_id=? AND day=? AND used<?').run(userId,day,limit).changes>0;
  }
  close(){ this.db.close(); }
}

export function createBackgroundWorker(store,{port,interval=4000,fetcher=globalThis.fetch, logger=console}){
  let busy=false;
  let closed=false;
  const request=async (row,path,method,body)=>{
    const session=store.sessionFor(row.user_id);
    if(!session) { store.db.prepare("UPDATE bg_jobs SET status='paused' WHERE id=?").run(row.job_id);return {missingSession:true}; }
    const response=await fetcher(`http://127.0.0.1:${port}${path}`,{
      method,
      headers:{'cookie':`alex_sid=${session.sealed_cookie}`, ...(method==='POST'?{'content-type':'application/json','x-alex-csrf':session.csrf}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const json=await response.json().catch(()=>({error:'Backend returned an invalid response'}));
    // Session refresh may rotate Roblox refresh tokens; capture updated sealed cookie.
    const newCookie=response.headers.get('set-cookie')?.match(/alex_sid=([^;]+)/)?.[1];
    if(newCookie) {
      const updated=store.sessionFor(row.user_id);
      if(updated && updated.sid===session.sid) {
        store.db.prepare('UPDATE bg_sessions SET sealed_cookie=?,updated=? WHERE user_id=? AND sid=?')
          .run(newCookie,Date.now(),row.user_id,session.sid);
      }
    }
    return {...json,httpStatus:response.status};
  };
  const processNext=async()=>{
    if(busy||closed)return false;
    busy=true;
    try {
      const row=store.next();
      if(!row)return false;
      if(row.status==='processing'){
        if(row.started && Date.now()-row.started>30*60*1000){store.finish(row,'review','Roblox operation took over 30 minutes; check Creator Dashboard before further action');return true;}
        try {
          const r=await request(row,`/api/operations/${encodeURIComponent(row.operation)}`,'GET');
          if(r.missingSession) return true;
          if(r.httpStatus===401){store.db.prepare("UPDATE bg_jobs SET status='paused' WHERE id=?").run(row.job_id);return true;}
          if(r.httpStatus!==200){store.defer(row,20000,r.error||'Could not poll Roblox operation');return true;}
          if(r.error) store.finish(row,'skipped',r.error);
          else if(r.done && /^\d+$/.test(String(r.assetId))) store.finish(row,'succeeded','',String(r.assetId));
          else if(r.done) store.finish(row,'review','Operation completed without new ID; check Creator Dashboard');
          else store.defer(row,3000,'Waiting on Roblox processing');
        } catch(e){store.defer(row,20000,e.message);}
        return true;
      }
      store.markSubmitting(row);
      try{
        const result=await request(row,'/api/auto-reupload','POST',{
          rightsConfirmed:true,oldId:row.old_id,assetType:row.kind,
          displayName:row.name,groupId:row.group_id,description:row.description
        });
        if(result.missingSession) {store.finish(row,'review','Login required; verify upload status');return true;}
        if(result.operation && result.httpStatus===202){store.operation(row,result.operation);return true;}
        if(result.httpStatus===429){
          const now=Date.now(),nextDay=new Date(); nextDay.setUTCHours(24,0,30,0);
          store.requeue(row,Math.max(60000,nextDay.getTime()-now),'Waiting until next UTC day / Roblox quota');
        }else if(result.httpStatus===401){
          store.finish(row,'review','Sign in again and check the Creator Dashboard');
          store.db.prepare("UPDATE bg_jobs SET status='paused' WHERE id=?").run(row.job_id);
        }else if([400,403,404,413,415,422].includes(result.httpStatus)){
          store.finish(row,'skipped',result.error||'Not an accessible owned asset');
        }else{
          store.finish(row,'review',result.error||'Submission result unclear; check Creator Dashboard');
        }
      }catch(e){
        // A network error after POST may mean Roblox accepted it. Do NOT retry blindly.
        store.finish(row,'review',`Upload status unclear; check Creator Dashboard: ${e.message}`);
      }
      return true;
    }finally{busy=false;}
  };
  const timer=setInterval(()=>{processNext().catch(e=>logger.error('ALEX background worker:',e.message));},interval);
  timer.unref();
  return {processNext,stop(){closed=true;clearInterval(timer);}};
}
