// ================================================================
// DASHBOARD
// ================================================================
async function loadDash(){
  const dashEl=G('s-dashboard');
  const today=new Date().toISOString().split('T')[0];
  const ms=today.substring(0,7)+'-01';
  const ys=today.substring(0,4)+'-01-01';
  try{
    const [r0,r1,r2,r3,r4]=await Promise.all([
      db.from('blood_donations').select('*',{count:'exact',head:true}).eq('donation_date',today).eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ms).eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ms).eq('donation_type','طوعي').eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).gte('donation_date',ys).eq('is_deleted',false),
      db.from('blood_donations').select('*',{count:'exact',head:true}).eq('is_deleted',false)
    ]);
    ['st0','st1','st2','st3','st4'].forEach((id,i)=>{
      const vals=[r0.count,r1.count,r2.count,r3.count,r4.count];
      const el=G(id); if(el) el.textContent=fnum(vals[i]||0);
    });

    // Recent donations today
    const {data:rec}=await db.from('blood_donations')
      .select('bottle_number,bottle_type,donation_type,donation_time,blood_type,serology_result,donors(donor_number,full_name)')
      .eq('donation_date',today).eq('is_deleted',false)
      .order('created_at',{ascending:false}).limit(10);

    if(rec&&rec.length){
      G('recentTbl').innerHTML=`<div class="tw"><table><thead><tr>
        <th>رقم المتبرع</th><th>اسم المتبرع</th><th>نوع القنينة</th><th>الفصيلة</th>
        <th>نوع التبرع</th><th>وقت التبرع</th><th>الفحوصات</th>
      </tr></thead><tbody>${rec.map(r=>`<tr>
        <td>${N(r.donors?.donor_number)}</td>
        <td>${esc(N(r.donors?.full_name))}</td>
        <td>${r.bottle_type}</td>
        <td>${N(r.blood_type)}</td>
        <td><span class="pill ${r.donation_type==='طوعي'?'pg':'py'}">${r.donation_type}</span></td>
        <td>${ft(r.donation_time)}</td>
        <td><span class="pill ${(['in_stock','dispatched','rejected_positive'].includes(r.status)&&r.serology_result)?r.serology_result==='Negative'?'pg':'pr':'py'}">${(['in_stock','dispatched','rejected_positive'].includes(r.status)&&r.serology_result)?r.serology_result==='Negative'?'سالبة ✅':'موجبة ⚠️':'لم يُفحص'}</span></td>
      </tr>`).join('')}</tbody></table></div>`;
    } else {
      G('recentTbl').innerHTML='<div class="empty"><i class="ti ti-clock"></i><p>لا توجد تبرعات اليوم حتى الآن</p></div>';
    }

    // Blood type counts
    const {data:btd}=await db.from('blood_donations').select('blood_type').eq('is_deleted',false).not('blood_type','is',null);
    const btc={};
    (btd||[]).forEach(r=>{btc[r.blood_type]=(btc[r.blood_type]||0)+1;});
    const bts=['A+','A-','B+','B-','O+','O-','AB+','AB-'];
    const rare=['O-','AB-','A-','B-'];
    G('btGrid').innerHTML=bts.map(bt=>`<div class="btc ${rare.includes(bt)?'warn':''}">
      <div class="btc-t">${bt}</div>
      <div class="btc-n">${fnum(btc[bt]||0)}${rare.includes(bt)?' ⚠':''}</div>
    </div>`).join('');

    // Infected badge
    const {count:ic}=await db.from('blood_donations').select('*',{count:'exact',head:true}).eq('serology_result','Positive').eq('is_deleted',false);
    if(ic>0){G('infBadge').textContent=ic; G('infBadge').style.display='inline-block';}
  }catch(e){
    console.log('loadDash error:',e);
    ['st0','st1','st2','st3','st4'].forEach(id=>{ const el=G(id); if(el) el.textContent='0'; });
    const rt=G('recentTbl'); if(rt) rt.innerHTML='<div class="empty"><i class="ti ti-wifi-off"></i><p>تعذّر تحميل البيانات</p></div>';
  }
}

