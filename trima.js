// ================================================================
// وحدة التريما — يستقبل المتبرعين الذين اختار الاستقبال لهم نوع قنينة "تريما".
// السحب الآلي ينتج دم مضغوط أو صفائح دموية أو الاثنين؛ كل ناتج يصير سجلاً مستقلاً بنفس رقم القنينة
// ويتجه للمختبر (الفحوصات تتم مرة واحدة للسحبة كلها عبر lab-shared). نافذة التأكيد هي نفس نافذة السحب
// (drawModal) المشتركة مع draw.js حتى تبقى قواعد الرفض الطبي/الانسحاب/التلف في مكان واحد.
// ================================================================
const TRIMA_FV = {
  unit:'trima', host:'trimaList', groups:['T'], chk:null, onSel:null, bigBottle:false,
  filter:m=>!m.parent_donation_id,
  stateOf(m){
    const note=(m.bottle_note||'').replace(/^رفض طبي:\s*/,'');
    if(m.exit_reason==='medical_reject') return {k:'excl',t:'⛔ مرفوض طبياً'+(note?': '+note:'')};
    if(m.status==='damaged') return {k:'excl',t:'⛔ تالف أثناء السحب'+(note?': '+note:'')};
    if(m.status==='pending_draw' && !m.is_deleted) return {k:'ready',t:''};
    return {k:'done',t:'✓ تم السحب'+(m.draw_date?' — '+fd(m.draw_date):'')};
  },
  workDate:m=>m.draw_date,
  sub:m=>'قنينة: '+(m.bottle_number||'—')+' | '+(m.donation_type||''),
  actions(m,st){
    if(st.k!=='ready') return '';
    return `<button class="btn" onclick="openEditDonation('${m.id}')" title="تعديل البيانات"><i class="ti ti-edit"></i></button>
      <button class="btn btn-p" onclick="openDrawModal('${m.id}','${sq(m.full_name)}','${sq(m.donation_type||'')}','${m.bottle_number||''}','تريما')"><i class="ti ti-droplet"></i> سحب تريما</button>`;
  },
  async legacy(){
    const{data}=await db.from('blood_donations')
      .select('id,donation_type,donation_date,bottle_number,donors(full_name)')
      .eq('status','pending_draw').eq('is_deleted',false).eq('bottle_type','تريما').is('collection_form_id',null)
      .order('created_at',{ascending:true});
    if(!data||!data.length) return '';
    return '<div style="margin:14px 0 6px;font-weight:700;color:#6B7280">بدون استمارة (سجلات قديمة)</div>'+data.map(r=>`<div class="flow-card">
      <div class="fc-av">${BAG}</div>
      <div style="flex:1"><div class="fc-name">${esc(r.donors?.full_name||'—')}</div><div class="fc-sub">قنينة: ${esc(r.bottle_number||'—')} | ${esc(r.donation_type||'')} | ${fd(r.donation_date)}</div></div>
      <div class="fc-act"><button class="btn btn-p" onclick="openDrawModal('${r.id}','${sq(r.donors?.full_name)}','${sq(r.donation_type||'')}','${r.bottle_number||''}','تريما')"><i class="ti ti-droplet"></i> سحب تريما</button></div></div>`).join('');
  }
};
async function loadTrima(){ if(!G('trimaList')) return; await FV.show(TRIMA_FV); }
