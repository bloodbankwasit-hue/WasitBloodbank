// استيراد بيانات النظام القديم (متبرعون + مصابون/مرفوضون + فصائل) — للمدير فقط.
// الملف الذي يُختار يبقى على جهازك ولا يُرفع لأي مكان إلا إلى قاعدة بيانات Supabase مباشرة.
// قاعدة التطابق: يُعدّ الشخص نفسه إذا تطابق اثنان من ثلاثة: (الاسم + الهاتف) أو (الهوية + الاسم) أو (الهوية + الهاتف).
// المتبرع المتطابق لا يتكرر: تُكمَّل فقط حقوله الفارغة. التشغيل أكثر من مرة آمن (لا يكرر شيئاً).
let _lgData=null, _lgPlan=null, _lgBusy=false;

function lgNN(s){ s=String(s==null?'':s).replace(/[ً-ٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه'); return s.replace(/\s+/g,' ').trim(); }
function lgMob(s){ s=String(s==null?'':s).replace(/\D/g,''); if(s.length===10&&s[0]==='7') s='0'+s; return (s.length===11&&s.startsWith('07'))?s:''; }
function lgNid(s){ s=String(s==null?'':s).trim(); if(!s) return ''; return /^\d{12}$/.test(s)?s:lgNN(s); }
const LG_RARE=['A-','B-','O-','AB-','A+','AB+'];

// يبني الخطة: من يُضاف، من يُكمَّل، من يُتخطّى، وما المرفوضون الجدد. دالة نقيّة قابلة للاختبار.
function lgBuildPlan(data, exDonors, exRej){
  const idx={nm:new Map(),kn:new Map(),km:new Map(),mo:new Map()};
  const add=(m,k,id)=>{ if(!k) return; let a=m.get(k); if(!a){ a=new Set(); m.set(k,a); } a.add(id); };
  const byId=new Map();
  const put=d=>{ byId.set(d.id,d); const n=lgNN(d.full_name), m=lgMob(d.mobile), k=lgNid(d.national_id);
    if(n&&m) add(idx.nm,n+'|'+m,d.id); if(k&&n) add(idx.kn,k+'|'+n,d.id); if(k&&m) add(idx.km,k+'|'+m,d.id); if(n&&d.mother_name) add(idx.mo,n+'|'+lgNN(d.mother_name),d.id); };
  exDonors.forEach(put);
  const plan={ins:[],upd:[],ambiguous:[],same:0,btFill:0,btConflict:0,rare:0,rej:[],rejSkip:0};
  const seenNew=new Set();
  for(const s of data.donors){
    const n=lgNN(s.name), m=lgMob(s.mobile), k=lgNid(s.nid);
    const cand=new Set();
    if(n&&m) (idx.nm.get(n+'|'+m)||[]).forEach(x=>cand.add(x));
    if(k&&n) (idx.kn.get(k+'|'+n)||[]).forEach(x=>cand.add(x));
    if(k&&m) (idx.km.get(k+'|'+m)||[]).forEach(x=>cand.add(x));
    if(!cand.size && !m && !k){   // لا هوية ولا هاتف: لا نطابق إلا بالاسم + اسم الأم
      if(!s.mother){ plan.ambiguous.push({why:'بيانات ناقصة (اسم فقط) — لم يُستورد',name:s.name,nid:s.nid,mobile:s.mobile}); continue; }
      (idx.mo.get(n+'|'+lgNN(s.mother))||[]).forEach(x=>cand.add(x));
    }
    if(cand.size>1){ plan.ambiguous.push({why:'يطابق أكثر من متبرع موجود',name:s.name,nid:s.nid,mobile:s.mobile}); continue; }
    if(cand.size===1){
      const ex=byId.get([...cand][0]), patch={};
      if(!ex.mother_name&&s.mother) patch.mother_name=s.mother;
      if(!ex.national_id&&s.nid){ patch.national_id=s.nid; if(s.idt) patch.id_type=s.idt; }
      if(!ex.mobile&&m) patch.mobile=m;
      if(!ex.address&&s.address) patch.address=s.address;
      if(!ex.occupation&&s.occ) patch.occupation=s.occ;
      if(!ex.birth_year&&s.by) patch.birth_year=s.by;
      if(s.bt){ if(!ex.blood_type){ patch.blood_type=s.bt; plan.btFill++; if(LG_RARE.includes(s.bt)) plan.rare++; } else if(ex.blood_type!==s.bt) plan.btConflict++; }
      if(Object.keys(patch).length) plan.upd.push({id:ex.id,patch}); else plan.same++;
      continue;
    }
    // جديد — وتأكد أنه لا يتكرر داخل الملف نفسه
    const key=(n&&m)?'nm|'+n+'|'+m:(k&&n)?'kn|'+k+'|'+n:(k&&m)?'km|'+k+'|'+m:'mo|'+n+'|'+(s.mother||'');
    if(seenNew.has(key)){ plan.same++; continue; }
    seenNew.add(key);
    plan.ins.push(s);
    if(s.bt&&LG_RARE.includes(s.bt)) plan.rare++;
  }
  // المرفوضون: المصاب (دائم + «إصابة») يُتخطّى إن وُجد لنفس الاسم أي سجل رفض دائم بإصابة؛ غيره بالاسم+السبب+التاريخ
  const rk=new Set(), inf=new Set();
  exRej.forEach(r=>{ const n=lgNN(r.full_name); rk.add(n+'|'+lgNN(r.rejection_reason)+'|'+(r.rejection_date||''));
    if(r.rejection_type==='دائم'&&/اصاب|إصاب|hb|hcv|hiv|syph/i.test(r.rejection_reason||'')) inf.add(n); });
  for(const r of data.rejected){
    const n=lgNN(r.name), isInf=r.type==='دائم'&&/اصاب|إصاب|hb|hcv|hiv|syph/i.test(r.reason||'');
    if(isInf){ if(inf.has(n)){ plan.rejSkip++; continue; } inf.add(n); }
    else { const k=n+'|'+lgNN(r.reason)+'|'+(r.date||''); if(rk.has(k)){ plan.rejSkip++; continue; } rk.add(k); }
    plan.rej.push(r);
  }
  return plan;
}

async function openLegacyImport(){
  if(UPROF?.role!=='admin'){ toast('⛔ هذه الأداة للمدير فقط','error'); return; }
  _lgData=null; _lgPlan=null;
  let ov=G('lgOv'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.className='overlay on'; ov.id='lgOv'; ov.style.zIndex=9000;
  ov.innerHTML=`<div class="modal" style="width:min(560px,96vw);max-height:92vh"><div class="modal-title"><i class="ti ti-database-import"></i> استيراد بيانات النظام القديم</div>
    <div class="modal-body" id="lgBody">
      <div style="font-size:15px;line-height:1.8;color:#374151">
        1) خذ <b>نسخة احتياطية</b> من التطبيق أولاً.<br>2) اختر ملف البيانات (<b>legacy_import.json</b>) من جهازك.<br>3) راجع المعاينة ثم اضغط تنفيذ. لا شيء يُكتب قبل ضغطك.</div>
      <input type="file" id="lgFile" accept=".json,application/json" style="margin-top:12px;width:100%" onchange="lgLoadFile(this)">
      <div id="lgPrev" style="margin-top:12px"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="G('lgOv').remove()">إغلاق</button><button class="btn btn-p" id="lgRun" style="display:none" onclick="lgRun()"><i class="ti ti-check"></i> تنفيذ الاستيراد</button></div></div>`;
  document.body.appendChild(ov);
}

async function lgLoadFile(inp){
  const f=inp.files&&inp.files[0]; if(!f) return;
  const prev=G('lgPrev'); prev.innerHTML='<div class="empty"><p>جاري القراءة والمقارنة…</p></div>'; G('lgRun').style.display='none';
  try{
    _lgData=JSON.parse(await f.text());
    if(!_lgData||!Array.isArray(_lgData.donors)||!Array.isArray(_lgData.rejected)) throw new Error('الملف ليس ملف استيراد صحيحاً');
    const ex=await bbFetchAll(()=>db.from('donors').select('id,full_name,national_id,mobile,mother_name,birth_year,address,occupation,blood_type').eq('is_deleted',false));
    const exR=await bbFetchAll(()=>db.from('rejected_donors').select('id,full_name,rejection_reason,rejection_type,rejection_date').eq('is_deleted',false));
    _lgPlan=lgBuildPlan(_lgData,ex,exR);
    const p=_lgPlan, c=(n,l,col)=>`<div style="flex:1;min-width:120px;text-align:center;border:1.5px solid #E5E7EB;border-radius:12px;padding:10px"><div style="font-size:24px;font-weight:900;color:${col}">${fnum(n)}</div><div style="font-size:14px;font-weight:700;color:#475569">${l}</div></div>`;
    prev.innerHTML=`<div style="font-weight:800;margin-bottom:6px">المعاينة (لم يُكتب شيء بعد)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${c(p.ins.length,'متبرعون جدد','#166534')}${c(p.upd.length,'متبرعون موجودون يُكمَّل نقصهم','#1D4ED8')}${c(p.same,'مكرر — يُتخطّى','#6B7280')}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${c(p.rej.length,'مصابون/مرفوضون جدد','#B91C1C')}${c(p.rejSkip,'مرفوض مكرر — يُتخطّى','#6B7280')}${c(p.rare,'فصائل نادرة ستُسجَّل','#BE123C')}</div>
      <div style="font-size:14px;color:#6B7280;margin-top:8px">فصيلة تُملأ للموجودين: ${fnum(p.btFill)} — فصيلة تختلف عن الموجودة (لا تُغيَّر): ${fnum(p.btConflict)} — بحاجة مراجعة: ${fnum(p.ambiguous.length+(_lgData.review||[]).length)}</div>
      <button class="btn" style="margin-top:8px" onclick="lgReview()"><i class="ti ti-file-spreadsheet"></i> تنزيل قائمة المراجعة (CSV)</button>`;
    G('lgRun').style.display=(p.ins.length||p.upd.length||p.rej.length)?'':'none';
  }catch(e){ prev.innerHTML='<div style="color:#B91C1C;font-weight:700">'+esc(e.message||String(e))+'</div>'; }
}

function lgReview(){
  const rows=[...(_lgPlan?.ambiguous||[]),...(_lgData?.review||[])];
  const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  const csv='﻿'+['السبب,الاسم,الهوية,الهاتف'].concat(rows.map(r=>[r.why,r.name,r.nid,r.mobile].map(q).join(','))).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download='مراجعة_الاستيراد.csv'; a.click();
}

async function _lgBatch(table,rows,prog){
  let ok=0,bad=0,errs=[];
  for(let i=0;i<rows.length;i+=500){
    const part=rows.slice(i,i+500);
    const{error}=await db.from(table).insert(part);
    if(!error){ ok+=part.length; }
    else{ for(const r of part){ const{error:e1}=await db.from(table).insert(r); if(e1){ bad++; if(errs.length<3) errs.push(e1.message); } else ok++; } }
    prog(ok+bad);
  }
  return{ok,bad,errs};
}

async function lgRun(){
  if(_lgBusy||!_lgPlan) return;
  const p=_lgPlan;
  if(!(await bbConfirm('سيتم إضافة '+fnum(p.ins.length)+' متبرعاً وتكميل '+fnum(p.upd.length)+' وإضافة '+fnum(p.rej.length)+' سجل مصاب/مرفوض.\nهل أخذت نسخة احتياطية؟ تأكيد التنفيذ؟'))) return;
  _lgBusy=true; G('lgRun').style.display='none';
  const prev=G('lgPrev'), uid=SES?.user?.id||null, total=p.ins.length+p.upd.length+p.rej.length; let done=0;
  const show=(t)=>{ prev.innerHTML='<div style="font-weight:800">'+t+'</div><div style="height:10px;background:#E5E7EB;border-radius:6px;margin-top:8px"><div style="height:10px;border-radius:6px;background:#BE123C;width:'+Math.min(100,Math.round(done*100/Math.max(1,total)))+'%"></div></div><div style="font-size:14px;color:#6B7280;margin-top:6px">'+fnum(done)+' / '+fnum(total)+' — لا تغلق الصفحة</div>'; };
  const res={ins:null,upd:{ok:0,bad:0},rej:null};
  try{
    show('إضافة المتبرعين…');
    const base=done;
    const rows=p.ins.slice().sort((a,b)=>(a.last||'')<(b.last||'')?-1:1).map(s=>({
      full_name:s.name, birth_year:s.by||null, gender:s.gender||'ذكر', mother_name:s.mother||null,
      national_id:s.nid||null, ...(s.idt?{id_type:s.idt}:{}), mobile:lgMob(s.mobile)||null,
      address:s.address||null, occupation:s.occ||null, blood_type:s.bt||null, created_by:uid }));
    res.ins=await _lgBatch('donors',rows,n=>{ done=base+n; show('إضافة المتبرعين…'); });
    done=base+rows.length;
    show('تكميل بيانات الموجودين…');
    for(let i=0;i<p.upd.length;i+=10){
      await Promise.all(p.upd.slice(i,i+10).map(async u=>{ const{error}=await db.from('donors').update(u.patch).eq('id',u.id); if(error) res.upd.bad++; else res.upd.ok++; }));
      done=base+rows.length+Math.min(p.upd.length,i+10); show('تكميل بيانات الموجودين…');
    }
    done=base+rows.length+p.upd.length;
    show('إضافة المصابين والمرفوضين…');
    const rrows=p.rej.map(r=>({full_name:r.name,age:r.age||null,rejection_reason:r.reason,rejection_date:r.date||new Date().toISOString().split('T')[0],rejection_type:r.type,notes:r.note||null,created_by:uid}));
    const b2=done; res.rej=await _lgBatch('rejected_donors',rrows,n=>{ done=b2+n; show('إضافة المصابين والمرفوضين…'); });
    try{ await db.from('audit_log').insert({user_id:uid,user_name:UPROF?.full_name,action:'INSERT',table_name:'donors',record_id:null,new_values:{legacy_import:{donors_added:res.ins.ok,donors_failed:res.ins.bad,donors_updated:res.upd.ok,rejected_added:res.rej.ok,rejected_failed:res.rej.bad}}}); }catch(e){}
    const bad=res.ins.bad+res.upd.bad+res.rej.bad;
    prev.innerHTML='<div style="font-weight:900;color:'+(bad?'#92400E':'#166534')+';font-size:17px">'+(bad?'⚠️ اكتمل مع أخطاء':'✅ اكتمل الاستيراد')+'</div>'
      +'<div style="line-height:1.9;margin-top:6px">متبرعون أُضيفوا: <b>'+fnum(res.ins.ok)+'</b>'+(res.ins.bad?' — فشل: '+fnum(res.ins.bad):'')+'<br>متبرعون كُمِّلوا: <b>'+fnum(res.upd.ok)+'</b>'+(res.upd.bad?' — فشل: '+fnum(res.upd.bad):'')+'<br>مصابون/مرفوضون أُضيفوا: <b>'+fnum(res.rej.ok)+'</b>'+(res.rej.bad?' — فشل: '+fnum(res.rej.bad):'')+'</div>'
      +(bad?'<div style="font-size:14px;color:#B91C1C;margin-top:6px">'+esc([...(res.ins.errs||[]),...(res.rej.errs||[])].slice(0,3).join(' | '))+'<br>يمكنك إعادة التشغيل بنفس الملف: لن يتكرر ما أُضيف.</div>':'');
  }catch(e){ prev.innerHTML='<div style="color:#B91C1C;font-weight:700">توقف الاستيراد: '+esc(e.message||String(e))+'<br><span style="font-size:14px;color:#374151">أعد اختيار الملف وشغّله مرة أخرى: لن يتكرر ما أُضيف.</span></div>'; }
  finally{ _lgBusy=false; }
}
