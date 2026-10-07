import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 카드 이미지(webp)를 JS에 인라인해서 한 파일로도 배포할 수 있게 한다
  build: { assetsInlineLimit: 200000 },
  test: { environment: 'node' },
});
