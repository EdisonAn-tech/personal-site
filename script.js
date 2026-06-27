// Smooth-scroll is handled by CSS scroll-behavior.
// This script compensates for the sticky nav offset on anchor clicks
// and highlights the nav link for the section currently in view.

// ── Smooth-scroll with sticky-nav offset ──
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', `#${id}`);
  });
});

// ── Active-section highlighting ──
const navLinks = document.querySelectorAll('header nav ul a[href^="#"]');
const linkFor = id => document.querySelector(`header nav ul a[href="#${id}"]`);

// Only observe sections that have a corresponding nav link.
const observed = [...navLinks]
  .map(a => document.getElementById(a.getAttribute('href').slice(1)))
  .filter(Boolean);

const setActive = id => {
  navLinks.forEach(a => a.classList.remove('is-active'));
  const active = linkFor(id);
  if (active) active.classList.add('is-active');
};

const observer = new IntersectionObserver(entries => {
  // Pick the entry nearest the top of the viewport among those intersecting.
  const visible = entries
    .filter(e => e.isIntersecting)
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

  if (visible.length) setActive(visible[0].target.id);
}, {
  // Offset the top by the nav height so the active state flips as a
  // section clears the sticky bar; trigger near the upper third.
  rootMargin: '-56px 0px -65% 0px',
  threshold: 0
});

observed.forEach(section => observer.observe(section));
