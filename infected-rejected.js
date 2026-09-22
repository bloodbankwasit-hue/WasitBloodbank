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
  load(true);
  let q=db.from('blood_donations')
    .select('bottle_number,serology_result,serology_type,donation_date,id,donors(donor_number,full_name,mobile)',{count:'exact'})
    .eq('serology_result','Positive').eq('is_deleted',false).order('created_at',{ascending:false});
  if(_infType) q=q.eq('serology_type',_infType);
  q=q.range((page-1)*PS, page*PS-1);
  const {data,count}=await q; load(false);
  if(data&&data.length){
    G('infTbl').innerHTML=`<div class="tw"><table><thead><tr>
      <th>رقم المتبرع</th><th>اسم المتبرع</th><th>رقم القنينة</th>
      <th>نوع الإصابة</th><th>تاريخ الاكتشاف</th><th>رقم الموبايل</th>
    </tr></thead><tbody>${data.map(r=>`<tr>
      <td>${N(r.donors?.donor_number)}</td>
      <td>${esc(N(r.donors?.full_name))}</td>
      <td style="color:#BE123C;font-weight:700">${r.bottle_number}</td>
      <td><span class="pill pr">${r.serology_type||'موجب'}</span></td>
      <td>${fd(r.donation_date)}</td>
      <td dir="ltr">${esc(N(r.donors?.mobile))}</td>
    </tr>`).join('')}</tbody></table></div>`;
    G('infPag').innerHTML=_pagHtml(count,page,'goInfPage');
  } else {
    G('infTbl').innerHTML='<div class="empty"><i class="ti ti-shield-check" style="color:#2e7d32"></i><p>لا توجد حالات إيجابية</p></div>';
    G('infPag').innerHTML='';
  }
}
let _infPage=1, _infType='';
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
