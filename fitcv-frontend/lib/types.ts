// Auth
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    userId: string;
    email: string;
    accessToken: string;
    refreshToken?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  accessToken: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Learning types
export interface RecordAdaptationRequest {
  jobTitle: string;
  company: string;
  atsScore: number;
  keywords: string[];
  cvChanges?: string[];
}

export interface RecordOutcomeRequest {
  adaptationId: string;
  outcome: 'interview' | 'offer' | 'rejection' | 'unknown';
  feedback?: string;
}

export interface TopKeywordsResponse {
  keywords: string[];
}

export interface PatternsResponse {
  topCompanies: string[];
  topJobTitles: string[];
  averageScore: number;
  totalAdaptations: number;
}

export interface SkillGrowthResponse {
  newSkills: string[];
  strengthenedSkills: string[];
  obsoleteSkills: string[];
}

export interface RecommendationsResponse {
  recommendedKeywords: string[];
  recommendedCompanies: string[];
  recommendedRoles: string[];
  marketOpportunities: string[];
}

export interface MarketTrendsResponse {
  hotSkills: string[];
  hotRoles: string[];
  hotCompanies: string[];
  marketHealth: string;
}
