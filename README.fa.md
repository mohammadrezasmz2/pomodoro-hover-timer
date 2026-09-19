# Pomodoro Timing

Pomodoro Timing یک نرم‌افزار دسکتاپ ویندوزی مبتنی بر Electron است که به‌صورت
لوکال کار می‌کند و تایمر پومودورو را با یادداشت روزانه، یادآور، Habit Tracker،
فهرست کارها، نمای هفتگی و آمار/تقویم ترکیب می‌کند.

## دانلود نسخهٔ ویندوز

**[دانلود نسخهٔ 1.6.4 برای Windows x64](https://github.com/mohammadrezasmz2/pomodoro-hover-timer/releases/download/v1.6.4/Pomodoro-Timing-1.6.4-Windows-x64.zip)**

[توضیحات انتشار](https://github.com/mohammadrezasmz2/pomodoro-hover-timer/releases/tag/v1.6.4) · [فایل checksum از نوع SHA-256](https://github.com/mohammadrezasmz2/pomodoro-hover-timer/releases/download/v1.6.4/Pomodoro-Timing-1.6.4-Windows-x64.zip.sha256)

۱. فایل ZIP پرتابل را دانلود کنید و **تمام محتویات آن** را در یک پوشه استخراج کنید.
۲. برای اجرای برنامه، `Run.bat` را باز کنید.
۳. اجرای `Install.bat` اختیاری است؛ میان‌بر دسکتاپ و اجرای خودکار همراه ویندوز را اضافه می‌کند.

نسخهٔ پرتابل Electron را همراه خود دارد و برای اجرای آن نصب Node.js یا npm لازم نیست.
فایل‌های **Source code** در صفحهٔ انتشار برای توسعه هستند.

## امکانات

- چند تایمر پومودورو با مدت، هدف، درصد پیشرفت و عنوان قابل ویرایش
- بازشدن با Hover در بالای وسط هر نمایشگر
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

- Node.js نسخهٔ 22.12 یا بالاتر (برای توسعه Node 24 پیشنهاد می‌شود)
- npm
- ویندوز برای تست کامل قابلیت‌های وابسته به Windows

```bash
npm ci
npm start
```

نسخهٔ Electron برابر `44.4.3` است. توسعه و ساخت ویندوز هر دو نسخه را از
package.json می‌خوانند و package-lock.json وابستگی‌ها را ثابت نگه می‌دارد.

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
- ساخت GitHub Release هنگام Push کردن Tag مثل `v1.6.4`
- Dependabot برای وابستگی Electron و GitHub Actions

## حریم خصوصی و داده‌ها

داده‌های برنامه به‌صورت محلی در پوشه `Pomodoro Timing` داخل Documents کاربر
ذخیره می‌شوند. اجرای برنامه به API سمت سرور یا حساب کاربری نیاز ندارد.

## مجوز

کد پروژه تحت مجوز [MIT](LICENSE) منتشر می‌شود. Attribution و مجوز بخش‌های
Third-party در [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) قرار دارد.

## ذخیره و رفتار تایمر

نسخهٔ جدید را در پوشهٔ تازه استخراج کنید. داده‌ها در Documents\Pomodoro Timing
می‌مانند؛ پیش از ارتقا یک کپی از این پوشه بگیرید. فایل اصلی با نوشتن در فایل موقت
جایگزین می‌شود و pomodoro-data.json.bak نسخهٔ معتبر قبلی را نگه می‌دارد.
Restart.bat ابتدا درخواست ذخیره و خروج عادی می‌دهد. در صورت شکست ذخیره، برنامه
باز می‌ماند و پیام خطا نشان می‌دهد.

تایمرِ در حال اجرا، زمان خواب سیستم و بسته‌بودن برنامه را هم حساب می‌کند.
برای کنارگذاشتن این زمان، تایمر را Pause کنید. مهلت پایان از ساعت سیستم استفاده
می‌کند؛ جلوکشیدن دستی ساعت ممکن است تایمر را زودتر تمام کند. عقب‌کشیدن ساعت
عدد باقی‌مانده را بیشتر نمی‌کند، ولی می‌تواند رسیدن به مهلت را عقب بیندازد.

```bash
npm run check
npm test
# در ویندوز، پس از npm ci:
npm run test:electron
```

آزمون رفتاری و اجرای خودکار Electron روی ویندوز در CI تعریف شده است. آزمون
دستی صدا، منوی Start، خواب و نمایشگرهای واقعی در [چک‌لیست تست](docs/TESTING.md)
آمده است. [راهنمای استفاده و پشتیبان‌گیری](docs/USER_GUIDE.fa.md) را نیز ببینید.
