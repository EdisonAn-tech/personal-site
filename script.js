const root = document.documentElement;
const sections = [...document.querySelectorAll('main section')];
const dockLinks = [...document.querySelectorAll('.dock a')];
const topbar = document.querySelector('.topbar');
const hero = document.getElementById('home');

const setActive = id => {
  dockLinks.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
};

const activeObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) setActive(e.target.id);
  });
}, { rootMargin: '-45% 0px -45% 0px' });

sections.forEach(s => activeObserver.observe(s));

const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

new IntersectionObserver(([e]) => {
  topbar.classList.toggle('is-shown', !e.isIntersecting);
}, { threshold: 0.35 }).observe(hero);

let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    root.style.setProperty('--sy', window.scrollY);
    ticking = false;
  });
}, { passive: true });
