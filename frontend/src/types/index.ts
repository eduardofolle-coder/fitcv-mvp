export interface User {
  id: string;
  email: string;
}

export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string;
  yearsExperience: number;
  skills: string[];
  experience: Experience[];
  education: Education[];
  summary?: string;
}

export interface Experience {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  responsibilities: string[];
  achievements: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  graduationYear: number;
}

export interface Postulation {
  id: string;
  userId: string;
  offerId: string;
  estado: 'Por revisar' | 'Preparar' | 'Aplicado' | 'Entrevista' | 'Oferta';
  matchScore?: number;
  atsScore?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MatchResult {
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
  overallMatch: number;
  gaps: Gap[];
  recommendations: string[];
}

export interface Gap {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AdaptedCV {
  id: string;
  postulationId: string;
  adaptedCV: string;
  atsScore: number;
  keywords: string[];
  changes: string[];
}

export interface Offer {
  id: string;
  title: string;
  company: string;
  level: string;
  salary: {
    min: number;
    max: number;
    currency: string;
  };
  location?: string;
  description: string;
  requirements?: string[];
}

export interface OfferRanking {
  rank: number;
  offerId: string;
  offer: Offer;
  overallScore: number;
  scores: {
    skillsFit: number;
    careerGrowth: number;
    compensation: number;
    locationLifestyle: number;
    companyStability: number;
  };
  verdict: string;
}

export interface MemorySummary {
  successfulPatterns: number;
  personalHeuristics: number;
  skillsTracked: number;
  companiesTracked: number;
  lastUpdated?: string;
}

export interface PostulationOutcome {
  postulationId: string;
  outcome: 'interview' | 'offer' | 'rejection' | 'unknown';
  feedback?: string;
  daysToOutcome?: number;
}
