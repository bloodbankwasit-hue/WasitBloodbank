// ================================================================
// INFECTED + REJECTED — three modes: المصابون (from blood_donations, read-only),
// مرفوضون دائماً and مرفوضون مؤقتاً (both from rejected_donors, split by rejection_type).
// The search box works across BOTH rejected types regardless of which tab is active, and
// labels each result with its actual type — the tabs are for plain browsing only.
// ================================================================
let _rejMode = 'perm';

function openRejectedExport(){
  openAdvExport({
    title:'تصدير — قائمة المرفوضين', filename:'قائمة_المرفوضين',
    table:'rejected_donors',
    select:'full_name,age,rejection_reason,rejection_date,rejection_type,notes',
    dateField:'rejection_date', nameField:'full_name', orderBy:'rejection_date', orderAsc:false,
    filters:['dateRange','rejectionType','name'],
    headers:['الاسم','العمر','سبب الرفض','تاريخ الرفض','نوع الرفض','ملاحظات'],
    rowMap:r=>[r.full_name, r.age||'—', r.rejection_reason, fd(r.rejection_date), r.rejection_type, r.notes||'—']
  });
}

function switchInfRejMode(mode){
  G('irModeInfected').classList.toggle('on', mode==='infected');
  G('irModePerm').classList.toggle('on', mode==='perm');
  G('irModeTemp').classList.toggle('on', mode==='temp');
  G('infectedPane').style.display = mode==='infected' ? 'block' : 'none';
  G('rejectedPane').style.display = mode==='infected' ? 'none' : 'block';
  if(mode!=='infected'){
    _rejMode = mode;
    G('rjAddBtn').style.display = mode==='perm' ? '' : 'none';
    G('rjSrch').value='';
    loadRejected();
  }
}

async function loadInfected(type, tabEl, page=1){
  if(tabEl){
    document.querySelectorAll('#infectedPane .tab').forEach(t=>t.classList.remove('on'));
    tabEl.classList.add('on');
    _infType = type;
  }
  _infPage=page;
  const s=(G('infSrch')?.value||'').trim();
  const cols='bottle_number,serology_result,serology_type,donation_date,bottle_note,id,donors(donor_number,full_name,mobile,national_id)';
  load(true);
  let data, count;
  if(!s){
    let q=db.from('blood_donations').select(cols,{count:'exact'})
      .eq('serology_result','Positive').eq('is_deleted',false).order('created_at',{ascending:false});
    if(_infType) q=q.eq('serology_type',_infType);
    q=q.range((page-1)*PS, page*PS-1);
    ({data,count}=await q);
  } else {
    // Search: positives are few, so fetch them all (1000 per page) and match here. That allows
    // Arabic-aware matching (أإآ=ا، ى=ي، ة=ه) across name, mobile, donor no., national ID,
    // bottle number, infection type and the note — one box, no need to say which field.
    let all=[], from=0;
    for(;;){
      let q=db.from('blood_donations').select(cols)
        .eq('serology_result','Positive').eq('is_deleted',false).order('created_at',{ascending:false});
      if(_infType) q=q.eq('serology_type',_infType);
      const r=await q.range(from,from+999);
      if(r.error) break;
      all=all.concat(r.data||[]);
      if((r.data||[]).length<1000) break;
      from+=1000;
    }
    const needle=_normSearch(s);
    const filtered=all.filter(r=>_normSearch([r.donors?.full_name,r.donors?.mobile,r.donors?.donor_number,r.donors?.national_id,r.bottle_number,r.serology_type,r.bottle_note].join(' | ')).includes(needle));
    count=filtered.length; data=filtered.slice((page-1)*PS, page*PS);
  }
  load(false);
  if(data&&data.length){
    G('infTbl').innerHTML=`<div class="tw"><table><thead><tr>
      <th>رقم المتبرع</th><th>اسم المتبرع</th><th>رقم القنينة</th>
      <th>نوع الإصابة</th><th>تاريخ الاكتشاف</th><th>رقم الموبايل</th><th>ملاحظة</th>${_canUnInfect()?'<th>إجراء</th>':''}
    </tr></thead><tbody>${data.map(r=>`<tr>
      <td>${N(r.donors?.donor_number)}</td>
      <td>${esc(N(r.donors?.full_name))}</td>
      <td style="color:#BE123C;font-weight:700">${r.bottle_number}</td>
      <td><span class="pill pr">${r.serology_type||'موجب'}</span></td>
      <td>${fd(r.donation_date)}</td>
      <td dir="ltr">${esc(N(r.donors?.mobile))}</td>
      <td style="min-width:140px">${r.bottle_note?esc(r.bottle_note):'—'}</td>
      ${_canUnInfect()?`<td><button class="btn" style="font-size:14px;padding:6px 10px;white-space:nowrap;color:#166534;border-color:#166534" onclick="openUnInfect('${r.id}')"><i class="ti ti-rotate-2"></i> إلغاء الإصابة</button></td>`:''}
    </tr>`).join('')}</tbody></table></div>`;
    G('infPag').innerHTML=_pagHtml(count,page,'goInfPage');
  } else {
    G('infTbl').innerHTML = s
      ? '<div class="empty"><i class="ti ti-search-off"></i><p>لا توجد نتائج مطابقة للبحث</p></div>'
      : '<div class="empty"><i class="ti ti-shield-check" style="color:#2e7d32"></i><p>لا توجد حالات إيجابية</p></div>';
    G('infPag').innerHTML='';
  }
}
let _infPage=1, _infType='';

// ── Cancel an infection result after a second, negative test ─────────────────────────────────
// Who: anyone who can enter وحدة الفيروسات (admin or the 'virology' permission).
// What happens (all rows of the same draw — same donor + bottle number — together):
//   • serology → Negative, infection type cleared, a note with the reason is appended;
//   • the bottle itself is DISCARDED by default (status 'damaged', reason recorded) because time has
//     usually passed between the two tests; a checkbox sends it back to المخزن المؤقت instead;
//   • the donor's automatic permanent rejection ("إصابة: …") is lifted — unless another positive
//     bottle of the same donor is still on record, in which case it is kept;
//   • everything is written to the audit log with the original positive result.
function _canUnInfect(){ return UPROF?.role==='admin' || (typeof hasPermission==='function' && hasPermission('virology')); }

async function openUnInfect(id){
  if(!_canUnInfect()){ toast('⛔ هذا الإجراء لموظفي وحدة الفيروسات','error'); return; }
  load(true);
  const{data:r}=await db.from('blood_donations').select('id,bottle_number,serology_type,donors(full_name)').eq('id',id).single();
  load(false);
  if(!r){ toast('تعذّر تحميل القنينة','error'); return; }
  G('ui-id').value=id;
  G('ui-info').innerHTML='<b>'+esc(r.donors?.full_name||'—')+'</b><br>قنينة رقم '+esc(r.bottle_number)+' — الإصابة المسجّلة: <b style="color:#BE123C">'+esc(r.serology_type||'موجب')+'</b>';
  G('ui-reason').value=''; G('ui-unblock').checked=true; G('ui-keep').checked=false;
  G('unInfectModal').classList.add('on');
}

async function confirmUnInfect(){
  if(!_canUnInfect()){ toast('⛔ هذا الإجراء لموظفي وحدة الفيروسات','error'); return; }
  if(!IS_ONLINE){ toast('هذا الإجراء يحتاج اتصالاً بالإنترنت','warning'); return; }
  const id=G('ui-id').value, reason=G('ui-reason').value.trim();
  const unblock=G('ui-unblock').checked, keep=G('ui-keep').checked;
  if(!reason){ toast('اكتب سبب الإلغاء (مثلاً: فحص ثانٍ سالب بتاريخ ...)','error'); return; }
  load(true);
  try{
    const{data:main,error:me}=await db.from('blood_donations')
      .select('id,donor_id,bottle_number,serology_type,donors(full_name)').eq('id',id).single();
    if(me||!main) throw me||new Error('القنينة غير موجودة');
    const oldType=main.serology_type, donorName=main.donors?.full_name||null;
    // every row of this draw that carries the positive result (the bottle + trima outputs / components)
    const{data:rows,error:re}=await db.from('blood_donations')
      .select('id,status,bottle_note').eq('donor_id',main.donor_id).eq('bottle_number',main.bottle_number)
      .eq('serology_result','Positive').eq('is_deleted',false);
    if(re) throw re;
    const today=new Date().toISOString().split('T')[0];
    const stamp='أُلغيت الإصابة ('+(oldType||'موجب')+') بفحص ثانٍ سالب: '+reason;
    const damageReason='إصابة ملغاة بعد فحص ثانٍ — القنينة غير صالحة للاستخدام';
    for(const r of (rows||[])){
      const upd={serology_result:'Negative', serology_type:null, bottle_note:(r.bottle_note?r.bottle_note+' | ':'')+stamp};
      if(r.status==='rejected_positive'){
        if(keep) upd.status='pending_release';
        else { upd.status='damaged'; upd.damage_reason=damageReason; upd.damaged_date=today; }
      }
      const{error:ue}=await db.from('blood_donations').update(upd).eq('id',r.id);
      if(ue) throw ue;
    }
    // Lift the donor's automatic permanent rejection — only if no OTHER positive bottle of theirs remains.
    let unblocked=false, blockedKept=false;
    if(unblock && donorName){
      const{data:others}=await db.from('blood_donations').select('id')
        .eq('donor_id',main.donor_id).eq('serology_result','Positive').eq('is_deleted',false).limit(1);
      if(others && others.length){ blockedKept=true; }
      else {
        const{error:de}=await db.from('rejected_donors').update({is_deleted:true})
          .eq('full_name',donorName).eq('rejection_type','دائم').eq('rejection_reason','إصابة: '+oldType).eq('is_deleted',false);
        if(de) throw de;
        unblocked=true;
        if(typeof cacheRejectedDonors==='function') await cacheRejectedDonors();
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,
      old_values:{serology_result:'Positive',serology_type:oldType},
      new_values:{serology_result:'Negative',reason,bottle:keep?'returned_to_pending_release':'discarded',donor_unblocked:unblocked,rows:(rows||[]).length}});
    G('unInfectModal').classList.remove('on');
    toast('✅ أُلغيت الإصابة'+(unblocked?' ورُفع المنع عن المتبرع':'')+(keep?'':' — القنينة سُجّلت كتالفة'),'success',5000);
    if(blockedKept) toast('⚠️ لم يُرفع المنع: المتبرع عنده إصابة أخرى مسجّلة','warning',6000);
    await loadInfected(undefined,undefined,_infPage);
    if(typeof refreshExpiryNotifications==='function') refreshExpiryNotifications();
  }catch(e){ toast('خطأ: '+e.message,'error'); console.log('unInfect err:',e); }
  finally{ load(false); }
}
let _infSearchTimer=null;
function infSearchLive(){
  clearTimeout(_infSearchTimer);
  _infSearchTimer=setTimeout(()=>loadInfected(undefined,undefined,1), 350);
}
// Arabic-tolerant text for matching: lower-case, أإآ→ا، ى→ي، ة→ه، no diacritics/tatweel.
function _normSearch(s){
  return String(s??'').toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\u064B-\u065F\u0640]/g,'').trim();
}
function goInfPage(p){ loadInfected(undefined, undefined, p); }

// Shared pagination-control renderer (same look as سجل المتبرعين's pager) — takes the total
// row count, current page, and the name of the function to call with a page number.
function _pagHtml(count, page, fnName){
  const tp=Math.max(1,Math.ceil(count/PS));
  const start=Math.max(1,Math.min(page-2,tp-4));
  return `<span>إجمالي: ${fnum(count)} سجل — الصفحة ${page} من ${tp}</span>
    <div class="pag-btns">
      <button class="pbtn" onclick="${fnName}(${page-1})" ${page<=1?'disabled':''}>→</button>
      ${Array.from({length:Math.min(5,tp)},(_,i)=>{const p=start+i;return`<button class="pbtn ${p===page?'on':''}" onclick="${fnName}(${p})">${p}</button>`;}).join('')}
      <button class="pbtn" onclick="${fnName}(${page+1})" ${page>=tp?'disabled':''}>←</button>
    </div>`;
}

// ================================================================
// REJECTED
// ================================================================
let _rjSearchTimer=null, _rjPage=1;
function rjSearchLive(){
  clearTimeout(_rjSearchTimer);
  _rjSearchTimer=setTimeout(()=>loadRejected(1), 300);
}
function goRjPage(p){ loadRejected(p); }

async function loadRejected(page=1){
  _rjPage=page;
  const s=G('rjSrch').value.trim(); load(true);
  let q=db.from('rejected_donors').select('*',{count:'exact'}).eq('is_deleted',false).order('rejection_date',{ascending:false});
  // With no search text: browse the current tab's type only. While searching: search across
  // BOTH types together (a name might be rejected either way, and staff need to know which).
  if(s) q=q.ilike('full_name','%'+s+'%');
  else  q=q.eq('rejection_type', _rejMode==='perm' ? 'دائم' : 'مؤقت');
  q=q.range((page-1)*PS, page*PS-1);
  const {data,count}=await q; load(false);
  if(data&&data.length){
    G('rjTbl').innerHTML=`<div class="tw"><table><thead><tr>
      <th>الاسم</th><th>العمر</th><th>سبب الرفض</th><th>تاريخ الرفض</th><th>نوع الرفض</th><th>ملاحظات</th>
    </tr></thead><tbody>${data.map(r=>`<tr>
      <td>${esc(r.full_name)}</td><td>${N(r.age)}</td><td>${esc(r.rejection_reason)}</td>
      <td>${fd(r.rejection_date)}</td>
      <td><span class="pill ${r.rejection_type==='مؤقت'?'py':'pr'}">${r.rejection_type}</span></td>
      <td>${esc(N(r.notes))}</td>
    </tr>`).join('')}</tbody></table></div>`;
    G('rjPag').innerHTML=_pagHtml(count,page,'goRjPage');
  } else {
    G('rjTbl').innerHTML='<div class="empty"><i class="ti ti-user-x"></i><p>لا توجد سجلات</p></div>';
    G('rjPag').innerHTML='';
  }
}

function showRejModal(){ G('rj-dt').value=new Date().toISOString().split('T')[0]; G('rjModal').classList.add('on'); }
function closeRjModal(){
  G('rjModal').classList.remove('on');
  ['rj-nm','rj-age','rj-rsn','rj-note'].forEach(id=>G(id).value='');
  const l=G('ac-rjnm'); if(l) l.classList.remove('show');
}

// ── Autocomplete: typing an existing donor's name suggests them and fills their age ──
let _rjAcTimer=null;
async function rjNameSearch(val){
  const list=G('ac-rjnm'); if(!list) return;
  if(!val||val.trim().length<3){ list.classList.remove('show'); return; }
  clearTimeout(_rjAcTimer);
  _rjAcTimer=setTimeout(async()=>{
    const{data}=await db.from('donors')
      .select('id,full_name,birth_year,mobile,national_id')
      .eq('is_deleted',false).ilike('full_name','%'+val.trim().replace(/ة/g,'ه')+'%').limit(6);
    if(!data||!data.length){ list.classList.remove('show'); return; }
    list.innerHTML=data.map(d=>`
      <div class="ac-item" onmousedown="fillRjDonor(${JSON.stringify(d).replace(/"/g,'&quot;')})">
        <div class="ac-av">${esc(d.full_name.charAt(0))}</div>
        <div class="ac-info">
          <div class="ac-name">${esc(d.full_name)}</div>
          <div class="ac-sub">${esc(d.mobile||'—')} | ${esc(d.national_id||'—')}</div>
        </div>
      </div>`).join('');
    list.classList.add('show');
  },250);
}
function fillRjDonor(d){
  G('rj-nm').value=d.full_name||'';
  if(d.birth_year) G('rj-age').value=new Date().getFullYear()-d.birth_year;
  const l=G('ac-rjnm'); if(l) l.classList.remove('show');
}
document.addEventListener('click',e=>{
  if(!e.target.closest('.ac-wrap')){ const l=G('ac-rjnm'); if(l) l.classList.remove('show'); }
});

async function saveRejected(){
  const nm=G('rj-nm').value.trim(), rsn=G('rj-rsn').value.trim();
  if(!nm||!rsn){toast('الاسم وسبب الرفض إلزاميان','error'); return;}
  const {error}=await db.from('rejected_donors').insert({
    full_name:nm, age:parseInt(G('rj-age').value)||null,
    rejection_reason:rsn, rejection_date:G('rj-dt').value,
    rejection_type:'دائم', notes:G('rj-note').value.trim()||null,
    created_by:SES?.user?.id
  });
  if(error){toast('خطأ: '+error.message,'error'); return;}
  toast('تم الحفظ بنجاح','success'); closeRjModal(); await loadRejected();
}
