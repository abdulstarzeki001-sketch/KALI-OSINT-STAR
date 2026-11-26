import {ProxyAgent} from 'undici';

export function tailnetProvider(env, fetchImpl = globalThis.fetch) {
  if (!env.STAR_TAILNET_OLLAMA_URL) return {env, fetchImpl};

  const endpoint = new URL(env.STAR_TAILNET_OLLAMA_URL);
  if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\/v1\/?$/.test(endpoint.href)) {
    throw new Error('STAR_TAILNET_OLLAMA_URL must be a Tailscale HTTPS /v1 URL');
  }

  const baseUrl = endpoint.href.replace(/\/$/, '');
  const catalog = JSON.parse(env.STAR_MODELS_JSON || '[]');
  const proxy = new ProxyAgent('http://127.0.0.1:1055');
  return {
    env: {
      ...env,
      STAR_MODELS_JSON: JSON.stringify([...catalog, {
        id: 'qwen3-coder-vast',
        upstreamModel: 'qwen3-coder:30b',
        baseUrl,
        keyEnv: 'STAR_PROVIDER_TAILNET_OLLAMA_KEY'
      }, {
        id: 'star-pro-vast',
        upstreamModel: 'star-pro:latest',
        baseUrl,
        keyEnv: 'STAR_PROVIDER_TAILNET_OLLAMA_KEY'
      }]),
      // Ollama ignores OpenAI API keys. Tailscale policy authorizes this connection.
      STAR_PROVIDER_TAILNET_OLLAMA_KEY: 'ollama'
    },
    fetchImpl(url, options) {
      if ((url === baseUrl + '/chat/completions' && options?.method === 'POST') ||
          (url === baseUrl + '/models' && options?.method === 'GET')) {
        return fetchImpl(url, {...options, dispatcher: proxy});
      }
      return fetchImpl(url, options);
    }
  };
}
