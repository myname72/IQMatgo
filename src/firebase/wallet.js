import { firebaseConfig, firebaseEnabled } from './config.js';

// 처음 가입할 때 받는 포인트 (임시 값. firestore.rules의 값과 같아야 한다)
export const START_POINTS = 10000;

let cached = null;
// firebase 코드는 필요할 때만 불러온다 (게스트는 내려받지 않는다)
async function load() {
  if (!firebaseEnabled) return null;
  if (!cached) {
    cached = (async () => {
      const [{ initializeApp }, auth, fs] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(firebaseConfig);
      return { auth: auth.getAuth(app), fs: fs.getFirestore(app), A: auth, F: fs };
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
    off = fb.A.onAuthStateChanged(fb.auth, (u) => cb(u ? { uid: u.uid, name: u.displayName ?? '', photo: u.photoURL ?? '' } : null));
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

export async function signOut() {
  const fb = await load();
  await fb.A.signOut(fb.auth);
}

// 내 지갑(users/{uid})을 구독한다. 없으면 시작 포인트로 만든다. 포인트 변경은 서버(규칙)만 할 수 있다.
export function watchWallet(user, cb, onError = () => {}) {
  let off = () => {};
  let dead = false;
  load().then(async (fb) => {
    if (!fb || dead) return;
    const ref = fb.F.doc(fb.fs, 'users', user.uid);
    try {
      const snap = await fb.F.getDoc(ref);
      if (!snap.exists()) {
        await fb.F.setDoc(ref, { points: START_POINTS, name: user.name, createdAt: fb.F.serverTimestamp() });
      }
    } catch (e) {
      onError(e);
      return;
    }
    if (dead) return;
    off = fb.F.onSnapshot(ref, (s) => s.exists() && cb({ points: s.data().points }), onError);
  });
  return () => {
    dead = true;
    off();
  };
}
