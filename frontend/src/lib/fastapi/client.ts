// Base configuration

class HttpError extends Error {
    status: number;
    
    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

class ApiClient {
    private baseUrl = '/backend'; // We have a rewrite in next.config.ts to handle this, anything with /backend will be rewritten to the FastAPI backend URL

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        // Don't set Content-Type for FormData - browser will set it with boundary
        const isFormData = options.body instanceof FormData;
        const headers: HeadersInit = {};
        
        if (!isFormData && options.headers) {
            Object.assign(headers, options.headers);
        } else if (options.headers && !isFormData) {
            Object.assign(headers, options.headers);
        }
        
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: isFormData ? {} : headers, // Let browser set headers for FormData
        });
        
        if (!response.ok) {
            // Try to extract error details from FastAPI response
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                // FastAPI returns errors in a 'detail' field
                if (errorData.detail) {
                    errorMessage = errorData.detail;
                } else if (errorData.error) {
                    errorMessage = errorData.error;
                } else if (typeof errorData === 'string') {
                    errorMessage = errorData;
                }
            } catch {
                // If we can't parse the error, use the status message
                errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
            }
            throw new HttpError(errorMessage, response.status);
        }
        return response.json();
    }
}
  
export const apiClient = new ApiClient();