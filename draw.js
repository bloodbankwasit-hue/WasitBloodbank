// ================================================================
// WORKFLOW — DRAW (السحب)
// ================================================================
async function loadDraw(){
  load(true);
  const{data}=await db.from('blood_donations')
    .select('id,donation_type,donation_date,donation_time,bottle_number,bottle_type,donors(full_name,birth_year,gender,mobile)')
    .eq('status','pending_draw').eq('is_deleted',false)
    .order('created_at',{ascending:true});
  load(false);
  if(data&&data.length){
    const bar=`<div id="drawBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px">
      <span id="drawBulkCount">0 محدد</span>
      <div style="display:flex;gap:6px">
        <button class="btn" style="background:#BE123C;color:#fff;border:none" onclick="openBulkDrawModal()"><i class="ti ti-check"></i> تأكيد السحب للكل</button>
        <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.dr-chk').forEach(c=>c.checked=false);updateDrawBulkBar()">إلغاء التحديد</button>
      </div>
    </div>`;
    G('drawList').innerHTML=bar+data.map(r=>{
      const isTrima=r.bottle_type==='تريما';
      return `<div class="flow-card">
      ${isTrima?'<span style="width:18px"></span>':`<input type="checkbox" class="dr-chk" value="${r.id}" onclick="updateDrawBulkBar()" style="width:18px;height:18px;flex-shrink:0">`}
      <div class="fc-av">🩸</div>
      <div style="flex:1">
        <div class="fc-name">${esc(r.donors?.full_name||'—')}</div>
        <div class="fc-sub">قنينة: ${r.bottle_number||'—'} (${r.bottle_type||'—'}) | ${r.donation_type}</div>
      </div>
      <div class="fc-act">
        <button class="btn btn-p" onclick="openDrawModal('${r.id}','${sq(r.donors?.full_name)}','${r.donation_type}','${r.bottle_number||''}','${r.bottle_type||''}')">
          <i class="ti ti-droplet"></i> سحب
        </button>
      </div>
    </div>`;}).join('');
  } else {
    G('drawList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا يوجد متبرعون في الانتظار</p></div>';
  }
}

function updateDrawBulkBar(){
  const n=document.querySelectorAll('.dr-chk:checked').length;
  const bar=G('drawBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('drawBulkCount').textContent=n+' محدد';
}
function openBulkDrawModal(){
  const ids=[...document.querySelectorAll('.dr-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد متبرع واحد على الأقل','error'); return; }
  G('bdm-ids').value=ids.join(',');
  G('bdm-info').textContent=ids.length+' متبرع محدد — سيُسجَّل نجاح السحب للكل بنفس التاريخ (لا يشمل قناني التريما)';
  G('bdm-date').value=new Date().toISOString().split('T')[0];
  G('bulkDrawModal').classList.add('on');
}
async function confirmBulkDraw(){
  const ids=G('bdm-ids').value.split(',').filter(Boolean);
  const draw=G('bdm-date').value;
  if(!draw){ toast('يرجى تحديد التاريخ','error'); return; }
  load(true);
  try{
    for(const id of ids){
      const{data:row}=await db.from('blood_donations').select('bottle_type').eq('id',id).single();
      const days=WHOLE_BLOOD_DAYS[row?.bottle_type] ?? 45;
      const e=new Date(draw); e.setDate(e.getDate()+days);
      await db.from('blood_donations').update({draw_date:draw,expiry_date:e.toISOString().split('T')[0],status:'pending_lab'}).eq('id',id);
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{status:'pending_lab',bulk_count:ids.length}});
    toast('✅ تم تأكيد السحب لـ'+ids.length+' متبرع','success',4000);
    G('bulkDrawModal').classList.remove('on');
    await loadDraw();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

// Bottle type & number are fixed at RECEPTION (not draw's responsibility) — this modal only
// displays them, prominently, alongside the donor's name.
async function openDrawModal(id,name,dtype,bn,btyp){
  G('dm-id').value=id;
  G('dm-btyp-val').value=btyp;
  G('dm-donor-name').textContent=name;
  G('dm-bnum-big').textContent=bn||'—';
  G('dm-btyp-sub').textContent=btyp||'—';
  G('dm-draw').value=new Date().toISOString().split('T')[0];
  G('dm-med-reason').value='سكري';
  G('dm-med-other').value='';
  G('dm-med-other-grp').style.display='none';
  toggleDmMedSection(false);
  const isTrima = btyp==='تريما';
  const trimaSec=G('dm-trima-section'); if(trimaSec) trimaSec.style.display=isTrima?'block':'none';
  const expGrp=G('dm-exp-grp'); if(expGrp) expGrp.style.display=isTrima?'none':'block';
  if(G('dm-trima-blood')) G('dm-trima-blood').checked=false;
  if(G('dm-trima-plt'))   G('dm-trima-plt').checked=false;
  calcDmExpiry();
  G('drawModal').classList.add('on');
}

function toggleDmMedSection(show){
  G('dm-med-section').style.display = show?'block':'none';
  G('dm-normal-actions').style.display = show?'none':'flex';
  G('dm-med-actions').style.display = show?'flex':'none';
}

function calcDmExpiry(){
  const draw=G('dm-draw').value; if(!draw) return;
  const bt=G('dm-btyp-val').value;
  if(bt==='تريما') return; // trima's expiry depends on which output is chosen — see confirmDrawSuccess
  const days=WHOLE_BLOOD_DAYS[bt] ?? 45;
  const e=new Date(draw); e.setDate(e.getDate()+days);
  G('dm-exp').value=e.toISOString().split('T')[0];
}

// Outcome 1: normal successful draw. Bottle type & number were already fixed at RECEPTION —
// draw only records that the draw actually happened (date, expiry) and forwards to the lab.
// Trima is a special case: the machine produces its output(s) directly at draw time (no later
// "separation" step), so the draw employee marks which of the two outputs were actually taken,
// and each becomes its own row heading to the lab — the original pending_draw row is marked
// 'separated' just like a normal post-lab separation would.
async function confirmDrawSuccess(){
  const id=G('dm-id').value, draw=G('dm-draw').value;
  if(!draw){ toast('يرجى تحديد تاريخ السحب','error'); return; }
  const btyp=G('dm-btyp-val').value;

  if(btyp==='تريما'){
    if(!IS_ONLINE){ toast('سحب التريما يحتاج اتصال بالإنترنت (ينشئ عدة قناني دفعة وحدة)','error'); return; }
    const wantBlood=G('dm-trima-blood').checked;
    const wantPlt=G('dm-trima-plt').checked;
    if(!wantBlood && !wantPlt){ toast('يرجى تحديد ناتج واحد على الأقل (دم مضغوط أو صفائح)','error'); return; }
    load(true);
    try{
      const{data:parent,error:pe}=await db.from('blood_donations')
        .select('donor_id,bottle_number,bottle_type,donation_type,created_by')
        .eq('id',id).single();
      if(pe) throw pe;
      const rows=[];
      TRIMA_OUTPUTS.forEach(o=>{
        if((o.type==='دم مضغوط' && !wantBlood) || (o.type==='صفائح دموية' && !wantPlt)) return;
        const e=new Date(draw); e.setDate(e.getDate()+o.days);
        rows.push({
          donor_id:parent.donor_id, bottle_number:parent.bottle_number, bottle_type:parent.bottle_type,
          donation_type:parent.donation_type, component_type:o.type, parent_donation_id:id,
          draw_date:draw, donation_date:draw, expiry_date:e.toISOString().split('T')[0],
          status:'pending_lab', created_by:SES?.user?.id
        });
      });
      const{error:ie}=await db.from('blood_donations').insert(rows);
      if(ie) throw ie;
      const{error:ue}=await db.from('blood_donations').update({draw_date:draw,status:'separated'}).eq('id',id);
      if(ue) throw ue;
      await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'separated',components:rows.map(r=>r.component_type).join(', ')}});
      toast('✅ تم تسجيل سحب التريما — '+rows.length+' مكوّن أُرسل للمختبر','success',4500);
      G('drawModal').classList.remove('on');
      await loadDraw();
    }catch(e){ toast('خطأ: '+e.message,'error'); }
    finally{ load(false); }
    return;
  }

  load(true);
  try{
    const exp=G('dm-exp').value;
    if(!IS_ONLINE){
      // Offline: queue the update instead of blocking — this is a single, well-defined write
      // (draw_date + expiry_date + status) against an already-existing row, so it's safe to
      // replay later exactly like reception's offline path does.
      await enqueueOp('draw', {donation_id:id, draw_date:draw, expiry_date:exp});
      const q = await getPendingQueue();
      updateOfflineBar('offline', q.length+' عملية معلّقة');
      toast('💾 حُفظ بدون اتصال — سيُرسل تلقائياً عند عودة الإنترنت','warning',5000);
      G('drawModal').classList.remove('on');
      await loadDraw();
      load(false);
      return;
    }
    const{error}=await db.from('blood_donations').update({
      draw_date:draw, expiry_date:exp, status:'pending_lab'
    }).eq('id',id);
    if(error) throw error;
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'pending_lab'}});
    toast('✅ تم تسجيل السحب — أُرسل للمختبر','success',4000);
    G('drawModal').classList.remove('on');
    const{data:don}=await db.from('blood_donations').select('*,donors(full_name,donor_number)').eq('id',id).single();
    if(don){ BCDATA=don; setTimeout(()=>printBC('full'),300); }
    await loadDraw();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

// Outcome 2: the bottle itself was damaged during the draw. Its number was already assigned
// at reception and stays consumed (a real, physically-labeled bottle was spoiled — it's never
// reused). The donor is not penalized with the full 77-day wait — checkDonationInterval()
// grants a 14-day window instead whenever the donor's most recent donation has status 'damaged'.
async function confirmDamagedBottle(){
  const id=G('dm-id').value, draw=G('dm-draw').value;
  if(!draw){ toast('يرجى تحديد تاريخ السحب','error'); return; }
  if(!confirm('تأكيد: القنينة تالفة؟ يُسمح لهذا المتبرع بالتبرع مجدداً بعد أسبوعين بدل 77 يوماً.')) return;
  load(true);
  try{
    const{error}=await db.from('blood_donations').update({
      draw_date:draw, status:'damaged'
    }).eq('id',id);
    if(error) throw error;
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'damaged'}});
    toast('⚠️ سُجّلت القنينة كتالفة — يُسمح بالتبرع مجدداً بعد أسبوعين','warning',5500);
    G('drawModal').classList.remove('on');
    await loadDraw();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

// Outcome 3: the donor turns out to be medically ineligible (discovered by the draw staff's
// questioning, e.g. diabetes/hypertension) before any blood was actually drawn. Unlike the
// other two outcomes, a bottle number WAS already consumed at reception (before this was
// known) — since no blood was ever taken, we release it back into a reuse pool
// (bottle_number_pool) instead of wasting it or risking a duplicate by rewinding the shared
// sequence counter. The next donor of the same bottle type gets this number first, and the
// main sequence continues untouched from wherever it currently is.
async function confirmMedicalReject(){
  const id=G('dm-id').value;
  const reasonSel=G('dm-med-reason').value;
  const other=G('dm-med-other').value.trim();
  if(reasonSel==='أخرى' && !other){ toast('يرجى توضيح السبب','error'); return; }
  const reason = reasonSel==='أخرى' ? other : reasonSel;
  if(!confirm('تأكيد رفض المتبرع مؤقتاً — السبب: '+reason+'؟')) return;
  load(true);
  try{
    const{data:d}=await db.from('blood_donations').select('donor_id,bottle_number,bottle_type,donors(full_name)').eq('id',id).single();
    const donorName = d?.donors?.full_name || '';
    const{error:rejErr}=await db.from('rejected_donors').insert({
      full_name:donorName, rejection_reason:reason,
      rejection_date:new Date().toISOString().split('T')[0], rejection_type:'مؤقت',
      created_by:SES?.user?.id
    });
    if(rejErr){
      console.error('rejected_donors insert failed:', rejErr);
      toast('⚠️ فشلت إضافة '+donorName+' لقائمة المرفوضين تلقائياً — أضفه يدوياً حالاً!','error',10000);
    }
    // Release the already-reserved bottle number back into the reuse pool
    if(d?.bottle_number && d?.bottle_type){
      await db.from('bottle_number_pool').insert({
        bottle_type:d.bottle_type, bottle_number:d.bottle_number, created_by:SES?.user?.id
      });
    }
    const{error}=await db.from('blood_donations').update({is_deleted:true}).eq('id',id);
    if(error) throw error;
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'rejected_medical',reason,released_bottle:d?.bottle_number}});
    await cacheRejectedDonors();
    toast('⛔ تم رفض المتبرع مؤقتاً — رقم القنينة '+(d?.bottle_number||'')+' أُعيد لإعادة الاستخدام','warning',5500);
    G('drawModal').classList.remove('on');
    await loadDraw();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

