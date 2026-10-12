(() => {
  'use strict';

  const config = window.LIQEVENT_CONFIG || {};
  const contract = window.LIQEVENT_LEAD_CONTRACT;
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

  const pushDataLayerEvent = (name, params = {}) => {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: name, ...params });
  };

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
    element.addEventListener('click', () => {
      const context = {
        // Do not forward arbitrary incoming query strings to analytics.
        link_url: element.href ? element.href.split('?')[0].split('#')[0] : '',
        link_text: element.textContent.trim(),
        cta_location: element.dataset.trackLocation || undefined
      };
      trackEvent(element.dataset.track, context);
      // Preserve the historical pricing event while including this route in the CTA total.
      if (element.dataset.leadCta === 'true' && element.dataset.track !== 'lead_cta_click') {
        trackEvent('lead_cta_click', context);
      }
      if (['#lead-form', '#form-panel'].includes(element.getAttribute('href'))) loadTurnstile();
    });
  });

  const leadForm = document.querySelector('#lead-form');
  const contactSection = document.querySelector('#contact');
  const formStatus = document.querySelector('#form-status');
  const turnstileContainer = document.querySelector('#turnstile-widget');
  const turnstileStatus = document.querySelector('#turnstile-status');
  let formStarted = false;
  let formViewed = false;
  let isSubmitting = false;
  let turnstileWidgetId = null;
  let turnstileToken = '';

  const trackFormEvent = (name, params = {}) => trackEvent(name, {
    form_id: 'lead-form',
    funnel_version: 'v2_20261012',
    test_id: leadForm?.dataset.testId,
    variant: leadForm?.dataset.variant,
    ...params
  });

  const markViewed = method => {
    if (formViewed) return;
    formViewed = true;
    trackFormEvent('form_view', { view_method: method });
  };
  const hasEnteredValues = () => ['client_name', 'phone_or_telegram', 'event_type', 'company', 'guest_count', 'event_date', 'budget', 'event_details']
    .some(name => String(leadForm?.elements.namedItem(name)?.value || '').trim());
  const markStarted = method => {
    if (formStarted || !hasEnteredValues()) return;
    // Interaction with a form is also evidence it was viewed. Both arms share
    // this definition; historical P1 form_view is not directly comparable.
    markViewed('interaction');
    formStarted = true;
    trackFormEvent('form_start', { start_method: method });
  };

  // Observe the same compact introduction in both arms, not the new long block.
  const formIntro = document.querySelector('#form-intro');
  if (formIntro && 'IntersectionObserver' in window) {
    const formObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) return;
      markViewed('visible_intro');
      formObserver.disconnect();
    }, { threshold: [0.5] });
    formObserver.observe(formIntro);
  }

  if (contactSection) {
    if ('IntersectionObserver' in window) {
      const contactObserver = new IntersectionObserver((entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.3);
        if (!isVisible) return;
        trackEvent('contact_view', { section_id: 'contact' });
        contactObserver.disconnect();
      }, { threshold: [0.3] });
      contactObserver.observe(contactSection);
    } else {
      trackEvent('contact_view', { section_id: 'contact' });
    }
  }

  const setStatus = (message, type = '', scope = 'form') => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = `form-status ${type}`.trim();
    formStatus.dataset.scope = scope;
  };

  const setTurnstileStatus = message => {
    if (turnstileStatus) turnstileStatus.textContent = message;
  };
  const clearFieldError = field => {
    field?.removeAttribute('aria-invalid');
    const error = document.querySelector('#error-' + field?.name);
    if (error) error.textContent = '';
  };
  const showFieldError = result => {
    const field = leadForm?.elements.namedItem(result.field);
    if (field) {
      const optional = field.closest('details');
      if (optional) optional.open = true;
      field.setAttribute('aria-invalid', 'true');
      const error = document.querySelector('#error-' + result.field);
      if (error) error.textContent = result.message;
      field.focus();
    }
    setStatus(result.message || 'Перевірте позначене поле.', 'error', 'validation');
  };

  const buildLeadPayload = (formData) => {
    const contact = contract?.parseContact(formData.get('phone_or_telegram'));
    return {
      name: String(formData.get('client_name') || '').trim(),
      phone: contact?.type === 'phone' ? contact.value : '',
      telegram: contact?.type === 'telegram' ? contact.value : '',
      email: contact?.type === 'email' ? contact.value : '',
      company: String(formData.get('company') || '').trim(),
      eventType: String(formData.get('event_type') || '').trim(),
      guests: String(formData.get('guest_count') || '').trim(),
      date: String(formData.get('event_date') || '').trim(),
      budget: String(formData.get('budget') || '').trim(),
      message: String(formData.get('event_details') || '').trim(),
      privacyConsent: formData.get('privacy_consent') === 'Погоджено',
      website: String(formData.get('_gotcha') || '').trim(),
      turnstileToken,
      test_id: leadForm?.dataset.testId,
      variant: leadForm?.dataset.variant
    };
  };

  const validateForm = payload => {
    if (!leadForm || !contract) return false;
    leadForm.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
    // type=number can expose an empty value for incomplete numeric input.
    const guests = leadForm.elements.namedItem('guest_count');
    const result = guests?.validity.badInput
      ? { ok: false, code: 'invalid_guests', field: 'guest_count', message: 'Вкажіть цілу кількість гостей або залиште поле порожнім.' }
      : contract.validateLead(payload);
    if (!result.ok) {
      showFieldError(result);
      trackFormEvent('form_validation_error', { field: result.field, error_code: result.code });
      return false;
    }
    return true;
  };

  const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

  const createLeadRef = () => {
    if (typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
    if (typeof window.crypto?.getRandomValues !== 'function') return '';
    const bytes = window.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
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

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(result?.error || `Lead endpoint returned ${response.status}`);
      error.status = response.status;
      error.code = result?.code || '';
      throw error;
    }
    if (result?.ok !== true || !['telegram', 'formspree'].includes(result.channel)) {
      const error = new Error('Lead endpoint did not confirm delivery');
      error.code = 'delivery_unconfirmed';
      error.status = response.status;
      throw error;
    }
    if (!contract.validateAttribution(result).ok || result.lead_ref !== payload.lead_ref
      || result.test_id !== payload.test_id || result.variant !== payload.variant) {
      const error = new Error('Lead attribution was not confirmed');
      error.code = 'attribution_unconfirmed';
      error.status = response.status;
      throw error;
    }

    return result;
  };

  const resetTurnstile = () => {
    turnstileToken = '';
    if (turnstileWidgetId !== null && typeof window.turnstile?.reset === 'function') {
      window.turnstile.reset(turnstileWidgetId);
    }
  };

  const renderTurnstile = () => {
    const sitekey = String(config.turnstileSiteKey || '').trim();
    if (!turnstileContainer || !sitekey || sitekey === 'LIQEVENT_TURNSTILE_SITEKEY') {
      setTurnstileStatus('Антиспам-захист тимчасово недоступний. Зв’яжіться з нами напряму.');
      return;
    }
    if (typeof window.turnstile?.render !== 'function') {
      window.setTimeout(renderTurnstile, 120);
      return;
    }
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey,
      action: 'lead_form',
      theme: 'light',
      // Flexible has a 300px minimum. Compact fits narrow form interiors.
      size: turnstileContainer.clientWidth < 300 ? 'compact' : 'flexible',
      callback: (token) => {
        turnstileToken = token;
        setTurnstileStatus('');
        if (formStatus?.dataset.scope === 'turnstile') setStatus('');
      },
      'expired-callback': () => {
        turnstileToken = '';
        setTurnstileStatus('Антиспам-перевірка завершилася. Підтвердьте її ще раз.');
      },
      'error-callback': () => {
        turnstileToken = '';
        setTurnstileStatus('Не вдалося виконати антиспам-перевірку. Спробуйте перевірку ще раз або зв’яжіться з нами напряму.');
      }
    });
  };

  // Start anti-spam verification when the form is near or a visitor requests it.
  // The token is still mandatory in the browser and independently verified by the Worker.
  let turnstileLoading = false;
  const loadTurnstile = () => {
    if (typeof window.turnstile?.render === 'function') {
      renderTurnstile();
      return;
    }
    if (turnstileLoading) return;
    turnstileLoading = true;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = renderTurnstile;
    script.onerror = () => {
      turnstileLoading = false;
      script.remove();
      setTurnstileStatus('Не вдалося виконати антиспам-перевірку. Спробуйте перевірку ще раз або зв’яжіться з нами напряму.');
    };
    document.head.appendChild(script);
  };

  document.querySelector('#turnstile-retry')?.addEventListener('click', () => {
    if (isSubmitting) return;
    setTurnstileStatus('');
    if (turnstileWidgetId !== null) resetTurnstile();
    else loadTurnstile();
  });

  if (leadForm && 'IntersectionObserver' in window) {
    const verificationObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      loadTurnstile();
      verificationObserver.disconnect();
    }, { rootMargin: '600px 0px', threshold: 0 });
    verificationObserver.observe(leadForm);
  } else {
    loadTurnstile();
  }

  const onEdit = event => {
    markStarted(event.type);
    clearFieldError(event.target);
    if (formStatus?.dataset.scope === 'validation' && !leadForm.querySelector('[aria-invalid="true"]')) setStatus('');
  };
  leadForm?.addEventListener('input', onEdit);
  leadForm?.addEventListener('change', onEdit);
  window.addEventListener('pageshow', () => window.setTimeout(() => markStarted('autofill'), 250));
  window.setTimeout(() => markStarted('autofill'), 1000);

  leadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    markStarted('submit_fallback');
    trackFormEvent('form_submit_attempt');
    setStatus('');
    if (!contract) {
      setStatus('Форма тимчасово недоступна. Оновіть сторінку або зв’яжіться з нами напряму.', 'error', 'delivery');
      trackFormEvent('form_submit_error', { error_code: 'form_contract_missing', response_status: 0 });
      return;
    }
    const formData = new FormData(leadForm);
    const payload = buildLeadPayload(formData);
    if (!validateForm(payload)) return;

    if (!turnstileToken) {
      setStatus('Підтвердьте антиспам-перевірку перед надсиланням.', 'error', 'turnstile');
      turnstileContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      trackFormEvent('form_validation_error', { field: 'turnstile' });
      return;
    }

    if (formData.get('_gotcha')) {
      resetTurnstile();
      return;
    }

    const endpoint = String(config.leadEndpoint || '').trim();
    if (!isHttpUrl(endpoint)) {
      setStatus('Не вдалося надіслати заявку. Спробуйте ще раз або зв’яжіться з нами напряму.', 'error');
      trackEvent('form_config_missing');
      trackFormEvent('form_submit_error', { error_code: 'form_config_missing', response_status: 0 });
      return;
    }

    const submitButton = leadForm.querySelector('button[type="submit"]');
    const buttonLabel = submitButton?.querySelector('.button-label');
    const originalLabel = buttonLabel?.textContent || 'Надіслати заявку';
    isSubmitting = true;
    submitButton?.setAttribute('disabled', '');
    if (buttonLabel) buttonLabel.textContent = 'Надсилаємо…';

    try {
      payload.lead_ref = createLeadRef();
      if (!contract.validateAttribution(payload).ok) {
        const error = new Error('Invalid test assignment');
        error.code = 'invalid_attribution';
        throw error;
      }
      const result = await postLeadJson(endpoint, payload);
      const deliveryChannel = result?.channel === 'formspree' ? 'formspree' : 'telegram';

      leadForm.reset();
      resetTurnstile();
      leadForm.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
      leadForm.classList.add('is-sent');
      setStatus('Дякуємо! Заявку отримано. Ми зв’яжемося з вами найближчим часом.', 'success');
      const eventType = payload.eventType;
      const conversionContext = {
        form_id: 'lead-form',
        funnel_version: 'v2_20261012',
        event_type: eventType,
        delivery_channel: deliveryChannel,
        test_id: payload.test_id,
        variant: payload.variant,
        lead_ref: result.lead_ref
      };
      trackEvent('generate_lead', conversionContext);
      pushDataLayerEvent('lead_success', conversionContext);
      if (typeof window.fbq === 'function') window.fbq('track', 'Lead');
      formStarted = false;
    } catch (error) {
      resetTurnstile();
      const validationErrors = {
        invalid_name: ['client_name', 'Вкажіть ім’я: від 2 до 80 символів.'],
        invalid_contact: ['phone_or_telegram', 'Перевірте телефон, Telegram або email.'],
        invalid_event_type: ['event_type', 'Оберіть формат події.'],
        consent_required: ['privacy_consent', 'Підтвердьте згоду на відповідь на запит.'],
        invalid_guests: ['guest_count', 'Вкажіть цілу кількість гостей від 1 до 50 000.'],
        invalid_date: ['event_date', 'Вкажіть коректну дату.'],
        invalid_company: ['company', 'Скоротіть назву компанії до 120 символів.'],
        invalid_budget: ['budget', 'Скоротіть бюджет до 80 символів.'],
        invalid_message: ['event_details', 'Скоротіть коментар до 1500 символів.']
      };
      if (validationErrors[error.code]) {
        const [field, message] = validationErrors[error.code];
        showFieldError({ field, message });
      } else {
        const message = /rate_limited/.test(error.code || '')
          ? 'Забагато спроб. Зачекайте хвилину або зв’яжіться з нами напряму.'
          : 'Не вдалося підтвердити доставку заявки. Спробуйте ще раз або зв’яжіться з нами напряму.';
        setStatus(message, 'error', 'delivery');
      }
      trackFormEvent('form_submit_error', {
        error_code: String(error.code || 'submission_failed'),
        response_status: Number(error.status || 0)
      });
    } finally {
      isSubmitting = false;
      submitButton?.removeAttribute('disabled');
      if (buttonLabel) buttonLabel.textContent = originalLabel;
    }
  });
})();
