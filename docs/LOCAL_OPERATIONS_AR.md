# مركز عمليات KALI-OSINT-STAR المحلي

تمت إضافة صفحة «مركز العمليات» إلى React وFastAPI آمنة تعمل على جهاز Kali المحلي. هذه ليست واجهة Shell ولا تعمل على خدمات عامة. ثلاث وظائف محددة مسبقاً فقط: system_inventory (نسخة النظام)، tool_inventory (جرد البرامج المثبتة بدون تشغيلها)، lab_port_check (اتصال TCP واحد في شبكة IPv4 خاصة محددة ضمن المختبر، على المنافذ 22 و80 و443 و8000 و8080 و8443).

سير العمل: إنشاء طلب → انتظار الموافقة → إدخال رمز اعتماد مستقل وسبب مكتوب وتأكيد نطاق الاختبار → تشغيل صريح → نتيجة محفوظة وسجل تدقيق SQLite. لا توجد نتائج تلقائية ولا محاكاة لعمليات لم تحدث.

## تجهيز أسرار محلية

افتح الطرفية وشغّل الأوامر التالية، دون نشر الأسرار في المستودع:

    git clone https://github.com/abdulstarzeki001-sketch/KALI-OSINT-STAR.git
    cd KALI-OSINT-STAR
    bash scripts/init-local.sh

الملف .env.local محلي فقط، ومحمي بأذونات 0600. لا ترفعه إلى GitHub. اترك STAR_LAB_CIDRS فارغاً لتعطيل الاتصالات الشبكية. إذا أنشأت شبكة Host-Only مملوكة لك فعلياً، يمكن تعيين STAR_LAB_CIDRS=192.168.56.0/24 بداخل .env.local.

## الطرفية الأولى — API

    set -a
    source .env.local
    set +a
    cd services/api
    python3 -m venv .venv
    source .venv/bin/activate
    python -m pip install -r requirements-dev.txt
    uvicorn app.main:app --host 127.0.0.1 --port 8000

## الطرفية الثانية — الواجهة

    cd KALI-OSINT-STAR/apps/web
    npm install
    npm run dev

افتح http://127.0.0.1:5173 ثم افتح «مركز العمليات». أدخل STAR_OPERATOR_TOKEN من ملف .env.local داخل واجهة الاتصال؛ عند اعتماد مهمة أدخل STAR_APPROVAL_TOKEN. الرموز تبقى في الذاكرة أثناء عرض الصفحة فقط، ولا تستخدم localStorage.

يمكن فحص الحالة دون أسرار عبر:
    curl -fsS http://127.0.0.1:8000/api/v1/health
    curl -fsS http://127.0.0.1:8000/api/v1/capabilities

## حدود الأمان

- API مربوطة بـ 127.0.0.1 فقط. لا تغير إلى 0.0.0.0 ولا تنشرها على الإنترنت.
- لا يوجد تنفيذ Shell أو C2 أو جمع كلمات مرور أو استهداف نطاقات عامة.
- كل هدف شبكة يجب أن يكون IPv4 ضمن CIDR خاص مسموح صراحة، مع إعادة التحقق قبل التشغيل، ودون DNS.
- سجل SQLite محلي وليس غير قابل للعبث. الرمزان المستقلان ليسا بديلاً لموافقة شخصين.
- Cloudflare Pages للواجهة العامة فقط؛ الواجهة المنشورة لا يمكنها الاتصال الآمن مباشرة بكالي. الاتصال البعيد يحتاج بناء بوابة هوية/TLS/Zero Trust مستقلة لم ننفذها.
- لا تُدرج أسراراً في متغيرات VITE_، ولا في ملف README أو commit أو لقطة شاشة.
