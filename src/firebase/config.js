// Firebase 웹 앱 설정값. 비밀 키가 아니라 공개 식별자라 코드에 둬도 된다.
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정에서 값을 복사해 채운다.
// apiKey가 비어 있으면 로그인·포인트 기능은 꺼지고 게스트로만 플레이된다.
export const firebaseConfig = {
  apiKey: 'AIzaSyD8PkIpfguWeF0dybHyPQblyBVvU4zhsnY',
  authDomain: 'iq-matgo.firebaseapp.com',
  projectId: 'iq-matgo',
  storageBucket: 'iq-matgo.firebasestorage.app',
  messagingSenderId: '549201263631',
  appId: '1:549201263631:web:11ed463f50ae303e41777a',
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
