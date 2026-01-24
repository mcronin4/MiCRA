// Base configuration

import { supabase } from '@/lib/supabase/client';

class HttpError extends Error {
    status: number;
    
    constructor(message: string, status: number) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

class ApiClient {
    private getBaseUrl(): string {
        // Simple: use environment variable if set, otherwise use rewrite
        const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (envUrl) {
            const cleanUrl = envUrl.endsWith('/') ? envUrl.slice(0, -1) : envUrl;
            return `${cleanUrl}/api`;
        }
        return '/backend';
    }

    private async getAuthHeaders(): Promise<HeadersInit> {
        const headers: HeadersInit = {};
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }
        } catch (error) {
            // If we can't get session, continue without auth header
            console.warn('Failed to get auth session for API request:', error);
        }
        return headers;
    }

    async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        // Don't set Content-Type for FormData - browser will set it with boundary
        const isFormData = options.body instanceof FormData;
        const headers: HeadersInit = {};
        
        // Get auth headers (includes Bearer token if available)
        const authHeaders = await this.getAuthHeaders();
        Object.assign(headers, authHeaders);
        
        if (!isFormData && options.headers) {
            Object.assign(headers, options.headers);
        } else if (options.headers && !isFormData) {
            Object.assign(headers, options.headers);
        }

        const baseUrl = this.getBaseUrl();
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

        const response = await fetch(`${baseUrl}${cleanEndpoint}`, {
            ...options,
            headers: isFormData ? authHeaders : headers, // Preserve auth headers even for FormData
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

        // Handle 204 No Content responses (common for DELETE operations)
        if (response.status === 204) {
            return undefined as T;
        }

        return response.json();
    }
}
  
export const apiClient = new ApiClient();