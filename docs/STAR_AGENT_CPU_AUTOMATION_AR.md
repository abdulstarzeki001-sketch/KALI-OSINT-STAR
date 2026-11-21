# STAR AI CPU Agent — وكيل تنفيذي فعلي

هذا المكوّن **مختلف عن دردشة STAR AI القديمة**. وهو ينفّذ مهام برمجية ومتصفح عبر نموذج Qwen مفتوح الأوزان على CPU، دون إرسال بيانات الاستدلال إلى OpenAI أو Cloudflare. يعتمد على واجهة OpenAI-compatible الخاصة بخادم llama.cpp الموجود في deploy/cpu-ai.

## ما الذي يعمل في الكود؟
- مدير مهام متعدد الخطوات: يرسل المهمة إلى النموذج، يقرأ tool_calls، ينفّذ الأدوات ثم يعيد النتائج إلى النموذج حتى يكتب إجابة مبنية على التنفيذ.
- أدوات: list_files وread_file وsearch_text وgit_status وrun_command وreplace_text وcreate_file وbrowser_open وbrowser_text وbrowser_screenshot وbrowser_click وbrowser_fill.
- واجهة عربية على / داخل خدمة Agent: إدخال مهمة، عرض سجل التنفيذ، معاينة خطوة الموافقة، قبول أو رفض خطوة واحدة وعرض لقطة صفحة.
- SQLite سجل دائم محلي للمهمة والنتائج المنقّحة؛ المهام التي انقطع تنفيذها بعد إعادة التشغيل تُعلَّم interrupted ولا تُعاد تلقائياً.
- API خاص: /api/tasks و/api/tasks/{id} و/api/tasks/{id}/decide. والـMCP على /mcp لأداتي star_agent_submit وstar_agent_status فقط.
- الموافقة **ليست** ضمن أدوات MCP المعروضة للنموذج حتى لا يستطيع الموافقة على إجراءاته بنفسه.

## الصلاحيات وحدود الأمان
1. جميع الملفات داخل STAR_AGENT_WORKSPACE فقط. لا قراءة لأسماء ملفات الاعتماد المعتادة أو ملفات مفاتيح. لا تنفيذ shell من نص النموذج.
2. أوامر قراءة محددة تعمل تلقائياً: pwd وls وgit status/diff/log بأشكال محددة. أوامر اختبار برمجية محددة، مثل npm test وpython3 -m pytest، تحتاج موافقة بشرية.
3. تعديل ملف أو إنشاؤه يحتاج موافقة. لا تنفيذ git push ولا git clone ولا npm install ولا أوامر اختراق أو مسح شبكي آلي.
4. المتصفح يقبل HTTPS فقط وعلى النطاقات الموجودة في STAR_AGENT_BROWSER_HOSTS بالضبط. التنقل والقراءة تلقائيان بعد تحديد النطاق؛ النقر والتعبئة بموافقة. ممنوع تعبئة حقول password آلياً.
5. يستخدم Playwright Chromium في سياق جديد دون جلسة المتصفح الشخصية. يرفض الخادم الوصول إلى عناوين IP الخاصة والعناوين المجهولة. للحد الأقصى من العزل، امنع وجهات الشبكات الداخلية في جدار حماية الحاوية/الشبكة.
6. الواجهة والخدمات محميتان بمفتاح STAR_AGENT_API_KEY منفصل عن STAR_CPU_API_KEY. لا ترفع المفاتيح للمستودع ولا تضعها في واجهة عامة.
7. لا يفتح كالي الرئيسي أو STAR-ShellFish للعامة؛ جميع عمليات الوكيل داخل الحاوية ومسار العمل الموصول /workspace.

## التجهيز على VPS لديك
المتطلبات: Docker Engine + Docker Compose، خادم مناسب للنموذج + المتصفح؛ **12–16GB RAM و4–8 vCPU** أفضل من 8GB إذا تريد استدلال CPU ومتصفح في وقت واحد.

داخل جذر مستودع KALI-OSINT-STAR:

```bash
cd deploy/cpu-ai
cp .env.example .env
python3 - <<'PY'
from pathlib import Path
import secrets
p=Path(".env")
p.write_text(
  "STAR_CPU_API_KEY="+secrets.token_urlsafe(48)+"\n"+
  "STAR_AGENT_API_KEY="+secrets.token_urlsafe(48)+"\n"+
  "STAR_AGENT_BROWSER_HOSTS=example.com\n"
)
p.chmod(0o600)
print("Saved two separate secret keys in .env (not printed)")
PY
mkdir -p workspace
docker compose -f compose.yaml -f compose.agent.yaml up -d --build
```

**تغيير مهم:** عدّل STAR_AGENT_BROWSER_HOSTS إلى نطاقاتك الحقيقية المصرح بها (مثلاً نطاق واجهة مشروعك) قبل تشغيل مهام المتصفح. لا تستخدم نطاقات حكومية أو خوادم ليس لديك تفويض عليها.

واجهة Agent محلية افتراضياً على http://127.0.0.1:8787
والنموذج على http://127.0.0.1:8080

لا تفتح المنفذين للعامة؛ للوصول من الآيفون استخدم Cloudflare Tunnel مع حماية إضافية أو VPN إلى خادمك.

## ربط Minis
- النموذج داخل Minis يبقى Provider OpenAI-compatible الخاص بخادم Qwen CPU.
- أضف MCP Server منفصل بالعنوان HTTPS الآمن لمسار /mcp، مع Authorization: Bearer [STAR_AGENT_API_KEY].
- أدوات MCP: star_agent_submit يرسل مهمة، star_agent_status يعرض النتائج. عند طلب موافقة، افتح لوحة Agent على HTTPS وأكد الخطوة بنفسك.
- لا تختبر الربط في Minis قبل توفر عنوان HTTPS موثوق للخادم واتصال النموذج الفعلي.

## قيود تقنية غير مخفية
- جودة استدعاء الأدوات من Qwen3.5-4B ليست مضمونة في كل مهمة. llama.cpp يحتاج --jinja ومطالبات قصيرة.
- النموذج على CPU أبطأ من GPU ويعمل بميزانية 10 دورات استدلال في المهمة الواحدة.
- Playwright يحتاج Chromium وتعريفات النظام الموجودة بصورة Docker. بعض المواقع معقدة أو تحتاج جلسة دخول يدوية.
- تشغيل النموذج والمتصفح على VPS أو Railway **لم يُتحقق بعد**؛ اختبارات CI تستخدم نموذجاً وهمياً يختبر سير المهام، والموافقات ومسارات API دون ادعاء استدلال حقيقي.
- لا يتحكم الوكيل تلقائياً بتطبيقات آيفونك، جلسات Safari الخاصة، أو حسابات خارجية غير مصرح بها. لا يوجد تنفيذ غير مقيّد، ولا يوجد تحكم بترمنال STAR-ShellFish الحالي.

## الاختبارات
`python3 -m pytest -q services/agent/tests` بعد تثبيت services/agent/requirements.txt وpytest وpytest-asyncio.
