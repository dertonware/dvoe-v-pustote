// Набор иконок: мягкие, толстые, со скруглениями
const P = {
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.2-4 4-5.5 7.5-5.5s6.3 1.5 7.5 5.5"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M5.5 18.5l2.1-2.1M16.4 7.6l2.1-2.1"/>',
  pad: '<rect x="2.8" y="7" width="18.4" height="10.5" rx="5"/><path d="M7.5 10.2v4M5.5 12.2h4"/><circle cx="15.5" cy="11" r=".9" fill="currentColor"/><circle cx="17.6" cy="13.4" r=".9" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  back: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  rocket: '<path d="M12 2.8c3.5 2.6 5 6.3 4.5 11l-2 2.6h-5l-2-2.6c-.5-4.7 1-8.4 4.5-11z"/><circle cx="12" cy="9.5" r="1.8"/><path d="M9.5 17.5L8 21M14.5 17.5L16 21M12 17.5V21"/>',
  mouse: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3.5"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  flip: '<path d="M12 3v18M7 7l-3 5 3 5M17 7l3 5-3 5"/>',
  spark: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  shake: '<rect x="7" y="5" width="10" height="14" rx="3"/><path d="M3.5 9v6M20.5 9v6"/>',
  ship: '<path d="M12 2.8c2.8 2.5 4 6 4 9.8l3.5 3.2v2.7L16 17l-1 2.5H9L8 17l-3.5 1.5v-2.7L8 12.6c0-3.8 1.2-7.3 4-9.8z"/><circle cx="12" cy="10" r="1.6"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
  station: '<circle cx="12" cy="12" r="3.2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v5.8M12 15.2V21"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4L12 9l2.5-5M12 9v11"/>',
  map: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  gun: '<path d="M3 10h13l2-2h3v5h-4l-2 2H9l-1 4.5H4.5L5.5 14H3z"/>',
  rate: '<path d="M13 2.8L5 13.5h6l-1 7.7 8-10.7h-6z"/>',
  hull: '<rect x="3.5" y="5" width="17" height="14" rx="4"/><path d="M3.5 12h17M12 5v14"/>',
  engine: '<path d="M4 8h9l4 4-4 4H4z"/><path d="M17 12h3.5M19 8.5l2 1.5M19 15.5l2-1.5"/>',
  magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"/><path d="M6 7.5h4M14 7.5h4"/>',
  fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.8 3-5.5 3.5-9.3 2.4 1.4 3.5 3.5 3.5 5.5 1-.5 1.8-1.7 2-3 2.2 1.8 4 4.2 4 6.8 0 3.6-2.5 6.2-6.5 6.2z"/>',
  wrench: '<path d="M14.5 4a5 5 0 0 0-4.6 6.8L3.5 17.2a2 2 0 0 0 2.8 2.8l6.4-6.4A5 5 0 0 0 19.5 9l-3 1.2-2-2L15.7 5.2A5 5 0 0 0 14.5 4z"/>',
  med: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>',
  skull: '<path d="M12 3c-4.7 0-8 3.2-8 7.5 0 2.6 1.3 4.4 3 5.4V19h10v-3.1c1.7-1 3-2.8 3-5.4C20 6.2 16.7 3 12 3z"/><circle cx="9" cy="11" r="1.8"/><circle cx="15" cy="11" r="1.8"/><path d="M10.5 19v-2M13.5 19v-2"/>',
  nest: '<circle cx="12" cy="12" r="7.5"/><circle cx="9.5" cy="10" r="1.6"/><circle cx="14.5" cy="9.5" r="1.1"/><circle cx="13.5" cy="14.5" r="1.9"/>',
  boss: '<path d="M4 9c0-4 3.6-6.5 8-6.5S20 5 20 9c0 3-1.6 4.6-3 5.4V21l-2.3-2-2.7 2-2.7-2L7 21v-6.6C5.6 13.6 4 12 4 9z"/><circle cx="9" cy="9" r="1.7"/><circle cx="15" cy="9" r="1.7"/><circle cx="12" cy="12.6" r="1.2"/>',
  clear: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/>',
  defend: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
};
export function icon(name, color) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.spark}</svg>`;
}
export function fillIcons(root = document) {
  root.querySelectorAll('[data-i]').forEach(el => { if (!el.dataset.done) { el.innerHTML = icon(el.dataset.i); el.dataset.done = 1; } });
}
