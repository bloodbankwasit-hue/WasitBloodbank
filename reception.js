// ================================================================
// DONOR AUTOCOMPLETE — Smooth & Auto-fill
// ================================================================
let _acTimer = null;

async function donorSearch(field, val){
  const listId = 'ac-'+field;
  const list   = G(listId);
  if(!list) return;
  // Hide other lists
  ['ac-name','ac-nid','ac-mob'].filter(id=>id!==listId)
    .forEach(id=>{ const e=G(id); if(e) e.classList.remove('show'); });

  const minLen = {name:3, nid:6, mob:7}[field]||3;
  if(!val||val.trim().length<minLen){ list.classList.remove('show'); return; }

  clearTimeout(_acTimer);
  _acTimer = setTimeout(async()=>{
    try{
      let q = db.from('donors')
        .select('id,full_name,birth_year,gender,mother_name,national_id,mobile,address,occupation,donor_number')
        .eq('is_deleted',false).limit(6);
      if(field==='name') q=q.ilike('full_name','%'+val.trim().replace(/ة/g,'ه')+'%');
      if(field==='nid')  q=q.eq('national_id',val.trim());
      if(field==='mob')  q=q.eq('mobile',val.trim());

      const{data}=await q;
      if(!data||!data.length){ list.classList.remove('show'); return; }

      // Auto-fill immediately if single match (NID or mobile)
      if(data.length===1 && (field==='nid'||field==='mob')){
        fillDonor(data[0]); return;
      }

      // Show compact list for multiple matches or name search
      list.innerHTML = data.map(d=>`
        <div class="ac-item" onmousedown="fillDonor(${JSON.stringify(d).replace(/"/g,'&quot;')})">
          <div class="ac-av">${esc(d.full_name.charAt(0))}</div>
          <div class="ac-info">
            <div class="ac-name">${esc(d.full_name)}</div>
            <div class="ac-sub">${esc(d.mobile||'—')} | ${esc(d.national_id||'—')}</div>
          </div>
        </div>`).join('');
      list.classList.add('show');
    }catch(e){ list.classList.remove('show'); }
  }, 250);
}

function fillDonor(d){
  if(G('rc-name'))  G('rc-name').value = d.full_name||'';
  if(G('rc-by'))    G('rc-by').value   = d.birth_year||'';
  if(G('rc-gen'))   G('rc-gen').value  = d.gender||'ذكر';
  if(G('rc-mom'))   G('rc-mom').value  = d.mother_name||'';
  if(G('rc-nid'))   G('rc-nid').value  = d.national_id||'';
  if(G('rc-mob'))   G('rc-mob').value  = d.mobile||'';
  if(G('rc-addr'))  G('rc-addr').value = d.address||'';
  if(G('rc-job'))   G('rc-job').value  = d.occupation||'';
  if(G('rc-donornum')) G('rc-donornum').value = d.donor_number||'تلقائي';
  calcRcAge();

  // Mark as returning donor
  const form=G('s-reception');
  if(form) form.dataset.existingDonorId=d.id;

  // Show filled banner with blood type if known
  const banner=G('rcFilledBanner');
  const txt=G('rcFilledText');
  if(banner&&txt){
    const btLabel = d.blood_type ? ` | فصيلة: ${d.blood_type}` : '';
    txt.textContent='✅ متبرع معروف: '+d.full_name+btLabel;
    banner.classList.add('show');
  }

  // Close all lists
  ['ac-name','ac-nid','ac-mob'].forEach(id=>{ const e=G(id); if(e) e.classList.remove('show'); });

  // Run both safety checks the instant a suggestion is picked, and pop a centered, hard-to-miss
  // modal right away if either applies — this is on top of (not instead of) the inline banners,
  // which stay as the ongoing indicator while the form is open and still catch a name typed by
  // hand without ever picking a suggestion.
  checkDonorSafetyOnSelect(d);
}

// Finds a matching donor for when the staff typed the name by hand instead of picking a
// suggestion from the list — without this, a manually-typed name that matches an existing
// donor silently creates a SECOND, separate donor record (same person, new id), which then
// breaks every check that depends on donor_id (the 77-day interval, blood-type history...).
// Matching is tiered by confidence, from strongest to weakest, and stops at the first hit:
//   1) exact national_id match
//   2) exact mobile match
//   3) normalized name match AND matching birth year together (never name alone — a shared
//      name is common in Iraq and must not silently merge two different people)
async function _findExistingDonorFallback(nm, by, nid, mob){
  if(nid){
    const{data}=await db.from('donors').select('id,full_name,donor_number,blood_type').eq('is_deleted',false).eq('national_id',nid).limit(1);
    if(data&&data.length) return data[0];
  }
  if(mob){
    const{data}=await db.from('donors').select('id,full_name,donor_number,blood_type').eq('is_deleted',false).eq('mobile',mob).limit(1);
    if(data&&data.length) return data[0];
  }
  if(nm && by){
    const firstWord=nm.trim().split(/\s+/)[0];
    if(firstWord.length>2){
      const{data}=await db.from('donors').select('id,full_name,birth_year,donor_number,blood_type')
        .eq('is_deleted',false).eq('birth_year',by).ilike('full_name','*'+firstWord+'*').limit(20);
      if(data&&data.length){
        const norm=s=>normalizeAr((s||'').replace(/\s+/g,' '));
        const nmNorm=norm(nm);
        const hit=data.find(r=>norm(r.full_name)===nmNorm);
        if(hit) return hit;
      }
    }
  }
  return null;
}

// The one place that actually queries rejected_donors — used both by the live-typing check
// (checkRejectedName) and by the immediate on-select check below, so they can never drift out
// of sync with each other.
async function _queryRejectedMatch(nm, nid, mob){
  if(nm.length<3) return null;
  if(IS_ONLINE){
    // rejected_donors has NO national_id/mobile columns at all — only full_name. Matching is
    // by name alone. (This was the actual root cause of every earlier attempt at this check
    // silently finding nothing: selecting/filtering on national_id/mobile against this table
    // always errored with "column does not exist", and that error was never being checked.)
    const SEL='full_name,rejection_reason,rejection_type';
    const firstWord = nm.trim().split(/\s+/)[0];
    if(firstWord.length<3) return null;
    const{data,error}=await db.from('rejected_donors').select(SEL).eq('is_deleted',false).ilike('full_name','*'+firstWord+'*').limit(20);
    if(error || !data || !data.length) return null;
    // A name match must NOT depend on exact whitespace/letter-variant matching — two
    // visually-identical Arabic names commonly differ in which letter variant was typed
    // (different alef forms, ى vs ي, ة vs ه) or in stray whitespace. normalizeAr() (used
    // elsewhere in the app, e.g. rare-donor search) already collapses exactly these variants.
    const norm=s=>normalizeAr((s||'').replace(/\s+/g,' '));
    const nmNorm=norm(nm);
    const exact = data.find(r=> norm(r.full_name)===nmNorm || norm(r.full_name).includes(nmNorm) || nmNorm.includes(norm(r.full_name)));
    return exact || null;
  }
  return await checkRejectedOffline(nm, nid, mob);
}

async function checkDonorSafetyOnSelect(d){
  const nm=d.full_name||'', nid=d.national_id||'', mob=d.mobile||'';
  let rejHit=null, intervalResult=null;
  try{
    [rejHit, intervalResult] = await Promise.all([
      _queryRejectedMatch(nm, nid, mob),
      d.id ? checkDonationInterval(d.id) : Promise.resolve(null)
    ]);
  }catch(e){
    toast('⚠️ تعذّر التحقق من حالة هذا المتبرع — '+e.message,'error',8000);
    return;
  }

  // Update the inline banners/blocking state too (still needed for the save-time block and as
  // a persistent reminder while the form stays open).
  const w=G('rejWarn');
  if(w){
    if(rejHit){
      G('rejWarnTitle').textContent='⛔ '+rejHit.full_name+' — '+(rejHit.rejection_type||'مرفوض');
      G('rejWarnReason').textContent='السبب: '+rejHit.rejection_reason;
      w.classList.add('show');
    } else w.classList.remove('show');
  }
  const iw=G('intervalWarn');
  if(iw){
    if(intervalResult && !intervalResult.allowed){
      const remaining=intervalResult.required-intervalResult.diffDays;
      G('intervalWarnTitle').textContent='⛔ لا يمكن التبرع — آخر تبرع منذ '+intervalResult.diffDays+' يوم فقط';
      G('intervalWarnReason').textContent='المدة الدنيا بين التبرعات '+intervalResult.required+' يوماً — يتبقى '+remaining+' يوم للتمكن من التبرع (آخر تبرع: '+intervalResult.lastDate+')';
      iw.style.display='flex'; iw.dataset.blocked='1';
    } else { iw.style.display='none'; iw.dataset.blocked=''; }
  }

  // Centered popup — immediate, impossible to miss. Being مصاب/مرفوض always takes priority
  // over a timing issue, since it's the more serious reason and staff need to see it first.
  if(rejHit){
    showIntervalBlockModal('⛔ هذا الشخص مصاب / مرفوض من التبرع ('+(rejHit.rejection_type||'مرفوض')+') — السبب: '+rejHit.rejection_reason);
  } else if(intervalResult && !intervalResult.allowed){
    const remaining=intervalResult.required-intervalResult.diffDays;
    showIntervalBlockModal('⛔ لا يمكن قبول تبرع هذا الشخص الآن — آخر تبرع له منذ '+intervalResult.diffDays+' يوم فقط (المطلوب '+intervalResult.required+' يوماً) — يتبقى '+remaining+' يوم.');
  }
}

function clearDonorFill(){
  const form=G('s-reception');
  if(form) delete form.dataset.existingDonorId;
  const banner=G('rcFilledBanner');
  if(banner) banner.classList.remove('show');
  if(G('rc-donornum')) fetchNextDonorNumberPreview();
  ['ac-name','ac-nid','ac-mob'].forEach(id=>{ const e=G(id); if(e) e.classList.remove('show'); });
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.ac-wrap'))
    ['ac-name','ac-nid','ac-mob'].forEach(id=>{ const e2=G(id); if(e2) e2.classList.remove('show'); });
});

function newDonor(){
  G('rcPrintModal').classList.remove('on');
  G('rcSaveBtn').style.display='flex';
  resetReception();
  _lastDonation = null;
}

// WORKFLOW — RECEPTION (الاستقبال)
// ================================================================
function setupReception(){
  if(G('rc-date')) G('rc-date').value=fd(new Date().toISOString().split('T')[0]);
  if(G('rc-time')) G('rc-time').value=new Date().toTimeString().substring(0,5);
  fetchNextDonorNumberPreview();
}

// Preview-only: shows the donor sequence number this NEW donor will likely get (based on the
// highest donor_number currently on file). The real, final number is always assigned by the
// database sequence at the moment of saving — this is just a live estimate for the employee to see.
async function fetchNextDonorNumberPreview(){
  const el=G('rc-donornum');
  if(!el) return;
  if(G('s-reception')?.dataset?.existingDonorId) return; // an existing donor's real number is already shown
  try{
    const{data}=await db.from('donors').select('donor_number').order('donor_number',{ascending:false}).limit(1);
    const next=(data && data.length && data[0].donor_number) ? data[0].donor_number+1 : 1;
    el.value=next;
  }catch(e){ /* preview only — ignore failures */ }
}

function getHospName(){
  const v=G('rc-hosp')?.value.trim()||'';
  return v==='أخرى' ? (G('rc-hosp-other')?.value.trim()||'') : v;
}

function toggleRcPat(){
  const isTaw = G('rc-dtype').value==='طوعي';
  ['rc-pat-grp','rc-hosp-grp'].forEach(id=>{
    const e=G(id); if(e) e.style.display=isTaw?'none':'flex';
  });
}

function calcRcAge(){
  const by=parseInt(G('rc-by').value);
  if(by>1900&&by<2010) G('rc-age').value=(new Date().getFullYear()-by)+' سنة';
}

async function checkRejectedName(){
  const nm  = G('rc-name').value.trim();
  const nid = G('rc-nid')?.value.trim()||'';
  const mob = G('rc-mob')?.value.trim()||'';
  const w   = G('rejWarn');
  const hit = await _queryRejectedMatch(nm, nid, mob);

  if(hit){
    G('rejWarnTitle').textContent='⛔ '+hit.full_name+' — '+(hit.rejection_type||'مرفوض');
    G('rejWarnReason').textContent='السبب: '+hit.rejection_reason;
    w.classList.add('show');
  } else {
    w.classList.remove('show');
  }
}

async function saveReception(){
  if(G('rejWarn').classList.contains('show')){
    toast('المتبرع مرفوض — لا يمكن المتابعة','error'); return;
  }
  // Block if 77-day interval not met (UI-detected case: donor picked from autocomplete)
  const _iw=G('intervalWarn');
  if(_iw && _iw.dataset.blocked==='1'){
    showIntervalBlockModal('⛔ لا يمكن الحفظ — لم تمر 77 يوماً على آخر تبرع لهذا المتبرع.');
    return;
  }
  const nm=G('rc-name').value.trim(), by=parseInt(G('rc-by').value);
  if(!nm||!by){ toast('يرجى تعبئة الاسم وسنة التولد','error'); return; }
  const _mobVal=G('rc-mob')?.value.trim()||'';
  if(_mobVal && !/^07[0-9]{9}$/.test(_mobVal)){ toast('رقم الموبايل يجب أن يكون 11 رقم ويبدأ بـ 07','error'); return; }
  const _nidVal=G('rc-nid')?.value.trim()||'';
  if(_nidVal && _nidVal.length!==12){ toast('رقم البطاقة الوطنية يجب أن يكون 12 رقم','error'); return; }
  load(true);
  // Safety net: re-check by national ID / mobile even if no autocomplete suggestion was picked
  const _intervalBlock = await checkIntervalBeforeSave(G('rc-nid')?.value, G('rc-mob')?.value);
  if(_intervalBlock){ load(false); showIntervalBlockModal(_intervalBlock.message); return; }
  try{
    const btype = G('rc-btype')?.value;
    const bnum  = parseInt(G('rc-bnum')?.value)||null;
    const seqId = G('rc-bnum')?.dataset?.seqId;
    const poolId = G('rc-bnum')?.dataset?.poolId;
    if(!btype){ toast('يرجى اختيار نوع القنينة','error'); load(false); return; }
    if(!bnum){  toast('يرجى اختيار نوع القنينة للحصول على الرقم','error'); load(false); return; }

    const payload = {
      full_name:nm, birth_year:by, gender:G('rc-gen').value,
      mother_name:G('rc-mom').value.trim()||null,
      national_id:G('rc-nid').value.trim()||null,
      mobile:G('rc-mob').value.trim()||null,
      address:G('rc-addr').value.trim()||null,
      occupation:G('rc-job').value.trim()||null,
      donation_type:G('rc-dtype').value,
      patient_name:G('rc-pat').value.trim()||null,
      hospital_name:getHospName()||null,
      donation_date:new Date().toISOString().split('T')[0],
      donation_time:new Date().toTimeString().substring(0,5),
      bottle_type:btype,
      bottle_number:bnum,
      seq_id:seqId,
      pool_id:poolId,
      created_by:SES?.user?.id
    };

    if(!IS_ONLINE){
      // Offline: save to queue
      await enqueueOp('reception', payload);
      const q = await getPendingQueue();
      updateOfflineBar('offline', q.length+' عملية معلّقة');
      toast('💾 حُفظ بدون اتصال — سيُرسل تلقائياً عند عودة الإنترنت','warning',5000);
      resetReception();
    } else {
      // Online: send directly
      // Check if existing donor selected via autocomplete — or, if not, whether one can be
      // found anyway (see _findExistingDonorFallback for why this matters).
      let existingId = G('s-reception')?.dataset?.existingDonorId;
      if(!existingId){
        const fallbackMatch = await _findExistingDonorFallback(nm, by, payload.national_id, payload.mobile);
        if(fallbackMatch){
          existingId = fallbackMatch.id;
          toast('ℹ️ تم التعرف على متبرع معروف تلقائياً: '+fallbackMatch.full_name,'info',4000);
        }
      }
      let dn;
      if(existingId){
        // Update existing donor with any newly filled fields
        const updateFields = {};
        if(payload.mother_name)  updateFields.mother_name  = payload.mother_name;
        if(payload.national_id)  updateFields.national_id  = payload.national_id;
        if(payload.mobile)       updateFields.mobile        = payload.mobile;
        if(payload.address)      updateFields.address       = payload.address;
        if(payload.occupation)   updateFields.occupation    = payload.occupation;
        if(payload.birth_year)   updateFields.birth_year    = payload.birth_year;

        if(Object.keys(updateFields).length > 0){
          await db.from('donors').update(updateFields).eq('id', existingId);
        }
        dn = {id: existingId};
      } else {
        const{data:nd,error:de}=await db.from('donors').insert({
          full_name:payload.full_name, birth_year:payload.birth_year, gender:payload.gender,
          mother_name:payload.mother_name, national_id:payload.national_id,
          mobile:payload.mobile, address:payload.address, occupation:payload.occupation,
          created_by:payload.created_by
        }).select().single();
        if(de) throw de;
        dn = nd;
      }
      const{data:don,error:doe}=await db.from('blood_donations').insert({
        donor_id:dn.id, bottle_type:btype, bottle_number:bnum, donation_type:payload.donation_type,
        patient_name:payload.patient_name, hospital_name:payload.hospital_name,
        donation_date:payload.donation_date, donation_time:payload.donation_time,
        blood_pressure:G('rc-bp').value.trim()||null,
        pulse:parseInt(G('rc-pulse').value)||null,
        temperature:parseFloat(G('rc-temp').value)||null,
        weight:parseFloat(G('rc-weight').value)||null,
        hemoglobin:parseFloat(G('rc-hgb').value)||null,
        status:'pending_draw', created_by:payload.created_by
      }).select().single();
      if(doe) throw doe;
      await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'INSERT',table_name:'blood_donations',record_id:don.id,new_values:{donor:nm,status:'pending_draw',bottle:bnum}});
      // Consume the bottle number: from the reuse pool if that's where it came from,
      // otherwise advance the main sequence.
      if(payload.pool_id){
        await db.from('bottle_number_pool').delete().eq('id', payload.pool_id);
      } else if(payload.seq_id){
        await db.from('bottle_sequences')
          .update({current_number: bnum+1})
          .eq('id', payload.seq_id);
      }
      // donor_number ("رقم الاستمارة") — the insert above returns it for a brand-new donor;
      // for an existing donor picked via autocomplete, dn only has {id}, so fetch it.
      let donorNumber = dn.donor_number;
      if(donorNumber==null){
        const{data:dRow}=await db.from('donors').select('donor_number').eq('id',dn.id).single();
        donorNumber = dRow?.donor_number ?? null;
      }
      // Store for printing
      _lastDonation = {
        donor_name:nm, bottle_number:bnum,
        bottle_type:btype,
        donor_number:donorNumber,
        donation_date:payload.donation_date,
        donation_time:payload.donation_time,
        birth_year:by,
        gender:G('rc-gen').value,
        mobile:G('rc-mob').value.trim(),
        national_id:G('rc-nid').value.trim(),
        mother_name:G('rc-mom').value.trim(),
        address:G('rc-addr').value.trim(),
        occupation:G('rc-job').value.trim(),
        donation_type:G('rc-dtype').value,
        patient_name:G('rc-pat').value.trim(),
        hospital_name:getHospName(),
        blood_pressure:G('rc-bp').value.trim(),
        pulse:G('rc-pulse').value,
        temperature:G('rc-temp').value,
        weight:G('rc-weight').value,
        hemoglobin:G('rc-hgb').value,
        expiry_date:'', // will calculate from bottle type
      };
      // Show print options as a centered popup instead of resetting the form
      G('rcPrintModal').classList.add('on');
      G('rcSaveBtn').style.display='none';
      toast('✅ تم الحفظ — رقم القنينة: '+bnum,'success',4000);
    }
  }catch(e){toast('خطأ: '+e.message,'error');}
  finally{load(false);}
}

function resetReception(){
  ['rc-name','rc-by','rc-age','rc-mom','rc-nid','rc-mob','rc-addr','rc-job','rc-pat','rc-hosp','rc-hosp-other','rc-bp','rc-pulse','rc-temp','rc-weight','rc-hgb'].forEach(id=>{const e=G(id);if(e)e.value='';});
  const _ho=G('rc-hosp-other'); if(_ho) _ho.style.display='none';
  if(G('rc-date')){ const t=new Date().toISOString().split('T')[0]; G('rc-date').value=fd(t); }
  if(G('rc-time')){ G('rc-time').value=new Date().toTimeString().substring(0,5); }
  fetchNextDonorNumberPreview();
  if(G('rc-btype')) G('rc-btype').value='';
  if(G('rc-bnum'))  { G('rc-bnum').value=''; G('rc-bnum').dataset.seqId=''; G('rc-bnum').dataset.poolId=''; }
  const iw2=G('intervalWarn'); if(iw2){ iw2.style.display='none'; iw2.dataset.blocked=''; }
  G('rc-dtype').value='تعويضي';
  G('rejWarn').classList.remove('show');
  toggleRcPat();
}
