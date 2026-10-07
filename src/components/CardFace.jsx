import { KIND_LABEL, MONTHS, ribbonLabel } from '../game/cards.js';
import { CARD_IMAGES } from '../game/images.js';
import ItemFace from './ItemFace.jsx';

export default function CardFace({ card }) {
  if (card.kind === 'item') return <ItemFace card={card} />;
  const label = `${card.month}월 ${card.name} (${KIND_LABEL[card.kind]}${card.ribbon ? ' · ' + ribbonLabel(card.ribbon) : ''})`;
  const src = CARD_IMAGES[card.imageKey];
  if (!src) {
    // 이미지가 없을 때의 대체 표시
    return (
      <span className="card-fallback" role="img" aria-label={label} style={{ background: MONTHS[card.month - 1].color }}>
        <b>{card.month}월</b>
        <small>{card.name}</small>
      </span>
    );
  }
  return <img className="card-img" src={src} alt={label} draggable={false} />;
}
