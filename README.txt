TeleMovies — ترقية SEO + النشر التلقائي
=========================================
1) ارفع إلى جذر المستودع (استبدل القديم): admin.html, index.html  + أضف: build.js
2) في GitHub: Add file > Create new file، اكتب الاسم  .github/workflows/build.yml
   والصق محتوى ملف build.yml الموجود في هذه الحزمة، ثم Commit.
3) السطر SITE في build.js مضبوط على https://telemovies.wk7.workers.dev (غيّره عند ربط دومين خاص).
4) Actions > Build SEO pages > Run workflow (مرة واحدة). بعدها يعمل تلقائياً مع كل نشر.
   إن ظهر خطأ صلاحيات: Settings > Actions > General > Workflow permissions > Read and write.
5) كلمة مرور اللوحة: افتح /admin.html لأول مرة، اختر كلمة مرور، انسخ السطر الذي يظهر
   واستبدل به السطر const ADMIN_HASH=""; داخل admin.html على GitHub.
6) توكن النشر: GitHub > Settings > Developer settings > Fine-grained tokens > Generate
   - Repository access: Only select repositories (مستودع الموقع فقط)
   - Permissions > Contents: Read and write
   - ضع مدة انتهاء مناسبة، والصق التوكن في قسم «النشر إلى GitHub» داخل اللوحة.
7) Google Search Console: أضف الدومين وأرسل https://دومينك/sitemap.xml
8) TMDB: أنشئ حساباً على themoviedb.org > Settings > API، وانسخ «API Read Access Token».
   الصقه في اللوحة داخل «جلب البيانات من TMDB» (يُحفظ على جهازك فقط). الاسم يأتي بالإنجليزية والوصف بالعربية.
9) مطلوب من TMDB: إبقاء جملة الإسناد (This product uses the TMDB API...) في أسفل الموقع. الاستخدام التجاري يحتاج ترخيصاً منهم.

==== تحديث v3 ====
ارفع كل الملفات الموجودة في هذه الحزمة إلى جذر المستودع (استبدل القديم).
الملفات الجديدة: site.css, app.js, sw.js, manifest.webmanifest, icon-192.png, icon-512.png,
watch.html, dmca.html, privacy.html, contact.html
- إذا لم تعمل صفحات الأفلام بعد: افتح GitHub > تبويب Actions. إن لم يظهر تشغيل لـ Build SEO pages،
  فملف .github/workflows/build.yml غير موجود أو في مكان خاطئ. وإن ظهر X أحمر فافتحه وأرسل لي نص الخطأ.
- حتى يعمل البناء، يفتح الموقع الأفلام تلقائياً عبر صفحة /watch (احتياطية).
