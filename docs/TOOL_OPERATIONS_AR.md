# الأدوات الـ15 — Kali Local Tool Console

قسم مركز العمليات الآن يعرض **15 أداة** ويكشف حالة تثبيتها الحقيقية في PATH عند تشغيل FastAPI محلياً. لكل أداة فحص وجود لا ينفذ الأداة نفسها. بعض البرامج تدعم أمر Help ثابتاً (-h أو --help) بعد موافقة المشغّل وتفعيل ذلك صراحة.

**أمان**: Mythic / Sliver / Havoc / CALDERA / BloodHound / Rubeus / Mimikatz / Ghidra في وضع جرد وجود الملف فقط. لا فتح C2 ولا تنزيل بيانات اعتماد ولا أهداف شبكية من الواجهة. الأمر Help غير معزول بنظام حاويات، لذلك استخدم مستخدم Kali غير root وVM معزولة.

لإتاحة Help فقط، أضف STAR_ENABLE_TOOL_HELP=true في .env.local وأعد تشغيل خادم FastAPI. تبقى المساعدة اختيارية ومعطلة افتراضياً.

التسلسل: دخول برمز STAR_OPERATOR_TOKEN → اختيار أداة → طلب فحص → اعتماد برمز STAR_APPROVAL_TOKEN وسبب مكتوب → تشغيل → حفظ نتيجة في SQLite.

Endpoints المحمية: GET /api/v1/tooling/catalog، GET/POST /api/v1/tooling/jobs، POST /api/v1/tooling/jobs/{id}/approve، POST /api/v1/tooling/jobs/{id}/run، POST /api/v1/tooling/jobs/{id}/cancel.

API يجب أن تبقى على 127.0.0.1 ولا تُنشر للعامة. الواجهة العامة على Cloudflare ليست قناة اتصال آمنة مع Kali في هذا الإصدار. نجاح CI لا يعني أن أدوات Kali مثبتة في جهازك؛ شغّل الخادم محلياً لعرض نتائج حقيقية.
