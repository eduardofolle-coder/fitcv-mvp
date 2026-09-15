/**
 * FITCV lee solo lo que cada portal permite en su robots.txt. Los textos son
 * los reales de Chiletrabajos y trabajando.cl.
 */
import { describe, it, expect } from 'vitest';
import { isAllowed, parseRobots } from '../src/services/sources/robots.js';

const CHILETRABAJOS = `#linkedin
User-agent: *
disallow: /partners/
#scrapy
User-agent: Scrapy,proximic
disallow: /
#sitemap
Sitemap: https://www.chiletrabajos.cl/sitemap.xml
User-agent:*
Disallow:/ofertasmuchomas`;

const TRABAJANDO = `User-agent: *
Allow: /
Disallow: /recomendadas/
Disallow: /ingresa-a-tu-cuenta/
Disallow: /crea-tu-curriculum/
Disallow: /*author/
Disallow: /*~`;

describe('robots.txt', () => {
  it('applies every "*" group and ignores groups for other robots', () => {
    const rules = parseRobots(CHILETRABAJOS, 'FITCV-OfferSync');
    expect(isAllowed(rules, '/trabajo/conserje-nochero-3868379')).toBe(true);
    expect(isAllowed(rules, '/partners/feed')).toBe(false);
    expect(isAllowed(rules, '/ofertasmuchomas?x=1')).toBe(false);
  });

  it('obeys a group that names the robot', () => {
    const rules = parseRobots(CHILETRABAJOS, 'Scrapy');
    expect(isAllowed(rules, '/trabajo/x')).toBe(false);
  });

  it('lets the longest rule win, with wildcards', () => {
    const rules = parseRobots(TRABAJANDO, 'FITCV-OfferSync');
    expect(isAllowed(rules, '/trabajo/6124702-cajero-iquique')).toBe(true);
    expect(isAllowed(rules, '/ingresa-a-tu-cuenta/')).toBe(false);
    expect(isAllowed(rules, '/blog/author/ana')).toBe(false);
    expect(isAllowed(rules, '/backup~')).toBe(false);
  });

  it('allows everything when there are no rules', () => {
    expect(isAllowed(parseRobots('', 'FITCV-OfferSync'), '/cualquier/cosa')).toBe(true);
  });

  it('supports end anchors', () => {
    const rules = parseRobots('User-agent: *\nDisallow: /*.pdf$', 'FITCV-OfferSync');
    expect(isAllowed(rules, '/cv.pdf')).toBe(false);
    expect(isAllowed(rules, '/cv.pdf?download=1')).toBe(true);
  });
});
