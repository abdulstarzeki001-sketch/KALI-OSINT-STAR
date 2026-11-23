# STAR AI — استعادة اتصال Qwen الخاص عبر Tailscale

## العطل المثبت في 23 نوفمبر 2026

أظهر سجل بدء تشغيل STAR-AI-Cyber-Gateway على Railway:
- `invalid key`
- `Tailscale enrollment failed; starting without Ollama`

السبب المثبت هو فشل تسجيل عقدة Tailscale في آخر تشغيل؛ لا يثبت ذلك حالة خادم GPU نفسه. بقي محرك Deep Audit والفحص السريع يعملان بدون LLM.

## الاستعادة الآمنة (بدون مشاركة مفاتيح في الدردشة)

1. افتح Tailscale Admin → Settings → Keys:
   https://login.tailscale.com/admin/settings/keys
2. أنشئ **Auth key** جديداً لنفس الـtailnet؛ اختر **Reusable** لأن الحاوية تعيد التسجيل عند النشر، و**Ephemeral** للحاويات، وأبقِ وسم الوصول (Tag) بصلاحيات أقل ما يمكن. إذا كانت موافقة الأجهزة مفعّلة، فعّل Pre-approved حسب السياسة.
3. افتح Railway → مشروع STAR AI → خدمة `STAR-AI-Cyber-Gateway` → **Variables**.
4. استبدل قيمة `TS_AUTHKEY` مباشرةً بداخل Railway فقط. لا تضعها في GitHub أو VITE_* أو نص المحادثة. **لا تغير** `STAR_TAILNET_OLLAMA_URL` إذا كان صحيحاً.
5. دع Railway يعيد نشر الخدمة، وراجع السجل: تأكد من اختفاء `invalid key` ومن أن نموذج `qwen3-coder-vast` يظهر مجدداً في قائمة النماذج المحمية.
6. تحقق من خدمة Ollama/GPU باستدلال صغير مصادَق عليه. **ظهور اسم Qwen في القائمة لا يثبت نجاح الاستدلال.**

## ما يعرضه الموقع

حالة `tailnet_status` تأتي من بدء تشغيل Railway وتظهر فقط بعد توثيق Cloudflare Access:

| الحالة | المعنى |
|---|---|
| `auth_failed` | فشل التسجيل، غالباً مفتاح غير صالح أو مسحوب |
| `missing_key` | `TS_AUTHKEY` مفقود |
| `enrolled` | تسجيل Tailscale نجح؛ حالة استدلال Ollama لم تُختبر |
| `not_configured` | لم يضبط رابط Ollama في Railway |
| `unknown` | الحالة غير متاحة من نسخة الخادم |

الفحص السريع وDeep Audit لا يحتاجان Ollama. استخدام نموذج Cloudflare Llama خيار منفصل يقرره المستخدم قبل إرسال الكود إليه.

مراجع: https://tailscale.com/docs/features/access-control/auth-keys و https://tailscale.com/docs/features/ephemeral-nodes
