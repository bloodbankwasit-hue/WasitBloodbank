// ================================================================
// INFECTED + REJECTED — merged into one screen with a mode switcher (both lists
// serve the same purpose: donors currently excluded from donating, one
// permanently for a confirmed infection, the other temporarily for other reasons).
// ================================================================
function switchInfRejMode(mode){
  G('irModeInfected').classList.toggle('on', mode==='infected');
  G('irModeRejected').classList.toggle('on', mode==='rejected');
  G('infectedPane').style.display = mode==='infected' ? 'block' : 'none';
  G('rejectedPane').style.display = mode==='rejected' ? 'block' : 'none';
  if(mode==='rejected') loadRejected();
}

async function loadInfected(type, tabEl){
  document.querySelectorAll('#infectedPane .tab').forEach(t=>t.classList.remove('on'));
  if(tabEl) tabEl.classList.add('on');
  load(true);
  let q=db.from('blood_donations')
    .select('bottle_number,serology_result,serology_type,donation_date,id,donors(donor_number,full_name,mobile)')
    .eq('serology_result','Positive').eq('is_deleted',false).order('created_at',{ascending:false});
  if(type) q=q.eq('serology_type',type);
  const {data}=await q; load(false);
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
  } else {
    G('infTbl').innerHTML='<div class="empty"><i class="ti ti-shield-check" style="color:#2e7d32"></i><p>لا توجد حالات إيجابية</p></div>';
  }
}

// ================================================================
// REJECTED
// ================================================================
async function loadRejected(){
  const s=G('rjSrch').value.trim(); load(true);
  let q=db.from('rejected_donors').select('*').eq('is_deleted',false).order('rejection_date',{ascending:false});
  if(s) q=q.ilike('full_name','%'+s+'%');
  const {data}=await q; load(false);
  if(data&&data.length){
    G('rjTbl').innerHTML=`<div class="tw"><table><thead><tr>
      <th>الاسم</th><th>العمر</th><th>سبب الرفض</th><th>تاريخ الرفض</th><th>نوع الرفض</th><th>ملاحظات</th>
    </tr></thead><tbody>${data.map(r=>`<tr>
      <td>${esc(r.full_name)}</td><td>${N(r.age)}</td><td>${esc(r.rejection_reason)}</td>
      <td>${fd(r.rejection_date)}</td>
      <td><span class="pill ${r.rejection_type==='مؤقت'?'py':'pr'}">${r.rejection_type}</span></td>
      <td>${esc(N(r.notes))}</td>
    </tr>`).join('')}</tbody></table></div>`;
  } else {
    G('rjTbl').innerHTML='<div class="empty"><i class="ti ti-user-x"></i><p>لا توجد سجلات</p></div>';
  }
}

function showRejModal(){ G('rj-dt').value=new Date().toISOString().split('T')[0]; G('rjModal').classList.add('on'); }
function closeRjModal(){ G('rjModal').classList.remove('on'); ['rj-nm','rj-age','rj-rsn','rj-note'].forEach(id=>G(id).value=''); }

async function saveRejected(){
  const nm=G('rj-nm').value.trim(), rsn=G('rj-rsn').value.trim();
  if(!nm||!rsn){toast('الاسم وسبب الرفض إلزاميان','error'); return;}
  const {error}=await db.from('rejected_donors').insert({
    full_name:nm, age:parseInt(G('rj-age').value)||null,
    rejection_reason:rsn, rejection_date:G('rj-dt').value,
    rejection_type:G('rj-typ').value, notes:G('rj-note').value.trim()||null,
    created_by:SES?.user?.id
  });
  if(error){toast('خطأ: '+error.message,'error'); return;}
  toast('تم الحفظ بنجاح','success'); closeRjModal(); await loadRejected();
}
