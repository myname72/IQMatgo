import { useEffect, useState } from 'react';
import { firebaseEnabled } from './config.js';
import { signIn, signOut, watchUser, watchWallet } from './wallet.js';

// status: off(기능 꺼짐) | loading | out(로그아웃) | in(로그인)
export function useAccount() {
  const [user, setUser] = useState(undefined); // undefined=확인 중, null=로그아웃
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => (firebaseEnabled ? watchUser(setUser) : undefined), []);
  useEffect(() => {
    setWallet(null);
    if (!user) return undefined;
    return watchWallet(user, setWallet, () => setError('포인트 정보를 불러오지 못했습니다.'));
  }, [user]);

  const status = !firebaseEnabled ? 'off' : user === undefined ? 'loading' : user ? 'in' : 'out';
  return {
    status,
    user,
    points: wallet?.points ?? null,
    error,
    signIn: () => signIn().catch(() => setError('로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.')),
    signOut: () => signOut().catch(() => {}),
  };
}
