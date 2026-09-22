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

export interface TopicCount {
  term: string;
  offers: number;
}

export interface DiagnosisResponse {
  matched: number;
  reach: { alto: number; medio: number; bajo: number };
  nearMisses: number;
  entryLevelDiscarded: number;
  analyzed: number;
  strengths: TopicCount[];
  gaps: TopicCount[];
  unused: string[];
}
