// ================================================================
// WORKFLOW — VIROLOGY UNIT (وحدة الفيروسات) — tests pending bottles for infection; does not
// touch blood type at all (that's the classification unit's job, entirely separate now).
// ================================================================
async function loadVirology(){
  load(true);
  const{data}=await db.from('blood_donations')
    .select('id,bottle_number,bottle_type,donor_id,draw_date,donors(full_name)')
    .eq('status','pending_lab').is('serology_result',null).eq('is_deleted',false)
    .order('created_at',{ascending:true});
  load(false);
  // A single draw can produce more than one row sharing the same donor + bottle number
  // (trima's two outputs, or a component separated before testing) — the test is done once
  // for the whole draw, so only one card is shown; testing it resolves every sibling too.
  const seen=new Set();
  const dedup=(data||[]).filter(r=>{
    const key=r.donor_id+'|'+r.bottle_number;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  if(!dedup.length){
    G('virologyList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد عينات بانتظار الفحص</p></div>';
    return;
  }
  const bar=`<div id="vmBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px">
    <span id="vmBulkCount">0 محدد</span>
    <div style="display:flex;gap:6px">
      <button class="btn" style="background:#166534;color:#fff;border:none" onclick="openBulkVirologyModal()"><i class="ti ti-check"></i> فحص جماعي (All-Negative)</button>
      <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.vm-chk').forEach(c=>c.checked=false);updateVmBulkBar()">إلغاء التحديد</button>
    </div>
  </div>`;
  G('virologyList').innerHTML=bar+dedup.map(r=>`<div class="flow-card">
    <input type="checkbox" class="vm-chk" value="${r.id}" onclick="updateVmBulkBar()" style="width:18px;height:18px;flex-shrink:0">
    <div class="fc-av">🧪</div>
    <div style="flex:1">
      <div class="fc-name">${esc(r.donors?.full_name||'—')}</div>
      <div class="fc-sub">قنينة: ${r.bottle_number||'—'} | ${r.bottle_type}</div>
    </div>
    <div class="fc-act">
      <button class="btn btn-p" onclick="openVirologyModal('${r.id}','${sq(r.donors?.full_name)}','${r.bottle_number||''}','${r.draw_date||''}')">
        <i class="ti ti-microscope"></i> فحص
      </button>
    </div>
  </div>`).join('');
  updateVmBulkBar();
}

function updateVmBulkBar(){
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
  load(true);
  try{
    for(const id of ids){
      await applyLabUpdate(id, {serology_result:'Negative', serology_type:null});
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{bulk_virology_count:ids.length,all_negative:true}});
    toast('✅ تم فحص '+ids.length+' قنينة (All-Negative)','success',4000);
    G('bulkVmModal').classList.remove('on');
    await loadVirology();
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
  G('vmModal').classList.add('on');
  // Pre-fill if a previous employee already saved a result for this bottle (should be rare
  // since this unit only lists untested ones, but a sibling could have just been resolved).
  try{
    const{data}=await db.from('blood_donations').select('serology_result,serology_type').eq('id',id).single();
    if(data?.serology_result==='Negative') G('vm-allneg').checked=true;
    else if(data?.serology_result==='Positive' && data.serology_type){
      const parts=data.serology_type.split(',').map(s=>s.trim());
      document.querySelectorAll('.vm-dis').forEach(c=>{ if(parts.includes(c.value)) c.checked=true; });
    }
  }catch(e){ /* pre-fill is a convenience only */ }
}

function vmAllNegChange(){
  if(G('vm-allneg').checked) document.querySelectorAll('.vm-dis').forEach(c=>c.checked=false);
}
function vmDiseaseChange(){
  if([...document.querySelectorAll('.vm-dis')].some(c=>c.checked)) G('vm-allneg').checked=false;
}

async function saveVirology(){
  const id=G('vm-id').value;
  const diseases=[...document.querySelectorAll('.vm-dis:checked')].map(c=>c.value);
  const allNeg=G('vm-allneg').checked;
  if(!allNeg && !diseases.length){ toast('يرجى تحديد All-Negative أو نوع الإصابة على الأقل','error'); return; }
  if(!IS_ONLINE){ toast('هذه الخطوة تحتاج اتصال بالإنترنت','error'); return; }
  load(true);
  try{
    const ser = diseases.length ? 'Positive' : 'Negative';
    const serType = diseases.length ? diseases.join(', ') : null;
    const{complete}=await applyLabUpdate(id, {serology_result:ser, serology_type:serType});
    if(ser==='Positive'){
      toast('⚠️ نتيجة موجبة — تم نقل المتبرع للمرفوضين دائماً','warning',5000);
    } else if(complete){
      toast('✅ اكتمل الفحص — القنينة أُضيفت للخزين','success',4000);
    } else {
      toast('✅ تم حفظ نتيجة الفحوصات — بانتظار وحدة التصنيف','success',4000);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{serology_result:ser,serology_type:serType}});
    G('vmModal').classList.remove('on');
    await loadVirology();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}
