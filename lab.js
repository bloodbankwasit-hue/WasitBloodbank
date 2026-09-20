// ================================================================
// WORKFLOW — LAB (المختبر)
// ================================================================
async function loadLab(){
  load(true);
  const{data}=await db.from('blood_donations')
    .select('id,blood_type,bottle_number,bottle_type,donor_id,donation_date,draw_date,donors(full_name,birth_year,gender)')
    .eq('status','pending_lab').eq('is_deleted',false)
    .order('created_at',{ascending:true});
  load(false);
  // A single draw can produce more than one pending-lab row sharing the same donor + bottle
  // number (trima's two outputs) — the test is done once for the whole draw, so only one card
  // is shown per (donor, bottle number); testing it resolves every row behind it (see saveLab).
  const seen=new Set();
  const dedup=(data||[]).filter(r=>{
    const key=r.donor_id+'|'+r.bottle_number;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
  if(dedup.length){
    const bar=`<div id="labBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <span id="labBulkCount">0 محدد</span>
      <div style="display:flex;gap:6px">
        <button class="btn" style="background:#166534;color:#fff;border:none" onclick="openBulkLabModal()"><i class="ti ti-check"></i> فحص جماعي</button>
        <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.lb-chk').forEach(c=>c.checked=false);updateLabBulkBar()">إلغاء التحديد</button>
      </div>
    </div>`;
    G('labList').innerHTML=bar+dedup.map(r=>`<div class="flow-card">
      <input type="checkbox" class="lb-chk" value="${r.id}" onclick="updateLabBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">🔬</div>
      <div style="flex:1">
        <div class="fc-name">${esc(r.donors?.full_name||'—')}</div>
        <div class="fc-sub">قنينة: ${r.bottle_number||'—'} | ${r.bottle_type}</div>
      </div>
      <div class="fc-act">
        <button class="btn btn-p" onclick="openLabModal('${r.id}','${sq(r.donors?.full_name)}','${r.bottle_number||''}','${r.draw_date||''}')">
          <i class="ti ti-microscope"></i> فحص
        </button>
      </div>
    </div>`).join('');
  } else {
    G('labList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد عينات في الانتظار</p></div>';
  }
}

function updateLabBulkBar(){
  const n=document.querySelectorAll('.lb-chk:checked').length;
  const bar=G('labBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('labBulkCount').textContent=n+' محدد';
}
function openBulkLabModal(){
  const ids=[...document.querySelectorAll('.lb-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  G('blm-ids').value=ids.join(',');
  G('blm-info').textContent=ids.length+' قنينة محددة';
  G('blm-bt').value='';
  G('blm-allneg').checked=false;
  G('bulkLabModal').classList.add('on');
}
// Bulk lab only supports the All-Negative case (matching the common real scenario of testing
// a batch that's all clear) — a bulk Positive result isn't offered, since disease selection
// needs to be verified per bottle individually.
async function confirmBulkLab(){
  const ids=G('blm-ids').value.split(',').filter(Boolean);
  const bt=G('blm-bt').value;
  const allNeg=G('blm-allneg').checked;
  if(!bt && !allNeg){ toast('يرجى تحديد فصيلة أو تفعيل All-Negative على الأقل','error'); return; }
  load(true);
  try{
    for(const id of ids){
      const{data:cur}=await db.from('blood_donations').select('blood_type,serology_result,donor_id,bottle_number').eq('id',id).single();
      const effBt=bt||cur?.blood_type||null;
      const effSer=allNeg?'Negative':(cur?.serology_result||null);
      const complete=!!effBt&&!!effSer;
      const payload={};
      if(bt) payload.blood_type=bt;
      if(allNeg) payload.serology_result='Negative';
      if(complete) payload.status='in_stock';
      await db.from('blood_donations').update(payload).eq('id',id);
      if(complete && cur?.donor_id && cur?.bottle_number){
        await db.from('blood_donations').update({blood_type:effBt,serology_result:'Negative',status:'in_stock'})
          .eq('donor_id',cur.donor_id).eq('bottle_number',cur.bottle_number).eq('status','pending_lab').neq('id',id);
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{bulk_lab_count:ids.length,blood_type:bt,all_negative:allNeg}});
    toast('✅ تم تحديث '+ids.length+' قنينة','success',4000);
    G('bulkLabModal').classList.remove('on');
    await loadLab();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function openLabModal(id,name,bn,drawDate){
  G('lm-id').value=id;
  G('lm-donor-name').textContent=name;
  G('lm-bnum-big').textContent=bn||'—';
  G('lm-draw-date').textContent=drawDate?fd(drawDate):'—';
  G('lm-bt').value='';
  G('lm-allneg').checked=false;
  document.querySelectorAll('.lm-dis').forEach(c=>c.checked=false);
  G('labModal').classList.add('on');
  // Pre-fill with whatever a previous employee may have already saved (blood type
  // and test results can be entered by two different employees, in either order).
  try{
    const{data}=await db.from('blood_donations').select('blood_type,serology_result,serology_type').eq('id',id).single();
    if(data){
      if(data.blood_type) G('lm-bt').value=data.blood_type;
      if(data.serology_result==='Negative') G('lm-allneg').checked=true;
      else if(data.serology_result==='Positive' && data.serology_type){
        const parts=data.serology_type.split(',').map(s=>s.trim());
        document.querySelectorAll('.lm-dis').forEach(c=>{ if(parts.includes(c.value)) c.checked=true; });
      }
    }
  }catch(e){ /* pre-fill is a convenience only — ignore failures */ }
}

function lmAllNegChange(){
  if(G('lm-allneg').checked) document.querySelectorAll('.lm-dis').forEach(c=>c.checked=false);
}
function lmDiseaseChange(){
  if([...document.querySelectorAll('.lm-dis')].some(c=>c.checked)) G('lm-allneg').checked=false;
}

// Blood type and test results don't have to be entered by the same employee in the same
// visit — one employee may save just the type, another the tests, in either order. The
// donation only leaves 'pending_lab' once BOTH pieces are known (either just entered, or
// already saved earlier by someone else).
async function saveLab(){
  const id=G('lm-id').value, bt=G('lm-bt').value;
  const diseases=[...document.querySelectorAll('.lm-dis:checked')].map(c=>c.value);
  const allNeg=G('lm-allneg').checked;
  const testsGiven = allNeg || diseases.length>0;
  if(!bt && !testsGiven){ toast('يرجى تحديد الفصيلة أو نتيجة الفحوصات على الأقل','error'); return; }
  if(!IS_ONLINE){ toast('هذه الخطوة تحتاج اتصال بالإنترنت','error'); return; }
  load(true);
  try{
    const{data:cur}=await db.from('blood_donations').select('blood_type,serology_result,serology_type,donor_id,bottle_number').eq('id',id).single();
    const effBt = bt || cur?.blood_type || null;
    let effSer, effSerType;
    if(testsGiven){
      effSer = diseases.length ? 'Positive' : 'Negative';
      effSerType = diseases.length ? diseases.join(', ') : null;
    } else {
      effSer = cur?.serology_result || null;
      effSerType = cur?.serology_type || null;
    }
    const complete = !!effBt && !!effSer;
    const newStatus = complete ? (effSer==='Positive'?'rejected_positive':'in_stock') : 'pending_lab';

    const updatePayload={};
    if(bt) updatePayload.blood_type=bt;
    if(testsGiven){ updatePayload.serology_result=effSer; updatePayload.serology_type=effSerType; }
    if(complete) updatePayload.status=newStatus;

    const{error}=await db.from('blood_donations').update(updatePayload).eq('id',id);
    if(error) throw error;

    if(complete){
      // One draw event can produce more than one pending-lab row sharing the same bottle
      // number (e.g. trima's two outputs) — the test is done once, and the result applies
      // to every sibling still awaiting testing, linked by donor + bottle number.
      if(cur?.donor_id && cur?.bottle_number){
        await db.from('blood_donations').update({
          blood_type:effBt, serology_result:effSer, serology_type:effSerType, status:newStatus
        }).eq('donor_id',cur.donor_id).eq('bottle_number',cur.bottle_number).eq('status','pending_lab').neq('id',id);
      }
      if(effSer==='Positive'){
        const{data:don}=await db.from('blood_donations').select('donors(full_name)').eq('id',id).single();
        if(don?.donors?.full_name){
          await db.from('rejected_donors').insert({
            full_name:don.donors.full_name, rejection_reason:'إصابة: '+effSerType,
            rejection_date:new Date().toISOString().split('T')[0], rejection_type:'دائم',
            created_by:SES?.user?.id
          });
          await cacheRejectedDonors();
        }
        toast('⚠️ نتيجة موجبة — تم نقل المتبرع للمرفوضين دائماً','warning',5000);
      } else {
        toast('✅ اكتمل الفحص — القنينة أُضيفت للخزين','success',4000);
      }
    } else if(bt){
      toast('✅ تم حفظ الفصيلة — بانتظار نتيجة الفحوصات','success',4000);
    } else {
      toast('✅ تم حفظ نتيجة الفحوصات — بانتظار تحديد الفصيلة','success',4000);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:updatePayload});
    G('labModal').classList.remove('on');
    await loadLab();
  }catch(e){toast('خطأ: '+e.message,'error');}
  finally{load(false);}
}
