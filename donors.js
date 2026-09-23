// ================================================================
// DONORS LIST
// ================================================================
function openDonorsExport(){
  openAdvExport({
    title:'تصدير متقدم — سجل المتبرعين', filename:'سجل_المتبرعين',
    table:'blood_donations',
    select:'bottle_number,bottle_type,blood_type,component_type,donation_type,donation_date,status,donors(full_name)',
    dateField:'donation_date', nameField:'donors.full_name', orderBy:'bottle_number',
    filters:['dateRange','bottleType','bloodType','bottleRange','specificBottles','name'],
    headers:['رقم القنينة','اسم المتبرع','نوع القنينة','الفصيلة','المكوّن','نوع التبرع','تاريخ التبرع','الحالة'],
    rowMap:r=>[r.bottle_number, r.donors?.full_name||'—', r.bottle_type, r.blood_type||'—', r.component_type||'دم كامل',
      r.donation_type||'—', fd(r.donation_date), AUDIT_STATUS_LABELS[r.status]||r.status]
  });
}

function showDonorsPlaceholder(){
  G('dTbl').innerHTML='<div class="empty"><i class="ti ti-search"></i><p>استخدم البحث أو الفلاتر أعلاه لعرض المتبرعين</p></div>';
  G('dPag').innerHTML='';
}

function showGlobalSearchPlaceholder(){
  G('gsResults').innerHTML='<div class="empty"><i class="ti ti-database-search"></i><p>اكتب أي تفصيلة أعلاه — اسم، هاتف، رقم قنينة، سبب رفض...</p></div>';
}

// Searches across donors/donations AND the rejected-donors list in one pass — the "شامل"
// archive search. Donor identity fields are matched on the donors table itself first (see the
// note in loadDonors about why PostgREST's or() can't reference an embedded table directly).
// The two search modes were separate screens before ("الأرشيف الشامل" and "البحث المتقدم")
// — merged into one, switched by this tab toggle, since they served nearly the same purpose.
function switchSearchMode(mode){
  G('gsModeQuick').classList.toggle('on', mode==='quick');
  G('gsModeAdvanced').classList.toggle('on', mode==='advanced');
  G('quickSearchPane').style.display = mode==='quick' ? 'block' : 'none';
  G('advancedSearchPane').style.display = mode==='advanced' ? 'block' : 'none';
}

async function runGlobalSearch(){
  const raw=(G('gsQuery')?.value||'').trim();
  if(!raw){ toast('يرجى كتابة كلمة بحث','error'); return; }
  const clean=raw.replace(/[,()%*:]/g,'').trim();
  const isNum=!isNaN(clean)&&clean!=='';
  load(true);
  try{
    // 1) Matching donors, by identity fields
    // Split into separate queries instead of one .or() mixing ilike with an eq condition —
    // that combination was confirmed to silently fail to match (see reception.js's rejected-
    // donor check for the full diagnosis); three ilike conditions together are fine, but adding
    // donor_number.eq alongside them in the SAME or() string is not.
    let donorIds=[];
    if(clean){
      const idQueries=[db.from('donors').select('id').eq('is_deleted',false)
        .or(`national_id.ilike.*${clean}*,full_name.ilike.*${clean}*,mobile.ilike.*${clean}*`).limit(500)];
      if(isNum) idQueries.push(db.from('donors').select('id').eq('is_deleted',false).eq('donor_number',clean).limit(500));
      const idResults=await Promise.all(idQueries);
      donorIds=[...new Set(idResults.flatMap(r=>(r.data||[]).map(x=>x.id)))];
    }
    // 2) Matching donations, by bottle number or by the matched donor ids — same reasoning:
    // separate queries instead of mixing eq and in() inside one or() string.
    let donationRows=[];
    const donQueries=[];
    if(isNum) donQueries.push(db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,component_type,status,donation_date,campaign_name,donors(donor_number,full_name,mobile)')
      .eq('is_deleted',false).eq('bottle_number',clean).limit(100));
    if(donorIds.length) donQueries.push(db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,component_type,status,donation_date,campaign_name,donors(donor_number,full_name,mobile)')
      .eq('is_deleted',false).in('donor_id',donorIds).order('created_at',{ascending:false}).limit(100));
    if(donQueries.length){
      const donResults=await Promise.all(donQueries);
      const seen=new Set();
      donationRows=donResults.flatMap(r=>r.data||[]).filter(r=>{
        if(seen.has(r.id)) return false;
        seen.add(r.id); return true;
      });
    }
    // 3) Matching rejected donors, by name or reason
    let rejectedRows=[];
    if(clean){
      const{data}=await db.from('rejected_donors').select('id,full_name,rejection_reason,rejection_date,rejection_type')
        .or(`full_name.ilike.*${clean}*,rejection_reason.ilike.*${clean}*`).limit(50);
      rejectedRows=data||[];
    }

    const sections=[];
    if(donationRows.length){
      sections.push(`<div class="sh-t" style="font-size:17px;margin:14px 0 8px"><i class="ti ti-droplet"></i> تبرعات (${donationRows.length})</div>` +
        donationRows.map(r=>`<div class="flow-card">
          <div class="fc-av">🩸</div>
          <div style="flex:1">
            <div class="fc-name">${r.donors?.full_name?esc(r.donors.full_name):(r.campaign_name?'متبرع حملة — '+esc(r.campaign_name):'—')} — قنينة ${r.bottle_number||'—'}</div>
            <div class="fc-sub">${r.blood_type||'—'} | ${r.component_type||'دم كامل'} | ${AUDIT_STATUS_LABELS[r.status]||r.status} | ${fd(r.donation_date)}</div>
          </div>
        </div>`).join(''));
    }
    if(rejectedRows.length){
      sections.push(`<div class="sh-t" style="font-size:17px;margin:14px 0 8px"><i class="ti ti-ban"></i> قائمة المرفوضين (${rejectedRows.length})</div>` +
        rejectedRows.map(r=>`<div class="flow-card">
          <div class="fc-av">⛔</div>
          <div style="flex:1">
            <div class="fc-name">${esc(r.full_name||'—')}</div>
            <div class="fc-sub">${esc(r.rejection_reason||'—')} | ${r.rejection_type||'—'} | ${fd(r.rejection_date)}</div>
          </div>
        </div>`).join(''));
    }
    G('gsResults').innerHTML = sections.length ? sections.join('') : '<div class="empty"><i class="ti ti-search"></i><p>لا توجد نتائج</p></div>';
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function loadDonors(page=1){
  DPAGE=page;
  const s     = G('dSrch')?.value.trim()||'';
  const bgF   = G('dBGFilter')?.value.trim()||'';
  const typeF = G('dTypeFilter')?.value.trim()||'';
  const dFrom = G('dDateFrom')?.value||'';
  const dTo   = G('dDateTo')?.value||'';
  load(true);
  try{
    const SEL='bottle_number,bottle_type,donation_type,donation_date,expiry_date,blood_type,serology_result,status,component_type,campaign_name,id,donors(donor_number,full_name,birth_year,national_id)';
    let q;
    if(s){
      // PostgREST's or()/and() only accepts columns on the table being queried — it cannot
      // reference an embedded/joined table's columns (e.g. "donors.full_name") inside or().
      // So donor identity fields (name/mobile/national id/donor number) are matched first,
      // against the donors table directly, then we filter blood_donations by donor_id.
      const clean=s.replace(/[,()%*:]/g,'').trim();
      const isNum=!isNaN(clean)&&clean!=='';
      let donorIds=[];
      if(clean){
        // Two separate queries instead of one .or() mixing ilike with an eq condition — that
        // combination silently fails to match (confirmed while diagnosing the rejected-donor
        // check in reception.js); three ilike conditions together are fine on their own.
        const idQueries=[db.from('donors').select('id').eq('is_deleted',false)
          .or(`national_id.ilike.*${clean}*,full_name.ilike.*${clean}*,mobile.ilike.*${clean}*`).limit(500)];
        if(isNum) idQueries.push(db.from('donors').select('id').eq('is_deleted',false).eq('donor_number',clean).limit(500));
        const idResults=await Promise.all(idQueries);
        donorIds=[...new Set(idResults.flatMap(r=>(r.data||[]).map(x=>x.id)))];
      }
      const orParts=[];
      if(isNum) orParts.push(`bottle_number.eq.${clean}`);
      if(donorIds.length) orParts.push(`donor_id.in.(${donorIds.join(',')})`);
      if(!orParts.length){
        G('dTbl').innerHTML='<div class="empty"><i class="ti ti-users"></i><p>لا توجد نتائج</p></div>';
        G('dPag').innerHTML='';
        load(false);
        return;
      }
      q=db.from('blood_donations').select(SEL,{count:'exact'})
        .eq('is_deleted',false)
        .or(orParts.join(','));
    } else {
      q=db.from('blood_donations').select(SEL,{count:'exact'}).eq('is_deleted',false);
    }
    if(bgF)   q=q.eq('blood_type',bgF);
    if(typeF) q=q.eq('donation_type',typeF);
    if(dFrom) q=q.gte('donation_date',dFrom);
    if(dTo)   q=q.lte('donation_date',dTo);
    // One row per DONATION, never per resulting component — a separated bottle's components
    // share this same donor/date and would otherwise show up as repeated "duplicate" rows for
    // the same person. The original whole-blood row (component_type stays 'دم كامل' even after
    // separation — only its status changes) already carries a "تم الفصل" tag when that happened,
    // so nothing about the separation is actually hidden, just not repeated per component here.
    q=q.eq('component_type','دم كامل');
    q=q.order('created_at',{ascending:false}).range((page-1)*PS,page*PS-1);
    const {data,count,error}=await q; if(error) throw error;
    const now=new Date();
    if(data&&data.length){
      G('dTbl').innerHTML=`<div class="tw"><table><thead><tr>
        <th>رقم المتبرع</th><th>الاسم الكامل</th><th>العمر</th><th>الفصيلة</th>
        <th>نوع القنينة</th><th>المحتوى</th><th>رقم القنينة</th><th>نوع التبرع</th>
        <th>تاريخ التبرع</th><th>تاريخ النفاد</th><th>الفحوصات</th><th></th>
      </tr></thead><tbody>${data.map(r=>{
        const age=r.donors?.birth_year ? new Date().getFullYear()-r.donors.birth_year : '—';
        const exp=r.expiry_date&&new Date(r.expiry_date)<now;
        const isSep=r.status==='separated';
        return`<tr>
          <td>${N(r.donors?.donor_number)}</td>
          <td>${r.donors?.full_name?esc(r.donors.full_name):(r.campaign_name?'🚐 '+esc(r.campaign_name):'—')}</td>
          <td>${age}</td>
          <td>${N(r.blood_type)}</td>
          <td>${r.bottle_type}</td>
          <td>${isSep?'<span class="pill py">تم الفصل</span>':`<span class="pill ${r.component_type==='دم كامل'?'pg':'pb'}">${r.component_type||'دم كامل'}</span>`}</td>
          <td style="font-weight:700;color:#BE123C">${r.bottle_number}</td>
          <td><span class="pill ${r.donation_type==='طوعي'?'pg':'py'}">${r.donation_type}</span></td>
          <td>${fd(r.donation_date)}</td>
          <td style="color:${exp?'#BE123C':'inherit'}">${fd(r.expiry_date)}${exp?' ⚠':''}</td>
          <td><span class="pill ${r.serology_result?(r.serology_result==='Negative'?'pg':'pr'):'py'}">${r.serology_result?(r.serology_result==='Negative'?'سالبة ✅':'موجبة ⚠️'):'لم يُفحص'}</span></td>
          <td style="white-space:nowrap">
            <button class="ibtn" onclick="printDonorFromList(storeDonorForPrint({donor_name:'${sq(r.donors?.full_name)}',bottle_number:${r.bottle_number||0},bottle_type:'${r.bottle_type||''}',donation_date:'${r.donation_date||''}',donation_type:'${r.donation_type||''}',birth_year:${r.donors?.birth_year||0},gender:'${r.donors?.gender||''}',mobile:'${sq(r.donors?.mobile)}',national_id:'${sq(r.donors?.national_id)}',address:'${sq(r.donors?.address)}',expiry_date:'${r.expiry_date||''}',blood_type:'${r.blood_type||''}' }))" title="طباعة" style="color:#BE123C"><i class="ti ti-printer"></i></button>
            <button class="ibtn" onclick="editDonorRow('${r.id}')" title="تعديل" style="color:#2563EB"><i class="ti ti-edit"></i></button>
            <button class="ibtn" onclick="deleteDonorRow('${r.id}','${sq(r.donors?.full_name)}')" title="حذف" style="color:#DC2626"><i class="ti ti-trash"></i></button>
          </td>
        </tr>`;}).join('')}</tbody></table></div>`;
      const tp=Math.ceil(count/PS);
      const start=Math.max(1,Math.min(page-2,tp-4));
      G('dPag').innerHTML=`<span>إجمالي: ${fnum(count)} سجل — الصفحة ${page} من ${tp}</span>
        <div class="pag-btns">
          <button class="pbtn" onclick="loadDonors(${page-1})" ${page<=1?'disabled':''}>→</button>
          ${Array.from({length:Math.min(5,tp)},(_,i)=>{const p=start+i;return`<button class="pbtn ${p===page?'on':''}" onclick="loadDonors(${p})">${p}</button>`;}).join('')}
          <button class="pbtn" onclick="loadDonors(${page+1})" ${page>=tp?'disabled':''}>←</button>
        </div>`;
    } else {
      G('dTbl').innerHTML='<div class="empty"><i class="ti ti-users"></i><p>لا توجد نتائج</p></div>';
      G('dPag').innerHTML='';
    }
  }catch(e){toast('خطأ: '+e.message,'error');}
  finally{load(false);}
}

async function editDonorRow(id){
  load(true);
  try{
    const{data:r,error}=await db.from('blood_donations')
      .select('*,donors(*)').eq('id',id).single();
    if(error) throw error;
    G('ed-donid').value=r.id;
    G('ed-donorid').value=r.donor_id||'';
    if(r.donor_id){
      G('ed-name').value=r.donors?.full_name||'';
      G('ed-name').removeAttribute('readonly');
    } else {
      G('ed-name').value='🚐 '+(r.campaign_name||'متبرع حملة')+' — لا يمكن تعديل بيانات المتبرع (بلا هوية)';
      G('ed-name').setAttribute('readonly','readonly');
    }
    G('ed-by').value=r.donors?.birth_year||'';
    G('ed-gen').value=r.donors?.gender||'ذكر';
    G('ed-mom').value=r.donors?.mother_name||'';
    G('ed-nid').value=r.donors?.national_id||'';
    G('ed-mob').value=r.donors?.mobile||'';
    G('ed-addr').value=r.donors?.address||'';
    G('ed-job').value=r.donors?.occupation||'';
    G('ed-dtyp').value=r.donation_type||'تعويضي';
    G('ed-btyp').value=r.bottle_type||'مفلتر';
    G('ed-bnum').value=r.bottle_number||'';
    G('ed-pat').value=r.patient_name||'';
    G('ed-hosp').value=r.hospital_name||'';
    G('ed-ddate').value=r.donation_date||'';
    G('ed-dtime').value=r.donation_time||'';
    G('ed-draw').value=r.draw_date||'';
    G('ed-exp').value=r.expiry_date||'';
    G('ed-bt').value=r.blood_type||'';
    G('ed-bp').value=r.blood_pressure||'';
    G('ed-wt').value=r.weight||'';
    G('ed-pulse').value=r.pulse||'';
    G('ed-hgb').value=r.hemoglobin||'';
    G('ed-ser').value=r.serology_result||'Negative';
    G('ed-sert').value=r.serology_type||'HIV';
    toggleEdSer();
    G('editDonorModal').classList.add('on');
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

function toggleEdSer(){ G('edSerTypGrp').style.display=G('ed-ser').value==='Positive'?'flex':'none'; }

async function saveDonorEdit(){
  const donId=G('ed-donid').value, donorId=G('ed-donorid').value;
  const dd=G('ed-ddate').value;
  // Campaign-drawn bottles have no linked donor — skip the identity requirement/update for them.
  if(donorId){
    const nm=G('ed-name').value.trim(), by=parseInt(G('ed-by').value);
    if(!nm||!by||!dd){ toast('يرجى تعبئة: الاسم، سنة التولد، تاريخ التبرع','error'); return; }
  } else if(!dd){
    toast('يرجى تعبئة تاريخ التبرع','error'); return;
  }
  load(true);
  try{
    if(donorId){
      const nm=G('ed-name').value.trim();
      const{error:de}=await db.from('donors').update({
        full_name:nm, birth_year:parseInt(G('ed-by').value), gender:G('ed-gen').value,
        mother_name:G('ed-mom').value.trim()||null, national_id:G('ed-nid').value.trim()||null,
        mobile:G('ed-mob').value.trim()||null, address:G('ed-addr').value.trim()||null,
        occupation:G('ed-job').value.trim()||null
      }).eq('id',donorId);
      if(de) throw de;
    }

    const ser=G('ed-ser').value;
    const{error:doe}=await db.from('blood_donations').update({
      bottle_type:G('ed-btyp').value, donation_type:G('ed-dtyp').value,
      patient_name:G('ed-pat').value.trim()||null, hospital_name:G('ed-hosp').value.trim()||null,
      donation_date:dd, donation_time:G('ed-dtime').value||null,
      draw_date:G('ed-draw').value||null, expiry_date:G('ed-exp').value||null,
      blood_type:G('ed-bt').value||null, blood_pressure:G('ed-bp').value.trim()||null,
      weight:parseFloat(G('ed-wt').value)||null, pulse:parseInt(G('ed-pulse').value)||null,
      hemoglobin:parseFloat(G('ed-hgb').value)||null,
      serology_result:ser, serology_type:ser==='Positive'?G('ed-sert').value:null
    }).eq('id',donId);
    if(doe) throw doe;

    await db.from('audit_log').insert({
      user_id:SES?.user?.id, user_name:UPROF?.full_name,
      action:'UPDATE', table_name:'blood_donations',
      record_id:donId, new_values:{donor:donorId?G('ed-name').value.trim():'حملة', bottle:G('ed-bnum').value}
    });

    toast('✅ تم حفظ التعديلات','success');
    G('editDonorModal').classList.remove('on');
    await loadDonors(DPAGE);
  }catch(e){ toast('خطأ في الحفظ: '+e.message,'error'); }
  finally{ load(false); }
}

async function deleteDonorRow(id,name){
  if(!confirm(`هل تريد حذف تبرع "${name}"؟ سيتم إخفاؤه من كل القوائم والتقارير، ولا يمكن التراجع عن هذا الإجراء من الواجهة.`)) return;
  load(true);
  try{
    const{error}=await db.from('blood_donations').update({is_deleted:true}).eq('id',id);
    if(error) throw error;
    await db.from('audit_log').insert({
      user_id:SES?.user?.id, user_name:UPROF?.full_name,
      action:'DELETE', table_name:'blood_donations',
      record_id:id, new_values:{donor:name}
    });
    toast('تم حذف الإدخال','success');
    await loadDonors(DPAGE);
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

async function exportDonors(){
  toast('جاري تحضير الملف...','info'); load(true);
  const {data}=await db.from('blood_donations')
    .select('*,donors(donor_number,full_name,birth_year,gender,mother_name,national_id,mobile,address,occupation)')
    .eq('is_deleted',false).order('bottle_number',{ascending:false});
  load(false); if(!data) return;
  const hd=['رقم المتبرع','الاسم','سنة التولد','الجنس','اسم الأم','البطاقة','الموبايل','العنوان','المهنة','رقم القنينة','نوع القنينة','نوع التبرع','اسم المريض','المستشفى','تاريخ التبرع','وقت التبرع','تاريخ السحب','تاريخ النفاد','فصيلة الدم','ضغط الدم','الوزن','النبض','الهيموكلوبين','الفحوصات'];
  const rows=data.map(r=>[r.donors?.donor_number,r.donors?.full_name,r.donors?.birth_year,r.donors?.gender,r.donors?.mother_name,r.donors?.national_id,r.donors?.mobile,r.donors?.address,r.donors?.occupation,r.bottle_number,r.bottle_type,r.donation_type,r.patient_name,r.hospital_name,r.donation_date,r.donation_time,r.draw_date,r.expiry_date,r.blood_type,r.blood_pressure,r.weight,r.pulse,r.hemoglobin,r.serology_result].map(v=>`"${v??''}"`));
  const csv='\uFEFF'+[hd.join(','),...rows.map(r=>r.join(','))].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`مصرف_الدم_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  toast('تم التصدير بنجاح','success');
}
