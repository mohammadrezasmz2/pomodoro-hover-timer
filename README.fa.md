# Pomodoro Timing

Pomodoro Timing یک نرم‌افزار دسکتاپ ویندوزی مبتنی بر Electron است که به‌صورت
لوکال کار می‌کند و تایمر پومودورو را با یادداشت روزانه، یادآور، Habit Tracker،
فهرست کارها، نمای هفتگی و آمار/تقویم ترکیب می‌کند.

## امکانات

- چند تایمر پومودورو با مدت، هدف، درصد پیشرفت و عنوان قابل ویرایش
- میان‌بر سریع `Ctrl + Alt + P`
- اجرا در System Tray و قابلیت اجرای خودکار با ویندوز
- ذخیره‌ی یادداشت‌ها و داده‌ها به‌صورت محلی در Documents
- Habit Tracker و فهرست کارهای روزانه
- آمار هفتگی و نمای تقویم/Statistics
- سیستم Reminder
- رابط فارسی و انگلیسی
- پشتیبانی از نمایش تاریخ شمسی، میلادی و قمری
- تم روشن و تاریک
- بدون نیاز به حساب کاربری، سرور یا Backend

## سیستم‌عامل

نسخه‌ی فعلی و اسکریپت‌های Build برای **Windows x64** آماده شده‌اند. سورس اصلی
HTML/CSS/JavaScript + Electron است، اما بخشی از رفتار برنامه به PowerShell و
Windows وابسته است.

## اجرای سورس برای توسعه

نیازمندی‌ها:

- Node.js نسخه 20 یا بالاتر (برای توسعه Node 22 پیشنهاد می‌شود)
- npm
- ویندوز برای تست کامل قابلیت‌های وابسته به Windows

```bash
npm install
npm start
```

نسخه Electron روی `31.7.7` ثابت شده تا با نسخه‌ای که از فایل اصلی شما استخراج
شده یکسان باشد. قبل از ارتقا، بهتر است نسخه‌ی جدید Electron روی ویندوز تست شود.

## بررسی سورس

```bash
npm run check
```

این دستور Syntax فایل‌های JavaScript و وجود فایل‌های ضروری پروژه را بررسی می‌کند.

## ساخت ZIP پرتابل ویندوز

روی ویندوز:

```powershell
npm run build:windows
```

یا:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1
```

خروجی در پوشه `dist/` ساخته می‌شود و شامل فایل ZIP و checksum از نوع SHA-256 است.

## اتوماسیون GitHub

- CI برای بررسی Push و Pull Request
- CodeQL برای بررسی امنیتی JavaScript
- Build خودکار نسخه Windows
- ساخت GitHub Release هنگام Push کردن Tag مثل `v1.6.3`
- Dependabot برای وابستگی Electron و GitHub Actions

## حریم خصوصی و داده‌ها

داده‌های برنامه به‌صورت محلی در پوشه `Pomodoro Timing` داخل Documents کاربر
ذخیره می‌شوند. اجرای برنامه به API سمت سرور یا حساب کاربری نیاز ندارد.

## مجوز

کد پروژه تحت مجوز [MIT](LICENSE) منتشر می‌شود. Attribution و مجوز بخش‌های
Third-party در [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) قرار دارد.
