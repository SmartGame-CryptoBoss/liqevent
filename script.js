(() => {
  'use strict';

  const config = window.LIQEVENT_CONFIG || {};
  const header = document.querySelector('.site-header');
  const menuBtn = document.querySelector('.menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');

  const trackEvent = (name, params = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
    if (typeof window.gtag === 'function') window.gtag('event', name, params);
    if (typeof window.fbq === 'function') window.fbq('trackCustom', name, params);
  };

  const initGA4 = () => {
    const id = String(config.ga4MeasurementId || '').trim();
    if (!/^G-[A-Z0-9]+$/i.test(id)) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.append(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  };

  const initMetaPixel = () => {
    const id = String(config.metaPixelId || '').trim();
    if (!/^\d{5,}$/.test(id)) return;
    const fbq = function(){ fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    window.fbq = fbq;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.append(script);
    fbq('init', id);
    fbq('track', 'PageView');
  };

  initGA4();
  initMetaPixel();

  window.addEventListener('scroll', () => {
    header?.classList.toggle('scrolled', window.scrollY > 35);
  }, { passive: true });

  const closeMenu = () => {
    menuBtn?.classList.remove('active');
    menuBtn?.setAttribute('aria-expanded', 'false');
    menuBtn?.setAttribute('aria-label', 'Відкрити меню');
    mobileMenu?.classList.remove('open');
    mobileMenu?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-open');
  };

  menuBtn?.addEventListener('click', () => {
    const open = menuBtn.classList.toggle('active');
    mobileMenu?.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Закрити меню' : 'Відкрити меню');
    mobileMenu?.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('menu-open', open);
  });
  mobileMenu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px' });
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
  } else {
    document.querySelectorAll('.reveal').forEach((element) => element.classList.add('in'));
  }

  document.querySelectorAll('[data-config-link]').forEach((link) => {
    const url = String(config[link.dataset.configLink] || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    link.href = url;
    link.hidden = false;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });

  document.querySelectorAll('[data-track]').forEach((element) => {
    element.addEventListener('click', () => trackEvent(element.dataset.track, {
      link_url: element.href || '',
      link_text: element.textContent.trim()
    }));
  });

  const leadForm = document.querySelector('#lead-form');
  const formStatus = document.querySelector('#form-status');
  let formStarted = false;
  let isSubmitting = false;

  const setStatus = (message, type = '') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = `form-status ${type}`.trim();
  };

  const collectAttribution = () => {
    const query = new URLSearchParams(window.location.search);
    return {
      utm_source: query.get('utm_source') || '',
      utm_medium: query.get('utm_medium') || '',
      utm_campaign: query.get('utm_campaign') || '',
      utm_content: query.get('utm_content') || '',
      utm_term: query.get('utm_term') || '',
      page_url: window.location.href,
      referrer: document.referrer || ''
    };
  };

  const validateForm = () => {
    if (!leadForm) return false;
    let firstInvalid = null;
    leadForm.querySelectorAll('[required]').forEach((field) => {
      const invalid = !field.checkValidity();
      field.setAttribute('aria-invalid', String(invalid));
      if (invalid && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      firstInvalid.focus();
      setStatus('Будь ласка, заповніть обов’язкові поля.', 'error');
      trackEvent('form_validation_error');
      return false;
    }
    return true;
  };

  leadForm?.addEventListener('input', (event) => {
    if (!formStarted) {
      formStarted = true;
      trackEvent('form_start', { form_id: 'lead-form' });
    }
    if (event.target.matches('[aria-invalid="true"]')) event.target.setAttribute('aria-invalid', 'false');
  }, { once: false });

  leadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    setStatus('');
    if (!validateForm()) return;

    const formData = new FormData(leadForm);
    if (formData.get('_gotcha')) return;

    const endpoint = String(config.leadEndpoint || leadForm.action || '').trim();
    if (!/^https?:\/\//i.test(endpoint)) {
      setStatus('Не вдалося надіслати заявку. Спробуйте ще раз або зв’яжіться з нами напряму.', 'error');
      trackEvent('form_config_missing');
      return;
    }

    const submitButton = leadForm.querySelector('button[type="submit"]');
    const buttonLabel = submitButton?.querySelector('.button-label');
    const originalLabel = buttonLabel?.textContent || 'Надіслати заявку';
    isSubmitting = true;
    submitButton?.setAttribute('disabled', '');
    if (buttonLabel) buttonLabel.textContent = 'Надсилаємо…';

    Object.entries(collectAttribution()).forEach(([key, value]) => formData.set(key, value));
    formData.set('submitted_at', new Date().toISOString());
    formData.set('source', 'liqevent.com');

    try {
      const noCors = config.leadRequestMode === 'no-cors';
      const response = await fetch(endpoint, {
        method: 'POST',
        mode: noCors ? 'no-cors' : 'cors',
        headers: noCors ? undefined : { Accept: 'application/json' },
        body: noCors ? new URLSearchParams(Object.fromEntries(formData.entries())) : formData,
        keepalive: true
      });
      if (!noCors && !response.ok) throw new Error(`HTTP ${response.status}`);

      leadForm.reset();
      leadForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
      leadForm.classList.add('is-sent');
      setStatus('Дякуємо! Заявку отримано. Ми зв’яжемося з вами найближчим часом.', 'success');
      const eventType = String(formData.get('event_type') || '');
      trackEvent('generate_lead', { form_id: 'lead-form', event_type: eventType });
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead', { content_name: eventType || 'Event request' });
      formStarted = false;
    } catch (error) {
      setStatus('Не вдалося надіслати заявку. Спробуйте ще раз або зв’яжіться з нами напряму.', 'error');
      trackEvent('form_submit_error', { message: String(error.message || error) });
    } finally {
      isSubmitting = false;
      submitButton?.removeAttribute('disabled');
      if (buttonLabel) buttonLabel.textContent = originalLabel;
    }
  });
})();
