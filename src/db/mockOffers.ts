import { v4 as uuidv4 } from 'uuid';
import type { JobOffer } from '../types/index.js';

// ✅ Mock data: 5 ofertas para MVP v0.2 (simulación)
export const mockOffers: JobOffer[] = [
  {
    id: uuidv4(),
    title: 'Senior Data Analyst',
    company: 'Amazon',
    level: 'L4',
    salary: {
      min: 5000000,
      max: 7000000,
      currency: 'CLP'
    },
    location: 'Santiago, Chile',
    description: `We're looking for a Senior Data Analyst to join our AWS team in Santiago.

      Responsibilities:
      - Analyze large datasets to drive business decisions
      - Build dashboards and reports using AWS tools
      - Mentor junior analysts
      - Collaborate with product and engineering teams

      Requirements:
      - 5+ years of data analysis experience
      - Expert-level SQL and Python
      - Experience with cloud analytics (AWS, GCP, or Azure)
      - Strong communication skills`,
    requirements: ['SQL', 'Python', 'AWS', 'Data Analysis', 'Leadership'],
    source: 'linkedin',
    url: 'https://example.com/job/1',
    createdAt: new Date()
  },

  {
    id: uuidv4(),
    title: 'Product Manager - Fintech',
    company: 'Cornershop by Uber',
    level: 'L4',
    salary: {
      min: 4500000,
      max: 6500000,
      currency: 'CLP'
    },
    location: 'Santiago, Chile',
    description: `Help us build the future of grocery delivery in Latin America.

      You will:
      - Own product roadmap for financial services
      - Define product strategy and metrics
      - Lead cross-functional teams
      - Drive innovation in fintech

      Ideal candidate:
      - 4+ years PM experience
      - Background in fintech or e-commerce
      - Analytical mindset
      - Bilingual (Spanish/English)`,
    requirements: ['Product Management', 'Fintech', 'Analytics', 'Leadership', 'Communication'],
    source: 'computrabajo',
    url: 'https://example.com/job/2',
    createdAt: new Date()
  },

  {
    id: uuidv4(),
    title: 'Growth Marketing Manager',
    company: 'Despegar',
    level: 'L3',
    salary: {
      min: 2800000,
      max: 3800000,
      currency: 'CLP'
    },
    location: 'Santiago, Chile',
    description: `Join Despegar's growth team to scale travel experiences across LATAM.

      Key responsibilities:
      - Execute growth campaigns across channels
      - Analyze funnel metrics and optimize conversions
      - Collaborate with product on feature launches
      - Manage marketing budgets and ROI

      You should have:
      - 3+ years marketing experience
      - Strong SQL and analytics skills
      - Background in growth or performance marketing
      - Experience with travel or e-commerce`,
    requirements: ['Growth Marketing', 'Analytics', 'SQL', 'Campaign Management', 'E-commerce'],
    source: 'laborum',
    url: 'https://example.com/job/3',
    createdAt: new Date()
  },

  {
    id: uuidv4(),
    title: 'ML Engineer',
    company: 'NotCo',
    level: 'L4',
    salary: {
      min: 5500000,
      max: 7500000,
      currency: 'CLP'
    },
    location: 'Santiago, Chile',
    description: `NotCo is building AI-powered product creation. We need ML engineers to scale our models.

      What you'll do:
      - Design and implement ML pipelines
      - Optimize model performance and inference
      - Collaborate with data engineers on infra
      - Research state-of-the-art techniques

      Requirements:
      - 4+ years ML/AI experience
      - Proficiency in Python and PyTorch/TensorFlow
      - Experience with NLP or Computer Vision
      - Strong understanding of production ML`,
    requirements: ['Machine Learning', 'Python', 'PyTorch', 'NLP', 'Production Systems'],
    source: 'trabajando',
    url: 'https://example.com/job/4',
    createdAt: new Date()
  },

  {
    id: uuidv4(),
    title: 'Business Analyst',
    company: 'Banco Estado',
    level: 'L2',
    salary: {
      min: 1800000,
      max: 2400000,
      currency: 'CLP'
    },
    location: 'Santiago, Chile',
    description: `Support our digital transformation initiative at Banco Estado.

      You will:
      - Gather requirements from business stakeholders
      - Document processes and requirements
      - Support implementation of new systems
      - Provide testing and QA coordination

      Required:
      - 2+ years in business analysis
      - Banking or fintech experience preferred
      - Excellent documentation skills
      - Bilingual is a plus`,
    requirements: ['Business Analysis', 'Banking', 'Requirements Gathering', 'Communication', 'Testing'],
    source: 'computrabajo',
    url: 'https://example.com/job/5',
    createdAt: new Date()
  }
];

// El seeding real vive en seedData.ts; esta versión quedó sin uso y sin migrar.
