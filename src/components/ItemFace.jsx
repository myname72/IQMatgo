// 아이템 패 그림 (직접 그린 SVG). 카드 비율은 일반 화투와 같다.
const THEME = {
  ssangpi: { bg: '#8a1226', fg: '#ffd84d' },
  tripi: { bg: '#5b1a8a', fg: '#ffd84d' },
  shuffle: { bg: '#0f4c81', fg: '#e8f6ff' },
  reset: { bg: '#14633a', fg: '#eaffee' },
  peek: { bg: '#3a2a78', fg: '#fff1c1' },
};

function Pi({ cx, cy, r, n, fg, bg }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fg} />
      <text x={cx} y={cy + r * 0.38} fontSize={r * 1.15} fontWeight="900" textAnchor="middle" fill={bg}>{n}</text>
    </g>
  );
}

function Icon({ item, fg, bg }) {
  switch (item) {
    case 'ssangpi':
      return (
        <g>
          <Pi cx={34} cy={72} r={17} n="2" fg={fg} bg={bg} />
          <Pi cx={70} cy={72} r={17} n="2" fg={fg} bg={bg} />
          <text x="51.6" y="112" fontSize="9" fill={fg} textAnchor="middle" opacity="0.9">피 2장</text>
        </g>
      );
    case 'tripi':
      return (
        <g>
          <Pi cx={51.6} cy={55} r={15} n="3" fg={fg} bg={bg} />
          <Pi cx={33} cy={86} r={15} n="3" fg={fg} bg={bg} />
          <Pi cx={70} cy={86} r={15} n="3" fg={fg} bg={bg} />
          <text x="51.6" y="119" fontSize="9" fill={fg} textAnchor="middle" opacity="0.9">피 3장</text>
        </g>
      );
    case 'shuffle':
      return (
        <g fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 62 H72 M60 48 L74 62 L60 76" />
          <path d="M82 98 H32 M44 84 L30 98 L44 112" />
        </g>
      );
    case 'reset':
      return (
        <g fill="none" stroke={fg} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M72 62 A26 26 0 1 0 77 88" />
          <path d="M76 44 L73 63 L54 60" />
        </g>
      );
    case 'peek':
      return (
        <g>
          <path d="M14 84 Q51.6 46 89 84 Q51.6 122 14 84 Z" fill={fg} />
          <circle cx="51.6" cy="84" r="17" fill={bg} />
          <circle cx="51.6" cy="84" r="8" fill="#000" />
          <circle cx="56" cy="79" r="3.5" fill="#fff" />
        </g>
      );
    default:
      return null;
  }
}

export default function ItemFace({ card }) {
  const t = THEME[card.item];
  return (
    <svg viewBox="0 0 103.2 168.2" className="card-img" role="img" aria-label={`아이템 ${card.name}`}>
      <rect width="103.2" height="168.2" rx="8" fill="#0e1428" />
      <rect x="4" y="4" width="95.2" height="160.2" rx="6" fill={t.bg} stroke="#ffd84d" strokeWidth="2.5" />
      <rect x="9" y="9" width="85.2" height="150.2" rx="4" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1" />
      <text x="51.6" y="26" fontSize="9" fontWeight="700" fill="#ffd84d" textAnchor="middle" letterSpacing="2">ITEM</text>
      <Icon item={card.item} fg={t.fg} bg={t.bg} />
      <rect x="14" y="132" width="75.2" height="22" rx="4" fill="rgba(0,0,0,0.38)" />
      <text x="51.6" y="148" fontSize="14" fontWeight="900" fill="#fff" textAnchor="middle">{card.name}</text>
    </svg>
  );
}
