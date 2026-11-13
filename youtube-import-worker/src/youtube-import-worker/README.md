# خدمة استيراد حلقات YouTube لـ TeleMovies

هذه خدمة Cloudflare Worker مستقلة حتى يبقى مفتاح YouTube API على الخادم. لا تضع مفتاح YouTube أو رمز حماية Worker في `panel-wk77.html` أو `films.json` أو `vars` أو أي ملف في المستودع.

## النشر الأول

1. أنشئ API Key في Google Cloud Console بعد تفعيل **YouTube Data API v3**. قيّد المفتاح على YouTube Data API v3 فقط.
2. ثبّت Node.js، ثم افتح الطرفية داخل هذا المجلد وسجّل الدخول إلى Cloudflare وانشر Worker:

   ```bash
   npx wrangler@latest login
   npx wrangler@latest deploy
   ```

3. أضف مفتاح YouTube تفاعلياً إلى Cloudflare Secret. أدخل القيمة عندما يطلبها Wrangler، ولا تلصقها في ملفات المشروع:

   ```bash
   npx wrangler@latest secret put YOUTUBE_API_KEY
   ```

4. أنشئ رمز حماية عشوائياً طويلاً (مثلاً بالأمر التالي)، ثم أضفه كـ Secret مستقل:

   ```bash
   openssl rand -hex 32
   npx wrangler@latest secret put YOUTUBE_IMPORT_TOKEN
   ```

   خزّن قيمة الرمز في مدير كلمات مرورك، ثم أدخلها في حقل **رمز الاستيراد الخاص** في لوحة TeleMovies عند الاستيراد. يحتفظ المتصفح بها في `sessionStorage` للجلسة الحالية فقط؛ لا تُرفع مع `films.json` ولا تظهر قيمة المفتاح للمتصفح. إذا فقدت الرمز، أنشئ واحداً جديداً وغيّر Cloudflare Secret وأدخل القيمة الجديدة في اللوحة.

سيقرأ Worker السرّين من `env.YOUTUBE_API_KEY` و`env.YOUTUBE_IMPORT_TOKEN`. إذا غاب أحدهما، يرفض الاستيراد برسالة إعداد واضحة.

يمكن إضافة السرّين بدلاً من Wrangler من لوحة Cloudflare: **Workers & Pages → telemovies-youtube-import → Settings → Variables and Secrets → Add → Secret**. أضف الاسمين حرفياً `YOUTUBE_API_KEY` و`YOUTUBE_IMPORT_TOKEN` ثم اضغط **Deploy**.

5. عنوان Worker الافتراضي هو:

   ```text
   https://telemovies-youtube-import.wk7.workers.dev/api/youtube-playlist
   ```

   إذا أعطاك Cloudflare عنواناً مختلفاً أو غيّرت اسم Worker، حدّث حقل **عنوان خدمة Cloudflare Worker** داخل واجهة الاستيراد في لوحة TeleMovies. عدّل `ALLOWED_ORIGIN` في `wrangler.jsonc` إذا تغيّر عنوان الموقع.

## الاختبار

```bash
npm test
```

الاختبارات تستخدم ردود YouTube اصطناعية متعددة الصفحات، ولا تحتاج إلى مفاتيح حقيقية. لاختبار اتصال Google الحقيقي، انشر Worker وأضف السرّين أولاً ثم استورد قائمة عامة من لوحة الإدارة.

## حدود الحماية

يقبل Worker الطلبات من أصل الموقع المحدد فقط، ويتطلب رمز Bearer محفوظاً كـ Secret، ويطبق حدّاً تقريبياً قدره 20 طلباً في الدقيقة لكل عنوان IP في كل موقع Cloudflare. الحد التقريبي ليس حماية عالمية صارمة؛ لذلك قيّد مفتاح Google على YouTube Data API v3 وراقب الحصة في Google Cloud. واجهة اللوحة لا تستقبل مفتاح YouTube.
