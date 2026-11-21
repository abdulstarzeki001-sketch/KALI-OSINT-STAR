# STAR AI VPS — شراء netcup ثم تثبيت Qwen CPU وAgent

## حالة هذا المسار
- خادم VPS لم يُشترَ بعد.
- سكربت التثبيت جاهز في deploy/cpu-ai/install-ubuntu.sh ويعمل على Ubuntu 24.04 LTS x86_64.
- لا يغيّر مشروع Railway incredible-mercy ولا STAR-ShellFish.
- لا يفتح منفذ نموذج/ترمنال للإنترنت.

## الخطوة 1: شراء خادم netcup
افتح https://www.netcup.com/en/server/vps
اختر VPS 2000 G12.5 (8 vCore / 16 GB RAM / 256 GB SSD)، وقارن السعر الشهري النهائي للعقد والضرائب، قبل الموافقة على الشراء.
السعر المعروض بتاريخ 2026-11-21 على الموقع يبدأ عند €26.92 شهرياً قبل ضريبة القيمة المضافة الألمانية (أو €30.96 مع 19% VAT) لعقد 12 شهراً، وقد يختلف عند الدفع من العراق.
استعمل صورة Ubuntu 24.04 LTS، نظام x86_64، ويفضّل تسجيل مفتاح SSH عام في إعدادات النظام بدلاً من كلمة مرور.
عقب الشراء احتفظ بعنوان IP العام، ولا تشارك كلمة سر root أو مفاتيحك الخاصة في المحادثة.

## الخطوة 2: أمر نشر السيرفر
من جلسة SSH آمنة على VPS الجديد:

```bash
git clone --depth 1 https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR.git
cd KALI-OSINT-STAR
bash -n deploy/cpu-ai/install-ubuntu.sh
sudo bash deploy/cpu-ai/install-ubuntu.sh
```

السكربت يُثبّت Docker Engine وDocker Compose plugin، ينشئ مفاتيح STAR_CPU_API_KEY وSTAR_AGENT_API_KEY تلقائياً داخل ملف .env بصلاحيات 0600 ولا يطبعها، وينزل نسخة من المشروع إلى workspace. يتأكد من RAM حوالي 16GB ومساحة حرة 20GB قبل التثبيت.

للتأكد:

```bash
cd /opt/kali-star-ai/app/deploy/cpu-ai
docker compose -f compose.yaml -f compose.agent.yaml ps
docker compose -f compose.yaml -f compose.agent.yaml logs --tail=50
```

أول إقلاع يحمّل وزن Qwen3.5-4B Q4_K_M إلى volume دائم وقد يحتاج بعض الوقت. للتحقق من الاستدلال محلياً فقط:

```bash
cd /opt/kali-star-ai/app/deploy/cpu-ai
bash scripts/check.sh
```

ملحوظة: لا نعتبر التشغيل ناجحاً قبل عودة JSON فعلي من /v1/chat/completions ونجاح مهمة قراءة ملف عبر STAR Agent.

## الخطوة 3: الوصول من الآيفون عبر شبكة خاصة
Tailscale يتيح HTTPS خاصاً بين هاتفك وخادمك دون فتح 8787 للعامة. يحتاج حساب Tailscale وتسجيل الجهازين بنفس الشبكة.

على VPS:

```bash
curl -fsSL https://tailscale.com/install.sh -o /tmp/install-tailscale.sh
less /tmp/install-tailscale.sh
sudo sh /tmp/install-tailscale.sh
sudo tailscale up
sudo tailscale serve --bg 8787
tailscale serve status
```

أكمل رابط تسجيل دخول Tailscale الذي يعرضه أمر up. لا تستخدم Funnel (عام). استخدم Serve فقط (خاص بالشبكة).

على iPhone/iPad: ثبّت تطبيق Tailscale، سجل بنفس الحساب، وفعّله. افتح رابط https://[device].[tailnet].ts.net الذي يظهر من أمر serve status. في لوحة STAR AI Agent أدخل STAR_AGENT_API_KEY الخاص بالخادم (احصل عليه مباشرة من جلسة SSH الآمنة).

لا تفتح tcp/8080 ولا tcp/8787 على لوحة netcup Firewall. المنافذ في Docker مربوطان بـ127.0.0.1 على المضيف.

## إدخال المشروع إلى الوكيل
نسخة ملفات المشروع داخل /opt/kali-star-ai/app/deploy/cpu-ai/workspace/KALI-OSINT-STAR.
يجب تعيين STAR_AGENT_BROWSER_HOSTS بالأسماء المعتمدة فقط في .env (مثلاً kali-osint-star.pages.dev) قبل مهام المتصفح، ثم:
`docker compose -f compose.yaml -f compose.agent.yaml up -d`.
الأوامر الاختبارية وتعديل الملفات داخل الحاوية تحتاج موافقة من لوحة Agent.

## التحكم بالتكلفة
تبدأ فوترة VPS من تفعيل مزود الاستضافة وقد يفرض عقداً؛ لا تعتمد على إطفاء VM لوقف رسوم الاشتراك. شغّل VPS فقط بعد مراجعة السعر النهائي والفترة والتجديد.

## الوضع الحالي
الملفات والنشر الآلي مُحضّرة، لكن لا يوجد عنوان IP لـVPS خاص بالمستخدم بعد. لم نجر اختبار Docker أو استدلال CPU على خادم مدفوع.
