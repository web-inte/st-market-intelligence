عامل تحديث القطاعات

- Finnhub للسعر الحالي داخل الموقع.
- Massive Individual Aggregates للتاريخ والحجم والقوة.
- Supabase مخزن مشترك للموقع والجوال.

أثناء جلسة نيويورك:
- القطاعات وSPY كل 5 دقائق.
- شركات القطاعات كل 30 دقيقة.
- فاصل Massive الأدنى 13.8 ثانية.

تعبئة الشركات المفقودة محليًا:
python sector-worker/main.py --bootstrap-missing

تشغيل مستمر:
python sector-worker/main.py

Railway:
Root Directory: apps/web/sector-worker
لا يحتاج Public Domain.
المتغيرات: MASSIVE_API_KEY وSUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY.
