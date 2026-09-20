// ================================================================
// BARCODE
// ================================================================
async function searchBC(){
  const t=G('bcSrch').value.trim(); if(!t){toast('أدخل رقم القنينة','warning'); return;}
  load(true);
  const {data}=await db.from('blood_donations')
    .select('*,donors(donor_number,full_name)')
    .eq('bottle_number',parseInt(t)).eq('is_deleted',false).limit(1);
  load(false);
  if(data&&data.length){BCDATA=data[0]; showBC(BCDATA);}
  else toast('لم يتم العثور على القنينة رقم '+t,'warning');
}

async function openBC(bn){
  await nav('barcode', document.querySelector('[onclick*="barcode"]'));
  G('bcSrch').value=bn; await searchBC();
}

function showBC(r){
  G('bcInfo').innerHTML=`
    <div class="bcf"><label>رقم المتبرع</label><span>${N(r.donors?.donor_number)}</span></div>
    <div class="bcf"><label>اسم المتبرع</label><span>${esc(N(r.donors?.full_name))}</span></div>
    <div class="bcf red"><label>رقم القنينة</label><span>${r.bottle_number}</span></div>
    <div class="bcf"><label>نوع القنينة</label><span>${r.bottle_type}</span></div>
    <div class="bcf"><label>تاريخ السحب</label><span>${fd(r.draw_date)}</span></div>
    <div class="bcf red"><label>تاريخ النفاد</label><span>${fd(r.expiry_date)}</span></div>`;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  JsBarcode(svg,String(r.bottle_number).padStart(8,'0'),{format:'CODE128',width:2,height:50,displayValue:true,font:'Arial',fontSize:12});
  G('bcSvg').innerHTML=''; G('bcSvg').appendChild(svg); G('bcRes').style.display='block';
}
