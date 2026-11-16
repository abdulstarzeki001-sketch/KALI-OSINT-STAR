# KALI-OSINT-STAR

**Cybersecurity training dashboard — React/Vite + FastAPI + GitHub Actions**

واجهة تدريب عربية RTL مبنية من ملفات KALI OSINT STAR الموجودة فعلياً. تحتوي على 15 أداة تعليمية، عشر منصات تدريب، إدارة محلية للتقدم والمختبرات، وتقارير محلية. **هذا ليس نظام اختراق عامل** ولا ينفذ فحصاً على أهداف أو يدير Shell عن بعد.

## هيكل المستودع

```text
apps/web/                    React 19 + TypeScript + Vite
services/api/                FastAPI read-only starter API
services/api/tests/          Pytest smoke tests
.github/workflows/ci.yml     Frontend typecheck/build + backend tests
docs/                        Arabic user guide, scope policy, visual preview
SECURITY.md                  Responsible lab scope and secret-handling rules
```

## 1) تشغيل واجهة React على Kali Linux

المتطلبات: Node.js 22 أو أحدث متوافق مع Vite، وnpm.

```bash
cd apps/web
npm install
npm run dev
```

افتح http://127.0.0.1:5173 . جرّب `npm run typecheck` ثم `npm run build`.

## 2) تشغيل FastAPI (Terminal ثانٍ)

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

تحقّق:

```bash
curl http://127.0.0.1:8000/api/v1/health
python -m pytest -q
```

الواجهة تستخدم Vite proxy إلى `/api` أثناء التطوير. حقل حالة الاتصال في الواجهة يعكس اتصال API فقط، ولا يدل على توفر أدوات اختراق أو تكامل حقيقي مع Kali.

## 3) GitHub Actions

تحتوي `ci.yml` على مسارين: React/TypeScript/Vite وFastAPI/Pytest. تبدأ اختبارات CI تلقائياً مع Push أو Pull Request إلى `main` بعد رفع الملفات.

## 4) الواجهة والتصميم

- GSAP + `@gsap/react`: حركات دخول عناصر المحتوى.
- Lenis: smooth scrolling مع دعم reduced motion.
- React Bits: مكوّن محلي مستلهم من ShinyText، **ليس استيراداً للمكتبة بالكامل**.
- 21st.dev: مصدر إلهام وتوجيه مكونات، **وليس dependency مثبتة**.

## 5) نطاق الاستخدام

التدريب فقط على الآلات الافتراضية والمختبرات التي خصصتها المنصات لك. لا تُعتبر المواقع العامة مثل `hackthebox.com` أو `portswigger.net` أهدافاً مصرحاً باختراقها. راجع `docs/SCOPES_AR.md`.

## 6) النشر المستقبلي

- Cloudflare Pages: Project root `apps/web`، build `npm run build`، output `dist`.
- لا تُنشر FastAPI تلقائياً مع Pages؛ تحتاج خدمة آمنة منفصلة.
- مفاتيح API والأسرار تُحفظ في خادم آمن، لا في React أو ملفات عامة.

## حالة التسليم

- Frontend: موجود فعلياً ومحوّل إلى `apps/web`.
- Backend: أنشئ هنا كخادم قراءة فقط، قابل للاختبار.
- CI: ملفات Actions موجودة؛ لا تعتبر الاختبارات ناجحة على GitHub حتى تُشغّل.
- نشر GitHub/Cloudflare: يتطلب إكمال إنشاء المستودع والرفع وإثبات نجاح الخطوات.

مزيد من التفاصيل في `docs/README_AR.md` و`docs/ARCHITECTURE.md` و`docs/CURRENT_VALIDATION.md`.