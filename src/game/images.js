// src/assets/cards/<imageKey>.webp 를 URL로 모은다 (빌드 시 base64로 인라인됨)
const modules = import.meta.glob('../assets/cards/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const CARD_IMAGES = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [path.split('/').pop().replace('.webp', ''), url]),
);
