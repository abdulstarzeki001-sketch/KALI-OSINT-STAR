FROM ghcr.io/ggml-org/llama.cpp:server
ENV LLAMA_CACHE=/models
EXPOSE 8080
# CPU-only, no external AI provider, private credential supplied via LLAMA_API_KEY.
CMD ["-hf", "ggml-org/Qwen3.5-4B-GGUF:Q4_K_M", "--no-mmproj", "--host", "0.0.0.0", "--port", "8080", "--alias", "star-ai-cpu", "-c", "4096", "-t", "4", "-ngl", "0", "--jinja", "--log-disable"]
