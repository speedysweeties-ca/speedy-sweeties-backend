/* The public page does not require the Webflow editor runtime. */
document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('.w-nav-button');
  const menu = document.getElementById('main-navigation');
  if (button && menu) {
    const setOpen = (open) => {
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.classList.toggle('is-open', open);
    };
    button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (event) => { if (event.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        button.focus();
      }
    });
    window.matchMedia('(min-width: 992px)').addEventListener('change', () => setOpen(false));
  }
  const notice = document.getElementById('preview-notice');
  if (notice) notice.hidden = window.speedySite?.live === true;
});
