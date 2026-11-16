# KALI-OSINT-STAR

**منصة تدريب الأمن السيبراني وإدارة المختبرات** — واجهة عربية RTL باستخدام React + Vite، مع GSAP للحركات وLenis للتمرير السلس، وخادم FastAPI اختياري للقراءة فقط.

## الحالة الحالية (16 نوفمبر 2026)

- ✅ الواجهة تحتوي على **15 أداة** و**10 منصات تدريب**، مع التنقل والبحث والمفضلة وإضافة المختبرات وتتبّع التقدم وتصدير تقارير Markdown.
- ✅ **GitHub Actions** يشغّل اختبارات TypeScript وVite Build واختبارات FastAPI/Pytest.
- ✅ يوجد **index.html** في الجذر كنسخة HTML مستقلة للمعاينة.
- ⚠️ حفظ البيانات **محلي في المتصفح**. لا يوجد تسجيل دخول أو قاعدة بيانات أو تنفيذ Shell أو فحص فعلي لأهداف.
- ⚠️ لم يتم تفعيل نشر GitHub Pages أو Cloudflare Pages تلقائياً؛ تشغيل CI لا يعني نشر الموقع.

## تشغيل واجهة React في Kali Linux

المتطلبات: Node.js 22 وnpm وGit.

```bash
git clone https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR.git
cd KALI-OSINT-STAR/apps/web
npm install
npm run typecheck
npm run build
npm run dev
```

افتح العنوان المحلي: http://127.0.0.1:5173

## تشغيل API المحلية (Terminal ثانٍ)

```bash
cd ~/KALI-OSINT-STAR/services/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

للتحقق:

```bash
curl http://127.0.0.1:8000/api/v1/health
python -m pytest -q
```

تُمرَّر طلبات `/api` من Vite إلى FastAPI أثناء التطوير فقط.

## هيكل المشروع

```text
index.html                    معاينة مستقلة HTML
apps/web/                     واجهة React/Vite مع GSAP وLenis
services/api/                 FastAPI آمنة للقراءة فقط
services/api/tests/           اختبارات API
.github/workflows/ci.yml      Build وTypecheck وPytest
docs/SCOPES_AR.md             قواعد نطاق التدريب
docs/ARCHITECTURE.md          البنية العامة
SECURITY.md                   سياسة أمنية
```

## GSAP / Lenis / React Bits / 21st.dev

- **GSAP + @gsap/react:** حركات دخول العناصر والانتقالات.
- **Lenis:** التمرير السلس.
- **React Bits:** مصدر إلهام لتأثيرات الواجهة؛ لم نثبت المكتبة كاملة.
- **21st.dev:** مصدر تصميم ومكوّنات تطوير، وليس خدمة تشغيل في المتصفح.

## قواعد الاختبار

اختبر فقط الأهداف الصريحة التي تحددها لك مختبرات Hack The Box وTryHackMe وPortSwigger وغيرها، أو الآلات الافتراضية التي تملكها. خوادم المواقع الرئيسية لهذه المنصات ليست ضمن نطاق التدريب تلقائياً.

**المشروع في هذه المرحلة منصة تدريبية بواجهة قابلة للتشغيل، وليس نظام اختراق عن بُعد.** نضيف أي تكامل مستقبلي مع Kali عبر API مصادَق عليها، وقائمة سماح للأهداف، وعزل للشبكة، وسجلات تدقيق.
