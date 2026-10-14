// استمارة سحب الدم — A4 بالعرض، 17 عموداً، 10 سجلات بكل صفحة (القالب: collection_form_EMPTY.html).
// التنسيق معزول: يُبنى مستند HTML مستقل يُطبع داخل iframe خفي، فلا يتأثر به التطبيق ولا يؤثر عليه.
// مفاتيح القالب: metadata = {batch,date,location,bagTypes}
//   كل سجل = {donorName,donorNo,bagType,hospitalName,patientName,antiA,antiB,antiD,aCell,bCell,interpretation,
//             hcvAb,hbsAg,hbcoreTotalAb,hivAgAb,syphilisAb}. أي قيمة ناقصة تبقى فارغة (لا استنتاج لأي نتيجة).
const COLLECTION_ROWS_PER_PAGE = 10;
const COLLECTION_CSS = "@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;background:#ddd;color:#000;font-family:Arial,Tahoma,sans-serif}.toolbar{text-align:center;padding:12px;background:white;font-size:14px}.toolbar button{padding:8px 24px}.sheet{width:297mm;height:210mm;background:white;margin:8mm auto;padding:10mm;position:relative;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}\n.heading{height:28mm;position:relative}.title{position:absolute;right:71mm;top:0;width:91mm;text-align:center;font-size:12pt;font-weight:700;line-height:2}.logo{position:absolute;left:18mm;top:2mm;width:20mm;height:20mm;object-fit:contain;filter:grayscale(1)}\n.metadata{width:277mm;height:14mm;display:table;table-layout:fixed;font-size:11pt;font-weight:700;direction:rtl}.metadata>div{display:table-cell;vertical-align:middle;white-space:nowrap}.metadata .batch{width:33mm;text-align:right}.metadata .date{width:45mm;text-align:center;direction:ltr}.metadata .place{width:113mm;text-align:center}.metadata .bags{width:86mm;text-align:center}.value{display:inline-block;min-width:22mm;text-align:center}.blank{display:inline-block;border-bottom:.5mm dotted #000;min-width:21mm;height:4mm;vertical-align:baseline}.value:not(:empty){border-bottom:0}\ntable{width:277mm;border-collapse:collapse;table-layout:fixed;direction:ltr;margin:0;font-size:10pt;font-weight:700}th,td{border:.3mm solid #000;padding:.4mm;text-align:center;vertical-align:middle;overflow-wrap:anywhere}th{height:11mm;background:#eee;font-family:'Times New Roman',serif;font-size:11pt;line-height:1.1}td{height:10mm;line-height:1.2}.arabic{direction:rtl;font-family:Arial,Tahoma,sans-serif}.numeric{direction:ltr}.footer{position:absolute;left:10mm;right:10mm;bottom:18mm;display:table;table-layout:fixed;width:277mm;direction:ltr;font-size:11pt;font-weight:700}.footer>div{display:table-cell;text-align:center;direction:rtl;vertical-align:top}.footer>div:first-child{width:90mm}.footer>div:nth-child(2){width:53mm}.footer>div:nth-child(3){width:75mm}.footer>div:last-child{width:59mm}\n@media print{body{background:white}.toolbar{display:none}.sheet{margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}";
const COLLECTION_SHEET = "<section class=\"sheet\">\n<header class=\"heading\"><div class=\"title\">مصرف الدم الرئيسي في واسط<br>استمارة سحب الدم</div><img class=\"logo\" alt=\"شعار وزارة الصحة\" src=\"data:image/png;base64,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\"></header>\n<div class=\"metadata\"><div class=\"batch\">الوجبة: <span class=\"value blank\" data-meta=\"batch\"></span></div><div class=\"date\" data-meta=\"date\"></div><div class=\"place\">مكان التبرع: <span data-meta=\"location\">شعبة مصرف الدم الرئيسي</span></div><div class=\"bags\">نوع الأكياس: <span class=\"value blank\" data-meta=\"bagTypes\"></span></div></div>\n<table><colgroup><col style=\"width:5mm\"><col style=\"width:40mm\"><col style=\"width:17mm\"><col style=\"width:17mm\"><col style=\"width:25mm\"><col style=\"width:34mm\"><col style=\"width:10mm\"><col style=\"width:10mm\"><col style=\"width:10mm\"><col style=\"width:10mm\"><col style=\"width:10mm\"><col style=\"width:20mm\"><col style=\"width:12mm\"><col style=\"width:12mm\"><col style=\"width:17mm\"><col style=\"width:13mm\"><col style=\"width:15mm\"></colgroup><thead><tr><th>N<br>O</th><th>Donor Name</th><th>Donor<br>No</th><th>Bag Type</th><th>Hospital<br>Name</th><th>Patient Name</th><th>Anti<br>A</th><th>Anti<br>B</th><th>Anti<br>D</th><th>A<br>Cell</th><th>B<br>Cell</th><th>Interpretat<br>ion</th><th>HCV<br>Ab</th><th>HBs<br>Ag</th><th>HBcore<br>Total Ab</th><th>HIV<br>Ag-Ab</th><th>Syphilis<br>Ab</th></tr></thead><tbody><tr><td class=\"numeric\">1</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">2</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">3</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">4</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">5</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">6</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">7</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">8</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">9</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr><tr><td class=\"numeric\">10</td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"arabic\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td><td class=\"numeric\"></td></tr></tbody></table>\n<footer class=\"footer\"><div>صالة سحب الدم/ اسم الساحب وتوقيعه</div><div>وحدة/ تصنيف الدم</div><div>وحدة / الفحوصات الفايروسية</div><div>وحدة/ فحص السفلس</div></footer>\n</section>";
const COLLECTION_SCRIPT = "const collectionKeys=['donorName','donorNo','bagType','hospitalName','patientName','antiA','antiB','antiD','aCell','bCell','interpretation','hcvAb','hbsAg','hbcoreTotalAb','hivAgAb','syphilisAb'];\nconst collectionPageTemplate=document.querySelector('.sheet').cloneNode(true);\nfunction setCollectionFormData(rows=[],metadata={}){\n if(!Array.isArray(rows))throw new TypeError('rows must be an array');\n const host=document.getElementById('pages');host.replaceChildren();\n const pages=Math.max(1,Math.ceil(rows.length/10));\n for(let p=0;p<pages;p++){\n const page=collectionPageTemplate.cloneNode(true);\n page.querySelectorAll('[data-meta]').forEach(node=>{let k=node.dataset.meta;node.textContent=metadata[k]??(k==='location'?'شعبة مصرف الدم الرئيسي':'');node.classList.toggle('blank',(k==='batch'||k==='bagTypes')&&!node.textContent)});\n [...page.querySelectorAll('tbody tr')].forEach((tr,i)=>{let index=p*10+i,row=rows[index];tr.children[0].textContent=index+1;collectionKeys.forEach((key,j)=>tr.children[j+1].textContent=row?.[key]??'')});\n host.append(page);\n }\n}\nfunction fitCollectionCells(){\n document.querySelectorAll('td,th').forEach(function(el){\n  var fs=parseFloat(getComputedStyle(el).fontSize),n=0;\n  while((el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)&&fs>7&&n<40){fs-=0.5;el.style.fontSize=fs+'px';n++}\n });\n}\nasync function printCollectionForm(){\n await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(function(){})));\n fitCollectionCells();window.print();\n}\nwindow.onload=function(){setCollectionFormData(__ROWS__,__META__);setTimeout(printCollectionForm,350)};";
const COLLECTION_KEYS = ['donorName','donorNo','bagType','hospitalName','patientName','antiA','antiB','antiD','aCell','bCell','interpretation','hcvAb','hbsAg','hbcoreTotalAb','hivAgAb','syphilisAb'];

function _colJson(v){ return JSON.stringify(v).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'); }
function _colClean(rows){
  return (rows||[]).map(function(r){ var o={}; COLLECTION_KEYS.forEach(function(k){ var v=r&&r[k]; o[k]=(v===undefined||v===null)?'':String(v); }); return o; });
}
// Standalone HTML document; prints itself (A4 landscape, 100%, margin 0) once fonts and the logo are ready.
function buildCollectionHtml(rows, metadata){
  var script = COLLECTION_SCRIPT.replace('__ROWS__',function(){return _colJson(_colClean(rows));}).replace('__META__',function(){return _colJson(metadata||{});});
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title> </title><style>'+COLLECTION_CSS+'</style></head><body>'
    +'<div id="pages">'+COLLECTION_SHEET+'</div><script>'+script+'<\/script></body></html>';
}

// ───── Canvas/PDF renderer (للآيفون: الطباعة المباشرة من iOS تضيف سطر الرابط/التاريخ بأسفل الورقة) ─────
const COLLECTION_LAYOUT = {
  W:297, H:210, pad:10,
  cols:[5,40,17,17,25,34,10,10,10,10,10,20,12,12,17,13,15],
  heads:[['N','O'],['Donor Name'],['Donor','No'],['Bag Type'],['Hospital','Name'],['Patient Name'],['Anti','A'],['Anti','B'],['Anti','D'],['A','Cell'],['B','Cell'],['Interpretat','ion'],['HCV','Ab'],['HBs','Ag'],['HBcore','Total Ab'],['HIV','Ag-Ab'],['Syphilis','Ab']],
  arabicCols:[1,3,4,5],
  footer:['صالة سحب الدم/ اسم الساحب وتوقيعه','وحدة/ تصنيف الدم','وحدة / الفحوصات الفايروسية','وحدة/ فحص السفلس'],
  footerW:[90,53,75,59],
  defaultLocation:'شعبة مصرف الدم الرئيسي'
};
var _collLogoCache=null;
async function _collLoadLogo(){
  if(_collLogoCache) return _collLogoCache;
  try{
    var m=COLLECTION_SHEET.match(/src="(data:image\/png;base64,[^"]+)"/); if(!m) return null;
    var img=new Image(); img.src=m[1]; await img.decode();
    // grayscale by hand (ctx.filter is not supported by iOS Safari canvas)
    var c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
    var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0);
    var d=x.getImageData(0,0,c.width,c.height), p=d.data;
    for(var i=0;i<p.length;i+=4){ var g=Math.round(p[i]*.299+p[i+1]*.587+p[i+2]*.114); p[i]=p[i+1]=p[i+2]=g; }
    x.putImageData(d,0,0); _collLogoCache=c; return c;
  }catch(e){ return null; }
}
function _collFit(ctx,text,basePx,minPx,maxW,weight,fam){
  var s=basePx; ctx.font=weight+' '+s+'px '+fam;
  while(ctx.measureText(text).width>maxW && s>minPx){ s-=0.5; ctx.font=weight+' '+s+'px '+fam; }
  return s;
}
async function renderCollectionCanvases(rows, metadata, ppm){
  ppm=ppm||8; var L=COLLECTION_LAYOUT, meta=metadata||{}, data=_colClean(rows), mm=ppm, pt=ppm*25.4/72;
  var pages=Math.max(1,Math.ceil(data.length/COLLECTION_ROWS_PER_PAGE)), out=[];
  try{ await document.fonts.ready; }catch(e){}
  var logo=await _collLoadLogo();
  var fam='Tahoma, Arial, sans-serif', serif='"Times New Roman", Times, serif';
  for(var p=0;p<pages;p++){
    var cv=document.createElement('canvas'); cv.width=Math.round(L.W*mm); cv.height=Math.round(L.H*mm);
    var ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle='#000'; ctx.textBaseline='middle';
    // title: two centered lines (box right:71mm, width 91mm inside the 277mm heading)
    var tcx=L.pad+277-71-91/2;
    ctx.font='bold '+(12*pt)+'px '+fam; ctx.textAlign='center'; ctx.direction='rtl';
    ctx.fillText('مصرف الدم الرئيسي في واسط',tcx*mm,(L.pad+4.23)*mm);
    ctx.fillText('استمارة سحب الدم',tcx*mm,(L.pad+4.23+8.47)*mm);
    if(logo) ctx.drawImage(logo,(L.pad+18)*mm,(L.pad+2)*mm,20*mm,20*mm);
    // metadata line: rtl cells (batch 33 | date 45 | place 113 | bags 86 mm), 11pt bold
    var my=(L.pad+28+7)*mm, f11='bold '+(11*pt)+'px '+fam;
    function labelValue(label,value,align,x,dotted){
      ctx.font=f11; ctx.direction='rtl';
      var lw=ctx.measureText(label+' ').width, vw=Math.max(ctx.measureText(value||'').width,dotted?22*mm:0), bw=lw+vw;
      var right=align==='right'?x:x+bw/2;
      ctx.textAlign='right'; ctx.fillText(label+' ',right,my);
      var vcx=right-lw-vw/2;
      if(value){ ctx.textAlign='center'; ctx.fillText(value,vcx,my); }
      else if(dotted){ ctx.save(); ctx.setLineDash([.5*mm,.5*mm]); ctx.lineWidth=.5*mm; ctx.beginPath(); ctx.moveTo(vcx-10.5*mm,my+2.4*mm); ctx.lineTo(vcx+10.5*mm,my+2.4*mm); ctx.stroke(); ctx.restore(); }
    }
    labelValue('الوجبة:',meta.batch||'','right',(L.pad+277)*mm,true);
    ctx.font=f11; ctx.direction='ltr'; ctx.textAlign='center'; ctx.fillText(meta.date||'',(L.pad+277-33-45/2)*mm,my);
    labelValue('مكان التبرع:',(meta.location===undefined||meta.location===null||meta.location==='')?L.defaultLocation:String(meta.location),'center',(L.pad+86+113/2)*mm,false);
    labelValue('نوع الأكياس:',meta.bagTypes||'','center',(L.pad+86/2)*mm,true);
    // table
    var ty=(L.pad+28+14), xs=[], acc=L.pad; L.cols.forEach(function(w){ xs.push(acc); acc+=w; });
    ctx.fillStyle='#eee'; ctx.fillRect(L.pad*mm,ty*mm,277*mm,11*mm);
    ctx.strokeStyle='#000'; ctx.lineWidth=.3*mm; ctx.setLineDash([]);
    L.cols.forEach(function(w,i){
      ctx.strokeRect(xs[i]*mm,ty*mm,w*mm,11*mm);
      for(var r=0;r<COLLECTION_ROWS_PER_PAGE;r++) ctx.strokeRect(xs[i]*mm,(ty+11+r*10)*mm,w*mm,10*mm);
    });
    ctx.fillStyle='#000'; ctx.direction='ltr'; ctx.textAlign='center';
    L.heads.forEach(function(h,i){
      var cx=(xs[i]+L.cols[i]/2)*mm, cy=(ty+5.5)*mm, lh=4.27*mm, maxW=(L.cols[i]-1.2)*mm;
      var sz=11*pt; h.forEach(function(t){ sz=Math.min(sz,_collFit(ctx,t,11*pt,6*pt,maxW,'bold',serif)); });
      ctx.font='bold '+sz+'px '+serif;
      h.forEach(function(t,k){ ctx.fillText(t,cx,h.length===1?cy:cy+(k-0.5)*lh); });
    });
    for(var r=0;r<COLLECTION_ROWS_PER_PAGE;r++){
      var idx=p*COLLECTION_ROWS_PER_PAGE+r, row=data[idx], cy=(ty+11+r*10+5)*mm;
      for(var c=0;c<17;c++){
        var txt=c===0?String(idx+1):(row?row[COLLECTION_KEYS[c-1]]:''); if(!txt) continue;
        var ar=L.arabicCols.indexOf(c)>=0, cx=(xs[c]+L.cols[c]/2)*mm, maxW=(L.cols[c]-1.2)*mm;
        ctx.direction=ar?'rtl':'ltr'; ctx.textAlign='center';
        var sz=_collFit(ctx,txt,10*pt,7*pt,maxW,'bold',fam);
        if(ctx.measureText(txt).width<=maxW){ ctx.fillText(txt,cx,cy); continue; }
        // still too wide at the minimum size: break into two lines at the nearest space
        var words=txt.split(' '), l1='', l2='';
        if(words.length>1){ var half=Math.ceil(words.length/2); l1=words.slice(0,half).join(' '); l2=words.slice(half).join(' '); } else { l1=txt; }
        var s2=Math.min(_collFit(ctx,l1,8*pt,6*pt,maxW,'bold',fam),l2?_collFit(ctx,l2,8*pt,6*pt,maxW,'bold',fam):8*pt);
        ctx.font='bold '+s2+'px '+fam; var lh2=s2*1.15;
        if(l2){ ctx.fillText(l1,cx,cy-lh2/2); ctx.fillText(l2,cx,cy+lh2/2); } else ctx.fillText(l1,cx,cy);
      }
    }
    // footer captions (4 cells, left→right widths 90/53/75/59), bottom: 18mm
    ctx.font=f11; ctx.direction='rtl'; ctx.textAlign='center';
    var fx=L.pad, fy=(L.H-18-2.6)*mm;
    L.footer.forEach(function(t,i){ ctx.fillText(t,(fx+L.footerW[i]/2)*mm,fy); fx+=L.footerW[i]; });
    out.push(cv);
  }
  return out;
}
async function collectionToPdfBlob(rows, metadata){
  var cvs=await renderCollectionCanvases(rows,metadata,8);
  var jsPDF=window.jspdf.jsPDF;
  var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  cvs.forEach(function(cv,i){ if(i>0) doc.addPage('a4','landscape'); doc.addImage(cv.toDataURL('image/png'),'PNG',0,0,297,210); });
  return doc.output('blob');
}
