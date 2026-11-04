// ================================================================
// تجهيز مستشفيات — نافذة: (المستشفى + عدد القناني + رقم الكتاب + تاريخ الكتاب + نوع التجهيز مرة واحدة) ثم تتولّد أسطر بعدد القناني.
// كل سطر: رقم القنينة (يدوي) → تُملأ الفصيلة ونوع القنينة تلقائياً، ويُختار تلقائياً المكوّن المحدد بالأعلى إن كان متوفراً.
// الحفظ بعملية واحدة (RPC dispatch_hospital): إما تُجهَّز كل القناني أو لا شيء.
// ================================================================
const SHP_COMPS = [ ['دم كامل','دم'], ['دم مضغوط','دم مضغوط'], ['دم مفلتر','دم مفلتر'], ['بلازما','بلازما'], ['بروتين بارد','Cryo'], ['صفائح دموية','صفيحات دموية'] ];
const SHP_SANE = 3000;   // لا حد عملي للعدد؛ هذا فقط حارس ضد خطأ كتابة (مثل 100000) يجمّد الصفحة
let _shpRows = [], _shpSeq = 0, _shpBusy = false;
const shpEsc = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));
const shpLbl = k => (SHP_COMPS.find(c=>c[0]===k)||[k,k])[1];

function shpEnsureModal(){
  if(G('supplyHospModal')) return;
  const hosp = [...(G('rc-hosp')?.options||[])].filter(o=>o.value && o.value!=='أخرى').map(o=>o.value);
  const m = document.createElement('div');
  m.className='overlay'; m.id='supplyHospModal';
  m.innerHTML = `<style>
    #supplyHospModal .modal{overflow-x:hidden}
    #supplyHospModal .modal-body{overflow-x:hidden;min-width:0}
    #supplyHospModal .shp-head{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,.8fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.1fr);gap:10px;align-items:start;direction:rtl}
    #supplyHospModal .shp-head>*{min-width:0}
    #supplyHospModal .shp-head input,#supplyHospModal .shp-head select{width:100%;box-sizing:border-box;min-width:0}
    #supplyHospModal .shp-row{display:grid;grid-template-columns:34px 130px minmax(0,1fr) 34px;gap:10px;align-items:center;padding:7px 10px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:7px;background:#fff;direction:rtl;box-sizing:border-box;width:100%}
    #supplyHospModal .shp-row>*{min-width:0}
    #supplyHospModal .shp-row input{width:100%;box-sizing:border-box}
    #supplyHospModal .shp-row.ok{border-color:#86EFAC;background:#F0FDF4}
    #supplyHospModal .shp-row.bad{border-color:#FECACA;background:#FEF2F2}
    #supplyHospModal .shp-n{font-weight:800;color:#9CA3AF;text-align:center}
    #supplyHospModal .shp-info{font-weight:700;color:#374151;min-height:22px;overflow-wrap:anywhere}
    #supplyHospModal .shp-msg{grid-column:2 / -1;font-size:13.5px;font-weight:600;margin-top:-2px}
    #supplyHospModal .shp-hint{border:1.5px dashed #D1D5DB;border-radius:12px;padding:26px 12px;text-align:center;color:#6B7280;font-size:15px}
    @media(max-width:760px){ #supplyHospModal .shp-head{grid-template-columns:1fr 1fr} #supplyHospModal .shp-row{grid-template-columns:28px 100px minmax(0,1fr) 30px;} }
  </style>
  <div class="modal" style="width:min(980px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-building-hospital"></i> تجهيز مستشفيات</div>
    <div class="modal-body">
      <div class="shp-head">
        <div class="fgrp"><label>اسم المستشفى *</label>
          <select id="shp-hosp" onchange="G('shp-hosp-o').style.display=this.value==='أخرى'?'block':'none';shpBuild()"><option value="">— اختر —</option>${hosp.map(h=>`<option value="${shpEsc(h)}">${shpEsc(h)}</option>`).join('')}<option value="أخرى">أخرى</option></select>
          <input type="text" id="shp-hosp-o" placeholder="اكتب اسم المستشفى" oninput="shpBuild()" style="display:none;margin-top:5px"></div>
        <div class="fgrp"><label>عدد القناني *</label>
          <input type="text" inputmode="numeric" id="shp-cnt" placeholder="مثال: 10" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'');shpBuild()"></div>
        <div class="fgrp"><label>رقم الكتاب *</label>
          <input type="text" id="shp-book" placeholder="رقم الكتاب" oninput="shpBuild()"></div>
        <div class="fgrp"><label>تاريخ الكتاب *</label>
          <input type="date" id="shp-bdate" onchange="shpBuild()"></div>
        <div class="fgrp"><label>نوع التجهيز *</label>
          <select id="shp-comp" onchange="shpCompChanged()"><option value="">— اختر —</option>${SHP_COMPS.map(([k,l])=>`<option value="${k}">${shpEsc(l)}</option>`).join('')}</select></div>
      </div>
      <div id="shp-prog" style="margin:12px 0 8px;font-size:14.5px;font-weight:700;color:#374151"></div>
      <div id="shp-rows"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="G('supplyHospModal').classList.remove('on')"><i class="ti ti-x"></i> إلغاء</button>
      <button class="btn btn-p" id="shp-go" onclick="shpSubmit()" disabled><i class="ti ti-check"></i> تجهيز</button>
    </div></div>`;
  document.body.appendChild(m);
}

function shpOpen(){
  shpEnsureModal();
  ['shp-hosp-o','shp-cnt','shp-book','shp-bdate'].forEach(i=>G(i).value='');
  G('shp-hosp').value=''; G('shp-comp').value=''; G('shp-hosp-o').style.display='none';
  _shpRows=[]; G('shp-rows').innerHTML='';
  shpBuild();
  G('supplyHospModal').classList.add('on');
  setTimeout(()=>G('shp-hosp').focus(),50);
}

function shpHeader(){
  let hosp=G('shp-hosp').value; if(hosp==='أخرى') hosp=G('shp-hosp-o').value.trim();
  const cnt=parseInt(G('shp-cnt').value)||0, book=G('shp-book').value.trim(), bdate=G('shp-bdate').value, comp=G('shp-comp').value;
  return { hosp, cnt, book, bdate, comp, ok: !!(hosp && cnt>0 && cnt<=SHP_SANE && book && bdate && comp) };
}

// (re)generate the rows to match the count — rows already filled are never thrown away by accident
function shpBuild(){
  const h=shpHeader(), box=G('shp-rows');
  if(!h.ok){
    const why = h.cnt>SHP_SANE ? 'العدد '+h.cnt+' كبير جداً — تأكد من الرقم' : 'أكمل الحقول الخمسة (المستشفى، العدد، رقم الكتاب، تاريخه، نوع التجهيز) لتظهر أسطر القناني';
    if(!_shpRows.length) box.innerHTML='<div class="shp-hint"><i class="ti ti-list-numbers" style="font-size:26px;display:block;margin-bottom:6px"></i>'+why+'</div>';
    else { const hint=G('shp-hint2'); if(!hint){ const d=document.createElement('div'); d.id='shp-hint2'; d.style.cssText='color:#B45309;font-size:13.5px;font-weight:700;margin-bottom:6px'; box.prepend(d); } G('shp-hint2').textContent='⚠️ '+why; }
    shpProgress(); return;
  }
  G('shp-hint2')?.remove();
  if(!_shpRows.length) box.innerHTML='';
  while(_shpRows.length<h.cnt) shpAddRow();
  // تقليل العدد: الأسطر الفارغة بالنهاية تُحذف تلقائياً؛ أي سطر فيه قنينة لا يُحذف إلا بزر الحذف (حتى لا يضيع إدخال بالخطأ)
  while(_shpRows.length>h.cnt){
    const last=_shpRows[_shpRows.length-1];
    if(last.num) break;
    G('shpr-'+last.id)?.remove(); _shpRows.pop();
  }
  shpRenumber(); shpProgress();
}
function shpRenumber(){ _shpRows.forEach((r,i)=>{ const n=G('shpN-'+r.id); if(n) n.textContent=i+1; }); }

function shpAddRow(){
  const id=++_shpSeq; _shpRows.push({id, num:'', opts:[], pick:'', looked:0, state:''});
  const d=document.createElement('div'); d.className='shp-row'; d.id='shpr-'+id;
  d.innerHTML=`<div class="shp-n" id="shpN-${id}"></div>
    <input type="text" inputmode="numeric" id="shpn-${id}" placeholder="رقم القنينة" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'')" onchange="shpLookup(${id})" onkeydown="if(event.key==='Enter'){event.preventDefault();shpLookup(${id},true)}">
    <div class="shp-info" id="shpi-${id}">—</div>
    <button class="btn" title="حذف هذا السطر" onclick="shpDelRow(${id})" style="padding:3px 6px;color:#B91C1C"><i class="ti ti-trash"></i></button>
    <div class="shp-msg" id="shpm-${id}"></div>`;
  G('shp-rows').appendChild(d);
}

// حذف سطر. إذا عدد الأسطر أكبر من العدد المطلوب نكتفي بحذفه (تقترب من العدد)؛ وإلا ينقص العدد المكتوب معه ليبقيا متطابقين.
function shpDelRow(id){
  const r=_shpRows.find(x=>x.id===id); if(!r) return;
  if(_shpRows.length<=1){ G('shpn-'+id).value=''; shpLookup(id); return; }
  const h=shpHeader(), wasOver=_shpRows.length>h.cnt;
  _shpRows=_shpRows.filter(x=>x.id!==id); G('shpr-'+id)?.remove();
  if(!wasOver) G('shp-cnt').value=String(_shpRows.length);
  shpRenumber(); shpApplyAll(); shpProgress();
}

// القنينة المدخلة (r.opts = مكوّناتها الجاهزة) + النوع المختار بالأعلى = المكوّن المعتمد للسطر
function shpApply(r){
  const comp=G('shp-comp').value, row=G('shpr-'+r.id), msg=G('shpm-'+r.id); if(!row) return;
  r.pick=''; r.state='';
  if(!r.num){ row.className='shp-row'; msg.textContent=''; return; }
  if(!r.opts.length) return;                                    // الخطأ (غير موجودة / غير جاهزة) يبقى كما كتبه البحث
  msg.style.color=''; msg.textContent='';
  if(!comp){ row.className='shp-row'; return; }
  const hit=r.opts.find(x=>(x.component_type||'دم كامل')===comp);
  if(!hit){
    r.state='bad'; row.className='shp-row bad'; msg.style.color='#B91C1C';
    const have=r.opts.map(x=>shpLbl(x.component_type||'دم كامل')).join('، ');
    msg.textContent='⛔ القنينة '+r.num+' لا يتوفر منها «'+shpLbl(comp)+'» — المتوفر: '+have; return;
  }
  const dup=_shpRows.find(x=>x.id!==r.id && x.pick===hit.id);
  if(dup){ r.state='bad'; row.className='shp-row bad'; msg.style.color='#B91C1C'; msg.textContent='⛔ القنينة '+r.num+' مكررة بسطر آخر'; return; }
  r.pick=hit.id; r.state='ok'; row.className='shp-row ok';
}
function shpApplyAll(){ _shpRows.forEach(shpApply); shpProgress(); }
function shpCompChanged(){ shpBuild(); shpApplyAll(); }

async function shpLookup(id,enter){
  const r=_shpRows.find(x=>x.id===id); if(!r) return;
  const num=parseInt(G('shpn-'+id).value)||0;
  if(num && num===r.looked){ if(enter) shpNext(id); return; }
  r.looked=num; r.num=num||''; r.opts=[]; r.pick=''; r.state='';
  const info=G('shpi-'+id), msg=G('shpm-'+id), row=G('shpr-'+id);
  info.textContent='—'; msg.textContent=''; msg.style.color=''; row.className='shp-row';
  if(!num){ shpApplyAll(); return; }
  const bad=(t)=>{ r.state='bad'; row.className='shp-row bad'; msg.style.color='#B91C1C'; msg.textContent=t; shpProgress(); };
  try{
    const{data,error}=await db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,component_type,status,expiry_date')
      .eq('bottle_number',num).eq('is_deleted',false);
    if(error) return bad('تعذر البحث: '+error.message);
    if(r.looked!==num) return;                                   // the user already typed another number
    const today=new Date().toISOString().split('T')[0], rows=data||[];
    if(!rows.length) return bad('⛔ القنينة '+num+' غير موجودة');
    const ready=rows.filter(x=>x.status==='in_stock' && (!x.expiry_date || x.expiry_date>=today));
    if(!ready.length){
      const expired=rows.some(x=>x.status==='in_stock');
      const st=expired ? 'منتهية الصلاحية' : [...new Set(rows.map(x=>(typeof AUDIT_STATUS_LABELS!=='undefined'&&AUDIT_STATUS_LABELS[x.status])||x.status))].join('، ');
      return bad('⛔ القنينة '+num+' غير جاهزة للتجهيز — حالتها: '+st);
    }
    r.opts=ready;
    info.textContent=(bbBt(ready[0].blood_type,G('shp-comp')?.value)||'—')+'  —  '+(ready[0].bottle_type||'—');   // الفصيلة + نوع القنينة تلقائياً
    shpApplyAll();
    if(enter && r.pick) shpNext(id);
  }catch(e){ bad('تعذر البحث: '+(e.message||e)); }
}
function shpNext(id){ const i=_shpRows.findIndex(x=>x.id===id); const nx=_shpRows[i+1]; if(nx) G('shpn-'+nx.id)?.focus(); }

function shpProgress(){
  const p=G('shp-prog'), go=G('shp-go'); if(!p) return;
  const h=shpHeader(), done=_shpRows.filter(r=>r.pick).length, total=_shpRows.length;
  const over = h.ok ? total-h.cnt : 0;
  p.innerHTML = total ? `مكتمل <span style="color:#166534">${done}</span> من ${total}`
    + (over>0 ? ` <span style="color:#B45309">— العدد المطلوب ${h.cnt}: احذف ${over} سطراً بزر 🗑️ ثم احفظ</span>` : '')
    + (_shpRows.some(r=>r.state==='bad')?' <span style="color:#B91C1C">— فيه أسطر فيها خطأ</span>':'') : '';
  if(go) go.disabled = !(h.ok && total && total===h.cnt && done===total && !_shpRows.some(r=>r.state==='bad')) || _shpBusy;
}

async function shpSubmit(){
  if(_shpBusy) return;
  const h=shpHeader(); if(!h.ok){ toast('أكمل بيانات الكتاب والمستشفى ونوع التجهيز','error'); return; }
  const ids=_shpRows.map(r=>r.pick).filter(Boolean);
  if(!ids.length || ids.length!==_shpRows.length || ids.length!==h.cnt){ toast('أكمل كل الأسطر ليتطابق العدد','error'); return; }
  if(new Set(ids).size!==ids.length){ toast('قنينة مكررة بأكثر من سطر','error'); return; }
  if(!IS_ONLINE){ toast('التجهيز يحتاج اتصالاً بالإنترنت','error'); return; }
  if(!(await bbConfirm('تأكيد تجهيز '+ids.length+' قنينة ('+shpLbl(h.comp)+') إلى «'+h.hosp+'»\nكتاب رقم '+h.book+' بتاريخ '+bbDmy(h.bdate)+'؟ ستُسحب من الرصيد.'))) return;
  _shpBusy=true; shpProgress(); load(true);
  try{
    const{error}=await db.rpc('dispatch_hospital',{p_ids:ids,p_hospital:h.hosp,p_book:h.book,p_bdate:h.bdate});
    if(error) throw error;
    try{ await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{status:'dispatched',dispatch_count:ids.length,hospital:h.hosp,book_no:h.book,book_date:h.bdate,component:h.comp}}); }catch(e){}
    toast('✅ تم تجهيز '+ids.length+' قنينة لـ '+h.hosp+' وسُحبت من الرصيد','success',5000);
    G('supplyHospModal').classList.remove('on');
    if(typeof _supplyRefreshCurrentLevel==='function') await _supplyRefreshCurrentLevel();
  }catch(e){ toast('⛔ '+(e.message||e),'error',8000); }
  finally{ _shpBusy=false; load(false); shpProgress(); }
}
