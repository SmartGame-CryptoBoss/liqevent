/* Old case pages have analytics bootstrap but do not load the form-page script.
 * Use its existing data-track contract once; preserve native link navigation. */
(() => {
  'use strict';
  document.querySelectorAll('a[data-case-lead-cta][data-track="lead_cta_click"]').forEach((link) => {
    link.addEventListener('click', () => {
      const context = {
        link_url: link.href,
        link_text: link.textContent.trim(),
        cta_location: link.dataset.trackLocation
      };
      if (typeof window.gtag === 'function') window.gtag('event', 'lead_cta_click', context);
      else {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'lead_cta_click', ...context });
      }
      if (typeof window.fbq === 'function') window.fbq('trackCustom', 'lead_cta_click', context);
    });
  });
})();
