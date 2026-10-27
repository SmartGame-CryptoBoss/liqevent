'use strict';
(() => {
  const reviews = [{"id": "review-01", "date": "20.02.2026", "year": "2026", "reading": [960, 300], "mobile": [480, 444], "original": [1240, 224]}, {"id": "review-02", "date": "11.07.2024", "year": "2024", "reading": [960, 372], "mobile": [480, 480], "original": [1218, 280]}, {"id": "review-03", "date": "24.04.2023", "year": "2023", "reading": [960, 336], "mobile": [480, 444], "original": [1224, 220]}, {"id": "review-04", "date": "29.09.2023", "year": "2023", "reading": [960, 173], "mobile": [480, 245], "original": [1202, 138]}, {"id": "review-05", "date": "16.11.2023", "year": "2023", "reading": [960, 156], "mobile": [480, 192], "original": [920, 162]}, {"id": "review-06", "date": "14.05.2024", "year": "2024", "reading": [960, 84], "mobile": [480, 156], "original": [1032, 110]}];
  const dialog = document.getElementById('proof-dialog');
  const imageArea = document.getElementById('dialog-image-area');
  const toggle = document.getElementById('original-toggle');
  let active = 0;
  let original = false;
  let opener = null;
  const close = () => dialog.close();

  function showImage() {
    const review = reviews[active];
    document.getElementById('dialog-title').textContent = `Відгук ${active + 1} · ${review.date}`;
    document.getElementById('dialog-position').textContent = `${active + 1} / ${reviews.length}`;
    toggle.setAttribute('aria-pressed', String(original));
    toggle.textContent = original ? 'Для читання' : 'Повний скрін';
    imageArea.classList.toggle('is-original', original);
    const image = document.createElement('img');
    image.alt = `Telegram-відгук клієнта після події, ${review.year}`;
    image.decoding = 'async';
    if (original) {
      image.src = `/assets/img/testimonials/${review.id}-original-names.webp`;
      [image.width, image.height] = review.original;
      imageArea.replaceChildren(image);
    } else {
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.media = '(max-width: 720px)';
      source.srcset = `/assets/img/testimonials/${review.id}-mobile-names.webp`;
      source.width = review.mobile[0];
      source.height = review.mobile[1];
      image.src = `/assets/img/testimonials/${review.id}-reading-names.webp`;
      [image.width, image.height] = review.reading;
      picture.append(source, image);
      imageArea.replaceChildren(picture);
    }
    document.getElementById('dialog-hint').textContent = original
      ? 'Початкове компонування. На вузькому екрані скрін можна прокручувати вбік.'
      : 'Дата та текст повідомлення збережені.';
    imageArea.scrollLeft = 0;
  }

  document.querySelectorAll('#client-proof [data-open]').forEach(button => {
    button.addEventListener('click', () => {
      active = reviews.findIndex(review => review.id === button.dataset.open);
      original = false;
      opener = button;
      showImage();
      dialog.showModal();
      dialog.querySelector('.dialog-close').focus();
    });
  });
  dialog.querySelector('.dialog-close').addEventListener('click', close);
  toggle.addEventListener('click', () => { original = !original; showImage(); });
  function move(delta) { active = (active + delta + reviews.length) % reviews.length; showImage(); }
  document.getElementById('previous-review').addEventListener('click', () => move(-1));
  document.getElementById('next-review').addEventListener('click', () => move(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.querySelectorAll('button:not([disabled])'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
  });
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  dialog.addEventListener('close', () => opener?.focus({preventScroll:true}));

})();
