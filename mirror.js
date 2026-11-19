// ════════════════════════════════════════════════════════════════
// المرآة المحلية (v125): نسخة من المتبرعين وسجل التبرعات والمرفوضين على الجهاز
// تُحدَّث بجلب «المتغيّر فقط» (updated_at) — بلا حد أقصى لعمر النسخة.
// تُستخدم للبحث والفحص بالاستقبال عند انقطاع الإنترنت أو السيرفر.
// ════════════════════════════════════════════════════════════════
(function(){
  if(window.bbm) return;
  const DBN='bloodbank_mirror', PAGE=1000, OVERLAP_MS=10*60*1000, SYNC_EVERY=5*60*1000;
  // جداول صغيرة تُنسخ كاملةً (v131): تُقرأ وتُكتب محلياً بدون نت
  const ST=['rejected_donors','campaign_slots','bottle_sequences','user_profiles','bottle_number_pool','lab_reagents','destruction_reports','campaigns','opening_stock','store_items','opening_dispatch','lab_reagent_log','dispatch_book_records','app_settings','store_moves','store_lots'];
  const EMB={lab_reagent_log:{lab_reagents:'reagent_id'},store_moves:{store_items:'item_id'},campaign_slots:{campaigns:'campaign_id'}};
  const TB={};
  let DALL=null, BALL=null; let idb=null, D=null /*donors array*/, LAST=null /*donor_id -> last donation*/, running=false, timer=null;

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

  const COLS={ donors:'*', donations:'*' };   // كل الأعمدة: كي تُجاب أي قراءة محلياً
  const TABLE={donors:'donors',donations:'blood_donations'};

  // جلب كامل بصفحات (عند أول مرة أو عند اختلاف العدد)
  async function fullPull(kind){
    let rows=[]; const noU=await metaGet('noUpdatedAt');
    const cols=COLS[kind];
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

  async function loadTB(name){ if(!TB[name]){ const v=await metaGet('tb_'+name); if(Array.isArray(v)) TB[name]=v; } return TB[name]||null; }
  async function syncTable(name){
    let rows=[], ordered=true;
    for(let p=0;;p+=PAGE){
      let r=await (ordered?_rawDb.from(name).select('*').order('id',{ascending:true}):_rawDb.from(name).select('*')).range(p,p+PAGE-1);
      if(r.error && ordered && p===0){ ordered=false; r=await _rawDb.from(name).select('*').range(p,p+PAGE-1); }
      if(r.error) throw r.error;
      rows=rows.concat(r.data||[]); if(!r.data||r.data.length<PAGE) break;
    }
    await metaSet('tb_'+name,rows); await metaSet('tbat_'+name,Date.now()); TB[name]=rows; return rows.length;
  }
  async function syncTables(){
    const out={}; const dirty=await metaGet('tbl_dirty'); let bad=0;
    for(const t of ST){
      try{ const at=await metaGet('tbat_'+t); if(!dirty && at && Date.now()-at<9*60e3) continue; out[t]=await syncTable(t); }
      catch(e){ out[t]='err'; bad++; }
    }
    if(dirty && !bad) await metaSet('tbl_dirty',0);
    return out;
  }

  async function sync(){
    if(running||!navigator.onLine) return {skipped:true};
    try{ if(typeof getPendingQueue==='function'){ const q=await getPendingQueue(); if(q&&q.length) return {skipped:'pending'}; } }catch(e){}   // لا نكتب فوق التعديلات المحلية قبل إرسالها
    running=true; const out={};
    try{
      for(const k of ['donors','donations']){ out[k]=await syncKind(k); }
      try{ out.tables=await syncTables(); }catch(e){ console.log('[mirror] tables',e); }
      try{ if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors(); }catch(e){}
      try{ await syncBN(); }catch(e){ console.log('[mirror] bn state',e); }
      try{ await metaSet('bn_local',{used:[],next:{}}); }catch(e){}   // كل ما استُعمل محلياً أُرسل (لا يوجد طابور معلّق هنا) فصار ضمن بيانات السيرفر
      await metaSet('lastSync',Date.now());
      D=null; LAST=null; DALL=null; BALL=null; out.ok=true;
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


  // ───────── محرك استعلام محلي (يحاكي PostgREST للحالات الشائعة) ─────────
  async function loadAll(table){
    if(ST.includes(table)) return (await loadTB(table))||[];
    if(table==='donors'){ if(!DALL) DALL=await all('donors'); return DALL; }
    if(!BALL) BALL=await all('donations'); return BALL;
  }
  function splitTop(str){ const out=[]; let d=0,cur=''; for(const ch of str){ if(ch==='(') d++; if(ch===')') d--; if(ch===','&&d===0){ out.push(cur.trim()); cur=''; } else cur+=ch; } if(cur.trim()) out.push(cur.trim()); return out; }
  function cmp(a,b){ if(a==null&&b==null) return 0; if(a==null) return 1; if(b==null) return -1; if(typeof a==='number'&&typeof b==='number') return a-b; return a<b?-1:(a>b?1:0); }
  function same(a,b){ if(a==null||b==null) return a==b; return String(a)===String(b); }
  const OK_OPS=new Set(['select','eq','neq','gt','gte','lt','lte','in','is','not','order','limit','range','single','maybeSingle','ilike','like','or']);
  // يرجع null إذا وُجد شيء غير مدعوم (فيُستعمل الكاش القديم أو يظهر الخطأ)
  // مرشِّحات PostgREST محلياً: eq/neq/gt/gte/lt/lte/is/in/ilike/like (+ not و or)
  function mkPred(col,op,v){
    op=String(op).toLowerCase();
    if(op==='eq') return r=>same(r[col],v);
    if(op==='neq') return r=>!same(r[col],v);
    if(op==='gt') return r=>r[col]!=null&&cmp(r[col],v)>0;
    if(op==='gte') return r=>r[col]!=null&&cmp(r[col],v)>=0;
    if(op==='lt') return r=>r[col]!=null&&cmp(r[col],v)<0;
    if(op==='lte') return r=>r[col]!=null&&cmp(r[col],v)<=0;
    if(op==='is'){ const t=(v==='null'||v===null)?null:(v==='true'||v===true)?true:(v==='false'||v===false)?false:undefined; if(t===undefined) return null; return r=>t===null? r[col]==null : r[col]===t; }
    if(op==='in'){ let arr=v; if(typeof v==='string'){ const m=v.match(/^\((.*)\)$/); if(!m) return null; arr=splitTop(m[1]).map(x=>x.replace(/^"|"$/g,'')); } return r=>(arr||[]).some(x=>same(r[col],x)); }
    if(op==='ilike'||op==='like'){
      const pat=String(v).replace(/\*/g,'%'); if(/_/.test(pat)) return null;
      const ci=op==='ilike', core=(ci?pat.toLowerCase():pat).replace(/^%|%$/g,''), st=!pat.startsWith('%'), en=!pat.endsWith('%');
      if(/%/.test(core)) return null;
      return r=>{ let x=String(r[col]==null?'':r[col]); if(ci) x=x.toLowerCase(); return st&&en? x===core : st? x.startsWith(core) : en? x.endsWith(core) : x.includes(core); };
    }
    return null;
  }
  function parseOr(str){
    const preds=[];
    for(const p of splitTop(String(str))){
      const m=p.match(/^([a-z_]+)\.(eq|neq|gt|gte|lt|lte|ilike|like|is|in)\.(.*)$/i); if(!m) return null;
      const pr=mkPred(m[1],m[2],m[3]); if(!pr) return null; preds.push(pr);
    }
    return preds.length? (r=>preds.some(f=>f(r))) : null;
  }
  async function runQuery(name,ops,_raw){
    const isView = name==='donors_with_last_donation';
    const kind = (name==='donors'||isView) ? 'donors' : (name==='blood_donations' ? 'donations' : null);
    const isST = ST.includes(name);
    if(isST){ if(!(await loadTB(name))) return null; }
    else if(!kind || !(await metaGet('lastSync'))) return null;
    if(!ops.length || ops[0][0]!=='select') return null;
    for(const o of ops) if(!OK_OPS.has(o[0])) return null;
    let cols=ops[0][1][0]||'*', opts=ops[0][1][1]||{};
    const parts=splitTop(cols), proj=[], embeds=[];
    for(const c of parts){
      const m=c.match(/^([a-z_]+)(!inner)?\((.*)\)$/i);
      if(m){ const fkm = isST ? (EMB[name]||{}) : (kind==='donations' ? {donors:'donor_id'} : {}); if(!fkm[m[1]]) return null; embeds.push({tbl:m[1],fk:fkm[m[1]],inner:!!m[2],cols:splitTop(m[3])}); }
      else proj.push(c);
    }
    let rows;
    if(isView){
      const LD=new Map(); for(const r of await loadAll('blood_donations')){ if(r.is_deleted||!r.donor_id) continue; const dt=r.donation_date||String(r.created_at||'').slice(0,10); if(dt && (!LD.has(r.donor_id)||dt>LD.get(r.donor_id))) LD.set(r.donor_id,dt); }
      rows=(await loadAll('donors')).filter(d=>!d.is_deleted).map(d=>({...d,last_donation_date:LD.get(d.id)||null}));
    }
    else rows=await loadAll(name);
    let res=rows, single=null, ord=[], lim=null, rng=null;
    const ft=[];
    for(let i=1;i<ops.length;i++){
      const [m,a]=ops[i];
      if(m==='or'){ const pr=parseOr(a[0]); if(!pr) return null; ft.push(pr); }
      else if(['eq','neq','gt','gte','lt','lte','is','ilike','like','in','not'].includes(m)){
        const col=a[0]; if(typeof col!=='string'||col.indexOf('.')>=0) return null;
        if(m==='not'){ const pr=mkPred(col,a[1],a[2]); if(!pr) return null; ft.push(r=> a[1]==='is' ? !pr(r) : (r[col]!=null && !pr(r))); }
        else { const pr=mkPred(col,m,a[1]); if(!pr) return null; ft.push(pr); }
      } else if(m==='order'){ ord.push({c:a[0],asc:!(a[1]&&a[1].ascending===false)}); }
      else if(m==='limit') lim=a[0];
      else if(m==='range') rng=a;
      else if(m==='single') single='single';
      else if(m==='maybeSingle') single='maybe';
    }
    res=rows.filter(r=>ft.every(f=>f(r)));
    if(_raw) return res;
    for(const e of embeds){ const src=await loadAll(e.tbl); if(e.tbl!=='donors' && !(await loadTB(e.tbl))) return null; e.map=new Map(src.map(d=>[d.id,d])); if(e.inner) res=res.filter(r=>e.map.has(r[e.fk])); }
    const total=res.length;
    if(opts.head) return {data:null,error:null,count:total,status:200,_local:true};
    if(ord.length) res=res.slice().sort((x,y)=>{ for(const o of ord){ const c=cmp(x[o.c],y[o.c]); if(c) return o.asc?c:-c*1; } return 0; });
    // PostgREST: تصاعدياً الفارغ أخيراً، وتنازلياً الفارغ أولاً (يطابقه cmp وعكسه)
    if(rng) res=res.slice(rng[0],rng[1]+1);
    if(lim!=null) res=res.slice(0,lim);
    const star=proj.includes('*');
    const out=res.map(r=>{
      let o; if(star) o={...r}; else { o={}; for(const c of proj){ const k=c.split(':').pop().trim(); o[k]=r[k]===undefined?null:r[k]; } }
      for(const e of embeds){ const d=e.map.get(r[e.fk]); if(!d){ o[e.tbl]=null; continue; }
        if(e.cols.includes('*')) o[e.tbl]={...d}; else { const x={}; for(const c of e.cols){ x[c]=d[c]===undefined?null:d[c]; } o[e.tbl]=x; } }
      return o; });
    if(single){
      if(out.length===1) return {data:out[0],error:null,status:200,_local:true,count:total};
      if(out.length===0 && single==='maybe') return {data:null,error:null,status:200,_local:true,count:0};
      return {data:null,error:{message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116'},status:406,_local:true};
    }
    return {data:out,error:null,status:200,count:opts.count?total:null,_local:true};
  }
  // تطبيق كتابة معلّقة على النسخة المحلية فوراً (كي تعكسها القراءات التالية)
  async function applyLocal(name,ops){
    try{
      const kind=name==='blood_donations'?'donations':(name==='donors'?'donors':null); if(!kind) return;
      const u=ops.find(o=>o[0]==='update'); if(!u) return;
      let ids=null; for(const o of ops){ if(o[0]==='eq'&&o[1][0]==='id') ids=[o[1][1]]; if(o[0]==='in'&&o[1][0]==='id') ids=o[1][1]; }
      if(!ids||!ids.length) return;
      const rows=await loadAll(name), set=new Set(ids.map(String)), changed=[];
      for(const r of rows){ if(set.has(String(r.id))){ Object.assign(r,u[1][0]); changed.push(r); } }
      if(changed.length){ await putMany(kind,changed,false); D=null; LAST=null; }
    }catch(e){ console.log('[mirror] applyLocal',e); }
  }
  const rnd=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  // كتابة عامة محلياً (insert/update/delete/upsert) على الجداول المنسوخة. ترجع {touched,lids} أو null إن لم تُدعم
  async function applyWrite(name,ops){
    try{
      const isST=ST.includes(name), kind=name==='blood_donations'?'donations':(name==='donors'?'donors':null);
      if(!isST&&!kind) return null;
      const w=ops[0]; if(!w) return null; const m=w[0];
      if(!isST && !(await metaGet('lastSync'))) return null;
      const rows=await loadAll(name); if(isST && !(await loadTB(name))) return null;
      const touched=[], lids=[];
      if(m==='insert'||m==='upsert'){
        const arr=Array.isArray(w[1][0])?w[1][0]:[w[1][0]]; const key=(w[1][1]&&w[1][1].onConflict)||'id';
        for(const x of arr){
          const row={...x}; let ex=null;
          if(m==='upsert') ex=rows.find(r=>r[key]!=null && same(r[key],row[key]));
          if(ex){ Object.assign(ex,row); touched.push(ex); lids.push(null); continue; }
          let lid=null; if(row.id==null){ lid='local-'+rnd(); row.id=lid; }
          if(row.created_at==null) row.created_at=new Date().toISOString();
          rows.push(row); touched.push(row); lids.push(lid);
        }
      } else if(m==='update'||m==='delete'){
        const flt=ops.slice(1).filter(o=>!['select','single','maybeSingle','order','limit'].includes(o[0]));
        const sel=await runQuery(name,[['select',['*']],...flt],true); if(sel==null) return null;
        if(m==='update') for(const r of sel){ Object.assign(r,w[1][0]); touched.push(r); }
        else { for(const r of sel) touched.push({...r}); const set=new Set(sel); const keep=rows.filter(r=>!set.has(r)); rows.length=0; keep.forEach(r=>rows.push(r)); }
      } else return null;
      if(isST){ await metaSet('tb_'+name,rows); await metaSet('tbl_dirty',1); }
      else if(m!=='delete'){ await putMany(kind,touched,false); D=null; LAST=null; }
      return {touched,lids};
    }catch(e){ console.log('[mirror] applyWrite',e); return null; }
  }
  // الأثر المحلي لدوال السيرفر الكاتبة (تقريب لما يفعله السيرفر؛ يُصحَّح بإعادة الجلب بعد المزامنة). ترجع {error} إن رُفضت محلياً
  async function applyRpc(name,a){
    a=a||{};
    try{
      const now=new Date().toISOString(), today=now.slice(0,10);
      const ins=async(t,row)=>{ await applyWrite(t,[['insert',[row]]]); };
      if(name==='soft_delete_donations'){
        await applyWrite('blood_donations',[['update',[{is_deleted:true,exit_reason:a.p_reason||null}]],['in',['id',a.p_ids||[]]]]);
      } else if(name==='lab_reagent_add'||name==='lab_reagent_set'){
        const rg=(await loadAll('lab_reagents')).find(r=>String(r.id)===String(a.p_id)); if(!rg) return null;
        const q=name==='lab_reagent_add'?(Number(rg.qty)||0)+Number(a.p_n):Number(a.p_qty);
        const d=q-(Number(rg.qty)||0);
        await applyWrite('lab_reagents',[['update',[{qty:q,updated_at:now}]],['eq',['id',rg.id]]]);
        await ins('lab_reagent_log',{reagent_id:rg.id,delta:d,qty_after:q,kind:name==='lab_reagent_add'?'add':'set',note:a.p_note||null});
      } else if(name==='lab_reagent_use'){
        for(const rg of (await loadAll('lab_reagents')).filter(r=>r.is_active&&r.per_test)){
          const q=Math.max(0,(Number(rg.qty)||0)-Number(a.p_n||1));
          await applyWrite('lab_reagents',[['update',[{qty:q,updated_at:now}]],['eq',['id',rg.id]]]);
          await ins('lab_reagent_log',{reagent_id:rg.id,delta:q-(Number(rg.qty)||0),qty_after:q,kind:'use',note:null});
        }
      } else if(name==='store_add'){
        await ins('store_lots',{item_id:a.p_item,qty_in:a.p_qty,qty_left:a.p_qty,expiry_date:a.p_expiry||null,received_date:a.p_date||today,note:a.p_note||null});
        await ins('store_moves',{item_id:a.p_item,kind:'in',reason:null,qty:a.p_qty,move_date:a.p_date||today,expiry_date:a.p_expiry||null,note:a.p_note||null,created_by_name:a.p_by||null});
      } else if(name==='store_withdraw'){
        const lots=(await loadAll('store_lots')).filter(l=>String(l.item_id)===String(a.p_item)&&Number(l.qty_left)>0);
        let use;
        if(a.p_lot){ use=lots.filter(l=>String(l.id)===String(a.p_lot)); }
        else use=lots.filter(l=>!l.expiry_date||String(l.expiry_date)>=today).sort((x,y)=>String(x.expiry_date||'9999').localeCompare(String(y.expiry_date||'9999')));
        const avail=use.reduce((t,l)=>t+Number(l.qty_left),0);
        if(avail<a.p_qty) return {error:{message:'INSUFFICIENT'}};
        let need=a.p_qty;
        for(const l of use){ if(need<=0) break; const t=Math.min(need,Number(l.qty_left)); need-=t;
          await applyWrite('store_lots',[['update',[{qty_left:Number(l.qty_left)-t}]],['eq',['id',l.id]]]); }
        await ins('store_moves',{item_id:a.p_item,kind:'out',reason:a.p_reason||null,qty:a.p_qty,move_date:a.p_date||today,note:a.p_note||null,created_by_name:a.p_by||null});
      } else if(name==='opening_dispatch_do'){
        const rows=await loadAll('opening_stock');
        for(const it of (a.p_items||[])){
          const r=rows.find(x=>x.component_type===it.c&&x.blood_type===it.b);
          if(!r||Number(r.qty_left)<it.n) return {error:{message:'الرصيد الخارجي غير كاف'}};
        }
        for(const it of (a.p_items||[])){
          const r=rows.find(x=>x.component_type===it.c&&x.blood_type===it.b);
          await applyWrite('opening_stock',[['update',[{qty_left:Number(r.qty_left)-it.n,updated_at:now}]],['eq',['id',r.id]]]);
          await ins('opening_dispatch',{kind:a.p_kind,component_type:it.c,blood_type:it.b,qty:it.n,hospital_name:a.p_hosp||null,patient:a.p_patient||null,book_no:a.p_book||null,note:a.p_note||null,dispatch_date:a.p_date||today});
        }
      }
    }catch(e){ console.log('[mirror] applyRpc',e); }
    return null;
  }
  // إعادة جلب صفوف محددة من السيرفر (بعد فشل عملية معلّقة، لتصحيح التعديل المحلي المتفائل)
  async function refreshIds(name,ids){
    try{
      const kind=name==='blood_donations'?'donations':'donors'; ids=[...new Set((ids||[]).map(String))];
      for(let i=0;i<ids.length;i+=150){
        const{data,error}=await _rawDb.from(name).select('*').in('id',ids.slice(i,i+150));
        if(!error&&data&&data.length) await putMany(kind,data,false);
      }
      DALL=null; BALL=null; D=null; LAST=null;
    }catch(e){}
  }


  // ───────── أرقام القناني بدون إنترنت (حاسبة الاستقبال وحدها تستعملها) ─────────
  async function syncBN(){
    const st={seqs:{},pool:[],camp:[]};
    const a=await _rawDb.from('bottle_sequences').select('id,bottle_type,current_number,end_number,created_at').eq('is_active',true).order('created_at',{ascending:false});
    if(a.error) throw a.error;
    for(const r of (a.data||[])){ if(!st.seqs[r.bottle_type]) st.seqs[r.bottle_type]=r; }   // الأحدث لكل نوع (كما يفعل الاستقبال)
    const b=await _rawDb.from('bottle_number_pool').select('id,bottle_type,bottle_number');
    if(!b.error) st.pool=b.data||[];
    for(let p=0;;p+=1000){
      const c=await _rawDb.from('campaign_slots').select('bottle_number').not('bottle_number','is',null).range(p,p+999);
      if(c.error) break; st.camp=st.camp.concat((c.data||[]).map(x=>x.bottle_number)); if(!c.data||c.data.length<1000) break;
    }
    await metaSet('bn_state',st);
  }
  async function usedNumbers(){
    const rows=await loadAll('blood_donations'); const set=new Set();
    for(const r of rows) if(r.bottle_number!=null) set.add(Number(r.bottle_number));
    return set;
  }
  // يقترح رقماً بنفس منطق الاستقبال: الأرقام المعادة أولاً ثم التسلسل، مع تخطي المستعمل وأرقام الحملات
  async function allocBN(sqk){
    const st=await metaGet('bn_state'); if(!st) return null;
    const loc=(await metaGet('bn_local'))||{used:[],next:{}};
    const used=await usedNumbers(), camp=new Set((st.camp||[]).map(Number)), locSet=new Set((loc.used||[]).map(Number));
    const blocked=n=>used.has(n)||camp.has(n)||locSet.has(n);
    const pool=(st.pool||[]).filter(x=>x.bottle_type===sqk && !blocked(Number(x.bottle_number))).sort((x,y)=>x.bottle_number-y.bottle_number);
    if(pool.length) return {number:Number(pool[0].bottle_number),poolId:pool[0].id};
    const seq=st.seqs[sqk]; if(!seq) return null;
    let n=Math.max(Number(seq.current_number),Number((loc.next||{})[sqk]||0));
    while(n<=Number(seq.end_number) && blocked(n)) n++;
    if(n>Number(seq.end_number)) return {finished:true};
    return {number:n,seqId:seq.id};
  }
  async function commitBN(sqk,n){
    const loc=(await metaGet('bn_local'))||{used:[],next:{}};
    loc.used=(loc.used||[]).concat([Number(n)]); loc.next=loc.next||{}; loc.next[sqk]=Math.max(Number(loc.next[sqk]||0),Number(n)+1);
    await metaSet('bn_local',loc);
  }
  // سجلات محلية مؤقتة (تبرع/متبرع حُفظ بدون إنترنت) كي تراها شاشات السحب والمختبر على نفس الحاسبة
  async function addLocal(donation,donor){
    if(donor) await putMany('donors',[donor],false);
    if(donation) await putMany('donations',[donation],false);
    DALL=null; BALL=null; D=null; LAST=null;
  }
  async function removeLocal(ids){
    const d=await open();
    for(const store of ['donors','donations']){
      const tx=d.transaction(store,'readwrite'); for(const id of ids) if(id) tx.objectStore(store).delete(id);
      await new Promise(r=>{tx.oncomplete=r;tx.onerror=r;});
    }
    DALL=null; BALL=null; D=null; LAST=null;
  }

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
  async function reset(){ for(const k in TB) delete TB[k]; const d=await open(); for(const s of ['donors','donations','meta']){ const tx=d.transaction(s,'readwrite'); tx.objectStore(s).clear(); } D=null; LAST=null; return sync(); }
  window.bbm={start,sync,applyWrite,applyRpc,syncTables,searchDonors,exactDonor,lastDonation,render,reset,runQuery,applyLocal,refreshIds,allocBN,commitBN,addLocal,removeLocal,syncBN,
    ready:async()=>!!(await metaGet('lastSync'))};
  window.bbmStart=start; window.bbmSync=sync;
})();
