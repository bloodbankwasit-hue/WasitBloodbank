// ================================================================
// STATISTICS
// ================================================================
async function loadStats(){
  const f=G('stFrom').value, t=G('stTo').value;
  if(!f||!t){toast('يرجى تحديد الفترة الزمنية','warning'); return;}
  load(true);
  const {data}=await db.from('blood_donations')
    .select('donation_type,bottle_type,blood_type,serology_result,component_type,status,dispatch_date,donors(gender)')
    .gte('donation_date',f).lte('donation_date',t).eq('is_deleted',false);
  const {data:outData}=await db.from('blood_donations')
    .select('component_type')
    .eq('status','dispatched').gte('dispatch_date',f).lte('dispatch_date',t).eq('is_deleted',false);
  load(false);
  if(!data?.length){toast('لا توجد بيانات في هذه الفترة','warning'); return;}
  const byTyp={}, byBot={}, byBld={}, byGen={ذكر:0,أنثى:0};
  const byCompIn={}, byCompOut={};
  const bts=['مفلتر','رباعي','ريفيوس','ثنائي','أحادي','تريما','حملة تبرع رباعي','حملة تبرع مفلتر','رباعي SAG'];
  data.forEach(r=>{
    byTyp[r.donation_type]=(byTyp[r.donation_type]||0)+1;
    byBot[r.bottle_type]=(byBot[r.bottle_type]||0)+1;
    if(r.blood_type) byBld[r.blood_type]=(byBld[r.blood_type]||0)+1;
    if(r.donors?.gender) byGen[r.donors.gender]=(byGen[r.donors.gender]||0)+1;
    const ct=r.component_type||'دم كامل';
    if(r.status!=='separated') byCompIn[ct]=(byCompIn[ct]||0)+1;
  });
  (outData||[]).forEach(r=>{
    const ct=r.component_type||'دم كامل';
    byCompOut[ct]=(byCompOut[ct]||0)+1;
  });
  const allComps=[...new Set([...Object.keys(byCompIn),...Object.keys(byCompOut)])];
  G('stRpt').style.display='block';
  G('stRpt').innerHTML=`<div class="rpt">
    <div class="rpt-hd">
      <div><div class="rh-t">شعبة مصرف الدم الرئيسي — واسط</div>
        <div class="rh-s">قسم الأمور الفنية / دائرة صحة واسط / وزارة الصحة</div>
        <div class="rh-s">الفترة: من ${f} إلى ${t} | الإجمالي: ${fnum(data.length)} تبرع</div>
      </div>
      <div class="rh-en">Ministry of Health<br>Wasit Health Directorate<br>Main Blood Bank Division</div>
    </div>
    <div class="rpt-body">
      <div class="rs"><div class="rs-t">إحصائية حسب نوع التبرع</div>
        ${['طوعي','تعويضي'].map(t=>`<div class="rr"><span>${t}</span><span class="rv">${fnum(byTyp[t]||0)}</span></div>`).join('')}
      </div>
      <div class="rs"><div class="rs-t">إحصائية حسب الجنس</div>
        ${Object.entries(byGen).map(([g,c])=>`<div class="rr"><span>${g}</span><span class="rv">${fnum(c)}</span></div>`).join('')}
      </div>
      <div class="rs"><div class="rs-t">إحصائية حسب نوع القنينة</div>
        ${bts.filter(b=>byBot[b]).map(b=>`<div class="rr"><span>${b}</span><span class="rv">${fnum(byBot[b])}</span></div>`).join('')}
        ${!Object.keys(byBot).length?'<div class="rr"><span>لا توجد بيانات</span><span class="rv">0</span></div>':''}
      </div>
      <div class="rs"><div class="rs-t">إحصائية حسب فصيلة الدم</div>
        ${Object.entries(byBld).sort((a,b)=>b[1]-a[1]).map(([b,c])=>`<div class="rr"><span>${b}</span><span class="rv">${fnum(c)}</span></div>`).join('')}
      </div>
      <div class="rs"><div class="rs-t">دخول وخروج حسب نوع المحتوى (دم كامل / مضغوط / بلازما / صفائح / بروتين بارد)</div>
        ${allComps.map(c=>`<div class="rr"><span>${c}</span><span class="rv">دخل: ${fnum(byCompIn[c]||0)} — خرج: ${fnum(byCompOut[c]||0)}</span></div>`).join('')}
        ${!allComps.length?'<div class="rr"><span>لا توجد بيانات</span><span class="rv">0</span></div>':''}
      </div>
    </div>
  </div>`;
}

function printStats(){
  if(G('stRpt').style.display==='none'){toast('يرجى توليد التقرير أولاً','warning'); return;}
  const c=G('stRpt').innerHTML;
  const w=window.open('','_blank','width=700,height=900');
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تقرير إحصائي</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;direction:rtl;padding:20px;background:#fff;font-size:13px}
  .rpt{border:1px solid #ddd;border-radius:8px;overflow:hidden}
  .rpt-hd{background:#BE123C;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:flex-start}
  .rh-t{font-size:14px;font-weight:700}.rh-s{font-size:11px;opacity:.8;margin-top:2px}.rh-en{text-align:left;font-size:11px;opacity:.7;line-height:1.6}
  .rpt-body{padding:14px}.rs{margin-bottom:12px}.rs-t{font-size:12px;font-weight:700;color:#757575;padding:4px 8px;background:#fafafa;border-radius:4px;margin-bottom:6px}
  .rr{display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:12px}.rr:last-child{border-bottom:none}.rv{font-weight:700;color:#BE123C}
  
/* ═══════════════════════════════════════════════════
   NEW DESIGN SYSTEM — مصرف الدم الرئيسي
   Primary: #BE123C | BG: #F1F5F9
═══════════════════════════════════════════════════ */

/* APP HEADER */
.app-header{background:#fff;border-bottom:1px solid #EEF2F6;flex-shrink:0}
.ah-top{display:flex;align-items:center;justify-content:space-between;padding:13px 16px 10px}
.ah-brand{display:flex;align-items:center;gap:10px}
.ah-name{font-size:14px;font-weight:700;color:#1E293B;line-height:1.35}
.ah-sub{font-size:11px;color:#94A3B8;margin-top:1px}
.ah-online{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#16A34A;font-weight:600;flex-shrink:0}
.ah-online span{width:7px;height:7px;background:#22C55E;border-radius:50%;display:inline-block;animation:pulse 2s infinite}
.ah-user{margin:0 16px 12px;background:#F8FAFC;border-radius:10px;padding:9px 12px;display:flex;align-items:center;justify-content:space-between;border:1px solid #EEF2F6}
.ah-user-l{display:flex;align-items:center;gap:9px}
.ah-av{width:32px;height:32px;border-radius:50%;background:#BE123C;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0}
.ah-uname{font-size:13.5px;font-weight:700;color:#1E293B}
.ah-urole{font-size:11.5px;color:#64748B;margin-top:1px}
.ah-dept{font-size:12px;font-weight:700;color:#BE123C;background:#FFF1F2;border:1px solid #FECDD3;padding:3px 11px;border-radius:20px;flex-shrink:0}

/* PAGE TITLE BAR */
.page-title-bar{display:flex;align-items:center;justify-content:space-between;padding:9px 16px 7px;background:#fff;border-bottom:1px solid #EEF2F6;flex-shrink:0}
.ptb-title{font-size:14.5px;font-weight:700;color:#1E293B}

/* 3-TAB BOTTOM NAV */
.bn-icon{font-size:25px;display:block;line-height:1}
.bn-lbl{font-size:11px;display:block;margin-top:3px;font-weight:600}

/* WORK HOME GRID */
.work-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.wcard{background:#fff;border-radius:14px;padding:18px 12px 15px;text-align:center;border:1px solid #EEF2F6;cursor:pointer;transition:all .16s;box-shadow:0 1px 4px rgba(0,0,0,.04)}
.wcard:hover{border-color:#BE123C;background:#FFF8F8;transform:translateY(-1px);box-shadow:0 4px 14px rgba(190,18,60,.1)}
.wcard:active{transform:scale(.97)}
.wcard.primary{border-color:#BE123C;background:linear-gradient(135deg,#FFF1F2,#FFE4E8)}
.wcard-icon{font-size:31px;display:block;margin-bottom:8px;line-height:1}
.wcard-name{font-size:14px;font-weight:700;color:#1E293B}
.wcard-desc{font-size:12px;color:#64748B;margin-top:2px}
.wcard-badge{display:inline-block;font-size:11px;padding:2px 9px;border-radius:20px;margin-top:6px;font-weight:700}
.wb-red{background:#FEE2E2;color:#991B1B}
.wb-green{background:#DCFCE7;color:#166534}
.wb-orange{background:#FEF3C7;color:#92400E}

/* ACCOUNT SCREEN */
.acc-profile{background:#fff;border-radius:16px;padding:22px;margin-bottom:12px;border:1px solid #EEF2F6;text-align:center}
.acc-av-big{width:64px;height:64px;border-radius:50%;background:#BE123C;display:flex;align-items:center;justify-content:center;color:#fff;font-size:25px;font-weight:700;margin:0 auto 12px;border:3px solid #FECDD3}
.acc-pname{font-size:18px;font-weight:800;color:#1E293B}
.acc-psub{font-size:12px;color:#94A3B8;margin-top:4px}
.acc-prole{display:inline-block;background:#FFF1F2;color:#BE123C;font-size:12.5px;padding:4px 14px;border-radius:20px;margin-top:8px;font-weight:700;border:1px solid #FECDD3}
.acc-menu-list{background:#fff;border-radius:14px;border:1px solid #EEF2F6;overflow:hidden}
.ami{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background .12s}
.ami:last-child{border:none}
.ami:hover{background:#F8FAFC}
.ami-icon{width:36px;height:36px;border-radius:10px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0}
.ami-icon.danger{background:#FEE2E2}
.ami-text{font-size:14px;font-weight:600;color:#1E293B}
.ami-sub{font-size:12px;color:#94A3B8;margin-top:1px}
.ami-arr{margin-right:auto;color:#CBD5E1;font-size:19px;flex-shrink:0}

/* OVERRIDE: content background */
.content{background:#F1F5F9 !important}
.page{background:#F1F5F9}

/* MOBILE OVERRIDES */
@media(max-width:768px){
  .page-title-bar{display:none}
  .ah-top{padding:11px 14px 8px}
  .ah-user{margin:0 12px 10px}
  .page{padding:12px 14px calc(130px + env(safe-area-inset-bottom,0px)) !important}
}
@media(min-width:769px){
  .app-header{display:none}
  .page-title-bar{display:flex}
}


/* ═══════ OFFLINE SYSTEM ═══════ */
.offline-bar{
  position:fixed;top:0;left:0;right:0;z-index:9999;
  background:#92400E;color:#fff;
  padding:9px 16px;font-size:14px;font-weight:600;
  display:none;align-items:center;justify-content:space-between;
  gap:10px;box-shadow:0 2px 12px rgba(0,0,0,.2);
}
.offline-bar.show{display:flex}
.offline-bar.syncing{background:#0F766E}
.ob-left{display:flex;align-items:center;gap:8px}
.ob-dot{width:8px;height:8px;border-radius:50%;background:#FCD34D;flex-shrink:0}
.ob-dot.sync{background:#6EE7B7;animation:blink .8s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.ob-badge{background:rgba(255,255,255,.25);border-radius:20px;padding:2px 10px;font-size:12px}

.offline-btn-disabled{opacity:.45;cursor:not-allowed !important;pointer-events:none}
.offline-queue-card{background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;padding:12px 14px;margin-bottom:8px}
.oqc-title{font-size:14px;font-weight:700;color:#92400E}
.oqc-sub{font-size:12px;color:#B45309;margin-top:3px}
.oqc-count{background:#92400E;color:#fff;border-radius:20px;padding:2px 9px;font-size:12px;font-weight:700}

/* BACK BUTTON */
.back-btn{
  display:none;align-items:center;gap:6px;
  background:none;border:none;cursor:pointer;
  color:#BE123C;font-size:14px;font-weight:600;
  padding:8px 16px 4px;font-family:inherit;
  -webkit-tap-highlight-color:transparent;
}
.back-btn.show{display:flex}
.back-btn-icon{font-size:19px}

/* ═══ BOTTLE SEQUENCES ═══ */
.seq-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}
.seq-card{background:#fff;border-radius:14px;padding:14px;border:1.5px solid #EEF2F6;position:relative}
.seq-card.active{border-color:#BE123C}
.seq-type{font-size:13px;font-weight:700;color:#1E293B;margin-bottom:6px}
.seq-num{font-size:23px;font-weight:800;color:#BE123C;line-height:1}
.seq-range{font-size:11px;color:#94A3B8;margin-top:3px}
.seq-remain{font-size:11px;font-weight:600;margin-top:4px}
.seq-remain.ok{color:#16A34A}
.seq-remain.warn{color:#D97706}
.seq-remain.danger{color:#DC2626}
.seq-edit{position:absolute;top:8px;left:8px;background:#FFF1F2;border:none;border-radius:8px;padding:4px 8px;font-size:12px;color:#BE123C;cursor:pointer;font-family:inherit;font-weight:600}
.seq-add-btn{width:100%;padding:12px;background:#BE123C;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px}
.seq-add-btn:active{background:#9F1239}

/* ═══ DONOR AUTOCOMPLETE ═══ */
.ac-wrap{position:relative;width:100%}
.ac-wrap input{width:100%;box-sizing:border-box}
.ac-list{
  position:absolute;top:calc(100% + 2px);right:0;left:0;z-index:500;
  background:#fff;border:1px solid #FECDD3;border-radius:10px;
  box-shadow:0 4px 16px rgba(0,0,0,.10);max-height:180px;
  overflow-y:auto;display:none;
}
.ac-list.show{display:block}
.ac-item{
  padding:10px 12px;cursor:pointer;border-bottom:1px solid #F8FAFC;
  display:flex;align-items:center;gap:10px;
}
.ac-item:last-child{border-bottom:none;border-radius:0 0 10px 10px}
.ac-item:active{background:#FFF1F2}
.ac-av{width:32px;height:32px;border-radius:50%;background:#FFF1F2;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#BE123C;flex-shrink:0}
.ac-info .ac-name{font-size:14px;font-weight:700;color:#1E293B}
.ac-info .ac-sub{font-size:11.5px;color:#94A3B8;margin-top:1px}

/* Auto-filled indicator */
.rc-filled-banner{
  background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;
  padding:9px 12px;margin-bottom:12px;display:none;
  align-items:center;justify-content:space-between;gap:10px;
}
.rc-filled-banner.show{display:flex}
.rc-filled-text{font-size:13.5px;color:#166534;font-weight:600}
.rc-filled-clear{background:none;border:none;color:#DC2626;font-size:13px;cursor:pointer;font-weight:600;padding:2px 6px;font-family:inherit}

/* ═══ RARE BLOOD TYPES ═══ */
.rare-wrap{display:flex;flex-direction:column;gap:12px}
.rare-search-bar{display:flex;gap:8px;align-items:center}
.rare-search-bar input{flex:1;padding:10px 14px;border:1.5px solid #EEF2F6;border-radius:12px;font-family:inherit;font-size:15px;direction:rtl}
.rare-search-bar select{padding:10px 12px;border:1.5px solid #EEF2F6;border-radius:12px;font-family:inherit;font-size:14px;background:#fff}
.rare-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.rs-card{background:#fff;border-radius:12px;padding:10px 12px;text-align:center;border:1.5px solid #EEF2F6;cursor:pointer;transition:all .15s}
.rs-card.active{border-color:#BE123C;background:#FFF1F2}
.rs-card:active{transform:scale(.97)}
.rs-type{font-size:16px;font-weight:800;color:#BE123C}
.rs-count{font-size:12px;color:#94A3B8;margin-top:2px}
.rare-list{background:#fff;border-radius:14px;overflow:hidden;border:1px solid #EEF2F6}
.rare-row{display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid #F8FAFC;gap:10px}
.rare-row:last-child{border-bottom:none}
.rare-av{width:36px;height:36px;border-radius:50%;background:#FFF1F2;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#BE123C;flex-shrink:0}
.rare-info{flex:1;min-width:0}
.rare-name{font-size:14px;font-weight:700;color:#1E293B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rare-addr{font-size:12px;color:#94A3B8;margin-top:2px}
.rare-mob{font-size:13px;color:#BE123C;font-weight:600}
.rare-call{background:none;border:none;color:#16A34A;font-size:21px;cursor:pointer;padding:4px;flex-shrink:0}
.rare-export-btn{width:100%;padding:12px;background:#1E293B;color:#fff;border:none;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px}
.rare-export-btn:active{background:#0F172A}
.rare-count-badge{background:#BE123C;color:#fff;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;margin-right:auto}
@media print{@page{margin:10mm}}</style></head>
  <body>${c}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
}
