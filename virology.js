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
    // الأرشيف: تعديل نتيجة الفحص (سليمة أو مصابة) في أي وقت، ما لم تُجهَّز القنينة. (للمدير أو من لديه صلاحية الفيروسات)
    if(ctx.archive && m.serology_result && m.status!=='dispatched' && _vmCanEdit()) return `<button class="btn" onclick="openVirologyEdit('${m.id}','${sq(m.full_name)}','${m.bottle_number||''}','${m.draw_date||''}')" title="تعديل نتيجة الفحص"><i class="ti ti-edit"></i> تعديل</button>`;
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

function _vmCanEdit(){ return UPROF?.role==='admin' || (typeof hasPermission==='function' && hasPermission('virology')); }
let _vmEditing=null, _vmOld=null;
async function openVirologyModal(id,name,bn,drawDate){
  _vmEditing=null; _vmOld=null;
  const _w=G('vm-edit-wrap'); if(_w) _w.remove();
  const _t=document.querySelector('#vmModal .modal-title'); if(_t) _t.innerHTML='<i class="ti ti-microscope"></i> فحص الفيروسات';
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

// تعديل نتيجة فحص مسجّلة (سليمة ↔ مصابة، أو تغيير نوع الإصابة)
async function openVirologyEdit(id,name,bn,drawDate){
  if(!_vmCanEdit()){ toast('⛔ هذا الإجراء للمدير أو موظفي وحدة الفيروسات','error'); return; }
  await openVirologyModal(id,name,bn,drawDate);
  const{data:cur}=await db.from('blood_donations').select('serology_result,serology_type,status').eq('id',id).single();
  _vmEditing=id; _vmOld=cur||{};
  const t=document.querySelector('#vmModal .modal-title'); if(t) t.innerHTML='<i class="ti ti-edit"></i> تعديل نتيجة الفيروسات';
  const body=document.querySelector('#vmModal .modal-body');
  const w=document.createElement('div'); w.id='vm-edit-wrap'; w.style.cssText='margin-top:12px';
  w.innerHTML=`<div style="font-size:14px;color:#6B7280;margin-bottom:6px">النتيجة الحالية: <b style="color:${cur?.serology_result==='Positive'?'#BE123C':'#166534'}">${cur?.serology_result==='Positive'?('إصابة: '+esc(cur.serology_type||'')):'سالبة'}</b></div>
    <label style="font-size:16px;color:#616161;font-weight:700;display:block;margin-bottom:6px">سبب التعديل *</label>
    <textarea id="vm-edit-reason" rows="2" placeholder="مثلاً: خطأ إدخال / فحص ثانٍ سالب" style="width:100%;padding:10px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:16px;font-family:inherit"></textarea>
    ${cur?.serology_result==='Positive'?`<label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:15px"><input type="checkbox" id="vm-edit-restore" checked style="width:18px;height:18px;margin-top:2px"><span>إن صارت النتيجة سالبة: أرجع القنينة للمخزن المؤقت وارفع المنع الدائم عن المتبرع</span></label>`:''}`;
  body.appendChild(w);
}
async function saveVirologyEdit(id,ser,serType,note){
  const reason=(G('vm-edit-reason')?.value||'').trim();
  if(!reason){ toast('اكتب سبب التعديل','error'); return; }
  if(!IS_ONLINE){ toast('التعديل يحتاج اتصالاً بالإنترنت','warning'); return; }
  const restore=!!G('vm-edit-restore')?.checked;
  load(true);
  try{
    const{data:main,error:me}=await db.from('blood_donations').select('id,donor_id,bottle_number,serology_result,serology_type,status,donors(full_name)').eq('id',id).single();
    if(me||!main) throw me||new Error('القنينة غير موجودة');
    const oldSer=main.serology_result, oldType=main.serology_type||null, donorName=main.donors?.full_name||null;
    if(oldSer===ser && (oldType||null)===(serType||null)){ toast('لا يوجد تغيير في النتيجة','info'); return; }
    let rows=[main];
    if(main.donor_id && main.bottle_number){
      const{data:rr,error:re}=await db.from('blood_donations').select('id,status,blood_type,bottle_note,serology_result,destruction_report_id')
        .eq('donor_id',main.donor_id).eq('bottle_number',main.bottle_number).eq('is_deleted',false);
      if(re) throw re;
      rows=(rr||[]).filter(r=>r.serology_result || r.id===id);
      if((rr||[]).some(r=>r.status==='dispatched')) throw new Error('هذه القنينة أو أحد مكوّناتها مجهّزة — لا يمكن تعديل نتيجتها');
    }
    const today=new Date().toISOString().split('T')[0];
    const stamp='تعديل نتيجة الفيروسات ('+(oldSer==='Positive'?('إصابة: '+(oldType||'')):'سالبة')+' ← '+(ser==='Positive'?('إصابة: '+serType):'سالبة')+'): '+reason;
    for(const r of rows){
      const upd={serology_result:ser, serology_type:serType, serology_date:labToday(), bottle_note:((ser==='Positive'&&note)?note+' | ':(r.bottle_note?r.bottle_note+' | ':''))+stamp};
      if(ser==='Positive' && oldSer!=='Positive' && ['pending_release','in_stock'].includes(r.status)) upd.status='rejected_positive';
      if(ser==='Negative' && oldSer==='Positive' && restore){
        const back=r.blood_type?'pending_release':'pending_lab';
        if(r.status==='rejected_positive') upd.status=back;
        else if(r.status==='damaged' && !r.destruction_report_id){ upd.status=back; upd.damage_reason=null; upd.damaged_date=null; }
      }
      let{error:ue}=await db.from('blood_donations').update(upd).eq('id',r.id);
      if(ue && /serology_date/i.test(ue.message||'')){ delete upd.serology_date; ({error:ue}=await db.from('blood_donations').update(upd).eq('id',r.id)); }
      if(ue) throw ue;
    }
    let rejNote='';
    if(donorName){
      if(ser==='Positive' && oldSer!=='Positive'){
        const{data:ex}=await db.from('rejected_donors').select('id').eq('full_name',donorName).eq('rejection_reason','إصابة: '+serType).eq('is_deleted',false).limit(1);
        if(!(ex&&ex.length)){
          const{error:ie}=await db.from('rejected_donors').insert({full_name:donorName,rejection_reason:'إصابة: '+serType,rejection_date:today,rejection_type:'دائم',created_by:SES?.user?.id});
          if(ie) toast('⚠️ تعذّرت إضافة '+donorName+' للمرفوضين تلقائياً — أضفه يدوياً حالاً','error',10000); else { rejNote=' وأُضيف المتبرع للمرفوضين'; if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors(); }
        }
      } else if(ser==='Positive' && oldSer==='Positive'){
        await db.from('rejected_donors').update({rejection_reason:'إصابة: '+serType}).eq('full_name',donorName).eq('rejection_type','دائم').eq('rejection_reason','إصابة: '+oldType).eq('is_deleted',false);
        if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors();
      } else if(ser==='Negative' && oldSer==='Positive' && restore){
        const{data:others}=await db.from('blood_donations').select('id').eq('donor_id',main.donor_id).eq('serology_result','Positive').eq('is_deleted',false).limit(1);
        if(others&&others.length) toast('⚠️ لم يُرفع المنع: المتبرع عنده إصابة أخرى مسجّلة','warning',6000);
        else { await db.from('rejected_donors').update({is_deleted:true}).eq('full_name',donorName).eq('rejection_type','دائم').eq('rejection_reason','إصابة: '+oldType).eq('is_deleted',false); rejNote=' ورُفع المنع عن المتبرع'; if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors(); }
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,
      old_values:{serology_result:oldSer,serology_type:oldType},new_values:{serology_result:ser,serology_type:serType,reason,rows:rows.length,restored:restore}});
    G('vmModal').classList.remove('on'); _vmEditing=null;
    toast('✅ عُدّلت نتيجة الفحص'+rejNote,'success',5000);
    await FV.refresh('virology');
  }catch(e){ toast('خطأ: '+(e.message||e),'error'); }
  finally{ load(false); }
}
async function saveVirology(){
  const id=G('vm-id').value;
  const diseases=[...document.querySelectorAll('.vm-dis:checked')].map(c=>c.value);
  const allNeg=G('vm-allneg').checked;
  if(!allNeg && !diseases.length){ toast('يرجى تحديد All-Negative أو نوع الإصابة على الأقل','error'); return; }
  if(_vmEditing) return saveVirologyEdit(_vmEditing, diseases.length?'Positive':'Negative', diseases.length?diseases.join(', '):null, G('vm-note').value.trim());
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
