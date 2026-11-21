# Open-weight model and CPU-only inference. No external inference API.
FROM ghcr.io/ggml-org/llama.cpp:server
ENV LLAMA_CACHE=/models
COPY start.sh /app/start.sh
EXPOSE 8080
# Fail closed when LLAMA_API_KEY is missing; never expose unauthenticated public inference.
ENTRYPOINT ["/bin/sh", "/app/start.sh"]
CMD ["-hf", "ggml-org/Qwen3.5-4B-GGUF:Q4_K_M", "--no-mmproj", "--host", "0.0.0.0", "--port", "8080", "--alias", "star-ai-cpu", "-c", "4096", "-t", "4", "-ngl", "0", "--jinja", "--log-disable"]
