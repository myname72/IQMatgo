import { firebaseConfig, firebaseEnabled } from './config.js';

let cached = null;
// firebase 코드는 필요할 때만 불러온다 (게스트는 내려받지 않는다)
export async function load() {
  if (!firebaseEnabled) return null;
  if (!cached) {
    cached = (async () => {
      const [{ initializeApp }, auth, fs, fn] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/functions'),
      ]);
      const app = initializeApp(firebaseConfig);
      return { auth: auth.getAuth(app), fs: fs.getFirestore(app), fns: fn.getFunctions(app, 'asia-northeast3'), A: auth, F: fs, N: fn };
    })();
  }
  return cached;
}

// 로그인 상태가 바뀔 때마다 user(또는 null)를 알려 준다. 반환값은 구독 해제 함수.
export function watchUser(cb) {
  let off = () => {};
  let dead = false;
  load().then((fb) => {
    if (!fb || dead) return;
    off = fb.A.onAuthStateChanged(fb.auth, (u) =>
      cb(u ? { uid: u.uid, name: u.displayName || (u.email ?? '').split('@')[0], email: u.email ?? '', verified: u.emailVerified } : null),
    );
  });
  return () => {
    dead = true;
    off();
  };
}

export async function signIn() {
  const fb = await load();
  const provider = new fb.A.GoogleAuthProvider();
  try {
    await fb.A.signInWithPopup(fb.auth, provider);
  } catch (e) {
    // 팝업이 막히는 환경(일부 모바일 브라우저)에서는 페이지 이동 방식으로 다시 시도한다
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.A.signInWithRedirect(fb.auth, provider);
    } else if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

// 이메일 회원가입: 계정을 만들고 닉네임을 저장한 뒤 인증 메일을 보낸다
export async function signUpEmail(email, password, name) {
  const fb = await load();
  const cred = await fb.A.createUserWithEmailAndPassword(fb.auth, email, password);
  if (name) await fb.A.updateProfile(cred.user, { displayName: name });
  await fb.A.sendEmailVerification(cred.user);
}

export async function signInEmail(email, password) {
  const fb = await load();
  await fb.A.signInWithEmailAndPassword(fb.auth, email, password);
}

export async function resetPassword(email) {
  const fb = await load();
  await fb.A.sendPasswordResetEmail(fb.auth, email);
}

export async function resendVerification() {
  const fb = await load();
  if (fb.auth.currentUser) await fb.A.sendEmailVerification(fb.auth.currentUser);
}

// 인증을 마친 뒤 상태를 새로 읽는다 (페이지를 새로고침한 것과 같은 효과)
export async function reloadUser() {
  const fb = await load();
  if (!fb.auth.currentUser) return;
  await fb.auth.currentUser.reload();
  await fb.auth.currentUser.getIdToken(true);
  window.location.reload();
}

export async function signOut() {
  const fb = await load();
  await fb.A.signOut(fb.auth);
}

// 내 지갑(users/{uid})을 구독한다. 없으면 서버가 만든다. 포인트 변경은 서버만 할 수 있다.
export function watchWallet(user, cb, onError = () => {}) {
  let off = () => {};
  let dead = false;
  load().then(async (fb) => {
    if (!fb || dead) return;
    const ref = fb.F.doc(fb.fs, 'users', user.uid);
    // 지갑이 없으면 서버가 시작 포인트로 만든다. 서버 호출이 실패해도 이미 있는 지갑은 그대로 읽는다.
    await call('ensureWallet', {}).catch(() => {});
    if (dead) return;
    off = fb.F.onSnapshot(ref, (s) => s.exists() && cb({ points: s.data().points, activeRoom: s.data().activeRoom ?? null }), onError);
  });
  return () => {
    dead = true;
    off();
  };
}

// 서버 함수 호출 (로그인 필요). 판 시작 시 서버가 시드를 정해 주고, 끝나면 조작 기록으로 정산한다.
export async function call(name, data) {
  const fb = await load();
  const res = await fb.N.httpsCallable(fb.fns, name)(data);
  return res.data;
}
export const startAiGameOnServer = (difficulty, first) => call('startAiGame', { difficulty, first });
export const settleAiGameOnServer = (gameId, actions) => call('settleAiGame', { gameId, actions });
