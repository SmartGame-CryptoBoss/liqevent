(() => {
  'use strict';

  const config = window.LIQEVENT_CONFIG || {};
  const header = document.querySelector('.site-header');
  const menuBtn = document.querySelector('.menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');

  const trackEvent = (name, params = {}) => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    } else {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: name, ...params });
    }
    if (typeof window.fbq === 'function') window.fbq('trackCustom', name, params);
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

  const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

  const buildLeadPayload = (formData) => {
    const contact = String(formData.get('phone_or_telegram') || '').trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    const isTelegram = /^@[a-zA-Z0-9_]{5,}$/.test(contact)
      || /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\//i.test(contact);

    return {
      name: String(formData.get('client_name') || '').trim(),
      phone: !isEmail && !isTelegram ? contact : '',
      telegram: isTelegram ? contact : '',
      email: isEmail ? contact : '',
      company: String(formData.get('company') || '').trim(),
      eventType: String(formData.get('event_type') || '').trim(),
      guests: String(formData.get('guest_count') || '').trim(),
      date: String(formData.get('event_date') || '').trim(),
      budget: String(formData.get('budget') || '').trim(),
      message: String(formData.get('event_details') || '').trim()
    };
  };

  const postLeadJson = async (endpoint, payload) => {
    if (!isHttpUrl(endpoint)) throw new Error('Lead endpoint is not configured');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      keepalive: true
    });

    if (!response.ok) throw new Error(`Lead endpoint returned ${response.status}`);

    const result = await response.json().catch(() => null);
    if (result && (result.ok === false || result.success === false)) {
      throw new Error('Lead endpoint rejected the submission');
    }

    return result;
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

    const endpoint = String(config.leadEndpoint || '').trim();
    const fallbackEndpoint = String(config.leadFallbackEndpoint || leadForm.action || '').trim();
    if (!isHttpUrl(endpoint) && !isHttpUrl(fallbackEndpoint)) {
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

    try {
      const payload = buildLeadPayload(formData);
      let deliveryChannel = 'worker';

      try {
        await postLeadJson(endpoint, payload);
      } catch {
        deliveryChannel = 'formspree';
        await postLeadJson(fallbackEndpoint, payload);
      }

      leadForm.reset();
      leadForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
      leadForm.classList.add('is-sent');
      setStatus('Дякуємо! Заявку отримано. Ми зв’яжемося з вами найближчим часом.', 'success');
      const eventType = payload.eventType;
      trackEvent('generate_lead', {
        form_id: 'lead-form',
        event_type: eventType,
        delivery_channel: deliveryChannel
      });
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
