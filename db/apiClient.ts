const API_BASE_URL = 'https://meditrack-portal.loca.lt/api/v1'; // Temporary Public Tunnel pointing to Localhost
const API_KEY = 'mtk_live_48f98c8dfa42k3jds8dj23kx1';

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    'Bypass-Tunnel-Reminder': 'true' // Required to bypass localtunnel splash screen
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers || {})
            }
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'API Request Failed');
        }
        return { data, error: null };
    } catch (error: any) {
        console.error('API Fetch Error:', error?.message || 'Unknown error');
        return { data: null, error };
    }
};
