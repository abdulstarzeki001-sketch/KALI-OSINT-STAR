# KALI-OSINT-STAR — Cloudflare & STAR AI
## Architecture
- GitHub repo: abdulstarzeki001-sketch/KALI-OSINT-STAR, source apps/web
- Cloudflare Pages: kali-osint-star.pages.dev
- Access: self-hosted exact-hostname policy, allow only authorized owner email
- STAR AI Pages Function: apps/web/functions/api/ai/analyze.js (same origin)
- Private Workers AI service: kali-osint-star-ai-core, service binding STAR_AI, workers.dev and preview disabled
- Local Kali FastAPI remains loopback-only, inaccessible from the public website

## Security
The protected Cloudflare website **must not** request STAR_OPERATOR_TOKEN or STAR_APPROVAL_TOKEN. Those credentials are only used via the local Vite application on Kali. The browser uploads report text to Cloudflare Workers AI **only** after the user clicks Analyze. Do not paste secrets, personal information or confidential government records. The application does not persist reports in localStorage; Cloudflare and model service processing policies may still apply.

The application is protected only at the exact canonical hostname. Keep preview branches disabled. The AI route also requires an Access assertion header and matching origin/host, but the actual authorization boundary is Cloudflare Access (not the header's mere presence).

Workers AI uses @cf/meta/llama-3.1-8b-instruct-fast; inference may incur charges or be unavailable under account quota. Never claim model answers are validated security tests.

## Deployment
GitHub is linked to Cloudflare Pages; build root apps/web, command npm run build, output dist. Both production and preview deployment were disabled until verified Access and service binding were created. Once enabled, push to main for deployment. If Access login does not work, leave deployment disabled until policy is repaired.

## اختبار جلسة المستخدم المصادق عليها
1. افتح https://kali-osint-star.pages.dev وسجّل الدخول عبر Cloudflare Access ببريد المالك المُصرح به.
2. انتقل إلى STAR AI ثم اضغط **اختبار الجلسة والتحليل الآن**.
3. سترسل الواجهة تقريراً وهمياً ثابتاً إلى POST /api/ai/analyze من نفس أصل الموقع، مع ملفات جلسة المستخدم المعتادة؛ لا توجد رموز ثابتة في الواجهة.
4. **نجاح الاختبار الحقيقي** يعني استلام JSON بحالة `status: completed` ونص `analysis` غير فارغ. سيظهر النص وزمن الاستجابة التقريبي في الواجهة.
5. إذا انتهت جلسة Access أو فشل الخادم أو الاشتراك في Workers AI، ستعرض الواجهة الخطأ دون اختلاق نتائج.

اختبارات Node.js في CI تتحقق من منطق Page Function بوحدة خدمة اصطناعية فقط؛ لا تعادل تسجيل الدخول إلى Cloudflare Access أو اختبار متصفح مستخدم مسجّل. لا تشارك رموز المصادقة أو لقطات الشاشة التي تكشفها.
