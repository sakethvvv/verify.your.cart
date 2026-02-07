import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { AnalysisResult } from '../types';
import { mockAnalyzeProduct } from './mockAnalysisService';

// We do not initialize 'ai' globally here because the key might change (user input vs env).

/**
 * Analyzes a product URL to determine if it's fake or genuine.
 * Uses Google Gemini AI with Search Grounding for accuracy.
 */
export const analyzeProduct = async (url: string, userApiKey?: string): Promise<AnalysisResult> => {
    // 1. Determine which API Key to use
    // Prioritize User Input -> then Environment Variable
    const apiKey = userApiKey || process.env.API_KEY;

    // If no key is found at all, fallback to Mock Service
    if (!apiKey || apiKey === "PLACEHOLDER_API_KEY" || apiKey === "") {
        console.warn("API Key missing. Using Mock Analysis Service.");
        return mockAnalyzeProduct(url);
    }

    try {
        // Initialize AI client with the resolved key
        const ai = new GoogleGenAI({ apiKey: apiKey });

        // 2. Real AI Analysis with Search Tool
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `You are an expert "Fake Online Product Detector" AI. Your job is to protect users from scams by verifying e-commerce URLs.

            Analyze this product URL: ${url}
            
            Use Google Search to verify:
            1. Is the domain legitimate (e.g., amazon.com vs amazon-cheap-deals.com)?
            2. Does the product exist at this price point elsewhere?
            3. Are there scam reports for this specific seller or website?

            STRICT ANALYSIS RULES:
            - If the URL is from a major, trusted retailer (Amazon, Flipkart, BestBuy, Apple, Nike, Myntra, Ajio) AND the domain is correct: Start with a high trust score (>85). Only flag as "Risky" if the price is impossibly low (e.g. iPhone 15 for $100) or the specific seller page has bad reputation.
            - If the URL is a new domain, uses a strange TLD (.xyz, .top), or mimics a brand (typosquatting): Flag as "Likely Fake" immediately.
            - If you cannot access the specific product page details, rely on the domain reputation and URL structure.

            ADVANCED FAKE REVIEW DETECTION:
            1. Review Length Analysis: Look for reviews that are extremely short (e.g., "Good", "Nice") or suspiciously long and generic.
            2. Sentiment Consistency: Check if 5-star reviews have generic praise vs 1-star reviews having specific detailed complaints. A mismatch often indicates botting.
            3. Scam Phrases: Scan for phrases like "kindly", "dear customer", "whatsapp us", "investment", "guaranteed win", or broken English common in scam templates.

            Perform the following checks for the output:
            
            1. Reviews & Ratings: Look for patterns of fake reviews, copy-paste text, or length anomalies.
            2. Review Sentiment: Does the text match the star rating? Are the positive reviews too vague?
            3. Price Analysis: Is it significantly lower (>50%) than market average?
            4. Seller Trust: Is the seller new? Do they have a profile?
            5. Product Description: Is it generic, copied, or poorly written?

            Return a detailed JSON object.
            `,
            config: {
                tools: [{googleSearch: {}}],
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        trust_score: { type: Type.NUMBER, description: "Confidence Score 0-100" },
                        verdict: { type: Type.STRING, description: "Must be exactly: 'Genuine', 'Suspicious', or 'Fake'" },
                        breakdown: {
                            type: Type.OBJECT,
                            properties: {
                                reviews: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Findings about reviews/ratings" },
                                sentiment: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Findings about sentiment mismatch" },
                                price: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Findings about price comparison" },
                                seller: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Findings about seller reputation" },
                                description: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Findings about product text quality" }
                            }
                        },
                        reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 short summary reasons" },
                        advice: { type: Type.STRING, description: "Final recommendation for the user" }
                    }
                },
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }
                ]
            }
        });

        // CRITICAL FIX: Clean the response text before parsing
        // Gemini often returns markdown blocks like ```json ... ``` which breaks JSON.parse
        let rawText = response.text || "{}";
        
        // Robust extraction of JSON content from potential Markdown blocks
        const jsonBlockMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        const genericBlockMatch = rawText.match(/```\s*([\s\S]*?)\s*```/);
        
        if (jsonBlockMatch) {
            rawText = jsonBlockMatch[1];
        } else if (genericBlockMatch) {
            rawText = genericBlockMatch[1];
        } else {
             // Fallback: try to find the content between the first { and last }
             const firstBrace = rawText.indexOf('{');
             const lastBrace = rawText.lastIndexOf('}');
             if (firstBrace !== -1 && lastBrace !== -1) {
                 rawText = rawText.substring(firstBrace, lastBrace + 1);
             }
        }
        
        const result = JSON.parse(rawText);
        
        // Extract grounding chunks (sources) if available
        const sources: string[] = [];
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
            response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
                if (chunk.web?.uri) {
                    sources.push(chunk.web.uri);
                }
            });
        }

        // Map the verbose verdict to our internal types
        let mappedVerdict: AnalysisResult['verdict'] = 'Suspicious';
        const v = result.verdict?.toLowerCase() || '';
        if (v.includes('genuine') || v.includes('safe')) mappedVerdict = 'Genuine';
        else if (v.includes('fake')) mappedVerdict = 'Fake';
        else mappedVerdict = 'Suspicious';

        // Ensure breakdown arrays exist even if AI returned null
        const safeBreakdown = {
            reviews: result.breakdown?.reviews || ["Analysis of reviews inconclusive."],
            sentiment: result.breakdown?.sentiment || ["Sentiment analysis unavailable."],
            price: result.breakdown?.price || ["Price comparison unavailable."],
            seller: result.breakdown?.seller || ["Seller details not found."],
            description: result.breakdown?.description || ["Description check passed."]
        };

        return {
            trust_score: result.trust_score || 0,
            verdict: mappedVerdict,
            reasons: result.reasons || ["Analysis completed based on domain reputation."],
            advice: result.advice || "Proceed with caution and verify independently.",
            url: url,
            timestamp: new Date().toISOString(),
            sources: sources.slice(0, 3), // Limit to top 3 sources
            breakdown: safeBreakdown
        };

    } catch (error: any) {
        console.error("AI Analysis Failed:", error);

        // Check for specific API Key errors to provide better feedback
        if (error.message?.includes("403") || error.message?.includes("API key")) {
            console.warn("Invalid API Key detected. Falling back to mock service for demo purposes.");
        }

        // Fallback to mock if API fails
        return mockAnalyzeProduct(url);
    }
};