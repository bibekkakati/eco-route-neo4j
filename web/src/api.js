import axios from 'axios';

// Static API key configured for demonstration purposes
export const DEMO_API_KEY = 'ecr_c223530d78101de6ac9841e5282d971382095dedf8c39313';

// Base Axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': DEMO_API_KEY,
  },
});

// Request Interceptor: Ensures static demo API key is attached to all outgoing requests
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-API-Key'] = DEMO_API_KEY;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for friendly error mapping
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const customError = {
      status: error.response?.status || 500,
      message: error.response?.data?.message || error.message || 'An unexpected error occurred.',
      error: error.response?.data?.error || 'NETWORK_ERROR',
      details: error.response?.data,
    };
    return Promise.reject(customError);
  }
);

export default apiClient;
