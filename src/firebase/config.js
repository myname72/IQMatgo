// Firebase 웹 앱 설정값. 비밀 키가 아니라 공개 식별자라 코드에 둬도 된다.
// Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) > SDK 설정에서 값을 복사해 채운다.
// apiKey가 비어 있으면 로그인·포인트 기능은 꺼지고 게스트로만 플레이된다.
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
