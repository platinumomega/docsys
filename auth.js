import * as cloud from "./cloud.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};
if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  const message = document.getElementById("authMessage");
  if (message) message.textContent = "New Firebase configuration required before sign-in.";
  throw new Error("Firebase is not configured for this DocSys deployment.");
}
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const screen = document.getElementById("authGate");
const message = document.getElementById("authMessage");
const form = document.getElementById("authForm");
const submit = document.getElementById("authSubmit");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const account = document.getElementById("authAccount");
const logout = document.getElementById("authLogout");
let currentUid = null;
function lock(text = "") {
  document.documentElement.classList.remove("auth-ready");
  screen.hidden = false;
  account.hidden = true;
  if(text) message.textContent = text;
}
function unlock(user, profile) {
  screen.hidden = true;
  message.textContent = "";
  account.hidden = false;
  account.textContent = (profile.email || user.email) + " · " + profile.role;
  document.documentElement.classList.add("auth-ready");
}
lock("Checking sign-in...");
form.addEventListener("submit", async event => {
  event.preventDefault();
  submit.disabled = true;
  message.textContent = "Signing in...";
  try {
    await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
    loginPassword.value = "";
  } catch (error) {
    console.error("DocSystem sign-in failed:", error);
    message.textContent = "Sign-in failed: " + (error.code || error.message);
  } finally {
    submit.disabled = false;
  }
});
logout.addEventListener("click", async () => {
  lock("Signing out...");
  await signOut(auth);
});
onAuthStateChanged(auth, async user => {
  const uid = user?.uid || null;
  currentUid = uid;
  if (!user) {
    cloud.clearCloud();
    window.DocSystemRole=null;
    window.DocSystemCloud=null;
    lock("Sign in with your approved account.");
    return;
  }
  lock("Checking account access...");
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (currentUid !== uid) return;
    const profile = snap.exists() ? snap.data() : null;
    const validRole = ["superadmin", "manager", "user", "staff"].includes(profile?.role);
    if (!profile || profile.status !== "active" || !validRole ||
        (profile.email || "").toLowerCase() !== (user.email || "").toLowerCase()) {
      await signOut(auth);
      lock("Account not approved, inactive, or missing a valid user profile. Contact an administrator.");
      return;
    }
    const normalizedRole=profile.role==="staff"?"user":profile.role;
    const managerOrAbove=["superadmin","manager"].includes(normalizedRole);
    window.DocSystemRole=normalizedRole;
    window.DocSystemCloud=cloud;
    document.querySelectorAll('#settingsNavTab, nav.tabs [data-tab="library"], [data-subpage="template"], #cloudMenuUsers').forEach(x=>x.hidden=!managerOrAbove);
    unlock(user, {...profile,role:normalizedRole});
    cloud.startCloud(user, profile).catch(error => {
      console.error("DocSystem cloud initialization failed:", error);
      const status=document.getElementById("cloudStatus");
      if(status) status.textContent="Cloud loading failed: "+(error.code || error.message);
    });
  } catch (error) {
    console.error("DocSystem user profile check failed:", error);
    lock("Account verification failed: " + (error.code || error.message));
  }
});
