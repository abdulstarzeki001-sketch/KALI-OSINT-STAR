# Architecture
KALI-OSINT-STAR has a static React/Vite application and an optional FastAPI read-only service.
Browser (localhost:5173) -> Vite proxy /api -> FastAPI (127.0.0.1:8000).
Training progress, targets and favorites are browser-local (localStorage).
No shell execution is exposed. The root index.html is a standalone static fallback for preview/GitHub Pages.
Cloudflare Pages: root apps/web, build npm run build, output dist.
GSAP and Lenis run in the React frontend. The visual treatment is inspired by React Bits and 21st.dev without importing proprietary components.
