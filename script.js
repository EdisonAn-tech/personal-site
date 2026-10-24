const sections = [...document.querySelectorAll('main section')];
const dockLinks = [...document.querySelectorAll('.dock a')];

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
