export const PRIVATE_MODEL = 'qwen3-coder-vast';
export const CLOUD_MODEL = 'llama-cloudflare';
export const AUTO_MODEL = 'star-ai-auto';
export type AIModel = typeof PRIVATE_MODEL | typeof CLOUD_MODEL | typeof AUTO_MODEL;

// Report analysis supports only explicit models until its server route adds fallback.
export const AI_MODELS: {id: AIModel; label: string}[] = [
  {id: PRIVATE_MODEL, label: 'Qwen3-Coder 30B · خادم Vast.ai'},
  {id: CLOUD_MODEL, label: 'Llama · Cloudflare'}
];

// Auto is opt-in in the chat UI because fallback may send text to Cloudflare.
export const CHAT_MODELS: {id: AIModel; label: string}[] = [
  {id: AUTO_MODEL, label: 'تلقائي: Qwen ثم Llama عند التعذر'},
  ...AI_MODELS
];
