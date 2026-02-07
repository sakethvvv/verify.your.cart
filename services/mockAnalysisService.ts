import { AnalysisResult } from '../types';

/**
 * Mocks the Python Backend Logic in the browser.
 * In a real deployment, this would use fetch() to call the Flask API.
 */
export const mockAnalyzeProduct = async (url: string): Promise<AnalysisResult> => {
    // Simulate network delay (approx 0.5s - 1.5s)
    const delay = 500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    const urlLower = url.toLowerCase();
    
    // Heuristic Logic to simulate ML Prediction
    let score = 82; // Default positive baseline
    let verdict: AnalysisResult['verdict'] = 'Genuine';
    let advice = '';

    // Default Breakdown Structure to ensure UI always has data
    let breakdown = {
        reviews: ["Reviews appear consistent with product performance.", "Verified buyer tags present."],
        sentiment: ["Positive sentiment matches star rating.", "Language patterns look natural."],
        price: ["Price is within 10% of market average.", "No suspicious discounts detected."],
        seller: ["Seller has a verified badge and history.", "Contact information is visible."],
        description: ["Professional product description.", "Clear specifications provided."]
    };

    // Simple keyword detection to simulate AI analysis
    const suspiciousKeywords = ['free', 'offer', 'win', 'cheap', 'discount', '70-off', 'urgent', 'buy-now', 'store-closing', 'clearance'];
    const hasSuspiciousKeywords = suspiciousKeywords.some(k => urlLower.includes(k));
    const isMajorPlatform = urlLower.includes('amazon') || urlLower.includes('flipkart') || urlLower.includes('myntra') || urlLower.includes('apple') || urlLower.includes('bestbuy') || urlLower.includes('nike') || urlLower.includes('atomberg');

    if (isMajorPlatform) {
        score = 92;
        verdict = 'Genuine';
        advice = "This looks like a Safe Product! The seller is verified and the listing details match professional standards.";
        breakdown = {
            reviews: ["Over 1,000+ verified reviews found.", "Review distribution looks organic."],
            sentiment: ["Sentiment aligns perfectly with the 4.5 star rating.", "No bot patterns detected."],
            price: ["Price aligns with market average for this category.", "Discount is realistic (10-15%)."],
            seller: ["Sold by a verified major retailer or official brand store.", "High positive feedback score."],
            description: ["Clear, professional specifications.", "Includes valid warranty information."]
        };
    } 
    else if (hasSuspiciousKeywords || urlLower.length > 70 || urlLower.includes('myshopify')) {
        score = 45;
        verdict = 'Fake';
        advice = "Please do not buy this. The price is too good to be true, and it fits the pattern of common scams.";
        breakdown = {
            reviews: ["Many reviews are very short and repetitive.", "Possible copy-paste review patterns detected."],
            sentiment: ["Mismatch detected between enthusiastic text and generic phrasing."],
            price: ["Product price is much lower (>70%) than average.", "Extremely low prices are often linked to scams."],
            seller: ["Seller account is new or has no history.", "Missing contact details."],
            description: ["Description contains generic or copied content.", "No clear brand or warranty info."]
        };
    } 
    else {
        score = 65;
        verdict = 'Suspicious';
        advice = "Proceed with caution. The seller is new, so double-check the return policy before spending your money.";
        breakdown = {
            reviews: ["Limited number of reviews available.", "Some 5-star reviews look generic."],
            sentiment: ["Review text sounds neutral but ratings are high.", "Mixed signals detected."],
            price: ["Price is slightly lower than expected.", "Unusual discount structure."],
            seller: ["Seller profile was created recently.", "Low response rate to queries."],
            description: ["Product specs are vague.", "Images might be stock photos."]
        };
    }

    const reasons = [
        breakdown.seller[0],
        breakdown.price[0],
        breakdown.description[0]
    ];

    return {
        trust_score: score,
        verdict,
        reasons,
        advice,
        url,
        timestamp: new Date().toISOString(),
        breakdown
    };
};