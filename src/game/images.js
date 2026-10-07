// src/assets/cards/<imageKey>.svg 를 URL로 모은다 (빌드 시 JS에 인라인됨)
const modules = import.meta.glob('../assets/cards/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const CARD_IMAGES = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [path.split('/').pop().replace('.svg', ''), url]),
);
