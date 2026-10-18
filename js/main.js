// Close the mobile menu after a link in it is tapped
const navMenu = document.getElementById('navbarNav');
navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        if (navMenu.classList.contains('show')) {
            bootstrap.Collapse.getOrCreateInstance(navMenu).hide();
        }
    });
});

// Shadow under the sticky navbar once the page is scrolled
const navbar = document.getElementById('navbar');
const updateNavShadow = () => navbar.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', updateNavShadow, { passive: true });
updateNavShadow();

// Fade sections in as they scroll into view
const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });
    revealItems.forEach((el) => observer.observe(el));
} else {
    revealItems.forEach((el) => el.classList.add('is-visible'));
}

document.getElementById('year').textContent = new Date().getFullYear();
