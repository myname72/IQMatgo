// 실제 맞고(고스톱) 48장 구성
// kind: gwang(광) | animal(열끗) | ribbon(띠) | pi(피) | ssangpi(쌍피)
// ribbon: hong(홍단) | cheong(청단) | cho(초단) | null(12월 비띠, 단 없음)

export const MONTHS = [
  { month: 1, name: '송학', hanja: '松', color: '#5b3a1e' },
  { month: 2, name: '매조', hanja: '梅', color: '#c8283c' },
  { month: 3, name: '벚꽃', hanja: '桜', color: '#e86aa8' },
  { month: 4, name: '흑싸리', hanja: '藤', color: '#2f4f4f' },
  { month: 5, name: '난초', hanja: '蘭', color: '#7a5bc7' },
  { month: 6, name: '모란', hanja: '牡', color: '#d81b78' },
  { month: 7, name: '홍싸리', hanja: '萩', color: '#b5302a' },
  { month: 8, name: '공산', hanja: '山', color: '#c9a227' },
  { month: 9, name: '국화', hanja: '菊', color: '#e0a800' },
  { month: 10, name: '단풍', hanja: '楓', color: '#e0561c' },
  { month: 11, name: '오동', hanja: '桐', color: '#4b2a8a' },
  { month: 12, name: '비', hanja: '雨', color: '#1f3b8f' },
];

const RIBBON_NAME = { hong: '홍단', cheong: '청단', cho: '초단' };

// [month, kind, ribbon | null, name]
const SPEC = [
  [1, 'gwang', null, '송학광'], [1, 'ribbon', 'hong', '송학띠'], [1, 'pi', null, '송학피'], [1, 'pi', null, '송학피'],
  [2, 'animal', null, '매조'], [2, 'ribbon', 'hong', '매조띠'], [2, 'pi', null, '매조피'], [2, 'pi', null, '매조피'],
  [3, 'gwang', null, '벚꽃광'], [3, 'ribbon', 'hong', '벚꽃띠'], [3, 'pi', null, '벚꽃피'], [3, 'pi', null, '벚꽃피'],
  [4, 'animal', null, '흑싸리새'], [4, 'ribbon', 'cho', '흑싸리띠'], [4, 'pi', null, '흑싸리피'], [4, 'pi', null, '흑싸리피'],
  [5, 'animal', null, '난초열끗'], [5, 'ribbon', 'cho', '난초띠'], [5, 'pi', null, '난초피'], [5, 'pi', null, '난초피'],
  [6, 'animal', null, '모란나비'], [6, 'ribbon', 'cheong', '모란띠'], [6, 'pi', null, '모란피'], [6, 'pi', null, '모란피'],
  [7, 'animal', null, '홍싸리멧돼지'], [7, 'ribbon', 'cho', '홍싸리띠'], [7, 'pi', null, '홍싸리피'], [7, 'pi', null, '홍싸리피'],
  [8, 'gwang', null, '공산광'], [8, 'animal', null, '공산기러기'], [8, 'pi', null, '공산피'], [8, 'pi', null, '공산피'],
  [9, 'animal', null, '국화술잔'], [9, 'ribbon', 'cheong', '국화띠'], [9, 'pi', null, '국화피'], [9, 'pi', null, '국화피'],
  [10, 'animal', null, '단풍사슴'], [10, 'ribbon', 'cheong', '단풍띠'], [10, 'pi', null, '단풍피'], [10, 'pi', null, '단풍피'],
  [11, 'gwang', null, '오동광'], [11, 'ssangpi', null, '오동쌍피'], [11, 'pi', null, '오동피'], [11, 'pi', null, '오동피'],
  [12, 'gwang', null, '비광'], [12, 'animal', null, '비제비'], [12, 'ribbon', null, '비띠'], [12, 'ssangpi', null, '비쌍피'],
];

const GODORI_MONTHS = [2, 4, 8]; // 매조, 흑싸리새, 기러기

export const HWATU_CARDS = SPEC.map(([month, kind, ribbon, name], i) => ({
  id: i + 1,
  month,
  kind,
  ribbon,
  name,
  godori: kind === 'animal' && GODORI_MONTHS.includes(month),
  piValue: kind === 'ssangpi' ? 2 : kind === 'pi' ? 1 : 0,
}));

export const KIND_LABEL = {
  gwang: '광',
  animal: '열끗',
  ribbon: '띠',
  pi: '피',
  ssangpi: '쌍피',
};

export const ribbonLabel = (ribbon) => RIBBON_NAME[ribbon] ?? '';

// Fisher-Yates
export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
