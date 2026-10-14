// ================================================================
// ملصق القنينة (طابعة HPRT الصغيرة) — قالب label_EMPTY.html كما هو: اسم المتبرع كبير بالأعلى، تحته رقم
// القنينة وبجانبه نوع القنينة، ثم تاريخ السحب وتاريخ النفاذ. أسود على أبيض، صفحة = ملصق.
// يُطبع داخل iframe مخفي (CSS معزول). على iPhone/iPad يُرسم نفس التصميم على canvas ويُحفظ PDF بمقاس
// الملصق (صفحة لكل ملصق) لأن طباعة iOS تضيف ترويسة/تذييل لا تُلغى بـ CSS.
// ================================================================
const LABEL_CSS = `*{box-sizing:border-box}body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#000;background:#eee}.label{width:var(--label-width,50mm);height:var(--label-height,50mm);padding:1.5mm 2mm;display:flex;flex-direction:column;justify-content:space-between;background:white;margin:12px auto;overflow:hidden;break-after:page;page-break-after:always;direction:rtl}.label:last-child{break-after:auto;page-break-after:auto}.name{font-size:calc(var(--u,50mm)*.16);font-weight:700;text-align:center;line-height:1.25;white-space:nowrap;overflow:hidden}.bag-row{display:flex;direction:ltr;height:calc(var(--u,50mm)*.26)}.type{flex:0 0 28%;display:flex;align-items:center;justify-content:center;text-align:center;direction:rtl;font-size:calc(var(--u,50mm)*.09);font-weight:700;line-height:1.15;border-right:.4mm solid #000;padding:0 1mm;overflow-wrap:anywhere;overflow:hidden}.number{flex:1;min-width:0;text-align:center;direction:ltr;font-size:calc(var(--u,50mm)*.22);font-weight:700;line-height:calc(var(--u,50mm)*.26);white-space:nowrap;overflow:hidden}.dates{font-size:calc(var(--u,50mm)*.115);font-weight:700}.date-row{display:flex;justify-content:space-between;align-items:center;gap:1mm;line-height:1.5}.date-row span{white-space:nowrap}.date-value{direction:ltr;white-space:nowrap}@media print{body{background:white}.label{margin:0}html,body{width:var(--label-width,50mm)}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
// Fixed stock size (measured on the real label: 5.9 cm x 4 cm, edge to edge) — not user-adjustable.
const LABEL_SIZE = {width:59, height:40};
const LABEL_LIMITS = {minW:25, maxW:100, minH:25, maxH:150, maxCopies:100};

// Size is remembered per device (the real label stock / printer driver decides it, not the template's 50x50).
function labelCfgLoad(){
  try{
    const c=JSON.parse(localStorage.getItem('bb_label_cfg')||'null');
    if(c && c.width>=LABEL_LIMITS.minW && c.width<=LABEL_LIMITS.maxW && c.height>=LABEL_LIMITS.minH && c.height<=LABEL_LIMITS.maxH) return {width:Number(c.width),height:Number(c.height)};
  }catch(e){}
  return {width:50,height:50};
}
function labelCfgSave(size){ try{ localStorage.setItem('bb_label_cfg',JSON.stringify({width:size.width,height:size.height})); }catch(e){} }
function labelValidate(copies,size){
  if(!Number.isInteger(copies)||copies<1||copies>LABEL_LIMITS.maxCopies) throw new Error('عدد الملصقات يجب أن يكون من 1 إلى '+LABEL_LIMITS.maxCopies);
  const w=Number(size.width),h=Number(size.height);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<LABEL_LIMITS.minW||w>LABEL_LIMITS.maxW||h<LABEL_LIMITS.minH||h>LABEL_LIMITS.maxH)
    throw new Error('القياس غير صالح (العرض '+LABEL_LIMITS.minW+'–'+LABEL_LIMITS.maxW+' ملم، الارتفاع '+LABEL_LIMITS.minH+'–'+LABEL_LIMITS.maxH+' ملم)');
}

// data: { donorName, bagNumber, bagType, collectionDate, expiryDate }
function buildLabelHtml(data,copies,size,full){
  if(full===undefined) full=1;
  labelValidate(copies,size);
  const json = JSON.stringify(data||{}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصق القنينة</title>'
   + '<style>@page{size:'+size.width+'mm '+size.height+'mm;margin:0}</style><style>'+LABEL_CSS+'</style></head><body><div id="labels"></div>'
   + '<script>' + LABEL_SCRIPT.replace('__DATA__',function(){return json;}).replace('__COPIES__',String(copies)).replace('__FULL__',String(full)).replace('__W__',String(size.width)).replace('__H__',String(size.height)) + '<\/script></body></html>';
}

const LABEL_SCRIPT = [
"function renderLabels(data,copies,size,full){",
" var w=Number(size.width),h=Number(size.height);",
" document.documentElement.style.setProperty('--label-width',w+'mm');document.documentElement.style.setProperty('--label-height',h+'mm');document.documentElement.style.setProperty('--u',Math.min(h,w/1.5)+'mm');",
" var host=document.getElementById('labels');host.innerHTML='';",
" for(var i=0;i<copies;i++){",
"  var el=document.createElement('section');el.className='label';",
"  var exp=(i<full)?'<div class=\"date-row\"><span>تاريخ النفاذ:</span><span class=\"date-value\" data-field=\"expiryDate\"></span></div>':'';",
"  el.innerHTML='<div class=\"name\" data-field=\"donorName\"></div><div class=\"bag-row\"><div class=\"type\" data-field=\"bagType\"></div><div class=\"number\" data-field=\"bagNumber\"></div></div><div class=\"dates\"><div class=\"date-row\"><span>تاريخ السحب:</span><span class=\"date-value\" data-field=\"collectionDate\"></span></div>'+exp+'</div>';",
"  el.querySelectorAll('[data-field]').forEach(function(n){var v=data[n.dataset.field];n.textContent=(v===undefined||v===null)?'':v;});host.appendChild(el);",
" }",
" fitText();",
"}",
"function fitText(){",
" var H=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u'))||50, px=96/25.4;",
" var floors={name:H*.08*px,number:H*.11*px,type:H*.045*px};",
" document.querySelectorAll('.name').forEach(function(el){el.style.whiteSpace='';el.style.maxHeight='';});",
" document.querySelectorAll('.name,.number,.type').forEach(function(el){",
"  el.style.fontSize='';",
"  var key=el.classList.contains('name')?'name':el.classList.contains('number')?'number':'type';",
"  var size=parseFloat(getComputedStyle(el).fontSize);",
"  while((el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)&&size>floors[key]){size-=.5;el.style.fontSize=size+'px';}",
"  if(key==='name'&&el.scrollWidth>el.clientWidth+1){",
"   el.style.whiteSpace='normal';el.style.maxHeight=(H*.22)+'mm';size=H*.1*px;el.style.fontSize=size+'px';",
"   while(el.scrollHeight>el.clientHeight+1&&size>H*.055*px){size-=.5;el.style.fontSize=size+'px';}",
"  }",
" });",
"}",
"async function printLabels(){",
" await document.fonts.ready;fitText();",
" var bad=[].slice.call(document.querySelectorAll('.label *')).some(function(el){return el.clientWidth&&((el.scrollWidth>el.clientWidth+1)||(el.scrollHeight>el.clientHeight+1));});",
" if(bad){ try{ parent.toast('البيانات تتجاوز مساحة الملصق — كبّر القياس أو قصّر الاسم قبل الطباعة','error',6000); }catch(e){} return; }",
" window.print();",
"}",
"window.onload=function(){ renderLabels(__DATA__,__COPIES__,{width:__W__,height:__H__},__FULL__); setTimeout(printLabels,350); };"
].join("\n");

// ───── Canvas/PDF renderer (للآيفون) — نفس مقاييس القالب ─────
function _lbPt(v){ return v*25.4/72; }   // pt → mm
function _lbPx(v){ return v*25.4/96; }   // css px → mm
function _lbWrap(ctx,text,maxW){
  // words wrap on spaces; a word wider than the line breaks by characters (overflow-wrap:anywhere)
  var lines=[], cur='';
  String(text||'').split(/\s+/).filter(Boolean).forEach(function(word){
    var t=cur?cur+' '+word:word;
    if(ctx.measureText(t).width<=maxW){ cur=t; return; }
    if(cur){ lines.push(cur); cur=''; }
    if(ctx.measureText(word).width<=maxW){ cur=word; return; }
    var part='';
    Array.from(word).forEach(function(ch){ if(ctx.measureText(part+ch).width<=maxW||!part) part+=ch; else{ lines.push(part); part=ch; } });
    cur=part;
  });
  if(cur) lines.push(cur);
  return lines.length?lines:[''];
}
async function renderLabelCanvas(data,size,ppm){
  ppm=ppm||12; data=data||{};
  var W=Number(size.width), H=Number(size.height), U=Math.min(H,W/1.5), cv=document.createElement('canvas');
  cv.width=Math.round(W*ppm); cv.height=Math.round(H*ppm);
  var ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
  try{ await document.fonts.ready; }catch(e){}
  var fam='Arial, Tahoma, sans-serif', padX=2, padY=1.5, cw=W-2*padX, ch=H-2*padY, overflow=false;
  function font(mm){ ctx.font='bold '+(mm*ppm)+'px '+fam; }
  var S=function(k){ var v=data[k]; return (v===undefined||v===null)?'':String(v); };
  function fitW(text,start,floor,maxW){ var f=start; font(f); while(ctx.measureText(text).width/ppm>maxW+0.01 && f>floor){ f-=0.5*25.4/96; font(f);} if(ctx.measureText(text).width/ppm>maxW+0.01) overflow=true; return f; }
  // name: one line, big, shrinks only as much as needed to fit the width
  var nameLines=[S('donorName')], nameFont=U*.16, nameH;
  nameFont=fitW(S('donorName'),U*.16,U*.08,cw); overflow=false;
  font(nameFont);
  if(ctx.measureText(S('donorName')).width/ppm>cw+0.01){ // too long for one line even at the floor: two lines within 20% of the height
    nameFont=U*.1; for(;;){ font(nameFont); nameLines=_lbWrap(ctx,S('donorName'),cw*ppm); if(nameLines.length*1.25*nameFont<=U*.22+0.01||nameFont<=U*.055) break; nameFont-=0.5*25.4/96; }
    if(nameLines.length*1.25*nameFont>U*.22+0.01) overflow=true;
  }
  nameH=nameLines.length*1.25*nameFont;
  // row: [type | number] — type on the left with a vertical divider, number centred in the rest
  var rowH=U*.26, typeW=cw*.28, numW=cw-typeW;
  var numFont=fitW(S('bagNumber'),U*.22,U*.11,numW-0.4);
  var typeFont=U*.09, typeLines;
  for(;;){ font(typeFont); typeLines=_lbWrap(ctx,S('bagType'),(typeW-2-0.4)*ppm); if(typeLines.length*1.15*typeFont<=rowH+0.01||typeFont<=U*.045) break; typeFont-=0.5*25.4/96; }
  if(typeLines.length*1.15*typeFont>rowH+0.01) overflow=true;
  var simple=!!data._simple, dFont=U*.115, dLine=1.5*dFont, datesH=(simple?1:2)*dLine;
  font(dFont); (simple?['تاريخ السحب:']:['تاريخ السحب:','تاريخ النفاذ:']).forEach(function(t,i){ var v=S(i?'expiryDate':'collectionDate'); if((ctx.measureText(t).width+ctx.measureText(v).width)/ppm+1>cw) overflow=true; });
  var free=ch-nameH-rowH-datesH; if(free<-0.01) overflow=true;
  var g=Math.max(0,free)/2;
  function drawLine(text,align,x,top,lineH,fontMm,dir){
    font(fontMm); ctx.fillStyle='#000'; ctx.textAlign=align; ctx.textBaseline='alphabetic';
    try{ ctx.direction=dir; }catch(e){}
    var m=ctx.measureText('Mهح'), asc=m.fontBoundingBoxAscent||fontMm*ppm*0.9, dsc=m.fontBoundingBoxDescent||fontMm*ppm*0.2;
    ctx.fillText(text,x*ppm,top*ppm+(lineH*ppm-(asc+dsc))/2+asc);
  }
  var y=padY;
  nameLines.forEach(function(l,i){ drawLine(l,'center',W/2,y+i*1.25*nameFont,1.25*nameFont,nameFont,'rtl'); });
  y+=nameH+g;
  var rowTop=y, left=padX;
  ctx.fillStyle='#000'; ctx.fillRect(Math.round((left+typeW-0.4)*ppm),Math.round(rowTop*ppm),Math.max(1,Math.round(0.4*ppm)),Math.round(rowH*ppm));
  typeLines.forEach(function(l,i){ drawLine(l,'center',left+(typeW-0.4)/2,rowTop+(rowH-typeLines.length*1.15*typeFont)/2+i*1.15*typeFont,1.15*typeFont,typeFont,'rtl'); });
  drawLine(S('bagNumber'),'center',left+typeW+numW/2,rowTop,rowH,numFont,'ltr');
  y+=rowH+g;
  (simple?[['تاريخ السحب:','collectionDate']]:[['تاريخ السحب:','collectionDate'],['تاريخ النفاذ:','expiryDate']]).forEach(function(r,i){
    var top=y+i*dLine;
    drawLine(r[0],'right',W-padX,top,dLine,dFont,'rtl');
    drawLine(S(r[1]),'left',padX,top,dLine,dFont,'ltr');
  });
  return {canvas:cv, overflow:overflow};
}
async function labelToPdfBlob(data,copies,size,full){
  if(full===undefined) full=1;
  labelValidate(copies,size);
  var r=await renderLabelCanvas(full>0?data:Object.assign({},data,{_simple:true}),size,12);
  if(r.overflow) throw new Error('البيانات تتجاوز مساحة الملصق — كبّر القياس أو قصّر الاسم');
  var r2=copies>full&&full>0?await renderLabelCanvas(Object.assign({},data,{_simple:true}),size,12):null;
  var jsPDF=window.jspdf.jsPDF, W=Number(size.width), H=Number(size.height), o=W>H?'landscape':'portrait';
  var doc=new jsPDF({orientation:o,unit:'mm',format:[W,H],compress:true});
  var img=r.canvas.toDataURL('image/png'), img2=r2?r2.canvas.toDataURL('image/png'):null;
  // الأول بالتصميم الكامل (مع تاريخ النفاذ)، والبقية بدون تاريخ النفاذ
  for(var i=0;i<copies;i++){ if(i) doc.addPage([W,H],o); doc.addImage(i<full?img:(img2||img),'PNG',0,0,W,H,i<full?'lbl':'lbl2','FAST'); }
  return doc.output('blob');
}
