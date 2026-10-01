const API_URL = (import.meta.env.VITE_API_URL || '/suite/api').replace(/\/$/, '');

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('Authentication required');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const readError = async (response: Response): Promise<string> => {
  try {
    const payload = await response.json();
    return payload.detail || payload.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

export const generateSeoAdvice = async (
  prompt: string,
  useThinking: boolean,
  useSearch: boolean,
  systemInstruction?: string
): Promise<{ text: string; groundingUrls?: Array<{ uri: string; title: string }> }> => {
  const response = await fetch(`${API_URL}/ai/text`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      prompt,
      use_thinking: useThinking,
      use_search: useSearch,
      system_instruction: systemInstruction || null,
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  return response.json();
};

export const generateImage = async (
  prompt: string,
  aspectRatio: '1:1' | '3:4' | '4:3' | '9:16' | '16:9'
): Promise<string> => {
  const response = await fetch(`${API_URL}/ai/image`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ prompt, aspect_ratio: aspectRatio }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  if (!payload.data_url) throw new Error('No image generated');
  return payload.data_url;
};

export const editImage = async (
  base64Image: string,
  prompt: string
): Promise<string> => {
  const response = await fetch(`${API_URL}/ai/edit-image`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ base64_image: base64Image, prompt }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const payload = await response.json();
  if (!payload.data_url) throw new Error('No edited image generated');
  return payload.data_url;
};

export const generateVideo = async (
  base64Image: string,
  prompt: string,
  aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
  const response = await fetch(`${API_URL}/ai/video`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      base64_image: base64Image,
      prompt,
      aspect_ratio: aspectRatio,
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// Kept for compatibility with CreativeStudio. Keys are now server-side only.
export const checkVeoAuth = async (): Promise<boolean> => true;
export const triggerVeoAuth = async (): Promise<void> => {};
