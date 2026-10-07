import { MONTHS, KIND_LABEL } from '../game/cards.js';

const RIBBON_COLOR = { hong: '#d62839', cheong: '#1d6fd1', cho: '#3c9a3c' };

// 월별 간단한 모티프 (꽃/잎 배치)
function Motif({ month, fill }) {
  const spots = [
    [28, 88], [50, 80], [72, 88], [38, 104], [62, 104],
  ];
  return (
    <g opacity="0.85">
      {spots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y + (month % 3) * 2} r={7 + (i % 2)} fill={fill} />
      ))}
    </g>
  );
}

export default function CardFace({ card, compact = false }) {
  const m = MONTHS[card.month - 1];
  const label = KIND_LABEL[card.kind];
  const ribbon = card.kind === 'ribbon';
  const ribbonColor = RIBBON_COLOR[card.ribbon] ?? '#c0392b';

  return (
    <svg
      viewBox="0 0 100 140"
      className="card-svg"
      role="img"
      aria-label={`${card.month}월 ${card.name} (${label})`}
    >
      <rect width="100" height="140" fill={m.color} />
      <rect x="4" y="4" width="92" height="132" fill="none" stroke="rgba(255,255,255,0.35)" rx="6" />
      <text x="12" y="22" fontSize="14" fontWeight="800" fill="#fff">{card.month}</text>
      <text x="88" y="22" fontSize="14" fontWeight="800" fill="#fff" textAnchor="end">{m.hanja}</text>

      {card.kind === 'gwang' && (
        <g>
          <circle cx="50" cy="52" r="22" fill="#ffd700" stroke="#fff3a6" strokeWidth="3" />
          <text x="50" y="60" fontSize="24" fontWeight="900" fill="#7a1f00" textAnchor="middle">光</text>
        </g>
      )}
      {card.kind === 'animal' && (
        <g>
          <ellipse cx="50" cy="52" rx="22" ry="16" fill="#fff" opacity="0.92" />
          <text x="50" y="60" fontSize="20" fontWeight="900" fill={m.color} textAnchor="middle">獸</text>
        </g>
      )}
      {ribbon && (
        <g>
          <rect x="16" y="40" width="68" height="26" rx="3" fill={ribbonColor} stroke="#fff" strokeWidth="2" />
          <text x="50" y="58" fontSize="13" fontWeight="800" fill="#fff" textAnchor="middle">
            {card.ribbon ? { hong: '紅', cheong: '靑', cho: '草' }[card.ribbon] : '띠'}
          </text>
        </g>
      )}
      {card.kind === 'ssangpi' && (
        <g>
          <circle cx="34" cy="52" r="15" fill="#fff" opacity="0.92" />
          <circle cx="66" cy="52" r="15" fill="#fff" opacity="0.92" />
          <text x="34" y="59" fontSize="18" fontWeight="900" fill={m.color} textAnchor="middle">2</text>
          <text x="66" y="59" fontSize="18" fontWeight="900" fill={m.color} textAnchor="middle">2</text>
        </g>
      )}
      {card.kind === 'pi' && <Motif month={card.month} fill="#fff" />}
      {card.kind !== 'pi' && <Motif month={card.month} fill="rgba(255,255,255,0.55)" />}

      {!compact && (
        <>
          <rect x="10" y="116" width="80" height="16" rx="3" fill="rgba(0,0,0,0.45)" />
          <text x="50" y="128" fontSize="10" fontWeight="700" fill="#fff" textAnchor="middle">
            {label}{card.godori ? ' · 고도리' : ''}
          </text>
        </>
      )}
    </svg>
  );
}
