# STAR AI OS — مخطط المراحل الست

التاريخ: 2026-11-23

## 1. لوحة STAR AI OS
تم إنشاء صفحة #os تعرض خدمات المشروع الست وتستعلم عن Agent Health وCloud AI Catalog عبر نفس الموقع وCloudflare Access. حالات 401 و403 تعني مصادقة مطلوبة وليست اتصالاً ناجحاً.

## 2. وكيل البرمجة
الصفحة #runtime تعرض مهام Railway، طلبات الموافقة، حالة النموذج، وإمكانية إدخال رقم مهمة موجودة ضمن جلسة المالك المخوّلة. مهام Minis بمفتاح منفصل قد تحتاج لوحة Railway الخاصة بالمالك.

## 3. ترمنال Linux
صفحة #terminal توفر مفاتيح الهاتف Tab والأسهم وEsc وأوامر مقترحة تعبئ حقل النص فقط. لا تشغيل تلقائي، والتشغيل داخل الحاوية وليس جهاز المستخدم.

## 4. الأمن السيبراني
صفحة #cyber تعرض نتائج Deep Audit الحقيقية مع بحث بالمسار/CWE وفلتر الخطورة. تصدّر JSON وSARIF وMarkdown. تقرير Markdown يحفظ المؤشرات دون الأكواد والسجلات الخام.

## 5. النماذج المتعددة
الخيار star-ai-auto في صفحة #agent مخصص للدردشة فقط. يحاول qwen3-coder-vast أولاً ثم llama-cloudflare عند فشل المزود قبل بدء البث. يجب على المستخدم اختياره صراحةً؛ قد ينتقل نص المحادثة إلى Cloudflare عند الفشل.

## 6. اختبارات CI ومراقبة النشر
يعمل GitHub Actions CI على كل PR وعلى main، مع مراجعة TypeScript وVite والخدمات والاختبارات.
ملف .github/workflows/star-ai-production-health.yml ينفذ فحصاً كل 6 ساعات أو يدوياً. يفحص نقاط الصحة العامة فقط، ويطلب نجاح اختبار استدلال الوكيل نفسه ولا يرسل مفاتيح API.
يمكن تشغيل الفحص داخل بيئة موثوقة عبر: node scripts/check-star-health.mjs

## روابط
- OS: https://kali-osint-star.pages.dev/#os
- Chat: https://kali-osint-star.pages.dev/#agent
- Agent: https://kali-osint-star.pages.dev/#runtime
- Terminal: https://kali-osint-star.pages.dev/#terminal
- Cyber: https://kali-osint-star.pages.dev/#cyber
- CI: https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR/actions

## حدود التحقق
- نجاح CI ونشر Pages لا يعني نجاح تجربة Minis على هاتف المستخدم؛ يجب اختبارها داخل التطبيق.
- لا يوجد تنفيذ للأوامر أو نشر GitHub دون حدود موافقة ومراجعة Pull Request.
- التشغيل التلقائي للنماذج يتطلب توفر واحد من المزودين؛ لا يوجد ضمان لوجود GPU.
- الفحوصات الأمنية النشطة تتطلب تفويضاً صريحاً ونطاقاً محدداً، ولا تستهدف شبكات عامة من الواجهة.
- لا تحفظ أي مفاتيح في المستودع أو متغيرات VITE_* ولا ترسل سجلات حساسة لجهة بديلة دون مراجعة.

## خطة التراجع
إذا فشل إصدار، ارجع إلى آخر commit ناجح وراجع سجل GitHub Actions وCloudflare Pages. لا تغيّر أسرار الخادم استجابةً لخطاء عرض دون تشخيص المصادقة.