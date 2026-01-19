import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { ModelType } from "../types";

// Helper to get AI client. Note: For Veo, we re-instantiate to capture user-selected keys.
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSeoAdvice = async (
  prompt: string,
  useThinking: boolean,
  useSearch: boolean,
  systemInstruction?: string
): Promise<{ text: string; groundingUrls?: Array<{ uri: string; title: string }> }> => {
  const ai = getAiClient();
  
  const model = useThinking ? ModelType.SEO_THINKING : ModelType.SEO_SEARCH;
  
  const config: any = {};
  
  if (useThinking) {
    // Max budget for pro model
    config.thinkingConfig = { thinkingBudget: 32768 };
  }
  
  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response: GenerateContentResponse = await ai.models.generateContent({
    model,
    contents: prompt,
    config,
  });

  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  const groundingUrls = groundingChunks
    ?.map((chunk: any) => chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : null)
    .filter((item: any) => item !== null);

  return {
    text: response.text || "No response generated.",
    groundingUrls,
  };
};

export const generateImage = async (
  prompt: string,
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
): Promise<string> => {
  const ai = getAiClient();
  
  // Gemini 3 Pro Image supports high quality and aspect ratio controls
  const response = await ai.models.generateContent({
    model: ModelType.IMAGE_GEN,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "1K" 
      }
    }
  });

  // Extract image from parts
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const editImage = async (
  base64Image: string,
  prompt: string
): Promise<string> => {
  const ai = getAiClient();
  
  // Clean base64 string if needed
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
  const mimeType = base64Image.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  const response = await ai.models.generateContent({
    model: ModelType.IMAGE_EDIT, // Nano Banana (2.5 Flash Image)
    contents: {
      parts: [
        {
          inlineData: {
            data: cleanBase64,
            mimeType: mimeType,
          },
        },
        { text: prompt },
      ],
    },
  });

   // Extract image from parts
   for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No edited image generated");
};

export const generateVideo = async (
  base64Image: string,
  prompt: string,
  aspectRatio: "16:9" | "9:16" = "16:9"
): Promise<string> => {
  // We must re-instantiate inside the function to ensure we pick up the latest key if selected via window.aistudio
  const ai = getAiClient();
  
  const cleanBase64 = base64Image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
  const mimeType = base64Image.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

  let operation = await ai.models.generateVideos({
    model: ModelType.VIDEO_GEN, // Veo 3.1 Fast
    prompt: prompt || "Animate this image",
    image: {
      imageBytes: cleanBase64,
      mimeType: mimeType,
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: aspectRatio,
    }
  });

  // Polling loop
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error("Video generation failed");

  // Fetch the actual video bytes using the key
  const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

// Helper for Veo Auth Check
export const checkVeoAuth = async (): Promise<boolean> => {
  if (typeof window.aistudio !== 'undefined') {
    return await window.aistudio.hasSelectedApiKey();
  }
  return true; // Fallback if not running in the specific environment that requires this
};

export const triggerVeoAuth = async (): Promise<void> => {
  if (typeof window.aistudio !== 'undefined') {
    await window.aistudio.openSelectKey();
  }
};