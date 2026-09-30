// ================================================================
// DASHBOARD — 5 summary cards, each a layer-1 tile that drills into a detail view (stats +
// list) for that period, plus a per-blood-type stock grid that drills into the actual bottles.
// ================================================================
function _dashToday(){ return new Date().toISOString().split('T')[0]; }
function _dashMonthStart(){ return _dashToday().substring(0,7)+'-01'; }
function _dashYearStart(){ return _dashToday().substring(0,4)+'-01-01'; }

async function loadDash(){
  const today=_dashToday(), ms=_dashMonthStart();
  try{
    // .eq('component_type','دم كامل') on every count below — a separated bottle produces 2-4
    // rows (one per component), all sharing the SAME donor and draw event; without this filter
    // every count here (today/month/year/all-time) counts one donation multiple times. The
    // whole-blood row itself (component_type stays 'دم كامل' even after separation — only its
    // STATUS changes to 'separated') is the one row that represents the actual donation event.
    const [r0,r1,r2,r3,r4]=await Promise.all([
      db.from('blood_donations').select('*',{count:'exact',head:true}).eq('donation_date',today).eq('component_type','دم كامل').eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ms).eq('component_type','دم كامل').eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ms).eq('donation_type','طوعي').eq('component_type','دم كامل').eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ms).eq('donation_type','تعويضي').eq('component_type','دم كامل').eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).eq('component_type','دم كامل').eq('is_deleted',false)
    ]);
    ['st0','st1','st2','st3','st4'].forEach((id,i)=>{
      const vals=[r0.count,r1.count,r2.count,r3.count,r4.count];
      const el=G(id); if(el) el.textContent=fnum(vals[i]||0);
    });

    // Stock overview — by COMPONENT TYPE first (not just blood type): دم كامل، دم مضغوط،
    // بلازما، صفائح دموية، بروتين بارد — each a tile showing its total in_stock count. This is
    // level 1 of a 3-level drill-down (component type → blood type → the actual bottles),
    // matching the same pattern already used in التجهيز.
    const{data:stockRows}=await db.from('blood_donations').select('component_type').eq('status','in_stock').eq('is_deleted',false);
    const compCnt={'دم كامل':0,'دم مضغوط':0,'بلازما':0,'صفائح دموية':0,'بروتين بارد':0};
    (stockRows||[]).forEach(r=>{ const ct=r.component_type||'دم كامل'; compCnt[ct]=(compCnt[ct]||0)+1; });
    const compIcons={'دم كامل':BAG,'دم مضغوط':BAG,'بلازما':'💛','صفائح دموية':'🟡','بروتين بارد':'🧊'};
    G('btGrid').innerHTML=Object.entries(compCnt).map(([name,n])=>`
      <div class="comp-stock-card ${n===0?'empty-bt':''}" style="cursor:pointer" onclick="openStockByComponent('${name}')">
        <div class="comp-stock-icon">${compIcons[name]}</div>
        <div class="comp-stock-name">${name}</div>
        <div class="comp-stock-count">${fnum(n)}</div>
      </div>`).join('');

    // Infected badge
    const {count:ic}=await db.from('blood_donations').select('*',{count:'exact',head:true}).eq('serology_result','Positive').eq('is_deleted',false);
    if(ic>0){G('infBadge').textContent=ic; G('infBadge').style.display='inline-block';}
  }catch(e){
    console.log('loadDash error:',e);
    ['st0','st1','st2','st3','st4'].forEach(id=>{ const el=G(id); if(el) el.textContent='0'; });
  }
}

// ── Layer 2 — a card's drill-down: mini breakdown + the full list of matching donations ──
async function openDashDrill(title, from, to, extraEq){
  G('ddTitle').textContent=title;
  G('ddStats').innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  G('ddList').innerHTML='';
  G('dashDrillModal').classList.add('on');

  let q=db.from('blood_donations')
    .select('bottle_number,bottle_type,donation_type,donation_time,blood_type,serology_result,donors(donor_number,full_name,gender)')
    .gte('donation_date',from).lte('donation_date',to).eq('component_type','دم كامل').eq('is_deleted',false);
  if(extraEq) Object.entries(extraEq).forEach(([k,v])=>{ q=q.eq(k,v); });
  const{data}=await q.order('created_at',{ascending:false}).limit(300);
  const list=data||[];

  if(!list.length){
    G('ddStats').innerHTML='';
    G('ddList').innerHTML='<div class="empty"><i class="ti ti-database-off"></i><p>لا توجد بيانات لهذي الفترة</p></div>';
    return;
  }

  // Mini breakdown — by blood type, gender, donation type
  const byBt={}, byGen={}, byDt={};
  list.forEach(r=>{
    if(r.blood_type) byBt[r.blood_type]=(byBt[r.blood_type]||0)+1;
    const g=r.donors?.gender; if(g) byGen[g]=(byGen[g]||0)+1;
    if(r.donation_type) byDt[r.donation_type]=(byDt[r.donation_type]||0)+1;
  });
  const pillRow=(obj)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span class="pill py" style="margin:2px">${k}: ${fnum(v)}</span>`).join('');
  G('ddStats').innerHTML=`
    <div style="font-weight:700;color:#BE123C;margin-bottom:6px">الإجمالي: ${fnum(list.length)}</div>
    <div style="margin-bottom:4px">${pillRow(byDt)}</div>
    <div style="margin-bottom:4px">${pillRow(byGen)}</div>
    <div>${pillRow(byBt)}</div>`;

  G('ddList').innerHTML=`<div class="tw"><table><thead><tr>
      <th>رقم المتبرع</th><th>اسم المتبرع</th><th>نوع القنينة</th><th>الفصيلة</th>
      <th>نوع التبرع</th><th>وقت التبرع</th><th>الفحوصات</th>
    </tr></thead><tbody>${list.map(r=>`<tr>
      <td>${N(r.donors?.donor_number)}</td>
      <td>${esc(N(r.donors?.full_name))}</td>
      <td>${r.bottle_type}</td>
      <td>${N(r.blood_type)}</td>
      <td><span class="pill ${r.donation_type==='طوعي'?'pg':'py'}">${r.donation_type}</span></td>
      <td>${ft(r.donation_time)}</td>
      <td><span class="pill ${r.serology_result?(r.serology_result==='Negative'?'pg':'pr'):'py'}">${r.serology_result?(r.serology_result==='Negative'?'سالبة ✅':'موجبة ⚠️'):'لم يُفحص'}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

// "إجمالي الكل" — layer 1 of its own: choose a period first, then drills into the same detail
// view as every other card (openDashDrill), so the whole dashboard follows one consistent
// two-layer pattern throughout.
function openDashAllTimeChoice(){
  G('ddTitle').textContent='إجمالي الكل — اختر الفترة';
  G('ddStats').innerHTML='';
  const today=_dashToday();
  const yearAgo=new Date(); yearAgo.setFullYear(yearAgo.getFullYear()-1);
  const sixMoAgo=new Date(); sixMoAgo.setMonth(sixMoAgo.getMonth()-6);
  G('ddList').innerHTML=`<div class="comp-stock-grid">
    <div class="comp-stock-card" style="cursor:pointer" onclick="openDashDrill('آخر سنة كاملة','${yearAgo.toISOString().split('T')[0]}','${today}')">
      <div class="comp-stock-icon">📅</div><div class="comp-stock-name">آخر سنة كاملة</div>
    </div>
    <div class="comp-stock-card" style="cursor:pointer" onclick="openDashDrill('آخر ٦ أشهر','${sixMoAgo.toISOString().split('T')[0]}','${today}')">
      <div class="comp-stock-icon">🗓️</div><div class="comp-stock-name">آخر ٦ أشهر</div>
    </div>
    <div class="comp-stock-card" style="cursor:pointer" onclick="openDashDrill('منذ البداية','2000-01-01','${today}')">
      <div class="comp-stock-icon">✅</div><div class="comp-stock-name">كل الفترات</div>
    </div>
  </div>`;
  G('dashDrillModal').classList.add('on');
}

// ── Stock drill-down, level 2 — blood types WITHIN one component type ──
async function openStockByComponent(componentType){
  G('ddTitle').textContent=componentType+' — اختر الفصيلة';
  G('ddStats').innerHTML='';
  G('ddList').innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  G('dashDrillModal').classList.add('on');

  const{data}=await db.from('blood_donations').select('blood_type')
    .eq('component_type',componentType).eq('status','in_stock').eq('is_deleted',false);
  const cnt={};
  (data||[]).forEach(r=>{ if(r.blood_type) cnt[r.blood_type]=(cnt[r.blood_type]||0)+1; });
  const bts=['A+','A-','B+','B-','O+','O-','AB+','AB-'];
  const rare=['O-','AB-','A-','B-'];
  G('ddList').innerHTML=`<div class="btg">${bts.map(bt=>`<div class="btc ${rare.includes(bt)?'warn':''} ${!cnt[bt]?'empty-bt':''}" style="cursor:pointer" onclick="openStockDrill('${componentType}','${bt}')">
    <div class="btc-t">${bt}</div>
    <div class="btc-n">${fnum(cnt[bt]||0)}${rare.includes(bt)&&cnt[bt]?' ⚠':''}</div>
  </div>`).join('')}</div>`;
}

// ── Stock drill-down, level 3 — one component+blood-type combo's actual in_stock bottles ──
async function openStockDrill(componentType, bt){
  G('ddTitle').textContent=componentType+' — فصيلة '+bt;
  G('ddStats').innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  G('ddList').innerHTML='';
  G('dashDrillModal').classList.add('on');

  const{data}=await db.from('blood_donations')
    .select('bottle_number,bottle_type,expiry_date,donors(full_name)')
    .eq('blood_type',bt).eq('component_type',componentType).eq('status','in_stock').eq('is_deleted',false)
    .order('expiry_date',{ascending:true}).limit(300);
  const list=data||[];

  if(!list.length){
    G('ddStats').innerHTML='';
    G('ddList').innerHTML='<div class="empty"><i class="ti ti-package-off"></i><p>لا يوجد مخزون حالياً بهذا النوع والفصيلة</p></div>';
    return;
  }

  G('ddStats').innerHTML=`<div style="font-weight:700;color:#BE123C;margin-bottom:6px">الإجمالي: ${fnum(list.length)} قنينة</div>`;

  G('ddList').innerHTML=`<div class="tw"><table><thead><tr>
      <th>رقم القنينة</th><th>نوع القنينة</th><th>اسم المتبرع</th><th>تاريخ النفاد</th>
    </tr></thead><tbody>${list.map(r=>`<tr>
      <td style="font-weight:700;color:#BE123C">${r.bottle_number}</td>
      <td>${r.bottle_type}</td>
      <td>${esc(N(r.donors?.full_name))}</td>
      <td>${fd(r.expiry_date)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
