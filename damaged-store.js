// ================================================================
// مخزن القناني التالفة — every damaged bottle from every section (draw, separation, manual,
// expiry...) lands here. One responsible employee destroys them under a medical destruction
// report (محضر إتلاف طبي); destroyed bottles leave the waiting list and stay in the archive.
//   waiting   = status 'damaged', not deleted, destruction_report_id IS NULL
//   destroyed = status 'damaged' with destruction_report_id set (the bottle row is kept for history)
// Needs: table destruction_reports + column blood_donations.destruction_report_id (SQL file).
// ================================================================
let _dstTab='wait', _dstRows=[], _dstKind='month', _dstToken=0;
const _DST_KINDS={day:'يومي',week:'أسبوعي',month:'شهري',half:'نصف سنوي',year:'سنوي',custom:'مخصص'};
const _DST_METHODS=['حرق','إتلاف طبي'];

function _dstYmd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _dstParse(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1); }
function _dstCanUse(){ return UPROF?.role==='admin' || hasPermission('damaged_store'); }

// Pure: period containing the anchor date (week = Saturday → Friday).
function dstPeriodRange(kind, anchor){
  const a=_dstParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  if(kind==='day')   return {from:new Date(y,m,d), to:new Date(y,m,d)};
  if(kind==='week'){ const back=(a.getDay()+1)%7; return {from:new Date(y,m,d-back), to:new Date(y,m,d-back+6)}; }
  if(kind==='month') return {from:new Date(y,m,1), to:new Date(y,m+1,0)};
  if(kind==='half'){ const h=m<6?0:6; return {from:new Date(y,h,1), to:new Date(y,h+6,0)}; }
  return {from:new Date(y,0,1), to:new Date(y,11,31)};
}
function dstShiftAnchor(kind, anchor, dir){
  const a=_dstParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  if(kind==='day')   return _dstYmd(new Date(y,m,d+dir));
  if(kind==='week')  return _dstYmd(new Date(y,m,d+7*dir));
  if(kind==='month') return _dstYmd(new Date(y,m+dir,1));
  if(kind==='half')  return _dstYmd(new Date(y,m+6*dir,1));
  return _dstYmd(new Date(y+dir,m,1));
}
// Pure: statistics of damaged bottles (rows already limited to the period).
function dstAggregate(rows){
  const cnt=(key)=>{ const o={}; rows.forEach(r=>{ const k=key(r)||'غير محدد'; o[k]=(o[k]||0)+1; }); return Object.entries(o).sort((a,b)=>b[1]-a[1]); };
  return { total:rows.length,
    destroyed:rows.filter(r=>r.destruction_report_id).length,
    waiting:rows.filter(r=>!r.destruction_report_id).length,
    byReason:cnt(r=>r.damage_reason), byComp:cnt(r=>r.component_type||'دم كامل'),
    byType:cnt(r=>r.bottle_type), byBlood:cnt(r=>r.blood_type) };
}

async function _dstFetchAll(build){
  let all=[]; for(let p=0;;p+=1000){ const{data,error}=await build().range(p,p+999); if(error) throw error; all=all.concat(data||[]); if((data||[]).length<1000) break; }
  return all;
}

async function loadDamagedStore(){
  if(!_dstCanUse()){ toast('⛔ ما عندك صلاحية مخزن القناني التالفة','error'); return; }
  dstTab(_dstTab||'wait');
}
function dstTab(t){
  _dstTab=t;
  document.querySelectorAll('#dstTabs .tab').forEach(x=>x.classList.toggle('on',x.dataset.t===t));
  ['wait','archive','stats'].forEach(k=>{ const el=G('dst-'+k); if(el) el.style.display = k===t?'block':'none'; });
  if(t==='wait') dstLoadWaiting(); else if(t==='archive') dstLoadArchive(); else dstStatsOpen();
}

// ───────────────────────── waiting list ─────────────────────────
async function dstLoadWaiting(){
  const box=G('dst-wait'); box.innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  try{
    _dstRows=await _dstFetchAll(()=>db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,component_type,damage_reason,damaged_date,bottle_note,donors(full_name)')
      .eq('status','damaged').eq('is_deleted',false).is('destruction_report_id',null).order('damaged_date',{ascending:false}).order('id'));
  }catch(e){ box.innerHTML='<div class="empty"><i class="ti ti-alert-triangle"></i><p>تعذّر التحميل: '+esc(e.message||'')+'<br>تأكد من تشغيل ملف SQL الخاص بالمخزن</p></div>'; return; }
  dstRenderWaiting();
}
function dstRenderWaiting(){
  const box=G('dst-wait');
  const q=(G('dstSrch')?.value||'').trim().toLowerCase(), rs=G('dstReason')?.value||'';
  const reasons=[...new Set(_dstRows.map(r=>r.damage_reason||'—'))];
  let rows=_dstRows.filter(r=>(!rs||(r.damage_reason||'—')===rs) && (!q||[r.bottle_number,r.donors?.full_name,r.blood_type,r.component_type,r.bottle_note].join(' ').toLowerCase().includes(q)));
  const LIM=400, shown=rows.slice(0,LIM);
  box.innerHTML=`
    <div class="rr" style="padding:10px 12px;background:#FEF2F2;border-radius:10px;margin-bottom:10px"><span style="font-weight:700;color:#7F1D1D">بانتظار الإتلاف</span><span class="rv" style="font-size:20px;color:#7F1D1D">${fnum(_dstRows.length)}</span></div>
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input type="text" id="dstSrch" class="sinp" placeholder="🔍 رقم القنينة، المتبرع، الفصيلة..." style="flex:1;min-width:160px" oninput="dstRenderWaiting()" value="${esc(G('dstSrch')?.value||'')}">
      <select id="dstReason" class="sinp" style="flex:1;min-width:140px" onchange="dstRenderWaiting()"><option value="">كل الأسباب</option>${reasons.map(x=>`<option value="${esc(x)}" ${x===rs?'selected':''}>${esc(x)}</option>`).join('')}</select>
    </div>
    <div id="dstBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between">
      <span id="dstCount">0 محدد</span>
      <button class="btn" style="background:#7F1D1D;color:#fff;border:none" onclick="dstOpenDestroy()"><i class="ti ti-flame"></i> إتلاف المحدد بمحضر</button>
    </div>
    ${rows.length?selAllRow('dst-chk','dstUpdateBar')+shown.map(r=>`
      <label class="flow-card" style="cursor:pointer">
        <input type="checkbox" class="dst-chk" value="${r.id}" onclick="dstUpdateBar()" style="width:18px;height:18px;flex-shrink:0">
        <div class="fc-av">${BAG}</div>
        <div style="flex:1;min-width:0">
          <div class="fc-name">قنينة ${esc(r.bottle_number)} — ${esc(r.blood_type||'—')} — ${esc(r.component_type||'دم كامل')}</div>
          <div class="fc-sub">${esc(r.damage_reason||'—')} | ${fd(r.damaged_date)} | ${esc(r.donors?.full_name||'—')}</div>
          ${r.bottle_note?`<div style="font-size:14px;color:#92400E;background:#FFFBEB;border-radius:8px;padding:5px 8px;margin-top:5px">📝 ${esc(r.bottle_note)}</div>`:''}
        </div>
        <button type="button" class="btn" style="font-size:14px;padding:6px 10px;flex-shrink:0" data-n="${esc(r.bottle_note||'')}" onclick="event.preventDefault();event.stopPropagation();openNoteModal('${r.id}',this.dataset.n,dstLoadWaiting)"><i class="ti ti-notes"></i> ${r.bottle_note?'تعديل':'ملاحظة'}</button>
      </label>`).join('')+(rows.length>LIM?`<div style="text-align:center;color:#757575;padding:8px">عُرض أول ${LIM} من ${fnum(rows.length)} — استخدم البحث أو الفلتر لتضييق القائمة</div>`:'')
    :'<div class="empty"><i class="ti ti-check"></i><p>لا توجد قناني تالفة بانتظار الإتلاف</p></div>'}`;
  dstUpdateBar();
}
function dstUpdateBar(){
  syncSelAll('dst-chk');
  const n=document.querySelectorAll('.dst-chk:checked').length, bar=G('dstBar'); if(!bar) return;
  bar.style.display = n?'flex':'none'; G('dstCount').textContent=n+' محدد';
}

// ───────────────────────── destruction report ─────────────────────────
function dstOpenDestroy(){
  const ids=[...document.querySelectorAll('.dst-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('حدد قنينة واحدة على الأقل','error'); return; }
  G('dsd-count').textContent=ids.length;
  G('dsd-method').innerHTML=_DST_METHODS.map(m=>`<option>${m}</option>`).join('');
  G('dsd-date').value=_dstYmd(new Date()); G('dsd-officer').value=UPROF?.full_name||''; G('dsd-notes').value='';
  G('dstDestroyModal').classList.add('on');
}
async function dstConfirmDestroy(){
  if(!_dstCanUse()){ toast('⛔ ما عندك صلاحية','error'); return; }
  if(!IS_ONLINE){ toast('الإتلاف يحتاج اتصالاً بالإنترنت','warning'); return; }
  const ids=[...document.querySelectorAll('.dst-chk:checked')].map(c=>c.value);
  const method=G('dsd-method').value, date=G('dsd-date').value, officer=G('dsd-officer').value.trim(), notes=G('dsd-notes').value.trim();
  if(!ids.length){ toast('لا توجد قناني محددة','error'); return; }
  if(!date||!officer){ toast('اكتب تاريخ الإتلاف واسم المسؤول','error'); return; }
  if(!confirm('تأكيد '+method+' لـ'+ids.length+' قنينة بمحضر رسمي؟\nلا يمكن التراجع، وتنتقل القناني للأرشيف.')) return;
  load(true);
  try{
    const{data:rep,error:re}=await db.from('destruction_reports').insert({report_date:date,method,officer_name:officer,notes:notes||null,bottle_count:ids.length,created_by:SES?.user?.id}).select().single();
    if(re) throw re;
    for(let i=0;i<ids.length;i+=100){
      const{error:ue}=await db.from('blood_donations').update({destruction_report_id:rep.id}).in('id',ids.slice(i,i+100)).is('destruction_report_id',null);
      if(ue) throw new Error('تم إنشاء المحضر رقم '+rep.report_no+' لكن تعذّر ربط بعض القناني: '+ue.message);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'destruction_reports',record_id:rep.id,new_values:{report_no:rep.report_no,method,count:ids.length}});
    G('dstDestroyModal').classList.remove('on');
    toast('✅ تم إنشاء محضر الإتلاف رقم '+rep.report_no,'success',4500);
    await dstLoadWaiting();
    if(confirm('هل تريد طباعة المحضر الآن؟')) dstPrintReport(rep.id);
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function dstPrintReport(id){
  load(true);
  try{
    const{data:rep,error}=await db.from('destruction_reports').select('*').eq('id',id).single(); if(error) throw error;
    const rows=await _dstFetchAll(()=>db.from('blood_donations').select('id,bottle_number,bottle_type,blood_type,component_type,damage_reason,damaged_date').eq('destruction_report_id',id).order('bottle_number').order('id'));
    const tr=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.bottle_number)}</td><td>${esc(r.bottle_type||'—')}</td><td>${esc(r.blood_type||'—')}</td><td>${esc(r.component_type||'دم كامل')}</td><td>${esc(r.damage_reason||'—')}</td><td>${fd(r.damaged_date)}</td></tr>`).join('');
    printHtmlDocument(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>محضر إتلاف رقم ${rep.report_no}</title>
    <style>body{font-family:'Segoe UI',Arial,sans-serif;direction:rtl;padding:24px;font-size:15px}h1{text-align:center;font-size:22px;margin:0 0 4px}h2{text-align:center;font-size:16px;font-weight:400;color:#555;margin:0 0 18px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:14px}.meta div{border-bottom:1px dotted #aaa;padding:4px 0}
    table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{border:1px solid #888;padding:5px 6px;text-align:center}th{background:#eee}
    .sig{display:flex;justify-content:space-between;margin-top:50px}.sig div{width:30%;text-align:center;border-top:1px solid #000;padding-top:6px}@media print{@page{margin:12mm}}</style></head><body>
    <h1>محضر إتلاف طبي رقم (${rep.report_no})</h1><h2>مصرف الدم الرئيسي — واسط</h2>
    <div class="meta"><div>تاريخ الإتلاف: <b>${fd(rep.report_date)}</b></div><div>طريقة الإتلاف: <b>${esc(rep.method)}</b></div>
    <div>المسؤول: <b>${esc(rep.officer_name)}</b></div><div>عدد القناني: <b>${rep.bottle_count}</b></div>${rep.notes?`<div style="grid-column:1/-1">ملاحظات: ${esc(rep.notes)}</div>`:''}</div>
    <table><thead><tr><th>#</th><th>رقم القنينة</th><th>النوع</th><th>الفصيلة</th><th>المكوّن</th><th>سبب التلف</th><th>تاريخ التلف</th></tr></thead><tbody>${tr}</tbody></table>
    <div class="sig"><div>المسؤول</div><div>عضو اللجنة</div><div>مدير المصرف</div></div></body></html>`);
  }catch(e){ toast('تعذّرت الطباعة: '+e.message,'error'); }
  finally{ load(false); }
}

// ───────────────────────── archive ─────────────────────────
async function dstLoadArchive(){
  const box=G('dst-archive'); box.innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  try{
    const reps=await _dstFetchAll(()=>db.from('destruction_reports').select('*').order('report_no',{ascending:false}));
    box.innerHTML = reps.length ? reps.map(r=>`<div class="flow-card">
      <div class="fc-av" style="font-size:26px">📄</div>
      <div style="flex:1"><div class="fc-name">محضر رقم ${r.report_no} — ${esc(r.method)}</div>
        <div class="fc-sub">${fd(r.report_date)} | ${fnum(r.bottle_count)} قنينة | ${esc(r.officer_name)}</div>${r.notes?`<div class="fc-sub">📝 ${esc(r.notes)}</div>`:''}</div>
      <div class="fc-act" style="display:flex;gap:4px"><button class="btn" style="font-size:14px;padding:6px 10px" onclick="dstShowReport('${r.id}')"><i class="ti ti-list"></i> القناني</button>
      <button class="btn" style="font-size:14px;padding:6px 10px" onclick="dstPrintReport('${r.id}')"><i class="ti ti-printer"></i></button></div></div>`).join('')
      : '<div class="empty"><i class="ti ti-archive"></i><p>لا توجد محاضر إتلاف بعد</p></div>';
  }catch(e){ box.innerHTML='<div class="empty"><i class="ti ti-alert-triangle"></i><p>تعذّر التحميل: '+esc(e.message||'')+'</p></div>'; }
}
async function dstShowReport(id){
  load(true);
  try{
    const rows=await _dstFetchAll(()=>db.from('blood_donations').select('id,bottle_number,blood_type,component_type,damage_reason,damaged_date').eq('destruction_report_id',id).order('bottle_number').order('id'));
    G('dstRepBody').innerHTML=rows.map(r=>`<div style="padding:8px 4px;border-bottom:1px solid #F1F5F9"><b>قنينة ${esc(r.bottle_number)}</b> — ${esc(r.blood_type||'—')} — ${esc(r.component_type||'دم كامل')}<div style="font-size:14px;color:#757575">${esc(r.damage_reason||'—')} | ${fd(r.damaged_date)}</div></div>`).join('')||'<div class="empty"><p>لا توجد قناني</p></div>';
    G('dstRepPrint').onclick=()=>dstPrintReport(id);
    G('dstRepModal').classList.add('on');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

// ───────────────────────── statistics ─────────────────────────
function dstStatsOpen(){
  const box=G('dst-stats');
  if(!G('dstAnchor')){
    box.innerHTML=`
      <div class="tabs" id="dstKinds" style="flex-wrap:wrap">${Object.entries(_DST_KINDS).map(([k,l])=>`<div class="tab" data-k="${k}" onclick="dstStatsKind('${k}')">${l}</div>`).join('')}</div>
      <div id="dstAnchorRow" style="display:flex;gap:6px;align-items:center;margin:10px 0">
        <button class="btn" onclick="dstStatsShift(-1)"><i class="ti ti-chevron-right"></i></button>
        <input type="date" id="dstAnchor" class="sinp" style="flex:1" onchange="dstStatsRun()">
        <button class="btn" onclick="dstStatsShift(1)"><i class="ti ti-chevron-left"></i></button></div>
      <div id="dstCustomRow" style="display:none;gap:6px;margin:10px 0"><input type="date" id="dstFrom" class="sinp" style="flex:1" onchange="dstStatsRun()"><input type="date" id="dstTo" class="sinp" style="flex:1" onchange="dstStatsRun()"></div>
      <div id="dstRange" style="font-size:15px;color:#6B7280;margin-bottom:8px"></div><div id="dstResult"></div>`;
    const t=_dstYmd(new Date()); G('dstAnchor').value=t; G('dstFrom').value=t; G('dstTo').value=t;
  }
  dstStatsKind(_dstKind);
}
function dstStatsKind(k){
  _dstKind=k;
  document.querySelectorAll('#dstKinds .tab').forEach(t=>t.classList.toggle('on',t.dataset.k===k));
  G('dstAnchorRow').style.display=k==='custom'?'none':'flex'; G('dstCustomRow').style.display=k==='custom'?'flex':'none';
  dstStatsRun();
}
function dstStatsShift(dir){ if(_dstKind==='custom') return; G('dstAnchor').value=dstShiftAnchor(_dstKind,G('dstAnchor').value||_dstYmd(new Date()),dir); dstStatsRun(); }
async function dstStatsRun(){
  const my=++_dstToken; let from,to;
  if(_dstKind==='custom'){ const f=G('dstFrom').value,t=G('dstTo').value; if(!f||!t) return; from=_dstParse(f); to=_dstParse(t); if(from>to)[from,to]=[to,from]; }
  else { const a=G('dstAnchor').value; if(!a) return; ({from,to}=dstPeriodRange(_dstKind,a)); }
  G('dstRange').textContent='من '+fd(_dstYmd(from))+' إلى '+fd(_dstYmd(to))+' (حسب تاريخ التلف)';
  G('dstResult').innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  try{
    const rows=await _dstFetchAll(()=>db.from('blood_donations').select('id,bottle_type,blood_type,component_type,damage_reason,destruction_report_id')
      .eq('status','damaged').eq('is_deleted',false).gte('damaged_date',_dstYmd(from)).lte('damaged_date',_dstYmd(to)).order('id'));
    if(my!==_dstToken) return;
    const a=dstAggregate(rows);
    const sec=(t,list)=>`<div class="rs"><div class="rs-t">${t}</div>${list.map(([k,v])=>`<div class="rr"><span>${esc(k)}</span><span class="rv">${fnum(v)}</span></div>`).join('')}</div>`;
    G('dstResult').innerHTML=!a.total?'<div class="empty"><i class="ti ti-search-off"></i><p>لا توجد قناني تالفة ضمن هذه الفترة</p></div>':`<div class="rpt"><div class="rpt-body">
      ${sec('الملخص',[['إجمالي التالف',a.total],['بانتظار الإتلاف',a.waiting],['تم إتلافه',a.destroyed]])}
      ${sec('حسب سبب التلف',a.byReason)}${sec('حسب المكوّن',a.byComp)}${sec('حسب نوع القنينة',a.byType)}${sec('حسب الفصيلة',a.byBlood)}</div></div>`;
  }catch(e){ if(my===_dstToken) G('dstResult').innerHTML='<div class="empty"><i class="ti ti-alert-triangle"></i><p>تعذّر التحميل: '+esc(e.message||'')+'</p></div>'; }
}
