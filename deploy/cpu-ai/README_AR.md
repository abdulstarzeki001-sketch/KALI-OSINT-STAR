# KALI STAR CPU AI — خادم مفتوح الأوزان على CPU

هذا المسار يحضّر نموذج **Qwen3.5-4B Q4_K_M** على محرك **llama.cpp** CPU بدون OpenAI/Cloudflare inference. النموذج الأصلي مرخّص **Apache-2.0**. واجهة HTTP متوافقة مع OpenAI Chat Completions، وModel ID هو `star-ai-cpu`.

## متطلبات
- Linux VPS مستقل (أو خدمة Railway جديدة) — مقترح 4 vCPU، 8 GB RAM، ومساحة وزن/كاش 5–10GB.
- حجم الوزن حوالي 2.8GB، والذاكرة التشغيلية تتجاوز حجم الملف.
- الاتصال الأول يحتاج الإنترنت لتحميل GGUF، مع استمرار حفظه في `/models`.
- CPU أبطأ بكثير من GPU، خصوصاً في تحليل المستودعات الطويلة.

## تجربة محلية / VPS خاص
بعد تثبيت Docker Engine وCompose plugin:

```bash
cd deploy/cpu-ai
cp .env.example .env
python3 - <<'PY'
import secrets
from pathlib import Path
p=Path('.env')
p.write_text('STAR_CPU_API_KEY='+secrets.token_urlsafe(48)+'\n')
p.chmod(0o600)
print('Generated secret inside .env (not printed)')
PY
docker compose up -d --build
sh scripts/check.sh
```

العنوان الافتراضي محلي فقط: `http://127.0.0.1:8080`. نمنع نشر المنفذ للإنترنت مباشرة. للوصول من الآيفون استخدم VPN/Cloudflare Tunnel مع HTTPS وإجراءات وصول، ولا تفتح منفذ ttyd أو API بدون كلمة سر.

## نشر Railway — لا تغيّر خدمة STAR-ShellFish
- أضف **خدمة جديدة** في مشروع `incredible-mercy` من مجلد `deploy/cpu-ai` أو Dockerfile.
- ضع `LLAMA_API_KEY` بمتغير سري عشوائي، و`LLAMA_CACHE=/models`.
- وصل Volume مستقل مركباً على `/models` بسعة لا تقل عن 4GB؛ حساب Hobby يدعم 5GB كحد افتراضي.
- حدد 4 vCPU / 8GB RAM، وTarget Port 8080، وراقب المصروفات قبل تشغيل 24/7.
- عتبة التكلفة: حسب أسعار Railway الحالية RAM $10 لكل GB شهرياً عند استمرار استخدامه، والـCPU يُحاسب بشكل إضافي حسب الاستهلاك. لا ننشر هذا تلقائياً دون موافقتك على التكلفة.
- بعد تشغيله اختبر `/health` (فحص عام) و`/v1/models` و`/v1/chat/completions` باستخدام API Key.

## إعداد Minis
- Provider: OpenAI / Compatible API
- Custom API Base: عنوان HTTPS للخدمة الجديدة **بدون /v1**
- Auto Append /v1 = ON
- API Format: Chat Completions
- Credential: قيمة `LLAMA_API_KEY` للخادم الجديد
- Model ID: `star-ai-cpu`
- Thinking/Image/PDF/Audio/Video = OFF مبدئياً
- أضف النموذج للمجموعة الأساسية قبل بدء المحادثة

## نطاق استخدام الأمن السيبراني
استخدم النموذج لفحص الأكواد وتقارير Nmap/Nuclei ونتائج الفحص المصرّح بها، وتحليل الثغرات ومراجعة التهيئة. النموذج **ليس shell** ولا يملك صلاحية تنفيذ أوامر تلقائياً. لأي أدوات تنفيذية ابنِ وسيطاً منفصلاً بموافقة بشرية وAllowlist للأهداف وتسجيل تدقيق.

## حالة الاختبار
الـCompose وملف Shell تم فحص تركيبهما محلياً؛ **تشغيل Docker وتحميل الوزن والاستدلال الفعلي لم تُختبر** في هذه البيئة، ولم يتم شراء أو بدء خدمة CPU على Railway. هذه ملفات تشغيل جاهزة للتجربة، وليست إعلاناً عن خادم يعمل.
