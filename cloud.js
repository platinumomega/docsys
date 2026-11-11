import {listPresetCopies} from "./preset-user-templates.js?v=20261101-copy-1";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,collection,query,where,orderBy,limit,getDocs,deleteDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
let db=null;
let user=null, role=null, currentId=null, writeTimer=null, loading=false; const rank={user:1,staff:1,manager:2,superadmin:3};
const el=id=>document.getElementById(id);
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const notify=s=>{el("cloudStatus").textContent=s;};
const bridge=()=>window.DocSystemBridge;
const encode = (value, nested = false) => {
 if (Array.isArray(value)) {
   const result = value.map(v => encode(v, true));
   return nested ? { nestedArrayData: result } : result;
 }
 if (value && typeof value === "object") {
   return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)]));
 }
 return value;
};
const decode = value => {
 if (Array.isArray(value)) return value.map(decode);
 if (value && typeof value === "object") {
   if (Object.keys(value).length === 1 && Array.isArray(value.nestedArrayData))
     return value.nestedArrayData.map(decode);
   return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decode(v)]));
 }
 return value;
};

function canManage(){return role==="superadmin"||role==="manager"}
function canAdmin(){return role==="superadmin"}
export async function startCloud(authUser,profile){
  db=getFirestore();user=authUser;role=profile.role;currentId=null;loading=true;
  el("cloudMenuUsers").hidden=!canManage();
  el("newSuperadminOption").hidden=!canAdmin();
  document.querySelectorAll(".cloud-admin-only").forEach(x=>x.hidden=!canManage());
  const snap=await getDoc(doc(db,"appSettings","main"));
  if(snap.exists() && snap.data().settings)bridge().setSettings(decode(snap.data().settings));
  else if(canManage())await setDoc(doc(db,"appSettings","main"),{settings:encode(bridge().getSettings()),updatedAt:serverTimestamp(),updatedBy:user.uid});
  loading=false;notify("Online · "+profile.role);
  await loadDocs();
  await loadSavedPresetCopies();
  if(canManage())await loadUsers();
}
export function clearCloud(){user=null;role=null;currentId=null;loading=true;el("cloudList").innerHTML="";el("userList").innerHTML="";const list=el("workspacePresetCopiesList");if(list)list.innerHTML="";const lib=el("presetCopyLibraryList");if(lib)lib.innerHTML="";notify("Not signed in");}
export function settingsChanged(){
  if(!user||!canManage()||loading)return;
  clearTimeout(writeTimer);
  writeTimer=setTimeout(async()=>{
    try {
      await setDoc(doc(db,"appSettings","main"),{settings:encode(bridge().getSettings()),updatedBy:user.uid,updatedAt:serverTimestamp()});
      notify("Settings saved online");
      window.dispatchEvent(new CustomEvent('docsystem-settings-sync',{detail:{ok:true}}));
    }catch(e){
      notify("Settings save failed: "+e.message);
      window.dispatchEvent(new CustomEvent('docsystem-settings-sync',{detail:{ok:false,message:e.message}}));
    }
  },900);
}
export function changedDocument(){currentId=null;}
export async function businessHasDocuments(profileId){
 if(!user||!profileId)return null;
 try {const result=await getDocs(query(collection(db,"documents"),where("profileId","==",profileId),limit(1)));return !result.empty;}
 catch(error){notify("Business check failed: "+error.message);return null}
}
export async function saveDocument(){
  if(!user)return;
  const payload=bridge().getDocument();
  const d=payload.doc, num=String(d.fieldValues?.docno||"").trim(), date=String(d.fieldValues?.date||"").slice(0,10);
  if(!num){alert("Enter a document number before saving.");return}
  let savedDoc= currentId ? doc(db,"documents",currentId):doc(collection(db,"documents"));
  try{
    if(!currentId){
      // Restrict duplicate checks to the selected business. An unscoped query
      // can be rejected by business-aware Firestore rules.
      const matches=await getDocs(query(collection(db,"documents"),where("profileId","==",payload.profileId),limit(500)));
      const existing=matches.docs.find(x=>x.data().number===num && x.data().documentType===d.type);
      if(existing){
        if(!confirm("Document "+num+" exists. Update it instead of creating another?"))return;
        savedDoc=doc(db,"documents",existing.id);
      }
    }
    const prior=await getDoc(savedDoc);
    if(prior.exists() && prior.data().profileId!==payload.profileId){alert('Cannot save a document under another business. Open it under its original business.');return}
    await setDoc(savedDoc,{...encode(payload),number:num,documentType:d.type,date:date||new Date().toISOString().slice(0,10),profileId:payload.profileId,updatedAt:serverTimestamp(),updatedBy:user.uid,...(!prior.exists()?{createdAt:serverTimestamp(),createdBy:user.uid,creatorRole:role}:{})},{merge:true});
    currentId=savedDoc.id;notify("Document saved online: "+num);await loadDocs();
  }catch(e){const reason=(e.code?e.code+": ":"")+(e.message||String(e));notify("Save failed: "+reason);alert("Could not save document for "+payload.profileName+": "+reason+"\n\nIf permission-denied appears, review the Firestore rules for documents and appSettings.");}
}
export async function loadDocs(){
  if(!user)return;
  const month=el("cloudMonth").value;
  const businessId=bridge()?.getSettings()?.activeProfileId;
  if(!businessId){el("cloudList").innerHTML="<p>Select a business to view documents.</p>";return}
  const q=query(collection(db,"documents"),where("profileId","==",businessId),limit(500));
  try{
    const snaps=await getDocs(q);
    const records=snaps.docs.filter(s=>!month||String(s.data().date||"").slice(0,7)===month).sort((a,b)=>String(b.data().date||"").localeCompare(String(a.data().date||""))).slice(0,150);
    const creators=new Map();
    for(const s of records){
      const d=s.data(),id=d.createdBy;
      if(!d.creatorRole && id && id!==user.uid && !creators.has(id)){
        try{const p=await getDoc(doc(db,"users",id));creators.set(id,p.exists()?p.data().role:null)}
        catch{creators.set(id,null)}
      }
    }
    el("cloudList").innerHTML=!records.length?"<p>No documents for this business and period.</p>":records.map(s=>{
      const d=s.data(),ownerRole=d.creatorRole||creators.get(d.createdBy);
      const canDelete=canAdmin()||role==="manager"||d.createdBy===user.uid;
      return '<div class="cloud-entry"><div><b>'+escape(d.number||"Untitled")+'</b><div class="muted">'+escape(d.documentType)+" · "+escape(d.date)+" · "+escape(d.profileName)+'</div></div><div class="actions"><button data-open-doc="'+escape(s.id)+'">Open</button><button data-copy-doc="'+escape(s.id)+'">Duplicate</button>'+(canDelete?'<button class="danger" data-delete-doc="'+escape(s.id)+'">Delete</button>':'')+'</div></div>';
    }).join("");
    notify("Online · "+records.length+" documents loaded for selected business");
  }catch(e){notify("Document load failed: "+e.message)}
}
export async function deleteDocument(id){
  if(!user)return;
  try{
    const ref=doc(db,"documents",id),snap=await getDoc(ref);
    if(!snap.exists())return alert("Document no longer exists.");
    const record=snap.data();
    if(record.profileId!==bridge().getSettings().activeProfileId){alert("Select the document\u0027s business before deleting it.");return}
    if(!canAdmin()&&role!=="manager"&&record.createdBy!==user.uid){
      alert("Only the document creator, a manager, or a superadmin can delete this document.");return;
    }
    if(!confirm("Permanently delete "+(record.number||id)+"? This cannot be undone."))return;
    await deleteDoc(ref);
    if(currentId===id)currentId=null;
    notify("Document deleted");await loadDocs();
  }catch(error){
    if(error.code==="permission-denied"){
      alert("Delete denied by Firestore security rules. The document was not deleted. Firebase rules must grant this operation to your role.");
    }else alert("Delete failed: "+(error.code||error.message));
  }
}
export async function openDocument(id,duplicate=false){
  try{
    const s=await getDoc(doc(db,"documents",id));
    if(!s.exists())throw Error("Document not found");
    if(s.data().profileId!==bridge().getSettings().activeProfileId)throw Error("This document belongs to another business.");
    if(s.data().templateSource==="preset"){
      const data=s.data(),isPo=data.templateFamily==='purchase-order'||data.documentType==='Purchase Order',isDo=data.templateFamily==='delivery-ticket'||data.documentType==='Delivery Ticket',isReturn=data.templateFamily==='returning-ticket'||data.documentType==='Returning Ticket',isInvoice=data.templateFamily==='invoice'||data.documentType==='Invoice';
      const preset=encodeURIComponent(data.templateId||((isInvoice||isReturn||isDo)?'standard':isPo?'purchase-credit':'rental3'));
      const family=isInvoice?'&family=invoice':isReturn?'&family=returning-ticket':isDo?'&family=delivery-ticket':isPo?'&family=purchase-order':'';
      const saved=duplicate?'':(isInvoice?'&invoiceDoc=':isReturn?'&returnDoc=':isDo?'&doDoc=':isPo?'&poDoc=':'&presetDoc=')+encodeURIComponent(id);
      window.location.href="./?preset="+preset+family+saved;
      return;
    }
    // A saved custom document must never inherit the last-used preset editor.
    const sourcePicker=document.getElementById("workspaceTemplateSource");
    if(sourcePicker && sourcePicker.value!=="custom"){
      sourcePicker.value="custom";
      sourcePicker.dispatchEvent(new Event("change",{bubbles:true}));
    }
    bridge().setDocument(decode(s.data()));currentId=duplicate?null:id;
    if(duplicate)notify("Duplicate ready: change document number and save");
    else notify("Document opened: "+(s.data().number||""));
    document.querySelector('[data-tab="create"]').click();
  }catch(e){notify("Open failed: "+e.message)}
}
export async function loadUsers(){
  if(!user||!canManage())return;
  try{
    const snaps=await getDocs(canAdmin()?query(collection(db,"users"),limit(200)):query(collection(db,"users"),where("role","in",["manager","user","staff"]),limit(200)));
    el("userList").innerHTML=snaps.docs.map(s=>{let x=s.data();return '<div class="cloud-entry"><div><b>'+escape(x.email)+'</b><div class="muted">Account</div></div><div class="actions"><select data-role-uid="'+escape(s.id)+'" '+(!canAdmin()?'disabled':'')+'>'+(canAdmin()?["superadmin","manager","user"]:["manager","user"]).map(r=>'<option '+(r===(x.role==='staff'?'user':x.role)?'selected':'')+'>'+r+'</option>').join("")+'</select><select data-status-uid="'+escape(s.id)+'"><option '+(x.status==="active"?"selected":"")+'>active</option><option '+(x.status==="inactive"?"selected":"")+'>inactive</option></select><button data-user-save="'+escape(s.id)+'">Update</button></div></div>'}).join("");
  }catch(e){el("userList").textContent="Could not load users: "+e.message}
}
export async function saveUser(uid){
  if(!canManage())return;
  const row=el("userList").querySelector('[data-user-save="'+uid+'"]').closest(".cloud-entry");
  const newRole=row.querySelector("select[data-role-uid]").value;
  const status=row.querySelector("select[data-status-uid]").value;
  if(uid===user.uid&&status==="inactive"){alert("You cannot deactivate yourself.");return}
  try{const ref=doc(db,"users",uid);const current=await getDoc(ref);if(!current.exists())throw Error("Account missing");
    if(!canAdmin()&&current.data().role==="superadmin")throw Error("Manager cannot modify a superadmin account");
    const storedRole=canAdmin()?newRole:current.data().role;
    if(!["superadmin","manager","user","staff"].includes(storedRole))throw Error("Invalid role");
    await setDoc(ref,{role:storedRole,status},{merge:true});notify("Account updated");await loadUsers();
  }catch(e){alert("Update failed: "+e.message)}
}
export async function addUser(){
  if(!canManage())return;
  const email=el("newUserEmail").value.trim().toLowerCase();
  const password=el("newUserPassword").value;
  const chosenRole=el("newUserRole").value;
  if(!email.includes("@") || password.length<6)return alert("Enter an email and a password of at least 6 characters.");
  if(!["user","manager","superadmin"].includes(chosenRole))return alert("Select a valid role.");
  if(!canAdmin() && chosenRole==="superadmin")return alert("Superadmin assignment is restricted.");
  const button=el("cloudUserAdd");button.disabled=true;
  let secondary=null;
  try{
    const {getApp}=await import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js");
    const config=getApp().options;
    secondary=initializeApp(config,"docsystem-user-provisioning");
    const newAuth=getAuth(secondary);
    const credentials=await createUserWithEmailAndPassword(newAuth,email,password);
    try{
      await setDoc(doc(db,"users",credentials.user.uid),{email,role:chosenRole,status:"active"});
    }catch(error){
      notify("Authentication user created, but profile creation failed. Contact administrator.");
      throw error;
    }
    await signOut(newAuth);
    el("newUserEmail").value="";el("newUserPassword").value="";
    notify("New user added: "+email);await loadUsers();
  }catch(error){alert("User creation failed: "+(error.code||error.message))}
  finally{button.disabled=false;if(secondary){try{await deleteApp(secondary)}catch(e){console.warn(e)}}}
}


export async function loadSavedPresetCopies(){
 const containers=[el('workspacePresetCopiesList'),el('presetCopyLibraryList')].filter(Boolean);
 if(!containers.length)return;
 if(!user){containers.forEach(x=>x.innerHTML='');return}
 try{
  const copies=await listPresetCopies(user);
  const label={'quotation':'Quotation','purchase-order':'Purchase Order','delivery-ticket':'Delivery Ticket','returning-ticket':'Returning Ticket','invoice':'Invoice'};
  const markup=copies.length?copies.map(copy=>
   '<div class="cloud-entry"><div><b>'+escape(copy.name)+'</b><div class="muted">'+escape(label[copy.family]||copy.family)+' · Based on '+escape(copy.basePresetId)+' · My Template</div></div>'+
   '<button type="button" class="small" data-open-preset-copy="'+escape(copy.id)+'" data-copy-family="'+escape(copy.family)+'" data-copy-base="'+escape(copy.basePresetId)+'">Use in Workspace</button>'+
   '<button type="button" class="small cloud-admin-only" data-edit-preset-copy="'+escape(copy.id)+'" data-copy-family="'+escape(copy.family)+'" data-copy-base="'+escape(copy.basePresetId)+'">Configure Copy</button></div>').join('')
   :'<p class="muted">No saved preset copies yet. Choose Configure Preset Templates above to duplicate an original and save a new reusable template.</p>';
  containers.forEach(x=>x.innerHTML=markup);
 }catch(error){
  containers.forEach(x=>x.innerHTML='<p class="muted">Cannot load saved preset copies: '+escape(error.message)+'</p>');
 }
}

document.addEventListener("click",e=>{
  const a=e.target.closest("[data-open-doc]");if(a)openDocument(a.dataset.openDoc);
  const del=e.target.closest("[data-delete-doc]");if(del)deleteDocument(del.dataset.deleteDoc);
  const b=e.target.closest("[data-copy-doc]");if(b)openDocument(b.dataset.copyDoc,true);
  const c=e.target.closest("[data-user-save]");if(c)saveUser(c.dataset.userSave);
  if(e.target.id==="cloudRefresh")loadDocs();
  if(e.target.id==="cloudSave")saveDocument();
  if(e.target.id==="cloudUserAdd")addUser();
});
el("cloudMonth").value=new Date().toISOString().slice(0,7);
el("cloudMonth").addEventListener("change",loadDocs);
