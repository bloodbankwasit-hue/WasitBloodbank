// ================================================================
// ملصق القنينة (طابعة HPRT الصغيرة) — قالب label_EMPTY.html كما هو: اسم المتبرع كبير بالأعلى، تحته رقم
// القنينة وبجانبه نوع القنينة، ثم تاريخ السحب وتاريخ النفاذ. أسود على أبيض، صفحة = ملصق.
// يُطبع داخل iframe مخفي (CSS معزول). على iPhone/iPad يُرسم نفس التصميم على canvas ويُحفظ PDF بمقاس
// الملصق (صفحة لكل ملصق) لأن طباعة iOS تضيف ترويسة/تذييل لا تُلغى بـ CSS.
// ================================================================
const LABEL_CSS = `*{box-sizing:border-box}body{margin:0;font-family:Arial,Tahoma,sans-serif;color:#000;background:#eee}.controls{padding:16px;background:white;text-align:center;font-size:14px;line-height:2}.controls input{width:70px}.controls button{padding:8px 18px}.label{width:var(--label-width,50mm);height:var(--label-height,50mm);padding:2mm;display:flex;flex-direction:column;justify-content:space-between;background:white;margin:12px auto;overflow:hidden;break-after:page;page-break-after:always;direction:rtl}.label:last-child{break-after:auto;page-break-after:auto}.name{font-size:15pt;font-weight:700;text-align:center;line-height:1.25;overflow-wrap:anywhere;max-height:38%;overflow:hidden}.bag-row{display:flex;align-items:center;justify-content:center;gap:2mm;width:100%}.number{font-size:25pt;font-weight:700;direction:ltr;white-space:nowrap;line-height:1.15}.type{font-size:11pt;font-weight:700;max-width:45%;overflow-wrap:anywhere;text-align:center}.dates{font-size:10pt;font-weight:700}.date-row{display:flex;justify-content:space-between;align-items:center;gap:1mm;line-height:1.6}.date-value{direction:ltr;white-space:nowrap}.screen-note{color:#555}.preview-note{font-size:12px;text-align:center;margin:10px}
@media print{body{background:white}.controls,.preview-note{display:none}.label{margin:0}html,body{width:var(--label-width,50mm)}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
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
function buildLabelHtml(data,copies,size){
  labelValidate(copies,size);
  const json = JSON.stringify(data||{}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصق القنينة</title>'
   + '<style>@page{size:'+size.width+'mm '+size.height+'mm;margin:0}</style><style>'+LABEL_CSS+'</style></head><body><div id="labels"></div>'
   + '<script>' + LABEL_SCRIPT.replace('__DATA__',function(){return json;}).replace('__COPIES__',String(copies)).replace('__W__',String(size.width)).replace('__H__',String(size.height)) + '<\/script></body></html>';
}

const LABEL_SCRIPT = [
"function renderLabels(data,copies,size){",
" var w=Number(size.width),h=Number(size.height);",
" document.documentElement.style.setProperty('--label-width',w+'mm');document.documentElement.style.setProperty('--label-height',h+'mm');",
" var host=document.getElementById('labels');host.innerHTML='';",
" for(var i=0;i<copies;i++){",
"  var el=document.createElement('section');el.className='label';",
"  el.innerHTML='<div class=\"name\" data-field=\"donorName\"></div><div class=\"bag-row\"><div class=\"type\" data-field=\"bagType\"></div><div class=\"number\" data-field=\"bagNumber\"></div></div><div class=\"dates\"><div class=\"date-row\"><span>تاريخ السحب:</span><span class=\"date-value\" data-field=\"collectionDate\"></span></div><div class=\"date-row\"><span>تاريخ النفاذ:</span><span class=\"date-value\" data-field=\"expiryDate\"></span></div></div>';",
"  el.querySelectorAll('[data-field]').forEach(function(n){var v=data[n.dataset.field];n.textContent=(v===undefined||v===null)?'':v;});host.appendChild(el);",
" }",
" fitText();",
"}",
"function fitText(){",
" document.querySelectorAll('.name,.number,.type').forEach(function(el){el.style.fontSize='';var size=parseFloat(getComputedStyle(el).fontSize);while((el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)&&size>10){size-=.5;el.style.fontSize=size+'px'}});",
" // the number never wraps: if number + type overflow the row, shrink the number (prevents overlap)",
" document.querySelectorAll('.bag-row').forEach(function(row){var n=row.querySelector('.number');var size=parseFloat(getComputedStyle(n).fontSize);while(row.scrollWidth>row.clientWidth+1&&size>10){size-=.5;n.style.fontSize=size+'px'}});",
"}",
"async function printLabels(){",
" await document.fonts.ready;fitText();",
" var bad=[].slice.call(document.querySelectorAll('.label *')).some(function(el){return el.clientWidth&&((el.scrollWidth>el.clientWidth+1)||(el.scrollHeight>el.clientHeight+1));})",
"   || [].slice.call(document.querySelectorAll('.bag-row')).some(function(r){return r.scrollWidth>r.clientWidth+1;});",
" if(bad){ try{ parent.toast('البيانات تتجاوز مساحة الملصق — كبّر القياس أو قصّر الاسم قبل الطباعة','error',6000); }catch(e){} return; }",
" window.print();",
"}",
"window.onload=function(){ renderLabels(__DATA__,__COPIES__,{width:__W__,height:__H__}); setTimeout(printLabels,350); };"
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
  var W=Number(size.width), H=Number(size.height), cv=document.createElement('canvas');
  cv.width=Math.round(W*ppm); cv.height=Math.round(H*ppm);
  var ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
  try{ await document.fonts.ready; }catch(e){}
  var fam='Arial, Tahoma, sans-serif', pad=2, cw=(W-2*pad), ch=(H-2*pad), overflow=false;
  function font(mm){ ctx.font='bold '+(mm*ppm)+'px '+fam; }
  try{ ctx.direction='rtl'; }catch(e){}
  var S=function(k){ var v=data[k]; return (v===undefined||v===null)?'':String(v); };
  // name: 15pt, shrinks (0.5px steps, floor 10px) until it fits width and 38% of the content height
  var namePx=_lbPt(15)/_lbPx(1), nameFont, nameLines, nameH;
  for(;;){
    nameFont=_lbPx(namePx); font(nameFont); nameLines=_lbWrap(ctx,S('donorName'),cw*ppm); nameH=nameLines.length*1.25*nameFont;
    if(nameH<=0.38*ch+0.01 || namePx<=10) break; namePx-=0.5;
  }
  if(nameH>0.38*ch+0.01) overflow=true;
  // bag row: type (11pt, up to 45% of the width, wraps) + number (25pt, never wraps), gap 2mm, centered
  var typeFont=_lbPt(11); font(typeFont);
  var typeLines=_lbWrap(ctx,S('bagType'),0.45*cw*ppm);
  var typeW=Math.max.apply(null,typeLines.map(function(l){return ctx.measureText(l).width;}))/ppm; if(!S('bagType')) typeW=0;
  var typeH=typeLines.length*1.15*typeFont;
  var numPx=_lbPt(25)/_lbPx(1), numFont, numW, gap=S('bagType')?2:0;
  for(;;){
    numFont=_lbPx(numPx); font(numFont); numW=ctx.measureText(S('bagNumber')).width/ppm;
    if(typeW+gap+numW<=cw+0.01 || numPx<=10) break; numPx-=0.5;
  }
  if(typeW+gap+numW>cw+0.01) overflow=true;
  var rowH=Math.max(1.15*numFont, S('bagType')?typeH:0);
  var dFont=_lbPt(10), dLine=1.6*dFont, datesH=2*dLine;
  var free=ch-nameH-rowH-datesH; if(free<-0.01) overflow=true;
  var g=Math.max(0,free)/2;
  function drawLine(text,align,x,top,lineH,fontMm,dir){
    font(fontMm); ctx.fillStyle='#000'; ctx.textAlign=align; ctx.textBaseline='alphabetic';
    try{ ctx.direction=dir; }catch(e){}
    var m=ctx.measureText('Mهح'), asc=m.fontBoundingBoxAscent||fontMm*ppm*0.9, dsc=m.fontBoundingBoxDescent||fontMm*ppm*0.2;
    ctx.fillText(text,x*ppm,top*ppm+(lineH*ppm-(asc+dsc))/2+asc);
  }
  var y=pad;
  nameLines.forEach(function(l,i){ drawLine(l,'center',W/2,y+i*1.25*nameFont,1.25*nameFont,nameFont,'rtl'); });
  y+=nameH+g;
  // row (RTL): type on the right, number to its left
  var total=typeW+gap+numW, startX=(W-total)/2, rowTop=y;
  if(S('bagType')){
    var typeRight=startX+total;
    typeLines.forEach(function(l,i){ drawLine(l,'center',typeRight-typeW/2,rowTop+(rowH-typeH)/2+i*1.15*typeFont,1.15*typeFont,typeFont,'rtl'); });
  }
  drawLine(S('bagNumber'),'left',startX,rowTop+(rowH-1.15*numFont)/2,1.15*numFont,numFont,'ltr');
  y+=rowH+g;
  [['تاريخ السحب:','collectionDate'],['تاريخ النفاذ:','expiryDate']].forEach(function(r,i){
    var top=y+i*dLine;
    drawLine(r[0],'right',W-pad,top,dLine,dFont,'rtl');
    drawLine(S(r[1]),'left',pad,top,dLine,dFont,'ltr');
  });
  return {canvas:cv, overflow:overflow};
}
async function labelToPdfBlob(data,copies,size){
  labelValidate(copies,size);
  var r=await renderLabelCanvas(data,size,12);
  if(r.overflow) throw new Error('البيانات تتجاوز مساحة الملصق — كبّر القياس أو قصّر الاسم');
  var jsPDF=window.jspdf.jsPDF, W=Number(size.width), H=Number(size.height), o=W>H?'landscape':'portrait';
  var doc=new jsPDF({orientation:o,unit:'mm',format:[W,H],compress:true});
  var img=r.canvas.toDataURL('image/png');
  for(var i=0;i<copies;i++){ if(i) doc.addPage([W,H],o); doc.addImage(img,'PNG',0,0,W,H,'lbl','FAST'); }
  return doc.output('blob');
}
