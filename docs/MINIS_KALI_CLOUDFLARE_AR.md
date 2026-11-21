# ربط KALI-OSINT-STAR مع Minis — Cloudflare

## البنية الحالية
KALI-OSINT-STAR uses Cloudflare Workers AI:
Pages /api/ai/chat → Cloudflare Access → STAR_AI Service Binding → kali-osint-star-ai-core Worker → Llama 3.3 70B.

مسار Pages الحالي ليس OpenAI-compatible، ومحمِي بتسجيل دخول Cloudflare Access. لا يمكن استخدامه مباشرة داخل Minis.

## ماذا أضفنا؟
ملف cloudflare/minis-bridge/worker.mjs هو جسر API مستقل بصيغة OpenAI، يتصل بـWorker الخاص عن طريق Service Binding. **لا تفتح Worker الأساسي للعامة.**

## خطوات النشر المطلوبة
1. أنشئ Worker مستقل باسم kali-osint-star-minis-bridge. لا تغيّر Worker الأصلي أو سياسة حماية موقع Pages.
2. استعمل cloudflare/minis-bridge/worker.mjs كملف الدخول للجسر الجديد.
3. أضف Service Binding باسم STAR_AI موجّه إلى Worker الخاص kali-osint-star-ai-core.
4. أضف Secret باسم MINIS_API_KEY؛ أنشئ قيمة عشوائية طويلة (32 حرفاً على الأقل) ولا تضعها في GitHub أو VITE_* أو لقطات الشاشة.
5. أضف Rate Limiting binding باسم MINIS_RATE_LIMITER، Namespace ID فريد مثل 1001، وعتبة 10 طلبات لكل 60 ثانية. الحد تقريبي في كل مركز Cloudflare ولا يضمن سقفاً عالمياً. الخدمة ترفض الاتصالات إذا غاب الـBinding.
6. فعّل رابط HTTPS عام للجسر المنفصل فقط. لا تفعّل workers.dev للـAI core الأصلي.
7. اختبر GET /v1/models بعد المصادقة، ثم محادثة POST /v1/chat/completions قبل ربط Minis. راقب حصة Workers AI والتكلفة.

## قيم Minis
- Provider: OpenAI / Compatible API
- Label: KALI OSINT STAR AI
- Credential: Secret MINIS_API_KEY الجديد، وليس مفتاح Railway أو GitHub.
- Custom API Base: HTTPS للجسر الجديد **بدون /v1**.
- Auto Append /v1: ON
- API Format: Chat Completions
- Model ID: star-ai-kali
- Display Name: STAR AI KALI
- Thinking, Image/Audio/Video input/output: OFF مبدئياً.
- Model Groups: أضف النموذج إلى المجموعة الرئيسية.

## حدود مهمة
- يدعم محادثات نصية فقط. الاستجابة هي OpenAI Chat Completions؛ SSE موجود لكن الرد يُولّد أولاً بالكامل، وليس token-by-token.
- ليس خادماً لتشغيل أوامر Kali تلقائياً؛ لا توجد Function tool calling عبر الجسر.
- تعليمات system/developer من التطبيق لا تلغي تعليمات المحرك الخاص.
- الذكاء هو Cloudflare Workers AI Llama 3.3 70B، وليس بوابة Railway أو GPU Qwen.
- لا يوجد ضمان أن النموذج بلا قيود؛ حصة المزوّد وسياساته ما تزال سارية.
- اجتياز CI ليس دليلاً على تشغيل الخدمة في حساب Cloudflare.

## اختبار الشيفرة
من apps/web نفذ npm run test:cloudflare.

احتفظ بالمفاتيح خارج المستودع. إذا انكشف مفتاح، قم بتدويره فوراً.
