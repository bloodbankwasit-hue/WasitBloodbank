// ================================================================
// WORKFLOW — SEPARATION BOARD (الفصل) — tracks separable bottles from the moment
// draw finishes through lab clearance and on to the actual separation action.
// ================================================================
async function loadSeparationBoard(){
  load(true);
  const separableTypes=Object.keys(COMPONENT_RULES);
  // Shows the whole lifecycle in one place: un-separated whole blood (fresh from draw, tested
  // or not) AND its already-separated components (also tested or not) — so nothing here is
  // gated on lab status; separation itself can happen before or after testing.
  const{data}=await db.from('blood_donations')
    .select('id,bottle_number,bottle_type,blood_type,component_type,status,draw_date,campaign_name,donors(full_name)')
    .in('bottle_type', separableTypes).eq('is_deleted',false)
    .in('status',['pending_lab','in_stock'])
    .order('created_at',{ascending:true});
  load(false);
  const list=data||[];
  if(!list.length){
    G('sepBoardList').innerHTML='<div class="empty"><i class="ti ti-dna"></i><p>لا توجد قناني بمرحلة ما بعد السحب حالياً</p></div>';
    return;
  }
  G('sepBoardList').innerHTML=list.map(r=>{
    const name=r.donors?.full_name?esc(r.donors.full_name):(r.campaign_name?'🚐 '+esc(r.campaign_name):'—');
    const tested=r.status==='in_stock';
    const isWhole=r.component_type==='دم كامل' || !r.component_type;
    const canSeparate=isWhole; // separation works regardless of tested/untested
    return `<div class="flow-card">
      ${canSeparate?`<input type="checkbox" class="sep-chk" value="${r.id}" data-bt="${r.bottle_type}" onclick="updateSepBulkBar()" style="width:18px;height:18px;flex-shrink:0">`:'<span style="width:18px"></span>'}
      <div class="fc-av">${tested?'✅':'⏳'}</div>
      <div style="flex:1">
        <div class="fc-name">${name} — قنينة ${r.bottle_number||'—'}</div>
        <div class="fc-sub">${r.bottle_type} | ${r.component_type||'دم كامل'} | ${r.blood_type||'—'} | ${fd(r.draw_date)}</div>
        <div style="margin-top:4px">
          ${tested
            ? `<span class="pill pg">✅ سليمة${isWhole?' — جاهزة للفصل':''}</span>`
            : `<span class="pill py">⏳ لم تُفحص لحد الآن</span>`}
        </div>
      </div>
      <div class="fc-act">
        ${canSeparate
          ? `<button class="btn btn-p" style="font-size:12px;padding:8px 10px" onclick="openSeparateModalBulk(['${r.id}'],'${r.bottle_type}','${r.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
  updateSepBulkBar();
}

function updateSepBulkBar(){
  const n=document.querySelectorAll('.sep-chk:checked').length;
  const bar=G('sepBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('sepBulkCount').textContent=n+' محدد';
}
function sepBulkSeparate(){
  const checked=[...document.querySelectorAll('.sep-chk:checked')];
  if(!checked.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  const types=new Set(checked.map(c=>c.dataset.bt));
  if(types.size>1){ toast('يرجى تحديد قناني من نفس النوع بس للفصل الجماعي','error'); return; }
  const bt=[...types][0];
  openSeparateModalBulk(checked.map(c=>c.value), bt);
}

// ================================================================
// WORKFLOW — CAMPAIGNS (حملات التبرع)
// ================================================================
async function loadCampaigns(){
  load(true);
  const{data:camps}=await db.from('campaigns').select('*').order('campaign_date',{ascending:false});
  const{data:slots}=await db.from('campaign_slots').select('campaign_id,status');
  load(false);
  const counts={};
  (slots||[]).forEach(s=>{
    counts[s.campaign_id]=counts[s.campaign_id]||{reserved:0,drawn:0,damaged:0,returned:0};
    counts[s.campaign_id][s.status]=(counts[s.campaign_id][s.status]||0)+1;
  });
  const list=camps||[];
  if(!list.length){
    G('campArchiveList').innerHTML='<div class="empty"><i class="ti ti-bus"></i><p>لا توجد حملات مسجّلة بعد</p></div>';
    return;
  }
  G('campArchiveList').innerHTML=list.map(c=>{
    const cnt=counts[c.id]||{reserved:0,drawn:0,damaged:0,returned:0};
    const total=cnt.reserved+cnt.drawn+cnt.damaged+cnt.returned;
    return `<div class="flow-card" onclick="openCampaignTracking('${c.id}','${sq(c.name)}')" style="cursor:pointer">
      <div class="fc-av">🚐</div>
      <div style="flex:1">
        <div class="fc-name">${esc(c.name)}</div>
        <div class="fc-sub">${fd(c.campaign_date)} ${c.location?'| '+esc(c.location):''} | إجمالي: ${total} — بانتظار: ${cnt.reserved} — نجح: ${cnt.drawn} — تالف: ${cnt.damaged} — مرجّع: ${cnt.returned}</div>
      </div>
    </div>`;
  }).join('');
}

function showAddCampaignForm(){
  G('camp-name').value=''; G('camp-location').value='';
  G('camp-date').value=new Date().toISOString().split('T')[0];
  G('campReserveRows').innerHTML='';
  addCampReserveRow();
  G('camp-archive-view').style.display='none';
  G('camp-add-view').style.display='block';
}

function addCampReserveRow(){
  const div=document.createElement('div');
  div.className='camp-reserve-row';
  div.style.cssText='display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center';
  div.innerHTML=`
    <select class="crr-type" style="padding:10px;border:1.5px solid #EEF2F6;border-radius:10px;font-family:inherit;background:#fff">
      <option value="مفلتر">مفلتر</option><option value="ريفيوس">ريفيوس</option>
      <option value="رباعي">رباعي</option><option value="رباعي SAG">رباعي SAG</option>
      <option value="ثنائي">ثنائي</option><option value="أحادي">أحادي</option>
    </select>
    <input type="number" class="crr-qty" placeholder="العدد" min="1" style="padding:10px;border:1.5px solid #EEF2F6;border-radius:10px;font-family:inherit">
    <button class="ibtn" onclick="this.parentElement.remove()" style="color:#DC2626"><i class="ti ti-trash"></i></button>`;
  G('campReserveRows').appendChild(div);
}

// Reserves N bottle numbers for a given type: takes from the shared reuse pool first (numbers
// released earlier, e.g. from a medically-rejected draw), then draws the rest fresh from the
// active sequence, advancing it so normal reception automatically continues after this block.
async function reserveBottleNumbers(bottleType, qty){
  const numbers=[];
  const{data:pooled}=await db.from('bottle_number_pool').select('id,bottle_number')
    .eq('bottle_type',bottleType).order('bottle_number',{ascending:true}).limit(qty);
  if(pooled && pooled.length){
    for(const p of pooled){
      numbers.push(p.bottle_number);
      await db.from('bottle_number_pool').delete().eq('id',p.id);
    }
  }
  const remaining=qty-numbers.length;
  if(remaining>0){
    const{data:seqs}=await db.from('bottle_sequences').select('id,current_number,end_number')
      .eq('bottle_type',bottleType).eq('is_active',true).order('created_at',{ascending:false}).limit(1);
    if(!seqs||!seqs.length) throw new Error('لا يوجد تسلسل نشط لنوع '+bottleType);
    const seq=seqs[0];
    if(seq.current_number+remaining-1>seq.end_number) throw new Error('التسلسل المتبقي لنوع '+bottleType+' غير كافٍ لحجز '+remaining+' رقم');
    for(let i=0;i<remaining;i++) numbers.push(seq.current_number+i);
    await db.from('bottle_sequences').update({current_number:seq.current_number+remaining}).eq('id',seq.id);
  }
  return numbers;
}

async function saveCampaign(){
  const name=G('camp-name').value.trim();
  const date=G('camp-date').value;
  const location=G('camp-location').value.trim();
  if(!name||!date){ toast('يرجى تعبئة اسم الحملة وتاريخها','error'); return; }
  const reservations=[...document.querySelectorAll('.camp-reserve-row')].map(r=>({
    bottleType:r.querySelector('.crr-type').value,
    qty:parseInt(r.querySelector('.crr-qty').value)||0
  })).filter(r=>r.qty>0);
  if(!reservations.length){ toast('يرجى إضافة نوع قنينة وعدد صحيح على الأقل','error'); return; }
  load(true);
  try{
    const{data:camp,error:ce}=await db.from('campaigns').insert({
      name, campaign_date:date, location:location||null, created_by:SES?.user?.id
    }).select().single();
    if(ce) throw ce;
    let totalReserved=0;
    for(const r of reservations){
      const numbers=await reserveBottleNumbers(r.bottleType, r.qty);
      const slotRows=numbers.map(n=>({campaign_id:camp.id, bottle_type:r.bottleType, bottle_number:n, status:'reserved'}));
      const{error:se}=await db.from('campaign_slots').insert(slotRows);
      if(se) throw se;
      totalReserved+=numbers.length;
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'INSERT',table_name:'campaigns',record_id:camp.id,new_values:{name,reserved:totalReserved}});
    toast('✅ تم إنشاء الحملة وحجز '+totalReserved+' تسلسل','success',4000);
    G('camp-add-view').style.display='none';
    G('camp-archive-view').style.display='block';
    await loadCampaigns();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

let _currentCampaignId=null;
async function openCampaignTracking(id, name){
  _currentCampaignId=id;
  G('campTrackTitle').textContent='متابعة: '+(name||'');
  G('camp-archive-view').style.display='none';
  G('camp-add-view').style.display='none';
  G('camp-track-view').style.display='block';
  await refreshCampaignSlots();
}

async function refreshCampaignSlots(){
  load(true);
  const{data}=await db.from('campaign_slots').select('*').eq('campaign_id',_currentCampaignId).order('bottle_number',{ascending:true});
  load(false);
  const list=data||[];
  const cnt={reserved:0,drawn:0,damaged:0,returned:0};
  list.forEach(s=>cnt[s.status]=(cnt[s.status]||0)+1);
  G('campTrackSummary').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12.5px">
    <span class="pill py">بانتظار: ${cnt.reserved}</span>
    <span class="pill pg">نجح: ${cnt.drawn}</span>
    <span class="pill pr">تالف: ${cnt.damaged}</span>
    <span class="pill pb">مرجّع: ${cnt.returned}</span>
  </div>`;
  const pending=list.filter(s=>s.status==='reserved');
  if(!pending.length){
    G('campSlotsList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد أرقام بانتظار إجراء</p></div>';
    updateCampBulkBar();
    return;
  }
  G('campSlotsList').innerHTML=pending.map(s=>`
    <div class="flow-card">
      <input type="checkbox" class="camp-chk" value="${s.id}" onclick="updateCampBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">🩸</div>
      <div style="flex:1">
        <div class="fc-name">قنينة رقم ${s.bottle_number}</div>
        <div class="fc-sub">${s.bottle_type}</div>
      </div>
      <div class="fc-act" style="display:flex;gap:4px">
        <button class="ibtn" style="color:#166534" onclick="resolveCampSlots(['${s.id}'],'drawn')" title="نجح السحب"><i class="ti ti-check"></i></button>
        <button class="ibtn" style="color:#7F1D1D" onclick="resolveCampSlots(['${s.id}'],'damaged')" title="تلفت"><i class="ti ti-trash"></i></button>
        <button class="ibtn" style="color:#0369A1" onclick="resolveCampSlots(['${s.id}'],'returned')" title="إرجاع للمخزون"><i class="ti ti-corner-up-left"></i></button>
      </div>
    </div>`).join('');
  updateCampBulkBar();
}

function updateCampBulkBar(){
  const n=document.querySelectorAll('.camp-chk:checked').length;
  const bar=G('campBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('campBulkCount').textContent=n+' محدد';
}
function bulkCampAction(outcome){
  const ids=[...document.querySelectorAll('.camp-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  resolveCampSlots(ids, outcome);
}

// Single shared resolver for both the per-row buttons and the bulk bar.
// drawn    → creates the real blood_donations row (no donor — "متبرع حملة") and sends it to
//            the lab queue, exactly like a normal draw.
// damaged  → just recorded on the slot; no blood_donations row (nothing was actually usable).
// returned → the unused reserved number goes back into the shared reuse pool for the next
//            normal reception entry of that bottle type.
async function resolveCampSlots(slotIds, outcome){
  if(outcome==='damaged' && !confirm('تأكيد: '+slotIds.length+' قنينة تلفت أثناء السحب؟')) return;
  if(outcome==='returned' && !confirm('تأكيد إرجاع '+slotIds.length+' رقم غير مستخدم للمخزون العام؟')) return;
  load(true);
  try{
    const{data:campaign}=await db.from('campaigns').select('name,campaign_date,location').eq('id',_currentCampaignId).single();
    for(const id of slotIds){
      const{data:slot}=await db.from('campaign_slots').select('*').eq('id',id).single();
      if(!slot || slot.status!=='reserved') continue;
      if(outcome==='drawn'){
        const days=WHOLE_BLOOD_DAYS[slot.bottle_type] ?? 45;
        const e=new Date(campaign.campaign_date); e.setDate(e.getDate()+days);
        const{data:don,error:de}=await db.from('blood_donations').insert({
          donor_id:null, bottle_type:slot.bottle_type, bottle_number:slot.bottle_number,
          donation_type:'طوعي', campaign_name:campaign.name, campaign_date:campaign.campaign_date,
          campaign_location:campaign.location, draw_date:campaign.campaign_date,
          donation_date:campaign.campaign_date, expiry_date:e.toISOString().split('T')[0],
          status:'pending_lab', created_by:SES?.user?.id
        }).select().single();
        if(de) throw de;
        await db.from('campaign_slots').update({status:'drawn', donation_id:don.id}).eq('id',id);
      } else if(outcome==='damaged'){
        await db.from('campaign_slots').update({status:'damaged'}).eq('id',id);
      } else if(outcome==='returned'){
        await db.from('bottle_number_pool').insert({bottle_type:slot.bottle_type, bottle_number:slot.bottle_number, created_by:SES?.user?.id});
        await db.from('campaign_slots').update({status:'returned'}).eq('id',id);
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'campaign_slots',record_id:slotIds[0],new_values:{outcome,count:slotIds.length}});
    toast('✅ تم تحديث '+slotIds.length+' رقم','success',3500);
    await refreshCampaignSlots();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}
