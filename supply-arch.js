// ================================================================
// أرشيف التجهيز + إحصائيات التجهيز (باي هاند / مستشفيات) — مع تصدير PDF و Excel.
// البيانات من RPC: dispatch_archive / dispatch_stats / dispatch_update / dispatch_remove_bottle / dispatch_cancel
// ================================================================
const SA_BT = ['A+','A-','B+','B-','O+','O-','AB+','AB-'];
const SA_CT = ['دم كامل','دم مضغوط','دم مفلتر','صفائح دموية','بلازما','بروتين بارد'];
const SA_CL = {'دم كامل':'دم','دم مضغوط':'دم مضغوط','دم مفلتر':'دم مفلتر','صفائح دموية':'صفيحات دموية','بلازما':'بلازما','بروتين بارد':'Cryo'};
const SA_KIND = {hand:'باي هاند', hospital:'مستشفيات'};
let _saTab='hospital', _saData=[], _saStats=null, _saBooksRaw=[], _saOpen=new Set(), _saBusy=false, _saHosp=null;
const saEsc = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));
const saD = v => v ? fd(v) : '—';
const saLbl = c => SA_CL[c]||c;
// فصائل الدم (O+ ، A-) تُعرض اتجاهاً يسارياً حتى لا ينقلب الرمز داخل الجداول العربية
const saX = v => /^(AB|A|B|O)[+-]$/.test(String(v)) ? '<bdi dir="ltr">'+saEsc(v)+'</bdi>' : saEsc(v);

function saEnsure(){
  if(G('supplyArchModal')) return;
  const hosp = [...(G('rc-hosp')?.options||[])].filter(o=>o.value && o.value!=='أخرى').map(o=>o.value);
  const m=document.createElement('div'); m.className='overlay'; m.id='supplyArchModal';
  m.innerHTML=`<style>
    #supplyArchModal .modal{overflow-x:hidden}
    #supplyArchModal .sa-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
    #supplyArchModal .sa-tab{padding:9px 16px;border:1.5px solid #E5E7EB;border-radius:10px;background:#fff;font-weight:800;cursor:pointer;font-size:15px}
    #supplyArchModal .sa-tab.on{background:#BE123C;color:#fff;border-color:#BE123C}
    #supplyArchModal .sa-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
    #supplyArchModal .sa-bar .fgrp{margin:0;min-width:130px}
    #supplyArchModal .sa-item{border:1px solid #E5E7EB;border-radius:12px;margin-bottom:8px;background:#fff;overflow:hidden}
    #supplyArchModal .sa-sum{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;cursor:pointer}
    #supplyArchModal .sa-sum>b{font-size:15.5px}
    #supplyArchModal .sa-pill{background:#FCE7F3;color:#9D174D;border-radius:20px;padding:2px 10px;font-weight:800;font-size:13.5px}
    #supplyArchModal .sa-det{border-top:1px dashed #E5E7EB;padding:10px 12px;background:#FAFAFA}
    #supplyArchModal table.sa-t{width:100%;border-collapse:collapse;font-size:14px;background:#fff}
    #supplyArchModal table.sa-t th,#supplyArchModal table.sa-t td{unicode-bidi:plaintext;border:1px solid #E5E7EB;padding:6px 8px;text-align:center}
    #supplyArchModal table.sa-t th{background:#F3F4F6}
    #supplyArchModal .sa-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
    #supplyArchModal .sa-card{border:1px solid #E5E7EB;border-radius:12px;padding:12px;text-align:center;background:#fff}
    #supplyArchModal .sa-card b{display:block;font-size:26px;color:#BE123C}
    #supplyArchModal h4{margin:16px 0 6px;color:#BE123C}
    #supplyArchModal .sa-sc{overflow-x:auto}
  </style>
  <div class="modal" style="width:min(1100px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-archive"></i> أرشيف وإحصائيات التجهيز</div>
    <div class="modal-body" style="min-width:0">
      <div class="sa-tabs">
        <div class="sa-tab" id="sat-hospital" onclick="saTab('hospital')">🏥 أرشيف المستشفيات</div>
        <div class="sa-tab" id="sat-hand" onclick="saTab('hand')">🤝 أرشيف الباي هاند</div>
        <div class="sa-tab" id="sat-stats" onclick="saTab('stats')">📊 إحصائيات التجهيز</div>
      </div>
      <div class="sa-bar">
        <div class="fgrp"><label>من تاريخ</label><input type="date" id="sa-from" onchange="saLoad()"></div>
        <div class="fgrp"><label>إلى تاريخ</label><input type="date" id="sa-to" onchange="saLoad()"></div>
        <div class="fgrp" id="sa-qwrap" style="flex:1;min-width:180px"><label id="sa-qlbl">بحث</label><input type="text" id="sa-q" oninput="saQ()"></div>
        <button class="btn" onclick="saClear()"><i class="ti ti-eraser"></i> مسح الفلتر</button>
        <button class="btn" onclick="saExport('pdf')"><i class="ti ti-file-type-pdf"></i> PDF</button>
        <button class="btn" onclick="saExport('xls')"><i class="ti ti-file-spreadsheet"></i> Excel</button>
      </div>
      <div id="sa-body"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="G('supplyArchModal').classList.remove('on')"><i class="ti ti-x"></i> إغلاق</button></div>
  </div>
  <datalist id="sa-hosp-dl">${hosp.map(h=>`<option value="${saEsc(h)}">`).join('')}</datalist>
  <datalist id="sa-comp-dl"><option value="عوض"><option value="بثمن"><option value="مجاني (الإدارة)"></datalist>`;
  document.body.appendChild(m);
}

function saOpen(tab){ saEnsure(); G('supplyArchModal').classList.add('on'); saTab(tab||'hospital'); }
function saClear(){ ['sa-from','sa-to','sa-q'].forEach(i=>G(i).value=''); saLoad(); }
let _saQt=null; function saQ(){ clearTimeout(_saQt); _saQt=setTimeout(()=>{ if(_saTab==='stats') saRenderStats(); else saLoad(); },350); }
function saTab(t){
  _saTab=t; _saOpen.clear(); _saHosp=null;
  ['hospital','hand','stats'].forEach(k=>G('sat-'+k).classList.toggle('on',k===t));
  G('sa-qwrap').style.display = '';
  G('sa-q').value='';
  G('sa-qlbl').textContent = t==='hospital' ? 'بحث: مستشفى / رقم كتاب / رقم قنينة' : t==='stats' ? 'بحث برقم الكتاب أو المستشفى (يظهر بجدول الكتب)' : 'بحث: مريض / مستشفى / رقم قنينة';
  saLoad();
}
async function saLoad(){
  const body=G('sa-body'); body.innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  const from=G('sa-from').value||null, to=G('sa-to').value||null;
  if(from && to && from>to){ body.innerHTML='<div class="empty"><p>تاريخ «من» أكبر من «إلى»</p></div>'; return; }
  try{
    if(_saTab==='stats'){
      const{data,error}=await db.rpc('dispatch_stats',{p_from:from,p_to:to}); if(error) throw error;
      _saStats=data;
      const ar=await db.rpc('dispatch_archive',{p_kind:'hospital',p_from:from,p_to:to,p_q:null}); _saBooksRaw=ar.error?[]:(ar.data||[]);
      saRenderStats();
    } else {
      const{data,error}=await db.rpc('dispatch_archive',{p_kind:_saTab,p_from:from,p_to:to,p_q:G('sa-q').value.trim()||null}); if(error) throw error;
      _saData=data||[]; saRenderList();
    }
  }catch(e){ body.innerHTML='<div class="empty"><p style="color:#B91C1C">⛔ '+saEsc(e.message||e)+'</p><p style="font-size:13px">إذا كانت هذه أول مرة: يجب تشغيل SQL التجهيز في Supabase.</p></div>'; }
}

// ---------- الأرشيف ----------
function saBottlesTxt(b){ return (b.bottles||[]).map(x=>x.num+' ('+(bbBt(x.bt,x.ct)||'—')+' · '+saLbl(x.ct)+')').join('، '); }
// كتاب واحد = (المستشفى + رقم الكتاب + تاريخه) وقد يضم عدة عمليات تجهيز (مكوّنات مختلفة جُهّزت كل واحدة على حدة)
function saBooks(batches){
  const m=new Map();
  batches.filter(b=>b.kind==='hospital').forEach(b=>{
    const k=[(b.hospital||'').trim(),(b.book_no||'').trim(),b.book_date||''].join('\u0001');
    if(!m.has(k)) m.set(k,{key:k,hospital:b.hospital||'—',book_no:b.book_no||'—',book_date:b.book_date||'',batches:[],bottles:[],count:0});
    const g=m.get(k); g.batches.push(b); g.count+=b.count; (b.bottles||[]).forEach(x=>g.bottles.push({...x,batch:b.batch,date:b.date}));
  });
  return [...m.values()].sort((a,b)=>(b.book_date||'').localeCompare(a.book_date||'')||String(b.book_no).localeCompare(String(a.book_no),'en',{numeric:true}));
}
function saCompCount(bottles){ const c={}; bottles.forEach(x=>{ c[x.ct]=(c[x.ct]||0)+1; }); return SA_CT.filter(k=>c[k]).map(k=>({ct:k,n:c[k]})); }
function saBookDetailsTxt(g){
  return SA_CT.map(ct=>{ const bs=g.bottles.filter(x=>x.ct===ct); if(!bs.length) return null;
    const bt={}; bs.forEach(x=>{ const k=bbBt(x.bt,x.ct)||'—'; bt[k]=(bt[k]||0)+1; });
    return saLbl(ct)+': '+bs.length+' ('+Object.entries(bt).map(([k,n])=>k+' '+n).join('، ')+') — '+bs.map(x=>x.num).join('، '); }).filter(Boolean).join(' | ');
}
function saRenderList(){
  const body=G('sa-body');
  if(_saTab==='hand') return saRenderHand();
  const books=saBooks(_saData);
  if(!books.length){ body.innerHTML='<div class="empty"><i class="ti ti-archive"></i><p>لا توجد كتب تجهيز'+(G('sa-q').value||G('sa-from').value||G('sa-to').value?' مطابقة للفلتر':' محفوظة')+'</p></div>'; return; }
  if(!_saHosp || !books.some(b=>b.hospital===_saHosp)){
    _saHosp=null;
    const hs=new Map(); books.forEach(b=>{ if(!hs.has(b.hospital)) hs.set(b.hospital,[]); hs.get(b.hospital).push(b); });
    const arr=[...hs.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar'));
    body.innerHTML=`<div style="font-weight:700;margin-bottom:8px">${arr.length} مستشفى — ${books.length} كتاب — ${books.reduce((s,b)=>s+b.count,0)} قنينة</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">`+arr.map(([h,bs],i)=>{
      const all=bs.flatMap(b=>b.bottles);
      return `<div class="sa-card" style="cursor:pointer;text-align:right" onclick="saPickHosp(${i})"><div style="font-weight:800;font-size:16px;margin-bottom:4px">🏥 ${saEsc(h)}</div>
        <div style="color:#6B7280;font-size:13.5px">${bs.length} كتاب · <b style="display:inline;font-size:inherit;color:#BE123C">${all.length}</b> قنينة</div>
        <div style="font-size:13px;margin-top:4px">${saCompCount(all).map(c=>saEsc(saLbl(c.ct))+' '+c.n).join(' · ')}</div></div>`; }).join('')+'</div>';
    window._saHospList=arr.map(a=>a[0]); return;
  }
  const mine=books.filter(b=>b.hospital===_saHosp), tot=mine.reduce((s,b)=>s+b.count,0);
  body.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap"><button class="btn" onclick="saPickHosp(-1)"><i class="ti ti-arrow-right"></i> كل المستشفيات</button>
      <b style="font-size:17px;color:#BE123C">🏥 ${saEsc(_saHosp)}</b><span style="color:#6B7280">${mine.length} كتاب — ${tot} قنينة</span></div>`+mine.map((g,i)=>{
    const open=_saOpen.has(g.key), cc=saCompCount(g.bottles);
    return `<div class="sa-item"><div class="sa-sum" onclick="saToggleBook(${i})">
        <div><div style="font-weight:800;font-size:15.5px">📅 ${saD(g.book_date)}</div><div style="color:#374151">كتاب رقم <b>${saEsc(g.book_no)}</b></div></div>
        <span class="sa-pill">${g.count} قنينة</span><span style="font-size:13.5px;color:#374151">${cc.map(c=>saEsc(saLbl(c.ct))+' '+c.n).join(' · ')}</span>
        <span style="margin-right:auto;display:flex;gap:6px" onclick="event.stopPropagation()">
          <button class="btn" onclick="saEditBook(${i})"><i class="ti ti-edit"></i> تعديل الكتاب</button>
          <button class="btn" style="color:#B91C1C" onclick="saCancelBook(${i})"><i class="ti ti-arrow-back-up"></i> إلغاء الكتاب</button></span></div>
      ${open?saBookDetail(g):''}</div>`;
  }).join('');
  window._saBookList=mine;
}
function saBookDetail(g){
  const m=saMatrix(g.bottles.map(x=>({ct:x.ct,bt:x.bt||'—',n:1})),()=>true);
  return `<div class="sa-det"><div class="sa-sc">${saTable({headers:m.heads,rows:m.rows})}</div>
    ${g.batches.map(b=>`<div style="margin-top:10px;font-weight:800">عملية تجهيز بتاريخ ${saD(b.date)} — ${b.count} قنينة
      <button class="btn" style="color:#B91C1C;padding:2px 8px;margin-right:8px" onclick="saCancel('${b.batch}')"><i class="ti ti-arrow-back-up"></i> إلغاء هذه العملية</button></div>
      <table class="sa-t" style="margin-top:4px"><thead><tr><th>رقم القنينة</th><th>الفصيلة</th><th>نوع القنينة</th><th>المكوّن</th><th></th></tr></thead><tbody>${(b.bottles||[]).map(x=>`<tr><td><b>${x.num}</b></td><td>${saX(bbBt(x.bt,x.ct)||'—')}</td><td>${saEsc(x.btype||'—')}</td><td>${saEsc(saLbl(x.ct))}</td><td><button class="btn" style="color:#B91C1C;padding:2px 8px" onclick="saRemove('${x.id}','${b.batch}',${x.num})" title="إرجاع هذه القنينة للرصيد"><i class="ti ti-arrow-back-up"></i> إرجاع</button></td></tr>`).join('')}</tbody></table>`).join('')}</div>`;
}
function saPickHosp(i){ _saHosp = i<0 ? null : (window._saHospList||[])[i]; _saOpen.clear(); saRenderList(); }
function saToggleBook(i){ const g=(window._saBookList||[])[i]; if(!g) return; _saOpen.has(g.key)?_saOpen.delete(g.key):_saOpen.add(g.key); saRenderList(); }

async function saCancelBook(i){
  if(_saBusy) return; const g=(window._saBookList||[])[i]; if(!g) return;
  if(!confirm('إلغاء الكتاب رقم '+g.book_no+' ('+g.hospital+') بكل عملياته؟\nترجع '+g.count+' قنينة إلى الرصيد.')) return;
  _saBusy=true; load(true);
  try{ const{error}=await db.rpc('dispatch_cancel_book',{p_oh:g.hospital,p_ob:g.book_no,p_od:g.book_date||null}); if(error) throw error;
    await saAudit('cancel_book',{count:g.count,hospital:g.hospital,book_no:g.book_no,book_date:g.book_date,bottles:g.bottles.map(x=>x.num)},g.bottles[0]?.id);
    toast('✅ أُلغي الكتاب ورجعت '+g.count+' قنينة للرصيد','success'); await saRefreshAll();
  }catch(e){ toast('⛔ '+(e.message||e),'error',7000); } finally{ _saBusy=false; load(false); }
}
function saEditBook(i){
  const g=(window._saBookList||[])[i]; if(!g) return;
  let m=G('supplyArchEdit'); if(m) m.remove();
  m=document.createElement('div'); m.className='overlay'; m.id='supplyArchEdit'; m.style.zIndex=9100;
  window._saEditBook=g;
  m.innerHTML=`<div class="modal" style="width:min(520px,96vw)"><div class="modal-title"><i class="ti ti-edit"></i> تعديل الكتاب (${g.count} قنينة)</div><div class="modal-body">
    <div class="fgrp"><label>اسم المستشفى *</label><input type="text" id="sae-hosp" list="sa-hosp-dl" value="${saEsc(g.hospital)}"></div>
    <div class="fgrp"><label>رقم الكتاب *</label><input type="text" id="sae-book" value="${saEsc(g.book_no)}"></div>
    <div class="fgrp"><label>تاريخ الكتاب *</label><input type="date" id="sae-bdate" value="${g.book_date||''}"></div>
    <div style="font-size:13px;color:#6B7280">يتغير على كل عمليات هذا الكتاب. لتبديل القناني: أرجع القنينة ثم جهّز من جديد.</div>
  </div><div class="modal-foot"><button class="btn" onclick="G('supplyArchEdit').remove()">إلغاء</button><button class="btn btn-p" onclick="saEditBookSave()"><i class="ti ti-check"></i> حفظ</button></div></div>`;
  document.body.appendChild(m); m.classList.add('on');
}
async function saEditBookSave(){
  if(_saBusy) return; const g=window._saEditBook; if(!g) return;
  const h=G('sae-hosp').value.trim(), b=G('sae-book').value.trim(), d=G('sae-bdate').value;
  if(!h||!b||!d){ toast('المستشفى ورقم الكتاب وتاريخه مطلوبة','error'); return; }
  _saBusy=true; load(true);
  try{ const{error}=await db.rpc('dispatch_update_book',{p_oh:g.hospital,p_ob:g.book_no,p_od:g.book_date||null,p_h:h,p_b:b,p_d:d}); if(error) throw error;
    await saAudit('edit_book',{before:{hospital:g.hospital,book_no:g.book_no,book_date:g.book_date},after:{hospital:h,book_no:b,book_date:d}},g.bottles[0]?.id);
    G('supplyArchEdit').remove(); _saHosp=h; toast('✅ تم حفظ التعديل','success'); await saLoad();
  }catch(e){ toast('⛔ '+(e.message||e),'error',7000); } finally{ _saBusy=false; load(false); }
}

// أرشيف الباي هاند: سطر لكل عملية (مريض + تاريخ تجهيز)
function saRenderHand(){
  const body=G('sa-body'), list=_saData;
  if(!list.length){ body.innerHTML='<div class="empty"><i class="ti ti-archive"></i><p>لا توجد عمليات تجهيز'+(G('sa-q').value||G('sa-from').value||G('sa-to').value?' مطابقة للفلتر':' محفوظة')+'</p></div>'; return; }
  const tot=list.reduce((s,b)=>s+b.count,0);
  body.innerHTML=`<div style="font-weight:700;margin-bottom:8px">${list.length} عملية — ${tot} قنينة${list.length>=500?' <span style="color:#B45309">(معروض أحدث 500)</span>':''}</div>`+list.map(b=>{
    const open=_saOpen.has(b.batch), cts=[...new Set((b.bottles||[]).map(x=>saLbl(x.ct)))].join('، ');
    return `<div class="sa-item"><div class="sa-sum" onclick="saToggle('${b.batch}')">
        <span style="color:#6B7280">📅 ${saD(b.date)}</span><b>${saEsc(b.patient||'—')}</b><span>${saEsc(b.hospital||'—')}</span><span>${saEsc(b.comp||'')}${b.note?': '+saEsc(b.note):''}</span>
        <span class="sa-pill">${b.count} قنينة${cts?' · '+saEsc(cts):''}</span>
        <span style="margin-right:auto;display:flex;gap:6px" onclick="event.stopPropagation()">
          <button class="btn" onclick="saEdit('${b.batch}')"><i class="ti ti-edit"></i> تعديل</button>
          <button class="btn" style="color:#B91C1C" onclick="saCancel('${b.batch}')"><i class="ti ti-arrow-back-up"></i> إلغاء التجهيز</button></span></div>
      ${open?`<div class="sa-det"><table class="sa-t"><thead><tr><th>رقم القنينة</th><th>الفصيلة</th><th>نوع القنينة</th><th>المكوّن</th><th></th></tr></thead><tbody>${(b.bottles||[]).map(x=>`<tr><td><b>${x.num}</b></td><td>${saX(bbBt(x.bt,x.ct)||'—')}</td><td>${saEsc(x.btype||'—')}</td><td>${saEsc(saLbl(x.ct))}</td><td><button class="btn" style="color:#B91C1C;padding:2px 8px" onclick="saRemove('${x.id}','${b.batch}',${x.num})" title="إرجاع هذه القنينة للرصيد"><i class="ti ti-arrow-back-up"></i> إرجاع</button></td></tr>`).join('')}</tbody></table></div>`:''}
    </div>`;
  }).join('');
}
function saToggle(id){ _saOpen.has(id)?_saOpen.delete(id):_saOpen.add(id); saRenderHand(); }

async function saAudit(act,vals,id){ try{ await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id||null,new_values:{dispatch_action:act,...vals}}); }catch(e){} }
async function saRefreshAll(){ await saLoad(); if(typeof _supplyRefreshCurrentLevel==='function'){ try{ await _supplyRefreshCurrentLevel(); }catch(e){} } }

async function saRemove(id,batch,num){
  if(_saBusy) return;
  const b=_saData.find(x=>x.batch===batch);
  if(!confirm('إرجاع القنينة '+num+' إلى الرصيد وإخراجها من هذا التجهيز؟')) { return; }
  _saBusy=true; load(true);
  try{ const{error}=await db.rpc('dispatch_remove_bottle',{p_id:id}); if(error) throw error;
    await saAudit('remove_bottle',{bottle:num,hospital:b?.hospital,patient:b?.patient,book_no:b?.book_no},id);
    toast('✅ رجعت القنينة '+num+' للرصيد','success'); await saRefreshAll();
  }catch(e){ toast('⛔ '+(e.message||e),'error',7000); } finally{ _saBusy=false; load(false); }
}
async function saCancel(batch){
  if(_saBusy) return;
  const b=_saData.find(x=>x.batch===batch); if(!b) return;
  if(!confirm('إلغاء عملية التجهيز كاملة؟\n'+(_saTab==='hospital'?b.hospital+' — كتاب '+b.book_no:b.patient)+'\nترجع '+b.count+' قنينة إلى الرصيد.')) return;
  _saBusy=true; load(true);
  try{ const{error}=await db.rpc('dispatch_cancel',{p_batch:batch}); if(error) throw error;
    await saAudit('cancel_batch',{count:b.count,hospital:b.hospital,patient:b.patient,book_no:b.book_no,bottles:(b.bottles||[]).map(x=>x.num)},b.bottles?.[0]?.id);
    toast('✅ أُلغي التجهيز ورجعت '+b.count+' قنينة للرصيد','success'); await saRefreshAll();
  }catch(e){ toast('⛔ '+(e.message||e),'error',7000); } finally{ _saBusy=false; load(false); }
}

function saEdit(batch){
  const b=_saData.find(x=>x.batch===batch); if(!b) return; const h=b.kind==='hospital';
  let m=G('supplyArchEdit'); if(m) m.remove();
  m=document.createElement('div'); m.className='overlay'; m.id='supplyArchEdit'; m.style.zIndex=9100;
  m.innerHTML=`<div class="modal" style="width:min(560px,96vw)"><div class="modal-title"><i class="ti ti-edit"></i> تعديل التجهيز (${b.count} قنينة)</div><div class="modal-body">
    <input type="hidden" id="sae-batch" value="${b.batch}">
    <div class="fgrp"><label>اسم المستشفى *</label><input type="text" id="sae-hosp" list="sa-hosp-dl" value="${saEsc(b.hospital||'')}"></div>
    ${h?`<div class="fgrp"><label>رقم الكتاب *</label><input type="text" id="sae-book" value="${saEsc(b.book_no||'')}"></div>
         <div class="fgrp"><label>تاريخ الكتاب *</label><input type="date" id="sae-bdate" value="${b.book_date||''}"></div>`
       :`<div class="fgrp"><label>اسم المريض *</label><input type="text" id="sae-pat" value="${saEsc(b.patient||'')}"></div>
         <div class="fgrp"><label>نوع التعويض *</label><input type="text" id="sae-comp" list="sa-comp-dl" value="${saEsc(b.comp||'')}"></div>
         <div class="fgrp"><label>ملاحظة</label><input type="text" id="sae-note" value="${saEsc(b.note||'')}"></div>`}
    <div class="fgrp"><label>تاريخ التجهيز</label><input type="date" id="sae-date" value="${b.date||''}"></div>
    <div style="font-size:13px;color:#6B7280">لإضافة قناني أو تبديلها: ألغِ التجهيز (أو أرجع القنينة) ثم جهّز من جديد.</div>
  </div><div class="modal-foot"><button class="btn" onclick="G('supplyArchEdit').remove()">إلغاء</button><button class="btn btn-p" onclick="saEditSave()"><i class="ti ti-check"></i> حفظ</button></div></div>`;
  document.body.appendChild(m); m.classList.add('on');
}
async function saEditSave(){
  if(_saBusy) return;
  const batch=G('sae-batch').value, b=_saData.find(x=>x.batch===batch), h=b.kind==='hospital';
  const v=id=>G(id)?G(id).value.trim():'';
  if(!v('sae-hosp')){ toast('اسم المستشفى مطلوب','error'); return; }
  if(h && (!v('sae-book')||!v('sae-bdate'))){ toast('رقم الكتاب وتاريخه مطلوبان','error'); return; }
  if(!h && (!v('sae-pat')||!v('sae-comp'))){ toast('اسم المريض ونوع التعويض مطلوبان','error'); return; }
  const args={p_batch:batch,p_hospital:v('sae-hosp'),p_patient:h?null:v('sae-pat'),p_comp:h?null:v('sae-comp'),p_note:h?null:v('sae-note'),p_book:h?v('sae-book'):null,p_bdate:h?v('sae-bdate'):null,p_date:v('sae-date')||null};
  _saBusy=true; load(true);
  try{ const{error}=await db.rpc('dispatch_update',args); if(error) throw error;
    await saAudit('edit_batch',{before:{hospital:b.hospital,patient:b.patient,book_no:b.book_no,book_date:b.book_date,comp:b.comp,date:b.date},after:args},b.bottles?.[0]?.id);
    G('supplyArchEdit').remove(); toast('✅ تم حفظ التعديل','success'); await saLoad();
  }catch(e){ toast('⛔ '+(e.message||e),'error',7000); } finally{ _saBusy=false; load(false); }
}

// ---------- الإحصائيات ----------
function saAgg(rows,filter){
  const f=rows.filter(filter), bt={}, tot={n:0};
  f.forEach(r=>{ const k=bbBt(r.bt,r.ct); (bt[r.ct]=bt[r.ct]||{}); bt[r.ct][k]=(bt[r.ct][k]||0)+r.n; tot.n+=r.n; });
  return {map:bt,total:tot.n};
}
function saMatrix(rows,filter){
  const a=saAgg(rows,filter); const cts=SA_CT.filter(c=>a.map[c]);
  const hasAbo=cts.some(c=>bbNoSign(c));
  const heads=['المكوّن',...SA_BT,...(hasAbo?PLASMA_ABO.map(x=>x+' (بلا إشارة)'):[]),'المجموع'];
  const trs=cts.map(c=>{ const m=a.map[c], ns=bbNoSign(c);
    return [saLbl(c),...SA_BT.map(b=>ns?0:(m[b]||0)),...(hasAbo?PLASMA_ABO.map(b=>ns?(m[b]||0):0):[]),Object.values(m).reduce((s,x)=>s+x,0)]; });
  if(trs.length){ const w=heads.length-2; trs.push(['المجموع',...Array.from({length:w},(_,i)=>trs.reduce((s,r)=>s+r[i+1],0)),a.total]); }
  const extra=[...new Set(Object.values(a.map).flatMap(m=>Object.keys(m)))].filter(x=>!SA_BT.includes(x)&&!PLASMA_ABO.includes(x));
  return {heads,rows:trs,total:a.total,extra};
}
function saBuildStats(){
  const S=_saStats||{rows:[],batches:[]}, R=S.rows, B=S.batches;
  const sum=(arr,f)=>arr.filter(f).reduce((s,x)=>s+x.n,0);
  const hosps=[...new Set(R.map(r=>r.hospital))].sort((a,b)=>a.localeCompare(b,'ar'));
  const out={cards:[],sections:[]};
  const tH=sum(R,r=>r.kind==='hospital'), tD=sum(R,r=>r.kind==='hand');
  out.cards=[['إجمالي القناني المجهّزة',tH+tD],['تجهيز مستشفيات (قنينة)',tH],['عمليات المستشفيات (كتب)',sum(B,r=>r.kind==='hospital')],['تجهيز باي هاند (قنينة)',tD],['عمليات الباي هاند',sum(B,r=>r.kind==='hand')]];
  // 1) جدول المستشفيات
  out.sections.push({title:'المجهَّز لكل مستشفى',headers:['المستشفى','مستشفيات (قنينة)','باي هاند (قنينة)','المجموع','عدد الكتب','عدد عمليات باي هاند'],
    rows:hosps.map(h=>{ const a=sum(R,r=>r.hospital===h&&r.kind==='hospital'), d=sum(R,r=>r.hospital===h&&r.kind==='hand'); return [h,a,d,a+d,sum(B,r=>r.hospital===h&&r.kind==='hospital'),sum(B,r=>r.hospital===h&&r.kind==='hand')]; })
      .concat(hosps.length?[['المجموع',tH,tD,tH+tD,sum(B,r=>r.kind==='hospital'),sum(B,r=>r.kind==='hand')]]:[])});
  // 2) مصفوفات الإجمالي
  [['كل التجهيز — الفصيلة × المكوّن',()=>true],['تجهيز المستشفيات — الفصيلة × المكوّن',r=>r.kind==='hospital'],['تجهيز الباي هاند — الفصيلة × المكوّن',r=>r.kind==='hand']].forEach(([t,f])=>{
    const m=saMatrix(R,f); if(m.rows.length) out.sections.push({title:t,headers:m.heads,rows:m.rows});
  });
  // 3) تفصيل كل مستشفى
  hosps.forEach(h=>{
    [['hospital','عن طريق كتاب'],['hand','عن طريق باي هاند']].forEach(([k,l])=>{
      const m=saMatrix(R,r=>r.hospital===h&&r.kind===k); if(m.rows.length) out.sections.push({title:h+' — '+l,headers:m.heads,rows:m.rows,detail:true});
    });
  });
  // 3.5) كتب المستشفيات (تظهر كلها، وعند البحث برقم الكتاب أو المستشفى تُفلتر)
  const q=(G('sa-q')?.value||'').trim().toLowerCase();
  let books=saBooks(_saBooksRaw); if(q) books=books.filter(g=>String(g.book_no).toLowerCase().includes(q)||String(g.hospital).toLowerCase().includes(q));
  const bs={title:q?'نتيجة البحث: '+q+' ('+books.length+' كتاب)':'كتب المستشفيات (حسب تاريخ الكتاب)',headers:['المستشفى','رقم الكتاب','تاريخ الكتاب','عدد القناني','تفاصيل التجهيز (المكوّن: العدد (الفصائل) — الأرقام)'],
    rows:books.map(g=>[g.hospital,g.book_no,saD(g.book_date),g.count,saBookDetailsTxt(g)]),books:true};
  if(q) out.sections.unshift(bs); else out.sections.push(bs);
  // 4) شهري
  const months=[...new Set(R.map(r=>r.month))].sort().reverse();
  out.sections.push({title:'التجهيز حسب الشهر',headers:['الشهر','مستشفيات (قنينة)','باي هاند (قنينة)','المجموع'],
    rows:months.map(mo=>{ const a=sum(R,r=>r.month===mo&&r.kind==='hospital'), d=sum(R,r=>r.month===mo&&r.kind==='hand'); const [y,m]=mo.split('-'); return [m+'/'+y,a,d,a+d]; })});
  return out;
}
function saTable(s){ if(s.books&&!s.rows.length) return '<div class="empty"><p>لا توجد كتب مطابقة</p></div>'; return `<div class="sa-sc"><table class="sa-t"><thead><tr>${s.headers.map(h=>`<th>${saX(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r,i)=>`<tr${i===s.rows.length-1&&/^المجموع/.test(r[0])?' style="font-weight:800;background:#FFF1F2"':''}>${r.map((c,j)=>`<td${j===0?' style="font-weight:700"':''}>${saX(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
function saRenderStats(){
  const st=saBuildStats();
  if(!_saStats || !_saStats.rows.length){ G('sa-body').innerHTML='<div class="empty"><i class="ti ti-chart-bar"></i><p>لا توجد عمليات تجهيز ضمن هذه الفترة</p></div>'; return; }
  const main=st.sections.filter(s=>!s.detail), det=st.sections.filter(s=>s.detail);
  G('sa-body').innerHTML=`<div class="sa-cards">${st.cards.map(c=>`<div class="sa-card"><b>${c[1]}</b>${saEsc(c[0])}</div>`).join('')}</div>`
    + main.map(s=>`<h4>${saEsc(s.title)}</h4>${saTable(s)}`).join('')
    + (det.length?`<h4>تفصيل كل مستشفى (الفصيلة × المكوّن)</h4>`+det.map(s=>`<details style="margin-bottom:6px"><summary style="cursor:pointer;font-weight:800;padding:6px 0">${saEsc(s.title)} — ${s.rows[s.rows.length-1].slice(-1)[0]} قنينة</summary>${saTable(s)}</details>`).join(''):'');
}

// ---------- التصدير ----------
function saPeriod(){ const f=G('sa-from').value,t=G('sa-to').value; return f||t ? 'الفترة: '+(f?bbDmy(f):'البداية')+' ← '+(t?bbDmy(t):'اليوم') : 'كل الفترات'; }
function saSections(){
  if(_saTab==='stats'){ const st=saBuildStats(); return {title:'إحصائيات التجهيز', cards:st.cards, sections:st.sections}; }
  if(_saTab==='hospital'){
    let books=saBooks(_saData); if(_saHosp) books=books.filter(g=>g.hospital===_saHosp);
    return {title:'أرشيف تجهيز المستشفيات'+(_saHosp?' — '+_saHosp:''), cards:[['عدد الكتب',books.length],['عدد القناني',books.reduce((s,g)=>s+g.count,0)]],
      sections:[{title:'',headers:['#','المستشفى','تاريخ الكتاب','رقم الكتاب','عدد القناني','التفاصيل (المكوّن: العدد (الفصائل) — الأرقام)'],rows:books.map((g,i)=>[i+1,g.hospital,saD(g.book_date),g.book_no,g.count,saBookDetailsTxt(g)])}]};
  }
  return {title:'أرشيف التجهيز (باي هاند)', cards:[['عدد العمليات',_saData.length],['عدد القناني',_saData.reduce((s,b)=>s+b.count,0)]],
    sections:[{title:'',headers:['#','تاريخ التجهيز','اسم المريض','المستشفى','نوع التعويض','عدد القناني','أرقام القناني (الفصيلة · المكوّن)'],
      rows:_saData.map((b,i)=>[i+1,saD(b.date),b.patient||'—',b.hospital||'—',(b.comp||'')+(b.note?': '+b.note:''),b.count,saBottlesTxt(b)])}]};
}
function saExport(fmt){
  if(_saTab==='stats' ? !(_saStats&&_saStats.rows.length) : !_saData.length){ toast('لا توجد بيانات للتصدير','error'); return; }
  const d=saSections(), now=bbDmyTime(new Date()), period=saPeriod();
  if(fmt==='xls'){
    const tbl=s=>`<table border="1" style="border-collapse:collapse;margin-bottom:14px"><tr><th colspan="${s.headers.length}" style="background:#F3F4F6">${saEsc(s.title)}</th></tr><tr style="background:#BE123C;color:#fff;font-weight:bold">${s.headers.map(h=>`<th>${saEsc(h)}</th>`).join('')}</tr>${s.rows.map(r=>'<tr>'+r.map(c=>`<td>${saEsc(c)}</td>`).join('')+'</tr>').join('')}</table>`;
    const html=`<html dir="rtl"><head><meta charset="UTF-8"></head><body><h2>مصرف الدم — واسط</h2><h3>${saEsc(d.title)}</h3><p>${saEsc(period)} | ${now}</p>
      <table border="1"><tr>${d.cards.map(c=>`<th>${saEsc(c[0])}</th>`).join('')}</tr><tr>${d.cards.map(c=>`<td>${c[1]}</td>`).join('')}</tr></table><br>${d.sections.map(tbl).join('')}</body></html>`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+html],{type:'application/vnd.ms-excel;charset=utf-8'}));
    a.download=d.title.replace(/[\\/:*?"<>|]/g,'')+'_'+new Date().toISOString().split('T')[0]+'.xls'; a.click(); toast('✅ تم تصدير Excel','success',3000); return;
  }
  const tbl=s=>`${s.title?`<h3>${saEsc(s.title)}</h3>`:''}<table><thead><tr>${s.headers.map(h=>`<th>${saX(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map((r,i)=>`<tr${/^المجموع/.test(r[0]||'')?' class="tot"':''}>${r.map((c,j)=>`<td${j===r.length-1&&_saTab!=='stats'?' class="bl"':''}>${saX(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  printHtmlDocument(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${saEsc(d.title)}</title><style>
    @page{size:A4 ${_saTab==='stats'?'portrait':'landscape'};margin:12mm}
    *{box-sizing:border-box} body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:0;font-size:12px}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #BE123C;padding-bottom:8px;margin-bottom:12px}
    .hd .o{font-size:13px;color:#555} .hd h1{margin:0;color:#BE123C;font-size:22px} .hd .m{font-size:12px;color:#555;text-align:left}
    .cards{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.c{flex:1;min-width:110px;border:1px solid #ddd;border-radius:8px;padding:8px;text-align:center}.c b{display:block;font-size:20px;color:#BE123C}
    h3{margin:14px 0 6px;font-size:14px;color:#BE123C;border-right:4px solid #BE123C;padding-right:8px;page-break-after:avoid}
    table{width:100%;border-collapse:collapse;margin-bottom:6px;page-break-inside:auto} tr{page-break-inside:avoid}
    th,td{unicode-bidi:plaintext;border:1px solid #cfcfcf;padding:5px 6px;text-align:center} th{background:#BE123C;color:#fff} tbody tr:nth-child(even){background:#f8f8f8}
    tr.tot td{font-weight:bold;background:#FFE4E6} td.bl{text-align:right;font-size:11px;line-height:1.5}
    .ft{margin-top:14px;border-top:1px solid #ccc;padding-top:6px;color:#777;font-size:11px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="hd"><div><div class="o">مصرف الدم الرئيسي — واسط</div><h1>${saEsc(d.title)}</h1></div><div class="m">${saEsc(period)}<br>تاريخ الطباعة: ${now}</div></div>
    <div class="cards">${d.cards.map(c=>`<div class="c"><b>${c[1]}</b>${saEsc(c[0])}</div>`).join('')}</div>
    ${d.sections.map(tbl).join('')}
    <div class="ft"><span>تطبيق كرار</span><span>${saEsc(UPROF?.full_name||'')}</span></div>
    <script>setTimeout(function(){window.print()},500)<\/script></body></html>`);
}
