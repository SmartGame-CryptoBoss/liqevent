'use strict';
(() => {
  const root = document.querySelector('.landing-client-proof');
  const opener = root?.querySelector('[data-review-open]');
  const dialog = root?.querySelector('.landing-review-dialog');
  if (!opener || !dialog || typeof dialog.showModal !== 'function') return;
  const close = dialog.querySelector('.landing-review-close');
  const toggle = dialog.querySelector('.landing-review-toggle');
  const imageArea = dialog.querySelector('.landing-review-dialog-image');
  let original = false;

  function render() {
    imageArea.classList.toggle('is-original', original);
    toggle.textContent = original ? 'Для читання' : 'Повний скрін';
    toggle.setAttribute('aria-pressed', String(original));
    if (original) {
      const image = document.createElement('img');
      image.src = opener.href;
      image.alt = opener.querySelector('img').alt;
      image.width = Number(opener.dataset.originalWidth);
      image.height = Number(opener.dataset.originalHeight);
      image.decoding = 'async';
      imageArea.replaceChildren(image);
    } else {
      const picture = opener.querySelector('picture').cloneNode(true);
      picture.querySelector('img').loading = 'eager';
      imageArea.replaceChildren(picture);
    }
    imageArea.scrollLeft = 0;
  }

  opener.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    original = false;
    render();
    dialog.showModal();
    close.focus();
  });
  close.addEventListener('click', () => dialog.close());
  toggle.addEventListener('click', () => { original = !original; render(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === close) {
      event.preventDefault(); toggle.focus();
    } else if (!event.shiftKey && document.activeElement === toggle) {
      event.preventDefault(); close.focus();
    }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    imageArea.replaceChildren();
    opener.focus({preventScroll: true});
  });
})();

