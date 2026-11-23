// The patient's healing-heart avatar. `fill` (0–1) is how "healed" it looks,
// which grows as the day's plan is completed.

let uid = 0;
const HEART = 'M50 91 C 22 72, 5 54, 5 33 C 5 16, 17 6, 31 6 C 41 6, 47 12, 50 20 C 53 12, 59 6, 69 6 C 83 6, 95 16, 95 33 C 95 54, 78 72, 50 91 Z';

export function heartSVG(fill = 1) {
  const id = `heart-clip-${uid++}`;
  const f = Math.max(0, Math.min(1, fill));
  const top = 6 + (1 - f) * 85;
  const happy = f >= 0.5;
  const mouth = happy
    ? '<path d="M38 50 Q50 61 62 50" fill="none" stroke="#1f2a37" stroke-width="4.5" stroke-linecap="round"/>'
    : '<path d="M39 55 Q50 50 61 55" fill="none" stroke="#1f2a37" stroke-width="4.5" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 100" class="heart" role="img" aria-label="Avatar heart, ${Math.round(f * 100)}% healed">
    <defs><clipPath id="${id}"><rect x="0" y="${top.toFixed(1)}" width="100" height="100"/></clipPath></defs>
    <path d="${HEART}" fill="#fbd9d9"/>
    <path d="${HEART}" fill="#e5484d" clip-path="url(#${id})"/>
    <path d="${HEART}" fill="none" stroke="#1f2a37" stroke-width="5" stroke-linejoin="round"/>
    <circle cx="38" cy="37" r="4.5" fill="#1f2a37"/><circle cx="62" cy="37" r="4.5" fill="#1f2a37"/>
    ${mouth}
  </svg>`;
}

export function animateHeart(el, from, to, ms = 1200) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - (1 - k) ** 3;
    el.innerHTML = heartSVG(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
