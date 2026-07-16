import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

// Config du traducteur XML -> JSON
const parser = new XMLParser({ 
  ignoreAttributes: false, 
  attributeNamePrefix: "" 
});

const apiClient = axios.create({
  baseURL: '/api', // Utilise le proxy défini dans vite.config.js
  params: {
    ws_key: '6CcZSeHI1MjkPrp1L9RGbKmoxNUEoMf7',
    output_format: 'JSON' // Demande gentiment du JSON
  }
});

export default {
  async get(resource) {
    try {
      const response = await apiClient.get(`/${resource}`);
      
      // 1. Si c'est déjà du JSON (Objet JS)
      if (typeof response.data === 'object') return response.data;

      // 2. Si PrestaShop envoie du XML (String)
      const jsonObj = parser.parse(response.data);
      return jsonObj;
      
    } catch (error) {
      console.error(`[API] Erreur sur la ressource ${resource}:`, error);
      return null;
    }
  },

  // Utile plus tard pour POST/PUT/DELETE
  async post(resource, data) { return (await apiClient.post(`/${resource}`, data)).data },
  async put(resource, data) { return (await apiClient.put(`/${resource}`, data)).data },
  async delete(resource, id) { return (await apiClient.delete(`/${resource}/${id}`)).data }
};