// ================================================================
// مواد فحص الفيروسات (HIV, HBcore, HBsAg, HCV, Syphilis ...) — الرصيد المتبقي بالفحوصات.
// • كل قنينة تُفحص لأول مرة تخصم فحصاً واحداً من كل مادة «تُخصم تلقائياً» (يتم داخل applyLabUpdate عبر lab_reagent_use).
// • موظف الفيروسات/المدير يضيف كمية جديدة، أو يصحّح الرصيد، أو يضبط «حد التنبيه» لكل مادة، أو يضيف مادة جديدة.
// • عند وصول الرصيد لحد التنبيه (أو النفاد) يظهر إشعار بالجرس وتظهر المواد بإحصائيات الفيروسات.
// الجداول: lab_reagents, lab_reagent_log — والدوال: lab_reagent_use / lab_reagent_add / lab_reagent_set.
// ================================================================
let _rgRows=[];
function rgCan(){ return UPROF?.role==='admin' || (typeof hasPermission==='function' && hasPermission('virology')); }
function rgState(r){ return r.qty<=0 ? {c:'#991B1B',bg:'#FEF2F2',bd:'#FECACA',t:'⛔ نفدت'} : r.qty<=r.low_threshold ? {c:'#92400E',bg:'#FFFBEB',bd:'#FDE68A',t:'⚠️ قاربت على النفاد'} : {c:'#166534',bg:'#F0FDF4',bd:'#BBF7D0',t:'✅ كافية'}; }
async function rgOpen(){
  if(!rgCan()){ toast('⛔ هذا القسم للمدير أو موظفي وحدة الفيروسات','error'); return; }
  let ov=G('rgModal'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.className='overlay on'; ov.id='rgModal'; ov.style.zIndex=9000;
  ov.innerHTML='<div class="modal" style="width:min(680px,97vw);max-height:92vh;display:flex;flex-direction:column"><div class="modal-title"><i class="ti ti-flask"></i> مواد فحص الفيروسات</div><div class="modal-body" id="rgBody" style="overflow:auto;flex:1;min-width:0"></div><div class="modal-foot"><button class="btn" onclick="rgLog()"><i class="ti ti-history"></i> سجل الحركات</button><button class="btn" onclick="rgNew()"><i class="ti ti-plus"></i> مادة جديدة</button><button class="btn" onclick="G(\'rgModal\').remove()"><i class="ti ti-x"></i> إغلاق</button></div></div>';
  document.body.appendChild(ov);
  await rgRender();
}
async function rgLoad(){
  const{data,error}=await db.from('lab_reagents').select('*').eq('is_active',true).order('name');
  if(error) throw error; _rgRows=data||[]; return _rgRows;
}
async function rgRender(){
  const B=G('rgBody'); if(!B) return;
  B.innerHTML='<div class="empty"><p>جاري التحميل...</p></div>';
  try{ await rgLoad(); }catch(e){ B.innerHTML='<div style="color:#B91C1C;font-weight:700">تعذّر التحميل: '+esc(e.message||e)+'<br><small>تأكد من تشغيل SQL مواد الفحص في Supabase</small></div>'; return; }
  if(!_rgRows.length){ B.innerHTML='<div class="empty"><p>لا توجد مواد. أضف مادة جديدة.</p></div>'; return; }
  B.innerHTML='<div style="font-size:14px;color:#6B7280;margin-bottom:8px">الرصيد بعدد الفحوصات. المواد المعلَّمة «تلقائي» تُخصم كل ما تُفحص قنينة جديدة.</div>'
   +_rgRows.map(r=>{ const s=rgState(r); return `<div style="border:1.5px solid ${s.bd};background:${s.bg};border-radius:12px;padding:12px;margin-bottom:10px">
     <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
       <div><div style="font-weight:800;font-size:19px">${esc(r.name)} ${r.per_test?'<span style="font-size:12px;background:#E0F2FE;color:#075985;border-radius:8px;padding:2px 6px">تلقائي</span>':''}</div>
       <div style="font-size:13.5px;color:${s.c};font-weight:700">${s.t} — حد التنبيه ${fnum(r.low_threshold)}</div></div>
       <div style="font-size:30px;font-weight:900;color:${s.c}">${fnum(r.qty)}</div></div>
     <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
       <button class="btn btn-p" onclick="rgAsk('add','${r.id}')"><i class="ti ti-plus"></i> إضافة كمية</button>
       <button class="btn" onclick="rgAsk('set','${r.id}')"><i class="ti ti-edit"></i> تصحيح الرصيد</button>
       <button class="btn" onclick="rgAsk('thr','${r.id}')"><i class="ti ti-bell"></i> حد التنبيه</button></div></div>`; }).join('');
}
function rgForm(title,inner,okFn){
  let f=G('rgFormOv'); if(f) f.remove();
  f=document.createElement('div'); f.className='overlay on'; f.id='rgFormOv'; f.style.zIndex=9100;
  f.innerHTML=`<div class="modal" style="width:min(420px,95vw)"><div class="modal-title">${title}</div><div class="modal-body">${inner}</div><div class="modal-foot"><button class="btn" onclick="G('rgFormOv').remove()">إلغاء</button><button class="btn btn-p" onclick="${okFn}"><i class="ti ti-device-floppy"></i> حفظ</button></div></div>`;
  document.body.appendChild(f); const i=f.querySelector('input'); if(i) setTimeout(()=>i.focus(),50);
}
const _rgNum=id=>{ const v=parseInt(normDigits(G(id).value).replace(/[^0-9]/g,'')); return Number.isInteger(v)?v:NaN; };
const _rgIn=(id,label,ph)=>`<div class="fgrp"><label>${label}</label><input type="text" inputmode="numeric" id="${id}" placeholder="${ph||''}" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'')"></div>`;
function rgAsk(kind,id){
  const r=_rgRows.find(x=>x.id===id); if(!r) return;
  const note=`<div class="fgrp"><label>ملاحظة (اختياري)</label><input type="text" id="rg-note" placeholder="مثلاً: وصلت شحنة جديدة"></div>`;
  if(kind==='add') rgForm(esc(r.name)+' — إضافة كمية', `<div style="margin-bottom:8px;color:#6B7280">الرصيد الحالي: <b>${fnum(r.qty)}</b></div>`+_rgIn('rg-n','الكمية المضافة (عدد الفحوصات)')+note, `rgSave('add','${id}')`);
  else if(kind==='set') rgForm(esc(r.name)+' — تصحيح الرصيد', `<div style="margin-bottom:8px;color:#6B7280">الرصيد الحالي: <b>${fnum(r.qty)}</b> — اكتب الرصيد الصحيح الجديد (بعد الجرد)</div>`+_rgIn('rg-n','الرصيد الصحيح')+`<div class="fgrp"><label>سبب التصحيح *</label><input type="text" id="rg-note" placeholder="مثلاً: جرد فعلي"></div>`, `rgSave('set','${id}')`);
  else rgForm(esc(r.name)+' — حد التنبيه', `<div style="margin-bottom:8px;color:#6B7280">الحد الحالي: <b>${fnum(r.low_threshold)}</b> — يظهر الإشعار عند وصول الرصيد له أو أقل</div>`+_rgIn('rg-n','الحد الجديد'), `rgSave('thr','${id}')`);
}
async function rgSave(kind,id){
  if(!rgCan()) return; if(!IS_ONLINE){ toast('يحتاج اتصالاً بالإنترنت','warning'); return; }
  const n=_rgNum('rg-n'), note=(G('rg-note')?.value||'').trim();
  if(!Number.isInteger(n)||n<0||(kind==='add'&&n<1)){ toast('اكتب رقماً صحيحاً','error'); return; }
  if(kind==='set' && !note){ toast('اكتب سبب التصحيح','error'); return; }
  load(true);
  try{
    let r;
    if(kind==='add') r=await db.rpc('lab_reagent_add',{p_id:id,p_n:n,p_note:note||null});
    else if(kind==='set') r=await db.rpc('lab_reagent_set',{p_id:id,p_qty:n,p_note:note});
    else r=await db.from('lab_reagents').update({low_threshold:n,updated_at:new Date().toISOString()}).eq('id',id);
    if(r.error) throw r.error;
    G('rgFormOv')?.remove(); toast('✅ تم الحفظ','success',3000);
    await rgRender(); if(typeof refreshExpiryNotifications==='function') refreshExpiryNotifications();
  }catch(e){ toast('خطأ: '+(e.message||e)+(/lab_reagent|function/i.test(e.message||'')?' — شغّل SQL مواد الفحص':''),'error',8000); }
  finally{ load(false); }
}
function rgNew(){
  rgForm('مادة جديدة',`<div class="fgrp"><label>اسم المادة *</label><input type="text" id="rg-name"></div>`+_rgIn('rg-n','الكمية الحالية (فحوصات)','0')+_rgIn('rg-t','حد التنبيه','50')
    +`<label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="rg-auto" checked style="width:18px;height:18px"> تُخصم تلقائياً مع كل قنينة تُفحص</label>`,'rgCreate()');
}
async function rgCreate(){
  if(!rgCan()) return; if(!IS_ONLINE){ toast('يحتاج اتصالاً بالإنترنت','warning'); return; }
  const name=(G('rg-name').value||'').trim(), n=_rgNum('rg-n'), t=_rgNum('rg-t');
  if(!name){ toast('اكتب اسم المادة','error'); return; }
  load(true);
  try{
    const{data,error}=await db.from('lab_reagents').insert({name,qty:Number.isInteger(n)?n:0,low_threshold:Number.isInteger(t)?t:50,per_test:!!G('rg-auto').checked}).select().single();
    if(error) throw error;
    await db.from('lab_reagent_log').insert({reagent_id:data.id,delta:data.qty,qty_after:data.qty,kind:'init',note:'إضافة المادة',created_by:SES?.user?.id});
    G('rgFormOv')?.remove(); toast('✅ أُضيفت المادة','success',3000);
    await rgRender(); if(typeof refreshExpiryNotifications==='function') refreshExpiryNotifications();
  }catch(e){ toast(/duplicate|unique/i.test(e.message||'')?'⛔ هذه المادة موجودة مسبقاً':('خطأ: '+(e.message||e)),'error',6000); }
  finally{ load(false); }
}
async function rgLog(){
  let f=G('rgFormOv'); if(f) f.remove();
  f=document.createElement('div'); f.className='overlay on'; f.id='rgFormOv'; f.style.zIndex=9100;
  f.innerHTML='<div class="modal" style="width:min(560px,97vw);max-height:90vh;display:flex;flex-direction:column"><div class="modal-title">سجل حركات المواد</div><div class="modal-body" id="rgLogB" style="overflow:auto;flex:1"><div class="empty"><p>جاري التحميل...</p></div></div><div class="modal-foot"><button class="btn" onclick="G(\'rgFormOv\').remove()">إغلاق</button></div></div>';
  document.body.appendChild(f);
  try{
    const{data,error}=await db.from('lab_reagent_log').select('delta,qty_after,kind,note,created_at,lab_reagents(name)').order('created_at',{ascending:false}).limit(100);
    if(error) throw error;
    const K={add:'إضافة',set:'تصحيح',init:'إضافة مادة'};
    G('rgLogB').innerHTML=(data&&data.length)?'<table style="width:100%;border-collapse:collapse;font-size:14.5px"><thead><tr style="background:#F3F4F6"><th style="padding:6px">التاريخ</th><th>المادة</th><th>الحركة</th><th>الفرق</th><th>الرصيد بعدها</th><th>ملاحظة</th></tr></thead><tbody>'
      +data.map(r=>`<tr style="border-top:1px solid #F1F5F9;text-align:center"><td style="padding:6px">${typeof bbDmyTime==='function'?bbDmyTime(r.created_at):r.created_at}</td><td style="font-weight:700">${esc(r.lab_reagents?.name||'')}</td><td>${K[r.kind]||r.kind}</td><td style="color:${r.delta<0?'#B91C1C':'#166534'};font-weight:700;direction:ltr">${r.delta>0?'+':''}${r.delta}</td><td>${r.qty_after??''}</td><td style="font-size:13px;color:#475569">${esc(r.note||'')}</td></tr>`).join('')+'</tbody></table>':'<div class="empty"><p>لا توجد حركات</p></div>';
  }catch(e){ G('rgLogB').innerHTML='<div style="color:#B91C1C">تعذّر التحميل: '+esc(e.message||e)+'</div>'; }
}
