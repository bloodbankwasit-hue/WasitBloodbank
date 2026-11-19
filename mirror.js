// ════════════════════════════════════════════════════════════════
// المرآة المحلية (v125): نسخة من المتبرعين وسجل التبرعات والمرفوضين على الجهاز
// تُحدَّث بجلب «المتغيّر فقط» (updated_at) — بلا حد أقصى لعمر النسخة.
// تُستخدم للبحث والفحص بالاستقبال عند انقطاع الإنترنت أو السيرفر.
// ════════════════════════════════════════════════════════════════
(function(){
  if(window.bbm) return;
  const DBN='bloodbank_mirror', PAGE=1000, OVERLAP_MS=10*60*1000, SYNC_EVERY=5*60*1000;
  let idb=null, D=null /*donors array*/, LAST=null /*donor_id -> last donation*/, running=false, timer=null;

  function open(){
    if(idb) return Promise.resolve(idb);
    return new Promise((res,rej)=>{
      const rq=indexedDB.open(DBN,1);
      rq.onupgradeneeded=e=>{ const d=e.target.result;
        if(!d.objectStoreNames.contains('donors')) d.createObjectStore('donors',{keyPath:'id'});
        if(!d.objectStoreNames.contains('donations')){ d.createObjectStore('donations',{keyPath:'id'}).createIndex('donor_id','donor_id'); }
        if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta',{keyPath:'k'}); };
      rq.onsuccess=e=>{ idb=e.target.result; res(idb); }; rq.onerror=()=>rej(rq.error);
    });
  }
  const P=r=>new Promise((res,rej)=>{ r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  async function metaGet(k){ const d=await open(); const r=await P(d.transaction('meta').objectStore('meta').get(k)); return r?r.v:null; }
  async function metaSet(k,v){ const d=await open(); const tx=d.transaction('meta','readwrite'); tx.objectStore('meta').put({k,v}); return new Promise(r=>{tx.oncomplete=r;tx.onerror=r;}); }
  async function putMany(store,rows,clear){
    const d=await open(); const tx=d.transaction(store,'readwrite'); const st=tx.objectStore(store);
    if(clear) st.clear(); for(const r of rows) st.put(r);
    return new Promise((res,rej)=>{ tx.oncomplete=res; tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error); });
  }
  async function all(store){ const d=await open(); return await P(d.transaction(store).objectStore(store).getAll()); }

  const COLS={
    donors:'id,full_name,birth_year,gender,mother_name,national_id,id_type,mobile,address,occupation,donor_number,blood_type,is_deleted,updated_at',
    donations:'id,donor_id,status,donation_date,draw_date,created_at,is_deleted,updated_at'
  };
  const TABLE={donors:'donors',donations:'blood_donations'};

  // جلب كامل بصفحات (عند أول مرة أو عند اختلاف العدد)
  async function fullPull(kind){
    let rows=[]; const noU=await metaGet('noUpdatedAt');
    const cols=noU? COLS[kind].replace(',updated_at','') : COLS[kind];
    for(let p=0;;p+=PAGE){
      const{data,error}=await _rawDb.from(TABLE[kind]).select(cols).order('id',{ascending:true}).range(p,p+PAGE-1);
      if(error) throw error;
      rows=rows.concat(data||[]); if(!data||data.length<PAGE) break;
    }
    await putMany(kind,rows,true);
    const mx=rows.reduce((m,r)=>(r.updated_at&&r.updated_at>m?r.updated_at:m),'');
    await metaSet('cur_'+kind, mx||new Date(0).toISOString());
    return rows.length;
  }
  // جلب التغيير فقط
  async function incPull(kind){
    let cur=await metaGet('cur_'+kind); if(!cur) return await fullPull(kind);
    const start=new Date(new Date(cur).getTime()-OVERLAP_MS).toISOString();
    let lastU=start, lastId=null, n=0;
    for(;;){
      let q=_rawDb.from(TABLE[kind]).select(COLS[kind]);
      q = lastId==null ? q.gt('updated_at',lastU) : q.or('updated_at.gt.'+lastU+',and(updated_at.eq.'+lastU+',id.gt.'+lastId+')');
      const{data,error}=await q.order('updated_at',{ascending:true}).order('id',{ascending:true}).limit(PAGE);
      if(error) throw error;
      if(!data||!data.length) break;
      await putMany(kind,data,false); n+=data.length;
      const l=data[data.length-1]; lastU=l.updated_at; lastId=l.id;
      if(l.updated_at>cur) cur=l.updated_at;
      if(data.length<PAGE) break;
    }
    await metaSet('cur_'+kind,cur);
    return n;
  }
  async function serverCount(kind){
    const{count,error}=await _rawDb.from(TABLE[kind]).select('id',{count:'exact',head:true}).eq('is_deleted',false);
    if(error) throw error; return count;
  }
  async function localCount(kind){ return (await all(kind)).filter(r=>!r.is_deleted).length; }

  async function syncKind(kind){
    const noU=await metaGet('noUpdatedAt');
    if(noU){ // العمود غير موجود بعد: مزامنة كاملة مرة كل 24 ساعة
      const t=await metaGet('full_'+kind); if(t && Date.now()-t<24*3600e3) return 0;
      const n=await fullPull(kind); await metaSet('full_'+kind,Date.now()); return n;
    }
    let n;
    try{ n=await incPull(kind); }
    catch(e){
      if(/updated_at/i.test(e&&e.message||'') && /column|exist/i.test(e.message)){ await metaSet('noUpdatedAt',1); const x=await fullPull(kind); await metaSet('full_'+kind,Date.now()); return x; }
      throw e;
    }
    // فحص السلامة: لو اختلف العدد عن السيرفر (حذف نهائي مثلاً) نعيد المزامنة كاملة
    try{ const [s,l]=await Promise.all([serverCount(kind),localCount(kind)]); if(s!==l){ console.log('[mirror] count mismatch',kind,s,l); await fullPull(kind); } }catch(e){}
    return n;
  }

  async function sync(){
    if(running||!navigator.onLine) return {skipped:true};
    running=true; const out={};
    try{
      for(const k of ['donors','donations']){ out[k]=await syncKind(k); }
      try{ if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors(); }catch(e){}
      await metaSet('lastSync',Date.now());
      D=null; LAST=null; out.ok=true;
    }catch(e){ out.error=e&&e.message; console.log('[mirror] sync failed',e); }
    running=false; render(); return out;
  }

  async function ensureLoaded(){
    if(!D){ D=(await all('donors')).filter(r=>!r.is_deleted); }
    return D;
  }
  async function ensureLast(){
    if(!LAST){ LAST=new Map(); for(const r of await all('donations')){ if(r.is_deleted) continue;
      const o=LAST.get(r.donor_id); if(!o||(r.created_at||'')>(o.created_at||'')) LAST.set(r.donor_id,r); } }
    return LAST;
  }
  const norm=s=>{ try{ return normalizeAr(String(s||'').replace(/\s+/g,' ').trim()); }catch(e){ return String(s||'').trim(); } };

  async function searchDonors(field,val,limit){
    limit=limit||6; const rows=await ensureLoaded(); val=String(val||'').trim();
    if(field==='nid') return rows.filter(r=>r.national_id===val).slice(0,limit);
    if(field==='mob') return rows.filter(r=>r.mobile===val).slice(0,limit);
    const q=norm(val); if(!q) return [];
    const starts=[],has=[];
    for(const r of rows){ const n=norm(r.full_name); if(n.startsWith(q)) starts.push(r); else if(n.includes(q)) has.push(r); if(starts.length>=limit) break; }
    return starts.concat(has).slice(0,limit);
  }
  async function exactDonor(nid,mob){
    const rows=await ensureLoaded();
    if(nid&&nid.length>=6) return rows.filter(r=>r.national_id===nid).slice(0,5);
    if(mob&&mob.length>=7) return rows.filter(r=>r.mobile===mob).slice(0,5);
    return [];
  }
  async function lastDonation(donorId){ const m=await ensureLast(); return m.get(donorId)||null; }

  // شريط حالة بشاشة الاستقبال
  async function render(){
    try{
      const host=document.getElementById('s-reception'); if(!host) return;
      let el=document.getElementById('rcMirrorStat');
      if(!el){ el=document.createElement('div'); el.id='rcMirrorStat'; el.style.cssText='font-size:12px;padding:6px 10px;margin:0 0 8px;border-radius:8px;background:#F1F5F9;color:#475569;display:flex;gap:8px;align-items:center;flex-wrap:wrap'; host.insertBefore(el,host.firstChild); }
      const t=await metaGet('lastSync'); const nd=(await ensureLoaded()).length;
      if(!t){ el.style.background='#FEF3C7'; el.style.color='#92400E'; el.textContent='⏳ لم تكتمل نسخة القوائم بعد على هذا الجهاز — اتصل بالإنترنت وانتظر دقيقة'; return; }
      const ageH=(Date.now()-t)/3600e3, dt=new Date(t);
      const pad=n=>String(n).padStart(2,'0');
      const when=pad(dt.getDate())+'/'+pad(dt.getMonth()+1)+'/'+dt.getFullYear()+' '+pad(dt.getHours())+':'+pad(dt.getMinutes());
      el.style.background=ageH>48?'#FEE2E2':(ageH>6?'#FEF3C7':'#ECFDF5'); el.style.color=ageH>48?'#991B1B':(ageH>6?'#92400E':'#065F46');
      el.textContent=(ageH>6?'⚠️ ':'✅ ')+'آخر تحديث لقوائم المتبرعين والمرفوضين: '+when+' — '+nd+' متبرع'+(ageH>6?' (قديمة: قد تنقص حالات جديدة)':'');
    }catch(e){}
  }

  async function start(){
    try{ await open(); }catch(e){ return; }
    sync(); if(timer) clearInterval(timer);
    timer=setInterval(()=>{ if(navigator.onLine) sync(); else render(); }, SYNC_EVERY);
    setInterval(render,30000); render();
  }
  async function reset(){ const d=await open(); for(const s of ['donors','donations','meta']){ const tx=d.transaction(s,'readwrite'); tx.objectStore(s).clear(); } D=null; LAST=null; return sync(); }
  window.bbm={start,sync,searchDonors,exactDonor,lastDonation,render,reset,
    ready:async()=>!!(await metaGet('lastSync'))};
  window.bbmStart=start; window.bbmSync=sync;
})();
