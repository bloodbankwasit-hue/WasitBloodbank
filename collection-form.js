// استمارة سحب الدم (A4) — من مهام الاستقبال. كل استمارة = 10 أسماء بالضبط، والأسماء المطبوعة لا تظهر في التالية.
// القاعدة: blood_donations.collection_form_id فارغ = لم تُطبع بعد. الطباعة تحجز الأسماء أولاً (collection_forms) ثم تطبع.
const COLLECTION_SIZE = 10;
let _colTab = 'cur', _colBusy = false;

function _colMetaFor(rows, formNo){
  const bags = [...new Set(rows.map(r=>r.bagType).filter(Boolean))].join(' / ');
  const d = new Date();
  return { batch: formNo!=null ? String(formNo) : '', date: d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0'), bagTypes: bags };
}
function _colRow(x){
  const dn = x.donors||{};
  // لا نملأ نتائج الفحوصات: الاستمارة تُعبّأ يدوياً بعد الفحص
  return { donorName: dn.full_name||'', donorNo: dn.donor_number!=null?String(dn.donor_number):'', bagType: x.bottle_type||'', hospitalName: x.hospital_name||'', patientName: x.patient_name||'' };
}
const _colSel = 'id,bottle_type,bottle_number,hospital_name,patient_name,created_at,donors(full_name,donor_number)';

async function colFetchPending(){
  const { data, error } = await db.from('blood_donations').select(_colSel)
    .is('collection_form_id', null).order('created_at', { ascending: true }).limit(200);
  if(error) throw error;
  return data || [];
}
async function colPendingCount(){
  const { count, error } = await db.from('blood_donations').select('id', { count:'exact', head:true }).is('collection_form_id', null);
  if(error) throw error;
  return count || 0;
}

// اطبع الأقدم n (<=10) من غير المطبوعين. ids اختيارية لتحديد أسماء بعينها.
async function colPrintPending(){
  if(_colBusy) return; _colBusy = true;
  try{
    if(window.nativePrint && !window.nativePrint.supportsForm){ toast('نسخة برنامج الكمبيوتر قديمة — أعد تشغيل Install-BloodBank.bat لتفعيل طباعة الاستمارة A4','error',8000); return; }
    if(!IS_ONLINE){ toast('الطباعة تحتاج اتصالاً بالإنترنت','warning'); return; }
    load(true);
    const pend = (await colFetchPending()).slice(0, COLLECTION_SIZE);
    if(!pend.length){ toast('لا توجد أسماء غير مطبوعة','info'); load(false); return; }
    // 1) إنشاء الاستمارة  2) حجز الأسماء (فقط الي لسه فارغة — حماية من طباعة نفس الاسم مرتين)
    const { data: form, error: fe } = await db.from('collection_forms').insert({ names_count: pend.length, printed_by: SES?.user?.id||null }).select().single();
    if(fe) throw fe;
    const { data: got, error: ue } = await db.from('blood_donations').update({ collection_form_id: form.id })
      .in('id', pend.map(p=>p.id)).is('collection_form_id', null).select('id');
    if(ue){ await db.from('collection_forms').delete().eq('id', form.id); throw ue; }
    const gotIds = new Set((got||[]).map(g=>g.id));
    const mine = pend.filter(p=>gotIds.has(p.id));
    if(!mine.length){ await db.from('collection_forms').delete().eq('id', form.id); toast('الأسماء طُبعت من جهاز آخر — حدّث القائمة','warning'); load(false); return; }
    if(mine.length !== pend.length) await db.from('collection_forms').update({ names_count: mine.length }).eq('id', form.id);
    load(false);
    await colPrintRows(mine, form.form_no);
    try{ await colRender(); }catch(e){}
  }catch(e){ load(false); toast('خطأ: '+e.message,'error',6000); }
  finally{ _colBusy = false; }
}

async function colPrintRows(items, formNo){
  if(window.nativePrint && !window.nativePrint.supportsForm){ toast('نسخة برنامج الكمبيوتر قديمة — أعد تشغيل Install-BloodBank.bat لتفعيل طباعة الاستمارة A4','error',8000); return; }
  await loadOneScript('collection-template.js');
  const rows = items.map(_colRow), meta = _colMetaFor(rows, formNo);
  if(isIOSDevice()){
    const blob = await collectionToPdfBlob(rows, meta);
    await shareOrDownloadFile(blob, 'collection-form-'+formNo+'.pdf');
    return;
  }
  printHtmlDocument(buildCollectionHtml(rows, meta), { kind:'form' });
}

// استمارة فارغة (10 صفوف) للمعاينة أو للتعبئة اليدوية — لا تحجز أي اسم
async function colPrintBlank(){
  try{
    if(window.nativePrint && !window.nativePrint.supportsForm){ toast('نسخة برنامج الكمبيوتر قديمة — أعد تشغيل Install-BloodBank.bat','error',8000); return; }
    await loadOneScript('collection-template.js');
    const meta=_colMetaFor([], null);
    if(isIOSDevice()){ await shareOrDownloadFile(await collectionToPdfBlob([],meta),'collection-form-blank.pdf'); return; }
    printHtmlDocument(buildCollectionHtml([],meta),{kind:'form'});
  }catch(e){ toast('خطأ: '+e.message,'error'); }
}

async function colReprint(formId, formNo){
  try{
    load(true);
    const { data, error } = await db.from('blood_donations').select(_colSel).eq('collection_form_id', formId).order('created_at', { ascending:true });
    load(false);
    if(error) throw error;
    if(!data || !data.length){ toast('لا توجد أسماء لهذه الاستمارة','warning'); return; }
    await colPrintRows(data, formNo);
  }catch(e){ load(false); toast('خطأ: '+e.message,'error'); }
}

function colTab(t){ _colTab = t; colRender(); }
async function openCollectionModal(t){ _colTab = t||'cur'; G('collectionModal').classList.add('on'); await colRender(); }

async function colRender(){
  const box = G('colBody'); if(!box) return;
  G('colTabCur').classList.toggle('btn-p', _colTab==='cur'); G('colTabArc').classList.toggle('btn-p', _colTab==='arc');
  box.innerHTML = '<div style="text-align:center;padding:20px;color:#6B7280">جاري التحميل...</div>';
  try{
    if(_colTab==='cur'){
      const all = await colFetchPending(), shown = all.slice(0, COLLECTION_SIZE);
      let h = `<div style="font-size:13px;color:#374151;margin-bottom:8px">غير المطبوعة: <b>${all.length}</b> — الاستمارة تحمل ${COLLECTION_SIZE} أسماء كحد أقصى${all.length>COLLECTION_SIZE?' (تُطبع الأقدم أولاً والباقي للاستمارة التالية)':''}</div>`;
      if(!shown.length) h += '<div style="text-align:center;padding:18px;color:#6B7280">لا توجد أسماء بانتظار الطباعة</div>';
      else h += '<div style="max-height:46vh;overflow:auto;border:1px solid #E5E7EB;border-radius:8px">' + shown.map((x,i)=>`<div style="display:flex;gap:8px;padding:7px 10px;border-bottom:1px solid #F3F4F6;font-size:14px"><b style="width:22px">${i+1}</b><span style="flex:1">${esc(x.donors?.full_name||'')}</span><span style="color:#6B7280">${esc(x.bottle_type||'')} ${esc(x.bottle_number||'')}</span></div>`).join('') + '</div>';
      h += `<button class="btn btn-p" ${shown.length?'':'disabled'} onclick="colPrintPending()" style="width:100%;justify-content:center;margin-top:12px">🖨️ طباعة الاستمارة (${shown.length} ${shown.length===1?'اسم':'أسماء'})</button>`;
      h += `<button class="btn" onclick="colPrintBlank()" style="width:100%;justify-content:center;margin-top:8px">📄 طباعة استمارة فارغة (معاينة)</button>`;
      box.innerHTML = h;
    } else {
      const { data, error } = await db.from('collection_forms').select('id,form_no,names_count,printed_at').gt('form_no', 0).order('form_no', { ascending:false }).limit(60);
      if(error) throw error;
      box.innerHTML = !(data||[]).length ? '<div style="text-align:center;padding:18px;color:#6B7280">لا توجد استمارات مطبوعة بعد</div>'
        : '<div style="max-height:52vh;overflow:auto">' + data.map(f=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:14px"><b>#${f.form_no}</b><span style="flex:1;color:#374151">${f.names_count} أسماء — ${esc(new Date(f.printed_at).toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'}))}</span><button class="btn" onclick="colReprint('${f.id}',${f.form_no})">🖨️ إعادة طباعة</button></div>`).join('') + '</div>';
    }
  }catch(e){ box.innerHTML = '<div style="color:#B91C1C;padding:14px;font-size:13px">تعذر التحميل: '+esc(e.message)+'</div>'; }
}

// بعد كل حفظ ناجح للاستقبال: إذا اكتملت 10 غير مطبوعة تظهر نافذة الطباعة مباشرة
async function colCheckAutoPopup(){
  try{
    if(!IS_ONLINE) return;
    if(await colPendingCount() >= COLLECTION_SIZE){
      toast('✅ اكتملت 10 أسماء — جاهزة لطباعة الاستمارة','success',4000);
      await openCollectionModal('cur');
    }
  }catch(e){ console.log('collection popup check failed', e); }
}
