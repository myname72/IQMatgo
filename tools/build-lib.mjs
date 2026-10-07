import * as s1 from './scenes1.mjs';
import * as s2 from './scenes2.mjs';
import * as s3 from './scenes3.mjs';
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
export function buildAll() {
  const out = {};
  const fns = [s1.month1, s1.month2, s1.month3, s1.month4, s2.month5, s2.month6, s2.month7, s2.month8, s3.month9, s3.month10, s3.month11, s3.month12];
  fns.forEach((fn, i) => {
    for (const [part, svg] of Object.entries(fn())) out[`${MONTHS[i]}_${part}`] = svg;
  });
  return out;
}
