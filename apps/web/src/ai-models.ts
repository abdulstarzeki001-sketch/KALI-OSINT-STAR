export const PRIVATE_MODEL = 'qwen3-coder-vast';
export const CLOUD_MODEL = 'llama-cloudflare';
export type AIModel = typeof PRIVATE_MODEL | typeof CLOUD_MODEL;

export const AI_MODELS: {id: AIModel; label: string}[] = [
  {id: PRIVATE_MODEL, label: 'Qwen3-Coder 30B · خادم Vast.ai'},
  {id: CLOUD_MODEL, label: 'Llama · Cloudflare'}
];
