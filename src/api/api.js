import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api', // or your FastAPI, Flask, etc.
  timeout: 10000,
});

export default api;