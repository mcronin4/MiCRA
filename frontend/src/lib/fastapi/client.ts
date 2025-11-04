// Base configuration
class ApiClient {
    private baseUrl = '/backend'; // We have a rewrite in next.config.ts to handle this, anything with /backend will be rewritten to the FastAPI backend URL

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    }
}
  
export const apiClient = new ApiClient();