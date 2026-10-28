// استمارة سحب الدم (A4) — الاستمارة تُفتح تلقائياً عند حفظ أول متبرع، وتتراكم فيها الأسماء حتى 10 ثم تُغلق وتُفتح غيرها.
// الاستمارة نفسها هي ما يظهر في وحدات العمل (السحب...) — راجع forms-view.js. بعد الطباعة لا تُضاف لها أسماء.
// ثلاث قوائم منفصلة: T = تريما، R = ريفيوس، B = بقية الأنواع. A = رمز قديم يبقى لاسم الأرشيف فقط.
const COLLECTION_SIZE = 10;
const COL_GROUPS = { T:{ name:'تريما' }, R:{ name:'ريفيوس' }, B:{ name:'بقية الأنواع' }, A:{ name:'تريما وريفيوس (قديمة)' } };
const COL_LISTS = ['T','R','B'];
function colGroupOf(bottleType){ return bbFormGroup(bottleType); }
let _colTab = 'T', _colBusy = false, _colPopupTimer = null;

const _colDate = v => { if(!v) return ''; const d=new Date(v); return isNaN(d)?'':d.toLocaleDateString('en-CA').replace(/-/g,'/'); };
async function _colRpc(fn,args){ const r=await db.rpc(fn,args||{}); if(r.error) throw r.error; return r.data; }
async function colForms(groups,limit){ return await _colRpc('forms_recent',{p_groups:groups,p_limit:limit||60}) || []; }
async function colMembers(ids){
  if(!ids.length) return {};
  const rows = await _colRpc('form_members',{p_forms:ids}) || [], by = {};
  rows.forEach(m=>{ (by[m.form_id]=by[m.form_id]||[]).push(m); });
  return by;
}

function _colMetaFor(rows, formNo, dateStr){
  const bags = [...new Set(rows.map(r=>r.bagType).filter(Boolean))].join(' / ');
  const d = new Date();
  return { batch: formNo!=null ? String(formNo) : '', date: dateStr || (d.getFullYear()+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')), bagTypes: bags };
}
function _colRow(x){
  // لا نملأ نتائج الفحوصات: الاستمارة تُعبّأ يدوياً بعد الفحص
  const nm = x.full_name!=null ? x.full_name : (x.donors&&x.donors.full_name)||'';
  return { donorName: bbTa(nm||''), donorNo: x.bottle_number!=null?String(x.bottle_number):'', bagType: x.bottle_type||'', hospitalName: bbTa(x.hospital_name||''), patientName: bbTa(x.patient_name||'') };
}

async function colPrintRows(items, formNo, dateStr){
  if(window.nativePrint && !window.nativePrint.supportsForm){ toast('نسخة برنامج الكمبيوتر قديمة — أعد تشغيل Install-BloodBank.bat لتفعيل طباعة الاستمارة A4','error',8000); return false; }
  await loadOneScript('collection-template.js');
  const rows = items.map(_colRow), meta = _colMetaFor(rows, formNo, dateStr);
  if(isIOSDevice()){
    const blob = await collectionToPdfBlob(rows, meta);
    await shareOrDownloadFile(blob, 'collection-form-'+formNo+'.pdf');
    return true;
  }
  printHtmlDocument(buildCollectionHtml(rows, meta), { kind:'form' });
  return true;
}

// اطبع استمارة (تُغلق وتُسجَّل مطبوعة). المرفوض طبياً لا يُطبع لأنه لم يُسحب منه دم.
async function colPrintForm(formId, formNo, dateStr, alreadyPrinted){
  if(_colBusy) return; _colBusy = true;
  try{
    if(!IS_ONLINE){ toast('الطباعة تحتاج اتصالاً بالإنترنت','warning'); return; }
    load(true);
    const by = await colMembers([formId]);
    const items = (by[formId]||[]).filter(m=>m.exit_reason!=='medical_reject');
    load(false);
    if(!items.length){ toast('لا توجد أسماء بهذه الاستمارة','info'); return; }
    const ok = await colPrintRows(items, formNo, dateStr);
    if(ok && !alreadyPrinted) await _colRpc('form_set_state',{p_form:formId,p_action:'printed'});
    try{ await colRender(); }catch(e){}
    try{ refreshExpiryNotifications(); }catch(e){}
  }catch(e){ load(false); toast('خطأ: '+(e.message||e),'error',6000); }
  finally{ _colBusy = false; }
}
// معاينة الاستمارة قبل الطباعة (لا تغيّر حالتها)
async function colPreviewForm(formId, formNo, dateStr, printed){
  try{
    load(true);
    const by = await colMembers([formId]);
    const items = (by[formId]||[]).filter(m=>m.exit_reason!=='medical_reject');
    await loadOneScript('collection-template.js');
    load(false);
    if(!items.length){ toast('لا توجد أسماء بهذه الاستمارة','info'); return; }
    const rows = items.map(_colRow), meta = _colMetaFor(rows, formNo, dateStr);
    const html = buildCollectionHtml(rows, meta);
    let ov = document.getElementById('colPrevOv'); if(ov) ov.remove();
    ov = document.createElement('div'); ov.id='colPrevOv';
    ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.75);display:flex;flex-direction:column;padding:10px;gap:8px';
    ov.innerHTML='<div style="display:flex;gap:8px"><button class="btn btn-p" id="colPrevPrint" style="flex:1;justify-content:center">🖨️ طباعة</button><button class="btn" id="colPrevClose" style="flex:1;justify-content:center">إغلاق</button></div><iframe id="colPrevFrame" style="flex:1;width:100%;border:0;background:#fff;border-radius:8px"></iframe>';
    document.body.appendChild(ov);
    document.getElementById('colPrevFrame').srcdoc = html;
    document.getElementById('colPrevClose').onclick=()=>ov.remove();
    document.getElementById('colPrevPrint').onclick=()=>{ ov.remove(); colPrintForm(formId, formNo, dateStr, !!printed); };
  }catch(e){ load(false); toast('خطأ: '+(e.message||e),'error',5000); }
}
async function colMoveWaiting(formId){
  try{
    await _colRpc('form_set_state',{p_form:formId,p_action:'waiting'});
    toast('⏳ نُقلت الاستمارة للانتظار — تجدها بالأرشيف وسيصلك تنبيه','success',4000);
    try{ refreshExpiryNotifications(); }catch(e){}
    G('collectionModal').classList.remove('on');
    await colRender();
  }catch(e){ toast('خطأ: '+(e.message||e),'error',5000); }
}

// استمارة فارغة (10 صفوف) للمعاينة أو للتعبئة اليدوية — لا تمس أي اسم
async function colPrintBlank(){
  try{
    if(window.nativePrint && !window.nativePrint.supportsForm){ toast('نسخة برنامج الكمبيوتر قديمة — أعد تشغيل Install-BloodBank.bat','error',8000); return; }
    await loadOneScript('collection-template.js');
    const meta=_colMetaFor([], null);
    if(isIOSDevice()){ await shareOrDownloadFile(await collectionToPdfBlob([],meta),'collection-form-blank.pdf'); return; }
    printHtmlDocument(buildCollectionHtml([],meta),{kind:'form'});
  }catch(e){ toast('خطأ: '+e.message,'error'); }
}

function colTab(t){ _colTab = t; colRender(); }
async function openCollectionModal(t){ _colTab = t||'T'; G('collectionModal').classList.add('on'); await colRender(); }

function _colFormBlock(f, members, mode){
  const act = members.filter(m=>m.exit_reason!=='medical_reject');
  const names = members.map((m,i)=>`<div style="display:flex;gap:8px;padding:6px 10px;border-bottom:1px solid #F3F4F6;font-size:14px"><b style="width:22px">${i+1}</b><span style="flex:1;${m.exit_reason==='medical_reject'?'color:#B91C1C;text-decoration:line-through':''}">${esc(bbTa(m.full_name||''))}</span><span style="color:#6B7280">${esc(m.bottle_type||'')} ${esc(m.bottle_number||'')}</span></div>`).join('');
  const dt = _colDate(f.last_name_at);
  const head = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><b style="font-size:15px">استمارة #${f.form_no} — ${esc((COL_GROUPS[f.form_group]||{}).name||'')}</b><span style="font-size:12.5px;color:#6B7280">${esc(dt)} — ${members.length} أسماء${f.status==='open'?' (مفتوحة)':''}</span></div>`;
  const args = `'${f.id}',${f.form_no},'${dt}',${f.printed_at?'true':'false'}`;
  const btns = `<div style="display:flex;gap:6px;margin-top:8px"><button class="btn" style="flex:1;justify-content:center" ${act.length?'':'disabled'} onclick="colPreviewForm('${f.id}',${f.form_no},'${dt}',${f.printed_at?'true':'false'})">👁 معاينة</button><button class="btn btn-p" style="flex:1;justify-content:center" ${act.length?'':'disabled'} onclick="colPrintForm(${args})">🖨️ طباعة (${act.length})</button>`
    + (mode==='print' && !f.printed_at && !f.waiting_print_at ? `<button class="btn" style="flex:1;justify-content:center" onclick="colMoveWaiting('${f.id}')">⏳ نقل للانتظار</button>` : '') + `</div>`;
  return `<div style="border:1px solid #E5E7EB;border-radius:10px;padding:10px;margin-bottom:10px">${head}<div style="max-height:30vh;overflow:auto;border:1px solid #F3F4F6;border-radius:8px">${names||'<div style="padding:10px;color:#6B7280;text-align:center">لا توجد أسماء</div>'}</div>${btns}</div>`;
}

async function colRender(){
  const box = G('colBody'); if(!box) return;
  ['T','R','B','Arc'].forEach(k=>{ const e=G('colTab'+k); if(e) e.classList.toggle('btn-p', _colTab===(k==='Arc'?'arc':k)); });
  box.innerHTML = '<div style="text-align:center;padding:20px;color:#6B7280">جاري التحميل...</div>';
  try{
    if(COL_LISTS.includes(_colTab)){
      const g=_colTab, forms=(await colForms([g],30)).filter(f=>f.status==='open' || (f.status==='closed' && !f.printed_at && !f.waiting_print_at));
      const by=await colMembers(forms.map(f=>f.id));
      let h = `<div style="font-size:13px;color:#374151;margin-bottom:8px">استمارة <b>${COL_GROUPS[g].name}</b>: تُفتح تلقائياً مع أول متبرع، وتُغلق عند اكتمال ${COLLECTION_SIZE} أسماء أو عند طباعتها. بعد الطباعة لا تُضاف لها أسماء.</div>`;
      h += forms.length ? forms.map(f=>_colFormBlock(f,by[f.id]||[],'print')).join('') : '<div style="text-align:center;padding:18px;color:#6B7280">لا توجد استمارة مفتوحة — تُفتح عند تسجيل أول متبرع</div>';
      h += `<button class="btn" onclick="colPrintBlank()" style="width:100%;justify-content:center;margin-top:4px">📄 طباعة استمارة فارغة (معاينة)</button>`;
      box.innerHTML = h;
    } else {
      const forms = await colForms(['T','R','B','A'],80);
      const waiting = forms.filter(f=>f.waiting_print_at && !f.printed_at), printed = forms.filter(f=>f.printed_at);
      const by = await colMembers(waiting.map(f=>f.id));
      const row = f=>`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #F3F4F6;font-size:14px"><b>#${f.form_no}</b><span style="flex:1;color:#374151">${esc((COL_GROUPS[f.form_group]||{}).name||'')} — ${f.names_count} أسماء — ${esc(_colDate(f.last_name_at||f.printed_at))}</span><button class="btn" onclick="colPrintForm('${f.id}',${f.form_no},'${_colDate(f.last_name_at||f.printed_at)}',${f.printed_at?'true':'false'})">🖨️ ${f.printed_at?'إعادة طباعة':'طباعة'}</button></div>`;
      let h = '';
      if(waiting.length) h += `<div style="font-weight:700;color:#B45309;margin-bottom:6px">⏳ بانتظار الطباعة (${waiting.length})</div><div style="border:1px solid #FDE68A;background:#FFFBEB;border-radius:10px;margin-bottom:12px">${waiting.map(row).join('')}</div>`;
      h += printed.length ? `<div style="font-weight:700;margin-bottom:6px">المطبوعة</div><div style="max-height:46vh;overflow:auto;border:1px solid #E5E7EB;border-radius:10px">${printed.map(row).join('')}</div>` : (waiting.length?'':'<div style="text-align:center;padding:18px;color:#6B7280">لا توجد استمارات بالأرشيف بعد</div>');
      box.innerHTML = h;
    }
  }catch(e){ box.innerHTML = '<div style="color:#B91C1C;padding:14px;font-size:13px">تعذر التحميل: '+esc(e.message||String(e))+'</div>'; }
}

// بعد اكتمال 10 أسماء: تظهر نافذة الطباعة بعد انتهاء طباعة بطاقة الاسم وملصقاته (إغلاق نافذة الطباعة) + 5 ثوانٍ.
function colSchedulePopup(info, group){
  if(!info || !info.closed) return;
  clearTimeout(_colPopupTimer);
  const tick = ()=>{
    if(G('rcPrintModal') && G('rcPrintModal').classList.contains('on')){ _colPopupTimer = setTimeout(tick,1000); return; }
    _colPopupTimer = setTimeout(()=>{
      toast('✅ اكتملت 10 أسماء — استمارة #'+info.form_no+' جاهزة للطباعة','success',4000);
      openCollectionModal(group||'B');
    }, 5000);
  };
  tick();
}
