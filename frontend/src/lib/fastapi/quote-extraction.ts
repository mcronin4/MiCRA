import { apiClient } from "./client";

export interface QuoteItem {
  text: string;
  reason?: string;
}

export interface QuoteExtractionResponse {
  success: boolean;
  quotes?: QuoteItem[];
  error?: string;
  detail?: string;
}

export interface QuoteExtractionRequest {
  transcript: string;
  style: "punchy" | "insightful" | "contrarian" | "emotional";
  count: number;
}

export async function extractQuotes(
  request: QuoteExtractionRequest,
): Promise<QuoteExtractionResponse> {
  return apiClient.request<QuoteExtractionResponse>("/v1/quote-extraction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
}
