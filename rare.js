// ================================================================
// RARE BLOOD TYPES
// ================================================================
async function loadRareGrid(){
  const RARE = ['A-','B-','O-','AB-','A+','AB+'];

  // 1. Load inventory stats (in_stock bottles with rare blood types)
  const{data:inv}=await db.from('blood_donations')
    .select('blood_type')
    .in('blood_type', RARE)
    .eq('status','in_stock');

  const invCounts = {};
  RARE.forEach(t=>invCounts[t]=0);
  (inv||[]).forEach(d=>{ if(invCounts[d.blood_type]!==undefined) invCounts[d.blood_type]++; });

  G('rareStats').innerHTML = RARE.map(t=>{
    const n = invCounts[t];
    const cls = n===0?'danger':n<3?'warn':'ok';
    const colors = {ok:'#16A34A',warn:'#D97706',danger:'#DC2626'};
    return `<div class="rs-card" onclick="document.getElementById('rareBGFilter').value='${t}';filterRare()" style="border-color:${n>0?'#EEF2F6':'#FECDD3'}">
      <div class="rs-type" style="color:${colors[cls]}">${t}</div>
      <div class="rs-count" style="color:${colors[cls]};font-weight:600">${n} قنينة</div>
    </div>`;
  }).join('');

  // 2. Load rare donors — paginated (Supabase max 1000 per request)
  let allDonors = [], from = 0, pageSize = 1000, hasMore = true;
  while(hasMore){
    const{data,error}=await db.from('donors')
      .select('id,full_name,mobile,address,blood_type,is_deleted')
      .in('blood_type', RARE)
      .eq('is_deleted',false)
      .order('blood_type').order('full_name')
      .range(from, from+pageSize-1);
    if(error||!data) break;
    allDonors = allDonors.concat(data);
    hasMore = data.length === pageSize;
    from += pageSize;
  }
  if(!allDonors.length){ G('rareList').innerHTML='<div class="empty"><p>لا توجد بيانات</p></div>'; return; }

  // 3. Latest donation date per donor — computed live from actual donation records (not a
  // stored field), so it always reflects the most recent donation automatically.
  let lastDonation = {}, from2 = 0, more2 = true;
  while(more2){
    const{data,error}=await db.from('blood_donations')
      .select('donor_id,donation_date,status')
      .in('blood_type', RARE).eq('is_deleted',false)
      .not('donation_date','is',null)
      .range(from2, from2+999);
    if(error||!data) break;
    data.forEach(d=>{
      if(!d.donor_id||!d.donation_date) return;
      if(!lastDonation[d.donor_id] || d.donation_date>lastDonation[d.donor_id].date)
        lastDonation[d.donor_id]={date:d.donation_date, status:d.status};
    });
    more2 = data.length===1000;
    from2 += 1000;
  }
  // All donors stay in the staff-facing list — each is just tagged with whether they're
  // currently eligible to donate again (77 days normally, 14 days if their last donation
  // ended in a damaged bottle), so staff can see everyone but tell the two apart at a glance.
  const today=new Date(); today.setHours(0,0,0,0);
  allDonors = allDonors.map(d=>{
    const ld=lastDonation[d.id];
    let eligible=true, eligibleDate=null;
    if(ld?.date){
      const last=new Date(ld.date); last.setHours(0,0,0,0);
      const diffDays=Math.floor((today-last)/86400000);
      const required=ld.status==='damaged'?14:77;
      eligible = diffDays>=required;
      if(!eligible){
        const ed=new Date(last); ed.setDate(ed.getDate()+required);
        eligibleDate=ed.toISOString().split('T')[0];
      }
    }
    return {...d, last_donation: ld?.date||null, eligible, eligible_date: eligibleDate};
  });

  window._RARE_DATA = allDonors;
  filterRare();
}

function filterRare(){
  const data = window._RARE_DATA||[];
  const q    = (G('rareSearch')?.value||'').trim().toLowerCase();
  const bg   = G('rareBGFilter')?.value||'';

  const qN = normalizeAr(q);
  const filtered = data.filter(d=>{
    const matchBG = !bg || d.blood_type===bg;
    const matchQ  = !qN ||
      normalizeAr(d.full_name).includes(qN)||
      (d.mobile||'').includes(qN)||
      normalizeAr(d.address).includes(qN);
    return matchBG && matchQ;
  });

  const badge=G('rareCountBadge');
  if(badge) badge.textContent=filtered.length;

  // Highlight active card
  const RARE=['A-','B-','O-','AB-','A+','AB+'];
  document.querySelectorAll('.rs-card').forEach((el,i)=>
    el.classList.toggle('active', bg===RARE[i]));

  if(!filtered.length){
    G('rareList').innerHTML='<div class="empty"><p>لا توجد نتائج</p></div>';
    return;
  }

  // Show list only when user has searched or filtered
  const hasQuery = qN || bg;
  if(!hasQuery){
    G('rareList').innerHTML=`<div class="empty" style="padding:24px 0">
      <p style="font-size:17px;color:#94A3B8">ابحث بالاسم أو الهاتف أو اختر فصيلة لعرض النتائج</p>
    </div>`;
    return;
  }

  const bar=`<div id="rareBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
    <span id="rareBulkCount">0 محدد</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" style="background:#16A34A;color:#fff;border:none;font-size:15px" onclick="openWaQueue('notice')">📱 إعلام بالتسجيل — للمحدد</button>
      <button class="btn" style="background:#0369A1;color:#fff;border:none;font-size:15px" onclick="openWaQueue('invite')">📱 دعوة للتبرع — للمحدد</button>
      <button class="btn" style="background:#374151;color:#fff;border:none;font-size:15px" onclick="document.querySelectorAll('.rare-chk').forEach(c=>c.checked=false);updateRareBulkBar()">إلغاء التحديد</button>
    </div>
  </div>
  <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:15.5px;color:#374151;cursor:pointer">
    <input type="checkbox" id="rareSelAll" onchange="document.querySelectorAll('.rare-chk').forEach(c=>c.checked=this.checked);updateRareBulkBar()">
    تحديد كل النتائج المعروضة (${filtered.length})
  </label>`;

  G('rareList').innerHTML = bar + filtered.map(d=>`
    <div class="rare-row">
      <input type="checkbox" class="rare-chk" value="${esc(d.full_name||'')}" data-name="${esc(d.full_name||'—')}" data-mobile="${esc(normIraqiMobile(d.mobile)||'')}" onchange="updateRareBulkBar()" style="width:18px;height:18px;flex-shrink:0;align-self:flex-start;margin-top:4px">
      <div class="rare-av" style="width:44px;height:44px;font-size:16px">${d.blood_type||'?'}</div>
      <div class="rare-info">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="rare-name" style="font-size:18px">${esc(d.full_name||'—')}</div>
          ${d.eligible
            ? `<span style="background:#DCFCE7;color:#166534;font-size:13.5px;font-weight:700;padding:2px 8px;border-radius:20px">✅ يمكنه التبرع الآن</span>`
            : `<span style="background:#FEF3C7;color:#92400E;font-size:13.5px;font-weight:700;padding:2px 8px;border-radius:20px">⏳ يؤهَّل بتاريخ ${fd(d.eligible_date)}</span>`}
        </div>
        <div class="rare-mob" style="font-size:17px;margin-top:3px">${esc(normIraqiMobile(d.mobile)||'—')}</div>
        <div class="rare-addr" style="font-size:15px;margin-top:2px">${esc(d.address||'—')}</div>
        <div class="rare-date" style="font-size:15px;margin-top:2px;color:#757575">آخر تبرع: ${d.last_donation?fd(d.last_donation):'—'}</div>
        ${d.mobile?`<div style="display:flex;gap:6px;margin-top:8px">
          <a href="${waLink(d.mobile, WA_TEMPLATES.notice)}" target="_blank" style="background:#16A34A;color:#fff;border-radius:8px;padding:6px 10px;text-decoration:none;font-size:14px;font-weight:700">📱 إعلام بالتسجيل</a>
          <a href="${waLink(d.mobile, WA_TEMPLATES.invite)}" target="_blank" style="background:#0369A1;color:#fff;border-radius:8px;padding:6px 10px;text-decoration:none;font-size:14px;font-weight:700">📱 دعوة للتبرع</a>
        </div>`:''}
      </div>
    </div>`).join('');
  updateRareBulkBar();
}

function updateRareBulkBar(){
  const n=document.querySelectorAll('.rare-chk:checked').length;
  const bar=G('rareBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('rareBulkCount').textContent=n+' محدد';
}

// WhatsApp has no paid-free "send to everyone at once" option (that needs WhatsApp Business
// API, a separate paid service) — this is the best achievable alternative: a queue that steps
// through the selected donors one by one, each just one tap away from a pre-filled chat, with
// progress tracked so nothing gets missed or repeated.
let _waQueue=[], _waQueueIdx=0, _waQueueTemplate='notice';
function openWaQueue(templateKey){
  const checked=[...document.querySelectorAll('.rare-chk:checked')]
    .map(c=>({name:c.dataset.name, mobile:c.dataset.mobile}))
    .filter(d=>d.mobile);
  if(!checked.length){ toast('يرجى تحديد متبرع واحد على الأقل (وله رقم هاتف)','error'); return; }
  _waQueue=checked; _waQueueIdx=0; _waQueueTemplate=templateKey;
  G('waQueueTotal').textContent=_waQueue.length;
  renderWaQueueStep();
  G('waQueueModal').classList.add('on');
}
function renderWaQueueStep(){
  if(_waQueueIdx>=_waQueue.length){
    G('waQueueBody').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>✅ خلصت القائمة كلها</p></div>';
    G('waQueueOpenBtn').style.display='none';
    return;
  }
  const cur=_waQueue[_waQueueIdx];
  G('waQueuePos').textContent=(_waQueueIdx+1);
  G('waQueueBody').innerHTML=`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:20px;font-weight:800;color:#1a1a1a">${esc(cur.name)}</div>
      <div style="font-size:17px;color:#757575;margin-top:4px">${esc(cur.mobile)}</div>
    </div>`;
  G('waQueueOpenBtn').style.display='flex';
  G('waQueueOpenBtn').href=waLink(cur.mobile, WA_TEMPLATES[_waQueueTemplate]);
}
function waQueueNext(){
  _waQueueIdx++;
  renderWaQueueStep();
}
function waQueueSkip(){ waQueueNext(); }


async function exportRarePDF(){
  const data = window._RARE_DATA||[];
  const q    = (G('rareSearch')?.value||'').trim().toLowerCase();
  const bg   = G('rareBGFilter')?.value||'';
  const qN = normalizeAr(q);
  const filtered = data.filter(d=>{
    const matchBG = !bg || d.blood_type===bg;
    const matchQ  = !qN ||
      normalizeAr(d.full_name).includes(qN)||
      (d.mobile||'').includes(qN)||
      normalizeAr(d.address).includes(qN);
    return matchBG && matchQ;
  });

  if(!filtered.length){ toast('لا توجد بيانات للتصدير','error'); return; }
  toast('⏳ جاري تجهيز القائمة...','warning',3000);

  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'pt',format:'a4',compress:true});
    const W=595,H=842,sc=2;
    const cv=document.createElement('canvas');
    cv.width=W*sc; cv.height=H*sc;
    const ctx=cv.getContext('2d');
    ctx.scale(sc,sc);
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);

    // Header
    ctx.fillStyle='#BE123C'; ctx.fillRect(0,0,W,45);
    ctx.fillStyle='#fff'; ctx.font='bold 14px Arial'; ctx.textAlign='center';
    ctx.fillText('قائمة أصحاب الفصائل النادرة — مصرف الدم الرئيسي واسط',W/2,28);
    ctx.font='10px Arial';
    const bgLabel = bg ? `فصيلة: ${bg}` : 'جميع الفصائل';
    ctx.fillText(`${bgLabel} | المجموع: ${filtered.length} متبرع`,W/2,40);

    // Table header
    let y=60;
    ctx.fillStyle='#F1F5F9'; ctx.fillRect(10,y,W-20,20);
    ctx.fillStyle='#1E293B'; ctx.font='bold 9px Arial'; ctx.textAlign='right';
    [[W-15,'الاسم'],[W-185,'الفصيلة'],[W-240,'رقم الهاتف'],[W-330,'آخر تبرع'],[W-410,'العنوان']].forEach(([x,t])=>ctx.fillText(t,x,y+14));
    y+=22;

    filtered.forEach((d,i)=>{
      if(y>H-30){
        doc.addImage(cv.toDataURL('image/jpeg',0.85),'JPEG',0,0,595,842);
        doc.addPage();
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
        y=20;
      }
      ctx.fillStyle=i%2===0?'#fff':'#F8FAFC';
      ctx.fillRect(10,y,W-20,18);
      ctx.fillStyle='#1E293B'; ctx.font='9px Arial'; ctx.textAlign='right';
      ctx.fillText((d.full_name||'—').substring(0,30),W-15,y+13);
      ctx.fillStyle='#BE123C'; ctx.font='bold 9px Arial';
      ctx.fillText(d.blood_type||'—',W-185,y+13);
      ctx.fillStyle='#1E293B'; ctx.font='9px Arial';
      ctx.fillText(d.mobile||'—',W-240,y+13);
      ctx.fillText(d.last_donation?fd(d.last_donation):'—',W-330,y+13);
      ctx.fillText((d.address||'—').substring(0,18),W-410,y+13);
      y+=18;
    });

    doc.addImage(cv.toDataURL('image/jpeg',0.85),'JPEG',0,0,595,842);
    const blob=doc.output('blob');
    const fname=`فصائل_نادرة_${bg||'الكل'}_${new Date().toISOString().split('T')[0]}.pdf`;
    await shareOrDownloadFile(blob,fname,'application/pdf');
    toast('✅ تم تصدير القائمة','success');
  }catch(e){
    console.error(e);
    toast('خطأ: '+e.message,'error');
  }
}

// Genuine Excel-openable export (no external library needed): an HTML table saved with an
// .xls extension — Excel recognizes and opens this natively, with correct Arabic/RTL text
// (UTF-8 BOM) and real columns (unlike a flat CSV, this keeps header styling too).
function exportRareExcel(){
  const data = window._RARE_DATA||[];
  const q    = (G('rareSearch')?.value||'').trim().toLowerCase();
  const bg   = G('rareBGFilter')?.value||'';
  const qN = normalizeAr(q);
  const filtered = data.filter(d=>{
    const matchBG = !bg || d.blood_type===bg;
    const matchQ  = !qN ||
      normalizeAr(d.full_name).includes(qN)||
      (d.mobile||'').includes(qN)||
      normalizeAr(d.address).includes(qN);
    return matchBG && matchQ;
  });
  if(!filtered.length){ toast('لا توجد بيانات للتصدير','error'); return; }

  const rows = filtered.map(d=>`<tr>
    <td>${esc(d.full_name||'—')}</td>
    <td>${esc(d.blood_type||'—')}</td>
    <td>${esc(normIraqiMobile(d.mobile)||'—')}</td>
    <td>${esc(d.address||'—')}</td>
    <td>${d.last_donation?fd(d.last_donation):'—'}</td>
    <td>${d.eligible?'يمكنه التبرع الآن':'بانتظار الأهلية'}</td>
  </tr>`).join('');

  const html = `<html dir="rtl"><head><meta charset="UTF-8"></head><body>
    <table border="1">
      <tr style="background:#BE123C;color:#fff;font-weight:bold">
        <th>الاسم</th><th>الفصيلة</th><th>الهاتف</th><th>العنوان</th><th>آخر تبرع</th><th>الحالة</th>
      </tr>
      ${rows}
    </table>
  </body></html>`;

  const blob = new Blob(['\uFEFF'+html], {type:'application/vnd.ms-excel;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `الفصائل_النادرة_${new Date().toISOString().split('T')[0]}.xls`;
  a.click();
  toast('✅ تم تصدير '+filtered.length+' سجل لإكسل','success',3500);
}

async function loadRareList(bt){
  load(true);
  const {data}=await db.from('blood_donations')
    .select('bottle_number,donation_date,blood_type,donors(donor_number,full_name,mobile,address)')
    .eq('blood_type',bt).eq('is_deleted',false)
    .order('donation_date',{ascending:false}).limit(100);
  load(false);
  if(data&&data.length){
    G('rareTbl').innerHTML=`<div style="margin-bottom:8px;font-size:15px;font-weight:700;color:#BE123C">فصيلة ${bt} — ${data.length} سجل</div>
    <div class="tw"><table><thead><tr>
      <th>رقم المتبرع</th><th>اسم المتبرع</th><th>الفصيلة</th><th>رقم الموبايل</th><th>تاريخ التبرع</th><th>عنوان السكن</th>
    </tr></thead><tbody>${data.map(r=>`<tr>
      <td>${N(r.donors?.donor_number)}</td>
      <td>${esc(N(r.donors?.full_name))}</td>
      <td style="font-weight:700;color:#BE123C">${r.blood_type}</td>
      <td dir="ltr">${esc(N(r.donors?.mobile))}</td>
      <td>${fd(r.donation_date)}</td>
      <td>${esc(N(r.donors?.address))}</td>
    </tr>`).join('')}</tbody></table></div>
    <div class="abar" style="margin-top:10px">
      <button class="btn btn-p" onclick="window.print()"><i class="ti ti-printer"></i> طباعة تقرير فصيلة ${bt}</button>
    </div>`;
  } else {
    G('rareTbl').innerHTML='<div class="empty"><i class="ti ti-droplet-half"></i><p>لا توجد سجلات لفصيلة '+bt+'</p></div>';
  }
}

