// ================================================================
// WORKFLOW — VIROLOGY UNIT (وحدة الفيروسات) — tests pending bottles for infection; does not
// touch blood type at all (that's the classification unit's job, entirely separate now).
// ================================================================
function openVirologyExport(){
  openAdvExport({
    title:'تصدير — وحدة الفيروسات', filename:'وحدة_الفيروسات',
    table:'blood_donations',
    select:'bottle_number,bottle_type,blood_type,component_type,draw_date,serology_result,serology_type,status,donors(full_name)',
    dateField:'draw_date', nameField:'donors.full_name', orderBy:'bottle_number',
    filters:['dateRange','bottleType','bloodType','bottleRange','specificBottles','name'],
    headers:['رقم القنينة','اسم المتبرع','نوع القنينة','الفصيلة','المكوّن','نتيجة الفحص','نوع الفحص','تاريخ السحب'],
    rowMap:r=>[r.bottle_number, r.donors?.full_name||'—', r.bottle_type, r.blood_type||'—', r.component_type||'دم كامل',
      r.serology_result?(r.serology_result==='Negative'?'سالبة':'موجبة'):'لم يُفحص', r.serology_type||'—', fd(r.draw_date)]
  });
}

// عرض الاستمارات (راجع forms-view.js): أخضر = جاهز، إطار أحمر = بانتظار السحب، رمادي ✓ = أُنجز، أحمر مظلل = خرج
const VIR_FV = {
  unit:'virology', host:'virologyList', groups:['T','R','B'], chk:'vm-chk', onSel:'updateVmBulkBar', bigBottle:true,
  // أصل التريما يُخفى (ناتجاه يظهران كقنينة واحدة) والفحص يتم مرة واحدة للسحبة
  filter:m=>!(m.bottle_type==='تريما' && m.status==='separated' && !m.parent_donation_id),
  dedup:m=>m.donor_id+'|'+m.bottle_number,
  stateOf(m){
    const done=!!m.serology_result;
    const note=(m.bottle_note||'').replace(/^رفض طبي:\s*/,'');
    if(m.exit_reason==='medical_reject') return {k:'excl',t:'⛔ مرفوض طبياً'+(note?': '+note:'')};
    if(m.status==='damaged' && !done) return {k:'excl',t:'⛔ تالف'+(note?': '+note:'')};
    if(m.status==='pending_draw') return {k:'notready',t:'بانتظار السحب'};
    if(m.serology_result==='Positive') return {k:'excl',t:'🦠 إصابة: '+(m.serology_type||'')};
    if(done) return {k:'done',t:'✓ فُحصت: '+(m.serology_result==='Negative'?'سالبة':'موجبة')};
    if(m.status==='pending_lab') return {k:'ready',t:''};
    return {k:'done',t:'—'};
  },
  workDate:m=>m.serology_date,
  sub:m=>m.bottle_type||'',
  bulkBar:()=>`<div id="vmBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px">
    <span id="vmBulkCount">0 محدد</span>
    <div style="display:flex;gap:6px">
      <button class="btn" style="background:#166534;color:#fff;border:none" onclick="openBulkVirologyModal()"><i class="ti ti-check"></i> فحص جماعي (All-Negative)</button>
      <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.vm-chk').forEach(c=>c.checked=false);updateVmBulkBar()">إلغاء التحديد</button>
    </div></div>`,
  actions(m,st,ctx){
    if(st.k==='ready') return `<button class="btn btn-p" onclick="openVirologyModal('${m.id}','${sq(m.full_name)}','${m.bottle_number||''}','${m.draw_date||''}')"><i class="ti ti-microscope"></i> فحص</button>`;
    // الأرشيف: تعديل في نفس يوم العمل فقط وقبل تثبيتها في المخزن
    if(ctx.canEdit && m.status==='pending_release') return `<button class="btn" onclick="openVirologyModal('${m.id}','${sq(m.full_name)}','${m.bottle_number||''}','${m.draw_date||''}')" title="تعديل (نفس يوم العمل فقط)"><i class="ti ti-edit"></i></button>`;
    return '';
  },
  // سجلات بلا استمارة: قديمة (بأسماء) + قناني الحملات (مجلدات باسم الحملة)
  async legacy(){
    const{data}=await db.from('blood_donations')
      .select('id,bottle_number,bottle_type,donor_id,draw_date,campaign_name,donors(full_name)')
      .eq('status','pending_lab').is('serology_result',null).eq('is_deleted',false).is('collection_form_id',null)
      .order('created_at',{ascending:true});
    const seen=new Set(), rows=(data||[]).filter(r=>{ const k=(r.donor_id||r.campaign_name)+'|'+r.bottle_number; if(seen.has(k)) return false; seen.add(k); return true; });
    if(!rows.length) return '';
    const row=r=>`<div class="flow-card">
      <input type="checkbox" class="vm-chk" value="${r.id}" onclick="updateVmBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">${BAG}</div>
      <div style="flex:1"><div class="fc-name fc-bn">${r.bottle_number||'—'}</div><div class="fc-sub fc-dn">${esc(r.donors?.full_name||'—')} | ${r.bottle_type}</div></div>
      <div class="fc-act"><button class="btn btn-p" onclick="openVirologyModal('${r.id}','${sq(r.donors?.full_name)}','${r.bottle_number||''}','${r.draw_date||''}')"><i class="ti ti-microscope"></i> فحص</button></div></div>`;
    const camp=rows.filter(r=>!r.donor_id), old=rows.filter(r=>r.donor_id);
    return '<div id="vmBulkBar-l" style="display:none"></div>'
      + FV.folders(camp,{chk:'vm-chk',onSel:'updateVmBulkBar',bulkFn:'openBulkVirologyModal()',bulkLabel:'فحص جماعي (All-Negative) للمحدد',row})
      + (old.length?'<div style="margin:14px 0 6px;font-weight:700;color:#6B7280">بدون استمارة (سجلات قديمة)</div>'+old.map(row).join(''):'');
  }
};
async function loadVirology(){ await FV.show(VIR_FV); }

function updateVmBulkBar(){
  syncSelAll('vm-chk');
  const n=document.querySelectorAll('.vm-chk:checked').length;
  const bar=G('vmBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('vmBulkCount').textContent=n+' محدد';
}

function openBulkVirologyModal(){
  const ids=[...document.querySelectorAll('.vm-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  G('bvm-ids').value=ids.join(',');
  G('bvm-info').textContent=ids.length+' قنينة محددة';
  G('bvm-allneg').checked=true;
  G('bulkVmModal').classList.add('on');
}

// Bulk only supports All-Negative (the common real scenario of clearing a batch) — a bulk
// Positive result isn't offered, since disease selection needs verifying per bottle.
async function confirmBulkVirology(){
  const ids=G('bvm-ids').value.split(',').filter(Boolean);
  if(!G('bvm-allneg').checked){ toast('يرجى تفعيل All-Negative للمتابعة','error'); return; }
  if(!IS_ONLINE){ toast('الفحص الجماعي يحتاج اتصال بالإنترنت (استخدم الفحص الفردي بدون نت)','error'); return; }
  load(true);
  try{
    for(const id of ids){
      await applyLabUpdate(id, {serology_result:'Negative', serology_type:null});
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{bulk_virology_count:ids.length,all_negative:true}});
    toast('✅ تم فحص '+ids.length+' قنينة (All-Negative)','success',4000);
    G('bulkVmModal').classList.remove('on');
    await FV.refresh('virology');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function openVirologyModal(id,name,bn,drawDate){
  G('vm-id').value=id;
  G('vm-donor-name').textContent=name;
  G('vm-bnum-big').textContent=bn||'—';
  G('vm-draw-date').textContent=drawDate?fd(drawDate):'—';
  G('vm-allneg').checked=false;
  document.querySelectorAll('.vm-dis').forEach(c=>c.checked=false);
  G('vm-note').value=''; vmNoteToggle();
  G('vmModal').classList.add('on');
  // Pre-fill if a previous employee already saved a result for this bottle (should be rare
  // since this unit only lists untested ones, but a sibling could have just been resolved).
  try{
    const{data}=await db.from('blood_donations').select('serology_result,serology_type,bottle_note').eq('id',id).single();
    if(data?.serology_result==='Negative') G('vm-allneg').checked=true;
    else if(data?.serology_result==='Positive' && data.serology_type){
      const parts=data.serology_type.split(',').map(s=>s.trim());
      document.querySelectorAll('.vm-dis').forEach(c=>{ if(parts.includes(c.value)) c.checked=true; });
      G('vm-note').value=data.bottle_note||''; vmNoteToggle();
    }
  }catch(e){ /* pre-fill is a convenience only */ }
}

// The note box exists only for a POSITIVE result (some disease ticked).
function vmNoteToggle(){
  G('vm-note-grp').style.display = [...document.querySelectorAll('.vm-dis')].some(c=>c.checked) ? 'block' : 'none';
}
function vmAllNegChange(){
  if(G('vm-allneg').checked) document.querySelectorAll('.vm-dis').forEach(c=>c.checked=false);
  vmNoteToggle();
}
function vmDiseaseChange(){
  if([...document.querySelectorAll('.vm-dis')].some(c=>c.checked)) G('vm-allneg').checked=false;
  vmNoteToggle();
}

async function saveVirology(){
  const id=G('vm-id').value;
  const diseases=[...document.querySelectorAll('.vm-dis:checked')].map(c=>c.value);
  const allNeg=G('vm-allneg').checked;
  if(!allNeg && !diseases.length){ toast('يرجى تحديد All-Negative أو نوع الإصابة على الأقل','error'); return; }
  load(true);
  try{
    const ser = diseases.length ? 'Positive' : 'Negative';
    const serType = diseases.length ? diseases.join(', ') : null;
    const fieldUpdates = {serology_result:ser, serology_type:serType, serology_date:labToday()};
    const note = G('vm-note').value.trim();
    if(ser==='Positive' && note) fieldUpdates.bottle_note = note;   // only sent when written
    if(!IS_ONLINE){
      // Offline: queue just the field update. The "is this donation now fully complete?" and
      // "does a positive result need adding to rejected_donors?" decisions both depend on
      // reading the donation's CURRENT state (e.g. has classification already set blood_type?)
      // — that can only be answered correctly against the real server state, so syncQueue()
      // replays this through applyLabUpdate() for real once back online, instead of guessing
      // the outcome here.
      await enqueueOp('lab', {donation_id:id, fieldUpdates});
      const q = await getPendingQueue();
      updateOfflineBar('offline', q.length+' عملية معلّقة');
      toast('💾 حُفظ بدون اتصال — سيُرسل تلقائياً عند عودة الإنترنت (بما فيها إضافة المرفوضين لو موجبة)','warning',6000);
      G('vmModal').classList.remove('on');
      await FV.refresh('virology');
      load(false);
      return;
    }
    const{complete}=await applyLabUpdate(id, fieldUpdates);
    if(ser==='Positive'){
      toast('⚠️ نتيجة موجبة — تم نقل المتبرع للمرفوضين دائماً','warning',5000);
    } else if(complete){
      toast('✅ اكتمل الفحص — القنينة أُضيفت للخزين','success',4000);
    } else {
      toast('✅ تم حفظ نتيجة الفحوصات — بانتظار وحدة التصنيف','success',4000);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:fieldUpdates});
    G('vmModal').classList.remove('on');
    await FV.refresh('virology');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}
