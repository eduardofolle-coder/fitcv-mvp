import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class FitcvAPI {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  setToken(token: string) {
    this.token = token;
  }

  // Auth endpoints
  async register(email: string, password: string) {
    const res = await this.client.post('/auth/register', { email, password });
    return res.data;
  }

  async login(email: string, password: string) {
    const res = await this.client.post('/auth/login', { email, password });
    return res.data;
  }

  async refreshToken(refreshToken: string) {
    const res = await this.client.post('/auth/refresh', { refreshToken });
    return res.data;
  }

  // CV endpoints
  async uploadCV(cvText: string) {
    const res = await this.client.post('/cv/upload', { cvText });
    return res.data;
  }

  async getCVProfile() {
    const res = await this.client.get('/cv/profile');
    return res.data;
  }

  async getCVStats() {
    const res = await this.client.get('/cv/stats');
    return res.data;
  }

  // Postulations endpoints
  async createPostulation(offerId: string) {
    const res = await this.client.post('/postulations', { offerId });
    return res.data;
  }

  async getPostulations() {
    const res = await this.client.get('/postulations');
    return res.data;
  }

  async getPostulation(id: string) {
    const res = await this.client.get(`/postulations/${id}`);
    return res.data;
  }

  async generateAdaptedCV(postulationId: string) {
    const res = await this.client.post(`/postulations/${postulationId}/generate-cv`, {});
    return res.data;
  }

  async matchPostulation(offerId: string) {
    const res = await this.client.post('/postulations/match', { offerId });
    return res.data;
  }

  async updatePostulation(id: string, data: any) {
    const res = await this.client.put(`/postulations/${id}`, data);
    return res.data;
  }

  // Offers endpoints
  async getRankedOffers() {
    const res = await this.client.get('/offers/ranked');
    return res.data;
  }

  async getOffers() {
    const res = await this.client.get('/offers');
    return res.data;
  }

  // Learning endpoints
  async reportOutcome(postulationId: string, outcome: string, feedback?: string) {
    const res = await this.client.post('/learning/outcome', {
      postulationId,
      outcome,
      feedback,
    });
    return res.data;
  }

  async getMemorySummary() {
    const res = await this.client.get('/learning/summary');
    return res.data;
  }

  async exportMemory() {
    const res = await this.client.get('/learning/export');
    return res.data;
  }

  async clearMemory() {
    const res = await this.client.delete('/learning/clear', {
      data: { confirm: true },
    });
    return res.data;
  }
}

export const api = new FitcvAPI();
