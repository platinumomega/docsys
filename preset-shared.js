// Shared, safe rendering for Business Profile preset headers.
// Both Quotation and PO use the same saved presetHeader and global placeholders.
const safe = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
export function richPresetText(value) {
 return safe(value).replace(/\[b\]([\s\S]*?)\[\/b\]/gi,'<strong>$1</strong>')
  .replace(/\[i\]([\s\S]*?)\[\/i\]/gi,'<em>$1</em>')
  .replace(/\[u\]([\s\S]*?)\[\/u\]/gi,'<u>$1</u>')
  .replace(/\[size=(\d{1,2})\]([\s\S]*?)\[\/size\]/gi,(_,n,v)=>'<span style="font-size:'+Math.max(6,Math.min(36,Number(n)))+'pt">'+v+'</span>')
  .replace(/\[font=(Arial|Georgia|Verdana|Tahoma|Courier New|Times New Roman)\]([\s\S]*?)\[\/font\]/gi,(_,font,v)=>'<span style="font-family:'+font+'">'+v+'</span>')
  .replace(/\[color=(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/gi,(_,color,v)=>'<span style="color:'+color+'">'+v+'</span>');
}
function webLink(value) {
 const label=String(value??'').trim();if(!label)return '';
 try {
  const url=new URL(/^https?:\/\//i.test(label)?label:'https://'+label);
  if(['http:','https:'].includes(url.protocol)&&url.hostname.includes('.')&&!/\s/.test(label))return '<a href="'+safe(url.href)+'" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">'+safe(label)+'</a>';
 } catch {}
 return safe(label);
}
export function sharedPresetSlot(slot, company={}, config={}, globals={}) {
 const defaults={logo:'{logo}',name:'{companyName}',details:'{companyInfo}'};
 const source=config[slot]===undefined?defaults[slot]:String(config[slot]??'');
 if(!source.trim())return '';
 const sizeValue=Number(config[slot+'Size']);
 const size=Number.isFinite(sizeValue)&&sizeValue>=6&&sizeValue<=36?sizeValue:(slot==='name'?13:slot==='details'?8:10);
 const font=['Arial','Georgia','Verdana','Tahoma','Courier New','Times New Roman'].includes(config[slot+'Font'])?config[slot+'Font']:'Arial';
 const align=['left','center','right'].includes(config[slot+'Align'])?config[slot+'Align']:'left';
 const color=/^#[0-9a-fA-F]{6}$/.test(String(config[slot+'Color']||''))?config[slot+'Color']:(slot==='name'?'#081527':'#111111');
 const variables={...globals,...(company.placeholders||{})};
 const values={
  logo:company.logo||'',companyName:company.name||'',companyname:company.name||'',
  companyInfo:company.info||'',doctype:company.documentTitle||'',
  documentTitle:company.documentTitle||'',docno:company.documentNumber||'',
  docdate:company.documentDate||'',page:String(company.page||1)
 };
 const keys=[];
 const marked=source.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,key)=>{
  const exists=Object.hasOwn(values,key)||Object.hasOwn(variables,key);
  if(!exists)return match;
  keys.push(key);return 'DOCSYSTEM_SAFE_PLACEHOLDER_'+(keys.length-1)+'_END';
 });
 return '<div class="preset-header-slot" style="font-family:'+font+';font-size:'+size+'pt;text-align:'+align+';color:'+color+';white-space:pre-wrap">'+richPresetText(marked).replace(/DOCSYSTEM_SAFE_PLACEHOLDER_(\d+)_END/g,(_,n)=>{
  const key=keys[Number(n)];
  if(key==='logo')return company.logo?'<img src="'+safe(company.logo)+'" alt="Company logo" style="width:'+Math.max(10,Math.min(70,Number(config.logoWidth)||35))+'mm;max-width:100%;height:auto">':'';
  const value=Object.hasOwn(values,key)?values[key]:variables[key];
  return key==='website'?webLink(value):richPresetText(String(value??'').replace(/\[\/?size(?:=\d{1,2})?\]/gi,''));
 })+'</div>';
}

export function expandPresetText(source,company={},globals={}) {
 const variables={...globals,...(company.placeholders||{})};
 const builtins={
  companyName:company.name||'',companyname:company.name||'',
  companyInfo:company.info||'',doctype:company.documentTitle||'',
  documentTitle:company.documentTitle||'',docno:company.documentNumber||'',
  docdate:company.documentDate||'',page:String(company.page||1)
 };
 let result=String(source??'');
 const seen=new Set();
 for(let pass=0;pass<4;pass++){
  if(seen.has(result))break;
  seen.add(result);
  const next=result.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,key)=>{
   if(Object.hasOwn(builtins,key))return String(builtins[key]??'');
   if(Object.hasOwn(variables,key))return String(variables[key]??'');
   return match;
  });
  if(next===result)break;
  result=next;
 }
 return result;
}
