# راهنمای انتشار پروژه در GitHub

این پوشه به‌عنوان ریشه‌ی Repository آماده شده است. پوشه‌ی `runtime/` و فایل EXE
بزرگ عمداً داخل سورس قرار نگرفته‌اند؛ GitHub فایل‌های بزرگ‌تر از 100 MiB را در
Git معمولی مسدود می‌کند و برای فایل‌های باینری توزیعی استفاده از Releases مناسب‌تر است.

## 1) ساخت Repository

در GitHub یک Repository جدید با نام پیشنهادی `pomodoro-hover-timer` بسازید و آن
را Public کنید. هنگام ساخت، README/License/.gitignore جدید از GitHub اضافه نکنید،
چون این فایل‌ها از قبل در این بسته آماده شده‌اند.

## 2) Push کردن سورس

در همین پوشه اجرا کنید:

```bash
git init
git add .
git commit -m "Open-source release v1.6.4"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/pomodoro-hover-timer.git
git push -u origin main
```

`YOUR-USERNAME` را با نام کاربری GitHub خودتان عوض کنید.

## 3) تنظیمات پیشنهادی Repository

بعد از Push:

- در **Settings → General** توضیح کوتاه پروژه و Topics را اضافه کنید.
- در **Settings → Security** قابلیت Private vulnerability reporting را فعال کنید.
- در **Settings → Branches / Rulesets** برای شاخه `main` حداقل Pull Request و
  status check مربوط به CI را فعال کنید.
- اگر قصد تعامل با کاربران را دارید، **Discussions** را فعال کنید.
- Community Standards را از **Insights → Community Standards** بررسی کنید.

فایل‌های README، LICENSE، CONTRIBUTING، CODE_OF_CONDUCT، SECURITY، SUPPORT و
Issue/PR templates در این بسته قرار داده شده‌اند.

## 4) ساخت اولین Release

Tag نسخه را Push کنید:

```bash
git tag v1.6.4
git push origin v1.6.4
```

Workflow فایل `.github/workflows/windows-release.yml` روی runner ویندوز اجرا می‌شود،
Electron رسمی را دانلود می‌کند، ZIP پرتابل می‌سازد و آن را همراه checksum در
GitHub Release قرار می‌دهد.

## 5) قبل از عمومی کردن

- یک بار کد و مخصوصاً اطلاعات تماس عمومی داخل UI را مرور کنید.
- مالکیت/مجوز تمام آیکن‌ها و assetهای تصویری را تأیید کنید.
- در صورت انتشار گسترده، برای کاهش هشدار SmartScreen امضای دیجیتال Windows را
  در نظر بگیرید.
- نسخهٔ Electron از package.json خوانده می‌شود و باید با lockfile یکسان باشد؛ ارتقا به نسخهٔ
  جدیدتر باید جداگانه تست شود.
