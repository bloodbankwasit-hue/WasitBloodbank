// ================================================================
// وحدة التريما — يستقبل المتبرعين الذين اختار الاستقبال لهم نوع قنينة "تريما".
// السحب الآلي ينتج دم مضغوط أو صفائح دموية أو الاثنين؛ كل ناتج يصير سجلاً مستقلاً بنفس رقم القنينة
// ويتجه للمختبر (الفحوصات تتم مرة واحدة للسحبة كلها عبر lab-shared). نافذة التأكيد هي نفس نافذة السحب
// (drawModal) المشتركة مع draw.js حتى تبقى قواعد الرفض الطبي/الانسحاب/التلف في مكان واحد.
// ================================================================
async function loadTrima(){
  const box=G('trimaList'); if(!box) return;
  load(true);
  const{data,error}=await db.from('blood_donations')
    .select('id,donation_type,donation_date,bottle_number,bottle_type,donors(full_name,birth_year,gender,mobile)')
    .eq('status','pending_draw').eq('is_deleted',false).eq('bottle_type','تريما')
    .order('created_at',{ascending:true});
  load(false);
  if(error){ box.innerHTML='<div class="empty"><p>تعذّر التحميل: '+esc(error.message)+'</p></div>'; return; }
  if(!data||!data.length){
    box.innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا يوجد متبرعو تريما بالانتظار</p></div>';
    return;
  }
  box.innerHTML=data.map(r=>`<div class="flow-card">
    <div class="fc-av">${BAG}</div>
    <div style="flex:1">
      <div class="fc-name">${esc(r.donors?.full_name||'—')}</div>
      <div class="fc-sub">قنينة: ${esc(r.bottle_number||'—')} | ${esc(r.donation_type||'')} | ${fd(r.donation_date)}</div>
    </div>
    <div class="fc-act">
      <button class="btn btn-p" onclick="openDrawModal('${r.id}','${sq(r.donors?.full_name)}','${sq(r.donation_type||'')}','${r.bottle_number||''}','تريما')">
        <i class="ti ti-droplet"></i> سحب تريما
      </button>
    </div>
  </div>`).join('');
}
