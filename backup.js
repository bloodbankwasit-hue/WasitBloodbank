// ================================================================
// FULL BACKUP & RESTORE — exports every table to one downloadable file, and can
// restore from it later (upsert-only: adds/updates rows from the file, never
// deletes anything currently in the database — safe by design for disaster
// recovery without risking existing data).
// ================================================================
const BACKUP_TABLES = [
  'donors','blood_donations','rejected_donors','campaigns','campaign_slots',
  'bottle_sequences','bottle_number_pool','user_profiles','audit_log'
];
// Tables are restored in this order so foreign-key references (e.g. a donation
// pointing at a donor) always land after the row they point to.
const BACKUP_RESTORE_ORDER = [
  'user_profiles','donors','bottle_sequences','campaigns',
  'blood_donations','campaign_slots','rejected_donors','bottle_number_pool','audit_log'
];

async function exportFullBackup(){
  if(!confirm('سيتم تصدير كل بيانات النظام (المتبرعون، التبرعات، الحملات، المستخدمون، سجل التتبع...) بملف واحد. متابعة؟')) return;
  load(true);
  try{
    const backup = { exported_at: new Date().toISOString(), app: 'WasitBloodbank', version: 1, tables: {} };
    for(const t of BACKUP_TABLES){
      let all=[], from=0, pageSize=1000, hasMore=true;
      while(hasMore){
        const{data,error}=await db.from(t).select('*').range(from, from+pageSize-1);
        if(error) throw new Error(t+': '+error.message);
        all=all.concat(data||[]);
        hasMore=(data||[]).length===pageSize;
        from+=pageSize;
      }
      backup.tables[t]=all;
    }
    const blob=new Blob([JSON.stringify(backup)], {type:'application/json'});
    const filename='نسخة_احتياطية_مصرف_الدم_'+new Date().toISOString().split('T')[0]+'.json';
    await shareOrDownloadFile(blob, filename, 'application/json');
    const total=Object.values(backup.tables).reduce((s,rows)=>s+rows.length,0);
    toast('✅ تم تصدير النسخة الاحتياطية بنجاح — '+total+' سجل','success',4500);
  }catch(e){
    toast('خطأ أثناء التصدير: '+e.message,'error',5000);
  }finally{
    load(false);
  }
}

let _restoreFile=null;
function handleRestoreFileSelect(input){
  _restoreFile = (input.files && input.files[0]) || null;
  const label=G('restoreFileName');
  if(label) label.textContent = _restoreFile ? ('📄 '+_restoreFile.name) : 'لم يتم اختيار ملف';
}

// Upsert-only restore: every row in the backup file is inserted or, if a row with the
// same id already exists, updated to match the backup. Nothing currently in the database
// is ever deleted by this — it only adds or repairs, which is the safe behavior for
// "قاعدة بيانات فقدت جزء من بياناتها" without risking data entered after the backup.
async function importFullBackup(){
  if(UPROF?.role!=='admin'){ toast('استعادة النسخة الاحتياطية متاحة لمدير النظام فقط','error'); return; }
  if(!_restoreFile){ toast('يرجى اختيار ملف النسخة الاحتياطية أولاً','error'); return; }
  if(!confirm('⚠️ سيتم إضافة أو تحديث كل السجلات الموجودة بالملف داخل قاعدة البيانات الحالية.\nلن يُحذف أي شيء موجود حالياً. متابعة؟')) return;
  if(!confirm('تأكيد أخير — هذا إجراء يمس كل بيانات النظام. متأكد تريد الاستمرار؟')) return;
  load(true);
  try{
    const text = await _restoreFile.text();
    let backup;
    try{ backup = JSON.parse(text); }catch(e){ throw new Error('الملف تالف أو ليس نسخة احتياطية صالحة'); }
    if(!backup || !backup.tables) throw new Error('الملف لا يحتوي بيانات جداول صالحة');

    let totalRestored=0, skippedTables=[];
    for(const t of BACKUP_RESTORE_ORDER){
      const rows = backup.tables[t];
      if(!rows || !rows.length) continue;
      let tableOk=true;
      for(let i=0;i<rows.length;i+=500){
        const batch=rows.slice(i,i+500);
        const{error}=await db.from(t).upsert(batch,{onConflict:'id'});
        if(error){ skippedTables.push(t+' ('+error.message+')'); tableOk=false; break; }
      }
      if(tableOk) totalRestored+=rows.length;
    }

    await db.from('audit_log').insert({
      user_id:SES?.user?.id, user_name:UPROF?.full_name, action:'UPDATE',
      table_name:'FULL_RESTORE', record_id:null,
      new_values:{restored_rows:totalRestored, backup_date:backup.exported_at, skipped:skippedTables}
    });

    if(skippedTables.length){
      toast('⚠️ تمت الاستعادة جزئياً ('+totalRestored+' سجل) — تعذّر: '+skippedTables.join('، '),'warning',7000);
    } else {
      toast('✅ تمت الاستعادة بنجاح — '+totalRestored+' سجل','success',5000);
    }
    _restoreFile=null;
    const label=G('restoreFileName'); if(label) label.textContent='لم يتم اختيار ملف';
    const input=G('restoreFileInput'); if(input) input.value='';
  }catch(e){
    toast('خطأ أثناء الاستعادة: '+e.message,'error',6000);
  }finally{
    load(false);
  }
}
