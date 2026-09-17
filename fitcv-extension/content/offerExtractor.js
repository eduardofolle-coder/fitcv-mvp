/**
 * Extrae ofertas de portales bloqueados (LinkedIn, Laborum, etc.)
 * Se inyecta directamente en la página.
 */

globalThis.FitcvOfferExtractor = {
  extractLinkedInOffers() {
    const offers = [];
    document.querySelectorAll('[data-job-id]').forEach(el => {
      const id = el.getAttribute('data-job-id');
      const titleEl = el.querySelector('h3, [class*="title"]');
      const companyEl = el.querySelector('[class*="company"], a[data-tracking-control-name*="company"]');
      if (id && titleEl) {
        offers.push({
          url: `https://www.linkedin.com/jobs/view/${id}/`,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || 'Empresa no informada',
          description: el.innerText.slice(0, 5000),
        });
      }
    });
    return offers;
  },

  extractLaborumOffers() {
    const offers = [];
    document.querySelectorAll('a[href*="/trabajo/"]').forEach(link => {
      const url = link.href;
      const titleEl = link.querySelector('h2, h3, strong');
      const companyEl = link.parentElement?.querySelector('[class*="empresa"], [class*="company"]');
      if (url && titleEl) {
        offers.push({
          url,
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || 'Empresa no informada',
          description: link.parentElement?.innerText.slice(0, 5000) || '',
        });
      }
    });
    return offers.slice(0, 50);
  },

  extractOffers() {
    const hostname = window.location.hostname;
    let offers = [];

    if (hostname.includes('linkedin.com')) {
      offers = this.extractLinkedInOffers();
    } else if (hostname.includes('laborum')) {
      offers = this.extractLaborumOffers();
    } else {
      offers = [...document.querySelectorAll('a[href*="job"], a[href*="offer"], a[href*="trabajo"]')]
        .slice(0, 50)
        .map(el => ({
          url: el.href,
          title: el.textContent.trim() || 'Oferta',
          company: 'Empresa no informada',
          description: '',
        }))
        .filter(o => o.title.length > 3);
    }

    return { portal: hostname, count: offers.length, offers };
  },
};

globalThis.FitcvOfferExtractor.extractOffers();
