// ================================================================
// WORKFLOW — CLASSIFICATION UNIT (وحدة التصنيف) — determines the blood type of pending
// bottles; does not touch virus testing at all (that's the virology unit's job now).
// ================================================================
function openClassificationExport(){
  openAdvExport({
    title:'تصدير — وحدة التصنيف', filename:'وحدة_التصنيف',
    table:'blood_donations',
    select:'bottle_number,bottle_type,blood_type,component_type,draw_date,status,donors(full_name)',
    dateField:'draw_date', nameField:'donors.full_name', orderBy:'bottle_number',
    filters:['dateRange','bottleType','bloodType','bottleRange','specificBottles','name'],
    headers:['رقم القنينة','اسم المتبرع','نوع القنينة','الفصيلة','المكوّن','الحالة','تاريخ السحب'],
    rowMap:r=>[r.bottle_number, r.donors?.full_name||'—', r.bottle_type, r.blood_type||'لم تُحدد', r.component_type||'دم كامل',
      AUDIT_STATUS_LABELS[r.status]||r.status, fd(r.draw_date)]
  });
}

async function loadClassification(){
  load(true);
  const{data}=await db.from('blood_donations')
    .select('id,bottle_number,bottle_type,donor_id,draw_date,donors(full_name)')
    .eq('status','pending_lab').is('blood_type',null).eq('is_deleted',false)
    .order('created_at',{ascending:true});
  load(false);
  const seen=new Set();
  const dedup=(data||[]).filter(r=>{
    const key=r.donor_id+'|'+r.bottle_number;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  if(!dedup.length){
    G('classificationList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد قناني بانتظار التصنيف</p></div>';
    return;
  }
  const bar=`<div id="cmBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px">
    <span id="cmBulkCount">0 محدد</span>
    <div style="display:flex;gap:6px">
      <button class="btn" style="background:#0369A1;color:#fff;border:none" onclick="openBulkClassificationModal()"><i class="ti ti-check"></i> تصنيف جماعي</button>
      <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.cm-chk').forEach(c=>c.checked=false);updateCmBulkBar()">إلغاء التحديد</button>
    </div>
  </div>`;
  G('classificationList').innerHTML=bar+dedup.map(r=>`<div class="flow-card">
    <input type="checkbox" class="cm-chk" value="${r.id}" onclick="updateCmBulkBar()" style="width:18px;height:18px;flex-shrink:0">
    <div class="fc-av">🩸</div>
    <div style="flex:1">
      <div class="fc-name">${esc(r.donors?.full_name||'—')}</div>
      <div class="fc-sub">قنينة: ${r.bottle_number||'—'} | ${r.bottle_type}</div>
    </div>
    <div class="fc-act">
      <button class="btn btn-p" onclick="openClassificationModal('${r.id}','${sq(r.donors?.full_name)}','${r.bottle_number||''}','${r.draw_date||''}')">
        <i class="ti ti-droplet"></i> تصنيف
      </button>
    </div>
  </div>`).join('');
  updateCmBulkBar();
}

function updateCmBulkBar(){
  const n=document.querySelectorAll('.cm-chk:checked').length;
  const bar=G('cmBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('cmBulkCount').textContent=n+' محدد';
}

function openBulkClassificationModal(){
  const ids=[...document.querySelectorAll('.cm-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  G('bcm-ids').value=ids.join(',');
  G('bcm-info').textContent=ids.length+' قنينة محددة';
  G('bcm-bt').value='';
  G('bulkCmModal').classList.add('on');
}

async function confirmBulkClassification(){
  const ids=G('bcm-ids').value.split(',').filter(Boolean);
  const bt=G('bcm-bt').value;
  if(!bt){ toast('يرجى اختيار فصيلة الدم','error'); return; }
  if(!IS_ONLINE){ toast('التصنيف الجماعي يحتاج اتصال بالإنترنت (استخدم التصنيف الفردي بدون نت)','error'); return; }
  load(true);
  try{
    for(const id of ids){
      await applyLabUpdate(id, {blood_type:bt});
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{bulk_classification_count:ids.length,blood_type:bt}});
    toast('✅ تم تصنيف '+ids.length+' قنينة بفصيلة '+bt,'success',4000);
    G('bulkCmModal').classList.remove('on');
    await loadClassification();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function openClassificationModal(id,name,bn,drawDate){
  G('cm-id').value=id;
  G('cm-donor-name').textContent=name;
  G('cm-bnum-big').textContent=bn||'—';
  G('cm-draw-date').textContent=drawDate?fd(drawDate):'—';
  G('cm-bt').value='';
  G('cmModal').classList.add('on');
}

async function saveClassification(){
  const id=G('cm-id').value, bt=G('cm-bt').value;
  if(!bt){ toast('يرجى اختيار فصيلة الدم','error'); return; }
  load(true);
  try{
    if(!IS_ONLINE){
      // Offline: queue the field update — same reasoning as virology's offline path, the
      // completion/rejection decision needs the real server state and is only made for real
      // when syncQueue() replays this through applyLabUpdate() once back online.
      await enqueueOp('lab', {donation_id:id, fieldUpdates:{blood_type:bt}});
      const q = await getPendingQueue();
      updateOfflineBar('offline', q.length+' عملية معلّقة');
      toast('💾 حُفظ بدون اتصال — سيُرسل تلقائياً عند عودة الإنترنت','warning',5000);
      G('cmModal').classList.remove('on');
      await loadClassification();
      load(false);
      return;
    }
    const{complete,effSer}=await applyLabUpdate(id, {blood_type:bt});
    if(complete && effSer==='Positive'){
      toast('⚠️ نتيجة الفحص موجبة — تم نقل المتبرع للمرفوضين دائماً','warning',5000);
    } else if(complete){
      toast('✅ اكتمل التصنيف — القنينة أُضيفت للخزين','success',4000);
    } else {
      toast('✅ تم حفظ الفصيلة — بانتظار وحدة الفيروسات','success',4000);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{blood_type:bt}});
    G('cmModal').classList.remove('on');
    await loadClassification();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}
