// Users
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JWTPayload {
  sub: string;
  iat: number;
  exp: number;
  type?: 'access' | 'refresh';
}

// Candidate Profile
export interface CandidateProfile {
  id: string;
  userId: string;
  fullName: string;
  yearsExperience: number;
  education: string;
  skills: string[];
  summary: string;
  cvOriginalContent: string; // Encriptado en BD
  createdAt: Date;
  updatedAt: Date;
}

// Suggested Roles
export interface SuggestedRole {
  id: string;
  userId: string;
  roleTitle: string;
  level: string; // L1-L6
  description: string;
  matchScore: number;
  isSelected: boolean;
  createdAt: Date;
}

// Job Offers
export interface JobOffer {
  id: string;
  title: string;
  company: string;
  level: string; // L1-L6
  salary: {
    min: number;
    max: number;
    currency: string;
  };
  location: string;
  description: string;
  requirements: string[];
  source: 'linkedin' | 'computrabajo' | 'laborum' | 'trabajando' | 'manual';
  url?: string;
  createdAt: Date;
}

// Postulations
export interface Postulation {
  id: string;
  userId: string;
  offerId: string;
  estado: 'Por revisar' | 'Preparar postulación' | 'Descartado' | 'Aplicado' | 'En revisión' | 'Entrevista';
  prioridad: 'Alta' | 'Media' | 'Baja';
  notes?: string;
  cvAdaptedId?: string;
  postulationWeight: number; // 1, 2, o 4
  postuladoAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Adapted CVs
export interface AdaptedCV {
  id: string;
  postulationId: string;
  userId: string;
  offerId: string;
  htmlContent: string; // Encriptado en BD
  atsScore: number;
  changesHighlights: string[];
  createdAt: Date;
}

// API Responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorId?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
