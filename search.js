// ================================================================
// SEARCH
// ================================================================
async function doSearch(){
  load(true);
  try{
    let q=db.from('blood_donations')
      .select('bottle_number,bottle_type,donation_type,donation_date,expiry_date,blood_type,serology_result,patient_name,hospital_name,donors(donor_number,full_name,birth_year,mobile,mother_name)')
      .eq('is_deleted',false).order('donation_date',{ascending:false}).limit(300);
    const bn=G('sr-bn').value.trim();
    if(bn) q=q.eq('bottle_number',parseInt(bn));
    if(G('sr-bt').value) q=q.eq('bottle_type',G('sr-bt').value);
    if(G('sr-bl').value) q=q.eq('blood_type',G('sr-bl').value);
    if(G('sr-dt').value) q=q.eq('donation_type',G('sr-dt').value);
    if(G('sr-hosp').value.trim()) q=q.ilike('hospital_name','%'+G('sr-hosp').value.trim()+'%');
    if(G('sr-pat').value.trim()) q=q.ilike('patient_name','%'+G('sr-pat').value.trim()+'%');
    if(G('sr-df').value) q=q.gte('donation_date',G('sr-df').value);
    if(G('sr-dt2').value) q=q.lte('donation_date',G('sr-dt2').value);
    if(G('sr-ser').value) q=q.eq('serology_result',G('sr-ser').value);
    const {data,error}=await q; if(error) throw error;
    const nm=G('sr-nm').value.trim(), mob=G('sr-mob').value.trim(), mom=G('sr-mom').value.trim();
    SRDATA=(data||[]).filter(r=>
      (!nm||r.donors?.full_name?.includes(nm))&&
      (!mob||r.donors?.mobile?.includes(mob))&&
      (!mom||r.donors?.mother_name?.includes(mom))
    );
    if(SRDATA.length){
      G('srRes').innerHTML=`<div style="margin-bottom:8px;font-size:15px;color:#757575">عدد النتائج: <strong>${SRDATA.length}</strong></div>
      <div class="tw"><table><thead><tr>
        <th>رقم المتبرع</th><th>الاسم</th><th>الفصيلة</th><th>نوع القنينة</th><th>رقم القنينة</th>
        <th>نوع التبرع</th><th>تاريخ التبرع</th><th>تاريخ النفاد</th><th>الفحوصات</th><th></th>
      </tr></thead><tbody>${SRDATA.map(r=>`<tr>
        <td>${N(r.donors?.donor_number)}</td><td>${esc(N(r.donors?.full_name))}</td>
        <td>${N(r.blood_type)}</td><td>${r.bottle_type}</td>
        <td style="font-weight:700;color:#BE123C">${r.bottle_number}</td>
        <td><span class="pill ${r.donation_type==='طوعي'?'pg':'py'}">${r.donation_type}</span></td>
        <td>${fd(r.donation_date)}</td><td>${fd(r.expiry_date)}</td>
        <td><span class="pill ${r.serology_result?(r.serology_result==='Negative'?'pg':'pr'):'py'}">${r.serology_result?(r.serology_result==='Negative'?'سالبة ✅':'موجبة ⚠️'):'لم يُفحص'}</span></td>
        <td><button class="ibtn" onclick="loadSectionScript('barcode').then(()=>openBC(${r.bottle_number}))"><i class="ti ti-barcode"></i></button></td>
      </tr>`).join('')}</tbody></table></div>`;
    } else {
      G('srRes').innerHTML='<div class="empty"><i class="ti ti-search"></i><p>لا توجد نتائج مطابقة</p></div>';
    }
  }catch(e){toast('خطأ في البحث: '+e.message,'error');}
  finally{load(false);}
}

function clearSearch(){
  ['sr-nm','sr-bn','sr-hosp','sr-pat','sr-mob','sr-mom','sr-df','sr-dt2'].forEach(id=>{const e=G(id);if(e)e.value='';});
  ['sr-bt','sr-bl','sr-dt','sr-ser'].forEach(id=>{const e=G(id);if(e)e.value='';});
  G('srRes').innerHTML=''; SRDATA=[];
}

function exportSearch(){
  if(!SRDATA.length){toast('لا توجد نتائج','warning'); return;}
  const hd=['رقم المتبرع','الاسم','الفصيلة','نوع القنينة','رقم القنينة','نوع التبرع','تاريخ التبرع','تاريخ النفاد','الفحوصات'];
  const rows=SRDATA.map(r=>[r.donors?.donor_number,r.donors?.full_name,r.blood_type,r.bottle_type,r.bottle_number,r.donation_type,r.donation_date,r.expiry_date,r.serology_result].map(v=>`"${v??''}"`));
  const csv='\uFEFF'+[hd.join(','),...rows.map(r=>r.join(','))].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`بحث_${new Date().toISOString().split('T')[0]}.csv`; a.click();
}
