const root = document.documentElement;
const topbar = document.querySelector('.topbar');
const intro = document.getElementById('home');

new IntersectionObserver(([e]) => {
  topbar.classList.toggle('is-shown', !e.isIntersecting);
}, { threshold: 0.25 }).observe(intro);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const target = { x: innerWidth * 0.3, y: innerHeight * 0.22 };
const lamp = { ...target };
let running = false;

const paint = () => {
  root.style.setProperty('--lx', `${lamp.x}px`);
  root.style.setProperty('--ly', `${lamp.y}px`);
};

const step = () => {
  lamp.x += (target.x - lamp.x) * 0.08;
  lamp.y += (target.y - lamp.y) * 0.08;
  paint();
  if (Math.abs(target.x - lamp.x) + Math.abs(target.y - lamp.y) > 0.5) {
    requestAnimationFrame(step);
  } else {
    running = false;
  }
};

const moveTo = (x, y) => {
  target.x = x;
  target.y = y;
  if (reduceMotion) {
    Object.assign(lamp, target);
    paint();
  } else if (!running) {
    running = true;
    requestAnimationFrame(step);
  }
};

window.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') moveTo(e.clientX, e.clientY);
}, { passive: true });

const onTouch = e => {
  const t = e.touches[0];
  if (t) moveTo(t.clientX, t.clientY);
};
window.addEventListener('touchstart', onTouch, { passive: true });
window.addEventListener('touchmove', onTouch, { passive: true });

paint();
