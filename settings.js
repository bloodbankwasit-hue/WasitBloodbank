// ================================================================
// BACKUP & SETTINGS
// ================================================================
async function exportBackup(){
  toast('جاري تحضير النسخة الاحتياطية...','info'); load(true);
  const [r1,r2,r3]=await Promise.all([
    db.from('donors').select('*').eq('is_deleted',false),
    db.from('blood_donations').select('*').eq('is_deleted',false),
    db.from('rejected_donors').select('*').eq('is_deleted',false)
  ]);
  load(false);
  const toCSV=(rows,keys)=>{
    if(!rows?.length) return '';
    return'\uFEFF'+[keys.join(','),...rows.map(r=>keys.map(k=>`"${r[k]??''}"`).join(','))].join('\n');
  };
  const dn=['id','donor_number','full_name','birth_year','gender','mother_name','national_id','mobile','address','occupation','created_at'];
  const dk=['id','donor_id','bottle_number','bottle_type','donation_type','patient_name','hospital_name','donation_date','donation_time','draw_date','expiry_date','blood_type','blood_pressure','weight','pulse','hemoglobin','serology_result','serology_type','created_at'];
  const rk=['id','full_name','age','rejection_reason','rejection_date','rejection_type','notes','created_at'];
  [[r1.data,dn,'donors'],[r2.data,dk,'donations'],[r3.data,rk,'rejected']].forEach(([data,keys,name])=>{
    if(!data?.length) return;
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([toCSV(data,keys)],{type:'text/csv;charset=utf-8'}));
    a.download=`backup_${name}_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  });
  toast('تم تصدير النسخة الاحتياطية (3 ملفات CSV)','success');
}

function showAbout(){
  toast('نظام مصرف الدم — واسط | الإصدار 2.0.0 | Powered by Supabase + GitHub Pages','info',6000);
}

function dangerZone(){
  if(UPROF?.role!=='admin'){toast('هذا الإجراء متاح للمدير فقط','error'); return;}
  toast('للحذف الدائم: اتصل بمسؤول قاعدة البيانات مباشرةً','warning',5000);
}
