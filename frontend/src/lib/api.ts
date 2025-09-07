import axios from 'axios';

// API Configuration
const API_BASE_URL = 'https://xvppx6qv25.execute-api.us-east-1.amazonaws.com/dev';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types
export interface UploadResponse {
  uploadUrl: string;
  key: string;
}

export interface IngestRequest {
  key: string;
  userId: string;
  issuer: string;
  cardLast4: string;
}

export interface IngestResponse {
  executionArn: string;
  statementId: string;
}

export interface Transaction {
  pk: string;
  sk: string;
  merchantRaw: string;
  merchantNorm: string;
  amount: number;
  memo: string;
  category: string;
  confidence: number;
  createdAt: string;
  updatedAt?: string;
  manuallyUpdated?: boolean;
  statementId: string;
  issuer: string;
  cardLast4: string;
}

export interface UpdateLabelRequest {
  userId: string;
  txnId: string;
  newCategory: string;
}

export interface UpdateLabelResponse {
  updated: boolean;
  category: string;
  transaction: Transaction;
}

export interface Category {
  name: string;
  active: boolean;
  hints: string[];
}

export interface CreateCategoryRequest {
  name: string;
  hints?: string[];
}

export interface UpdateCategoryRequest {
  name: string;
  active?: boolean;
  hints?: string[];
}

// API Functions
export const api = {
  // Get presigned URL for PDF upload
  getUploadUrl: async (): Promise<UploadResponse> => {
    const response = await apiClient.post('/statements/upload');
    return response.data;
  },

  // Start statement processing
  ingestStatement: async (data: IngestRequest): Promise<IngestResponse> => {
    const response = await apiClient.post('/statements/ingest', data);
    return response.data;
  },

  // Update transaction label
  updateTransactionLabel: async (data: UpdateLabelRequest): Promise<UpdateLabelResponse> => {
    const response = await apiClient.post('/transactions/update-label', data);
    return response.data;
  },

  // Category management
  createCategory: async (data: CreateCategoryRequest): Promise<{ created: boolean; category: Category }> => {
    const response = await apiClient.post('/categories', data);
    return response.data;
  },

  getCategories: async (userId: string): Promise<{ categories: Category[] }> => {
    const response = await apiClient.get(`/categories/${userId}`);
    return response.data;
  },

  updateCategory: async (userId: string, data: UpdateCategoryRequest): Promise<{ updated: boolean; category: Category }> => {
    const response = await apiClient.put(`/categories/${userId}`, data);
    return response.data;
  },
};

export default api;
