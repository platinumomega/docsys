// User-created preset copies. Built-in preset JSON and editor files are never written to.
// One immutable source family + source preset ID for each copy.
import {getFirestore,collection,doc,getDoc,setDoc,getDocs,query,where,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const allowed=new Set(['quotation','purchase-order','delivery-ticket','returning-ticket','invoice']);
export async function savePresetCopy({user,family,basePresetId,name,state,profileId}){
 if(!user?.uid)throw Error('Sign in to save a reusable template');
 if(!allowed.has(family))throw Error('Unsupported preset family');
 name=String(name||'').trim();
 if(!name||name.length>100)throw Error('Enter a template name up to 100 characters');
 if(!basePresetId||!state||typeof state!=='object')throw Error('Preset editor is not ready');
 // Explicit data copy: never mutate the active document or the built-in source.
 const defaults=JSON.parse(JSON.stringify(state));
 // Ticket photos are unique to issued documents and must not be inherited,
 // especially Storage objects belonging to other completed tickets.
 if(family==='delivery-ticket'||family==='returning-ticket')defaults.photos=Array(10).fill('');
 const db=getFirestore();
 const target=doc(collection(db,'presetCopies'));
 await setDoc(target,{name,family,basePresetId,defaults,ownerUid:user.uid,profileId:profileId||'',schemaVersion:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
 return {id:target.id,name,family,basePresetId};
}
export async function readPresetCopy({user,id,family}){
 if(!user?.uid)throw Error('Sign in first');
 if(!id||id.length>180)throw Error('Invalid template ID');
 const snap=await getDoc(doc(getFirestore(),'presetCopies',id));
 if(!snap.exists())throw Error('Saved template not found');
 const data=snap.data();
 if(data.ownerUid!==user.uid)throw Error('You cannot open another user\'s private template');
 if(!allowed.has(data.family)||data.family!==family)throw Error('Preset family does not match');
 if(!data.basePresetId||!data.defaults)throw Error('Incomplete template copy');
 const defaults=JSON.parse(JSON.stringify(data.defaults));
 if(family==='delivery-ticket'||family==='returning-ticket')defaults.photos=Array(10).fill('');
 return {id:snap.id,...data,defaults};
}
export async function listPresetCopies(user){
 if(!user?.uid)return [];
 const rows=await getDocs(query(collection(getFirestore(),'presetCopies'),where('ownerUid','==',user.uid)));
 return rows.docs.map(x=>({id:x.id,...x.data()})).filter(x=>allowed.has(x.family))
   .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
}
