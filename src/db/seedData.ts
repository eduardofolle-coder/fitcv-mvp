// ✅ Seed data - Simplified data initialization
import { db } from './client.js';

export const SEED_OFFERS = [
  {
    id: 'offer-001',
    title: 'Senior Data Analyst',
    company: 'Amazon',
    level: 'L4',
    salaryMin: 5000000,
    salaryMax: 7000000,
    salaryCurrency: 'CLP',
    location: 'Santiago, Chile',
    description: 'We\'re looking for a Senior Data Analyst to join our AWS team. Responsibilities: Analyze large datasets, Build dashboards, Mentor junior analysts.',
    requirements: JSON.stringify(['SQL', 'Python', 'AWS', 'Data Analysis', 'Leadership']),
    source: 'linkedin',
    url: 'https://example.com/job/1',
    createdAt: new Date().toISOString()
  },
  {
    id: 'offer-002',
    title: 'Product Manager - Fintech',
    company: 'Cornershop by Uber',
    level: 'L4',
    salaryMin: 4500000,
    salaryMax: 6500000,
    salaryCurrency: 'CLP',
    location: 'Santiago, Chile',
    description: 'Help us build the future of grocery delivery in Latin America. You will own product roadmap for financial services.',
    requirements: JSON.stringify(['Product Management', 'Fintech', 'Analytics', 'Leadership', 'Communication']),
    source: 'computrabajo',
    url: 'https://example.com/job/2',
    createdAt: new Date().toISOString()
  },
  {
    id: 'offer-003',
    title: 'Growth Marketing Manager',
    company: 'Despegar',
    level: 'L3',
    salaryMin: 2800000,
    salaryMax: 3800000,
    salaryCurrency: 'CLP',
    location: 'Santiago, Chile',
    description: 'Join Despegar\'s growth team to scale travel experiences across LATAM. Execute growth campaigns, analyze funnel metrics.',
    requirements: JSON.stringify(['Growth Marketing', 'Analytics', 'SQL', 'Campaign Management', 'E-commerce']),
    source: 'laborum',
    url: 'https://example.com/job/3',
    createdAt: new Date().toISOString()
  },
  {
    id: 'offer-004',
    title: 'ML Engineer',
    company: 'NotCo',
    level: 'L4',
    salaryMin: 5500000,
    salaryMax: 7500000,
    salaryCurrency: 'CLP',
    location: 'Santiago, Chile',
    description: 'NotCo is building AI-powered product creation. Design and implement ML pipelines, optimize model performance.',
    requirements: JSON.stringify(['Machine Learning', 'Python', 'PyTorch', 'NLP', 'Production Systems']),
    source: 'trabajando',
    url: 'https://example.com/job/4',
    createdAt: new Date().toISOString()
  },
  {
    id: 'offer-005',
    title: 'Business Analyst',
    company: 'Banco Estado',
    level: 'L2',
    salaryMin: 1800000,
    salaryMax: 2400000,
    salaryCurrency: 'CLP',
    location: 'Santiago, Chile',
    description: 'Support our digital transformation initiative at Banco Estado. Gather requirements, document processes, provide testing coordination.',
    requirements: JSON.stringify(['Business Analysis', 'Banking', 'Requirements Gathering', 'Communication', 'Testing']),
    source: 'computrabajo',
    url: 'https://example.com/job/5',
    createdAt: new Date().toISOString()
  }
];

export async function initializeSeedData() {
  console.log('🌱 Initializing seed data...');

  // Check if offers already exist
  const checkStmt = db.prepare('SELECT COUNT(*) as count FROM offers');
  const result = checkStmt.all() as any[];

  if (result && result[0] && result[0].count > 0) {
    console.log('✅ Offers already initialized');
    return;
  }

  // Insert offers
  for (const offer of SEED_OFFERS) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO offers (
        id, title, company, level, salaryMin, salaryMax, salaryCurrency,
        location, description, requirements, source, url, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      offer.id,
      offer.title,
      offer.company,
      offer.level,
      offer.salaryMin,
      offer.salaryMax,
      offer.salaryCurrency,
      offer.location,
      offer.description,
      offer.requirements,
      offer.source,
      offer.url,
      offer.createdAt
    );

    if (result.changes > 0) {
      console.log(`✅ Inserted offer: ${offer.title}`);
    }
  }

  console.log(`✅ Seeded ${SEED_OFFERS.length} offers`);
}
