// ================================================================
// AUTOMATIC BACKUP — Windows desktop app only (window.nativeBackup, see main.js).
// Every 3 days per ACCOUNT (stamp in user_profiles.last_backup_at) it silently writes 4 files into the
// folder chosen on THIS computer: full JSON backup + 3 Excel lists (all donors / rejected / rare groups).
// Files are never deleted. Notices go to the bell of the account that ran the backup.
// ================================================================
const BBA_TABLES = [
  'donors','blood_donations','rejected_donors','campaigns','campaign_slots',
  'bottle_sequences','bottle_number_pool','user_profiles','audit_log'
];
const BBA_RARE = ['A-','B-','O-','AB-','A+','AB+'];
const BBA_DAYS = 3;
let _bbaRunning = false, _bbaStarted = false;

// ---------- minimal .xlsx writer (stored zip, no dependencies) ----------
const _bbaCrcT = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
function _bbaCrc(u8){ let c=0xFFFFFFFF; for(let i=0;i<u8.length;i++) c=_bbaCrcT[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
function _bbaZip(files){
  const enc=new TextEncoder(), parts=[], cen=[]; let off=0;
  const u16=n=>[n&255,(n>>>8)&255], u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  for(const f of files){
    const name=enc.encode(f.name), data=enc.encode(f.data), crc=_bbaCrc(data);
    const lh=new Uint8Array([0x50,0x4b,3,4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(lh,name,data);
    cen.push({name,crc,len:data.length,off});
    off+=lh.length+name.length+data.length;
  }
  const cdStart=off;
  for(const c of cen){
    const h=new Uint8Array([0x50,0x4b,1,2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c.crc), ...u32(c.len), ...u32(c.len), ...u16(c.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.off)]);
    parts.push(h,c.name); off+=h.length+c.name.length;
  }
  const end=new Uint8Array([0x50,0x4b,5,6, ...u16(0), ...u16(0), ...u16(cen.length), ...u16(cen.length), ...u32(off-cdStart), ...u32(cdStart), ...u16(0)]);
  parts.push(end);
  let total=0; parts.forEach(p=>total+=p.length);
  const out=new Uint8Array(total); let o=0; parts.forEach(p=>{ out.set(p,o); o+=p.length; });
  return out;
}
function _bbaX(v){ return String(v==null?'':v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _bbaCol(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
function bbaMakeXlsx(sheetName, headers, rows){
  const cell=(v,c,r,st)=>'<c r="'+_bbaCol(c)+r+'" t="inlineStr"'+(st?' s="1"':'')+'><is><t xml:space="preserve">'+_bbaX(v)+'</t></is></c>';
  let sd='<row r="1">'+headers.map((h,c)=>cell(h,c,1,true)).join('')+'</row>';
  rows.forEach((row,i)=>{ sd+='<row r="'+(i+2)+'">'+row.map((v,c)=>cell(v,c,i+2,false)).join('')+'</row>'; });
  const cols='<cols>'+headers.map((h,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(/العنوان|الاسم|السبب|ملاحظات/.test(h)?30:16)+'" customWidth="1"/>').join('')+'</cols>';
  const sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+cols+'<sheetData>'+sd+'</sheetData></worksheet>';
  return _bbaZip([
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="'+_bbaX(sheetName).slice(0,31)+'" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    {name:'xl/worksheets/sheet1.xml',data:sheet}
  ]);
}

// ---------- data helpers ----------
async function _bbaFetchPages(table, build, onPage){
  const size=1000; let from=0;
  while(true){
    let q=build(db.from(table));
    q=q.order('id',{ascending:true}).range(from,from+size-1);
    const{data,error}=await q;
    if(error) throw new Error(table+': '+error.message);
    const rows=data||[];
    if(rows.length) await onPage(rows);
    if(rows.length<size) break;
    from+=size;
  }
}
async function _bbaFetchAll(table, build){ const all=[]; await _bbaFetchPages(table,build,r=>{ for(const x of r) all.push(x); }); return all; }
const _bbaDay = ()=>new Date().toLocaleDateString('en-CA');
function _bbaDate(v){ if(!v) return ''; const s=String(v); return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):s; }

// writes to a file through the desktop bridge
async function _bbaOpenSink(name){
  const b=await window.nativeBackup.begin(name);
  if(!b||!b.ok) throw new Error('تعذر إنشاء الملف: '+((b&&b.error)||''));
  const enc=new TextEncoder(); let buf=[], size=0;
  const flush=async()=>{
    if(!size) return;
    const u=new Uint8Array(size); let o=0; buf.forEach(p=>{ u.set(p,o); o+=p.length; }); buf=[]; size=0;
    const r=await window.nativeBackup.append(b.id,u);
    if(!r||!r.ok) throw new Error('تعذر الكتابة: '+((r&&r.error)||''));
  };
  return {
    async write(x){ const u=typeof x==='string'?enc.encode(x):x; buf.push(u); size+=u.length; if(size>1048576) await flush(); },
    async end(){ await flush(); const r=await window.nativeBackup.end(b.id); if(!r||!r.ok) throw new Error('تعذر إنهاء الملف: '+((r&&r.error)||'')); return r; },
    async abort(){ try{ await window.nativeBackup.abort(b.id); }catch(e){} }
  };
}

async function _bbaJson(day){
  const sink=await _bbaOpenSink('النسخة الاحتياطية '+day+'.json');
  try{
    await sink.write('{"exported_at":'+JSON.stringify(new Date().toISOString())+',"app":"WasitBloodbank","version":1,"tables":{');
    let ti=0;
    for(const t of BBA_TABLES){
      await sink.write((ti++?',':'')+JSON.stringify(t)+':[');
      let first=true;
      await _bbaFetchPages(t,q=>q.select('*'),async rows=>{
        let s=''; for(const r of rows){ s+=(first?'':',')+JSON.stringify(r); first=false; }
        await sink.write(s);
      });
      await sink.write(']');
    }
    await sink.write('}}');
    return await sink.end();
  }catch(e){ await sink.abort(); throw e; }
}
async function _bbaXlsx(name, sheet, headers, rows){
  const sink=await _bbaOpenSink(name+'.xlsx');
  try{ await sink.write(bbaMakeXlsx(sheet,headers,rows)); return await sink.end(); }
  catch(e){ await sink.abort(); throw e; }
}
async function _bbaDonorsXlsx(day){
  const rows=await _bbaFetchAll('donors',q=>q.select('*').eq('is_deleted',false));
  const H=['رقم المتبرع','الاسم','سنة التولد','الجنس','اسم الأم','نوع الهوية','رقم الهوية','الموبايل','العنوان','المهنة','الفصيلة','تاريخ التسجيل'];
  const out=rows.map(r=>[r.donor_number,r.full_name,r.birth_year,r.gender,r.mother_name,r.id_type||(r.national_id?'البطاقة الوطنية':''),r.national_id,r.mobile,r.address,r.occupation,r.blood_type,_bbaDate(r.created_at)]);
  return {r:await _bbaXlsx('كل المتبرعين '+day,'المتبرعين',H,out),n:out.length};
}
async function _bbaRejXlsx(day){
  const rows=await _bbaFetchAll('rejected_donors',q=>q.select('*').eq('is_deleted',false));
  const H=['الاسم','العمر','نوع الرفض','سبب الرفض','تاريخ الرفض','ملاحظات'];
  const out=rows.map(r=>[r.full_name,r.age,r.rejection_type,r.rejection_reason,_bbaDate(r.rejection_date),r.notes]);
  return {r:await _bbaXlsx('المرفوضين '+day,'المرفوضين',H,out),n:out.length};
}
async function _bbaRareXlsx(day){
  const rows=await _bbaFetchAll('donors_with_last_donation',q=>q.select('*').in('blood_type',BBA_RARE));
  const H=['رقم المتبرع','الاسم','الفصيلة','الموبايل','العنوان','تاريخ آخر تبرع'];
  const out=rows.map(r=>[r.donor_number,r.full_name,r.blood_type,r.mobile,r.address,_bbaDate(r.last_donation_date)]);
  return {r:await _bbaXlsx('الفصائل النادرة '+day,'الفصائل النادرة',H,out),n:out.length};
}

// ---------- scheduling ----------
function _bbaLocalKey(uid){ return 'bb_backup_last_'+uid; }
async function _bbaLastStamp(uid){
  let t=0;
  try{ const{data}=await db.from('user_profiles').select('last_backup_at').eq('id',uid).single(); if(data&&data.last_backup_at) t=Math.max(t,new Date(data.last_backup_at).getTime()); }catch(e){}
  try{ t=Math.max(t,Number(localStorage.getItem(_bbaLocalKey(uid))||0)); }catch(e){}
  return t;
}
async function _bbaStamp(uid){
  try{ localStorage.setItem(_bbaLocalKey(uid),String(Date.now())); }catch(e){}
  try{
    const r=await db.rpc('mark_backup_done');
    if(r.error) await db.from('user_profiles').update({last_backup_at:new Date().toISOString()}).eq('id',uid);
    if(UPROF) UPROF.last_backup_at=new Date().toISOString();
  }catch(e){}
}

async function bbaRun(manual){
  if(_bbaRunning) return {ok:false,busy:true};
  const uid=SES?.user?.id; if(!uid||!window.nativeBackup) return {ok:false};
  _bbaRunning=true;
  const day=_bbaDay();
  try{
    toast('💾 بدأ النسخ الاحتياطي في الخلفية — يمكنك مواصلة العمل','info',3500);
    const j=await _bbaJson(day);
    bbNoticeAdd('ok','تم حفظ: النسخة الاحتياطية '+day,j.path,uid);
    const d=await _bbaDonorsXlsx(day);
    bbNoticeAdd('ok','تم حفظ: كل المتبرعين '+day+' ('+d.n+' متبرع)',d.r.path,uid);
    const x=await _bbaRejXlsx(day);
    bbNoticeAdd('ok','تم حفظ: المرفوضين '+day+' ('+x.n+')',x.r.path,uid);
    const z=await _bbaRareXlsx(day);
    bbNoticeAdd('ok','تم حفظ: الفصائل النادرة '+day+' ('+z.n+')',z.r.path,uid);
    await _bbaStamp(uid);
    return {ok:true};
  }catch(e){
    bbNoticeAdd('err','فشل النسخ الاحتياطي',String(e&&e.message||e),uid);
    return {ok:false,error:e};
  }finally{ _bbaRunning=false; try{ if(G('backupAutoModal')?.classList.contains('on')) openBackupAutoModal(); }catch(e){} }
}

async function bbaCheck(){
  try{
    if(_bbaRunning||!canAutoBackup()||!IS_ONLINE) return;
    const st=await window.nativeBackup.get();
    if(!st||!st.folder||!st.exists) return;
    const uid=SES?.user?.id; if(!uid) return;
    const last=await _bbaLastStamp(uid);
    if(last && Date.now()-last < BBA_DAYS*86400000) return;
    await bbaRun(false);
  }catch(e){}
}
function bbAutoStart(){
  if(_bbaStarted) return; _bbaStarted=true;
  setTimeout(bbaCheck,20000);
  setInterval(bbaCheck,30*60*1000);
}

// ---------- settings window ----------
async function openBackupAutoModal(){
  const body=G('backupAutoBody'); if(!body) return;
  G('backupAutoModal').classList.add('on');
  let st={}; try{ st=await window.nativeBackup.get(); }catch(e){}
  const uid=SES?.user?.id; let last=0; try{ last=await _bbaLastStamp(uid); }catch(e){}
  const lastTxt=last?new Date(last).toLocaleString('ar-IQ'):'لم يتم بعد';
  const on=st&&st.folder&&st.exists;
  body.innerHTML=
    '<div style="font-size:13px;line-height:1.9">'+
    '<div style="padding:10px;border-radius:8px;background:'+(on?'#ECFDF5':'#FEF3C7')+';margin-bottom:10px">'+
      (on?'✅ مفعّل على هذه الحاسبة':'⚠️ غير مفعّل على هذه الحاسبة')+
      (st&&st.folder?'<div dir="ltr" style="font-size:12px;color:#475569;text-align:left;word-break:break-all">'+esc(st.folder)+(st.exists?'':' (المجلد غير موجود!)')+'</div>':'')+
    '</div>'+
    '<div>آخر نسخة لهذا الحساب: <b>'+esc(lastTxt)+'</b></div>'+
    (_bbaRunning?'<div style="color:#B45309;margin-top:6px">⏳ جارٍ النسخ الآن في الخلفية...</div>':'')+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'+
      '<button class="btn btn-primary" onclick="bbaChooseFolder()">'+(on?'تغيير المجلد':'تفعيل واختيار المجلد')+'</button>'+
      (on?'<button class="btn" onclick="bbaManual()">تنزيل نسخة الآن</button><button class="btn" onclick="bbaDisable()">إيقاف على هذه الحاسبة</button>':'')+
    '</div>'+
    '<div style="font-size:12px;color:#64748b;margin-top:12px">كل 3 أيام يُحفظ تلقائياً: النسخة الاحتياطية الكاملة + كل المتبرعين + المرفوضين + الفصائل النادرة (Excel). لا يُحذف أي ملف قديم. تحتوي الملفات بيانات شخصية — احمِ المجلد.</div></div>';
}
async function bbaChooseFolder(){
  const r=await window.nativeBackup.choose();
  if(!r||!r.ok){ openBackupAutoModal(); return; }
  toast('تم اختيار المجلد — جارٍ أخذ نسخة الآن','success',3000);
  openBackupAutoModal();
  bbaRun(true);
}
async function bbaManual(){
  const r=await bbaRun(true);
  if(r&&r.busy) toast('النسخ جارٍ بالفعل','info');
}
async function bbaDisable(){
  if(!confirm('إيقاف النسخ التلقائي على هذه الحاسبة؟ (الملفات المحفوظة لا تُحذف)')) return;
  await window.nativeBackup.clear(); openBackupAutoModal();
}
