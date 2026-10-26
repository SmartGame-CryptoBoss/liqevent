(() => {
  const root = document.getElementById('conference-proof');
  const dialog = document.getElementById('conference-proof-dialog');
  if (!root || !dialog || typeof dialog.showModal !== 'function') return;

  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('figcaption');
  const closeButton = dialog.querySelector('.proof-dialog-close');
  let opener = null;

  root.querySelectorAll('[data-proof-src]').forEach(button => {
    button.addEventListener('click', () => {
      opener = button;
      image.src = button.dataset.proofSrc;
      image.alt = button.dataset.caption;
      caption.textContent = button.dataset.caption;
      dialog.showModal();
      closeButton.focus();
    });
  });
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    if (opener) opener.focus();
  });
})();
