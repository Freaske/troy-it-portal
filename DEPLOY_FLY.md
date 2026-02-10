# Deploy len Fly.io (co gui ma xac minh bang Gmail)

Huong dan nay da khop voi code hien tai cua project (Next.js + Prisma SQLite + resources + upload avatar).

## 1. Cai Fly CLI tren Mac

```bash
brew install flyctl
fly auth login
```

## 2. Chuan bi data local de image mang len Fly

Trong project:

```bash
cd /Users/harrieum/Desktop/tkb-portal
mkdir -p data/catalog data/resources
cp /Users/harrieum/Downloads/Catalog.csv data/catalog/Catalog.csv
rsync -avh "/Users/harrieum/Downloads/Troy University Resources/" data/resources/
```

Ghi chu:
- Luc deploy lan dau, container se tu copy `data/catalog` va `prisma/dev.db` vao volume `/data`.
- Upload avatar giang vien se duoc luu persistent trong volume `/data/uploads/lecturers`.

## 3. Tao app Fly + volume

Sua `fly.toml`:
- doi `app = "tkb-portal"` thanh ten unique cua ban, vi du `app = "tkb-portal-k69"`.

Chay:

```bash
fly apps create tkb-portal-k69
fly volumes create tkb_data --region sin --size 10 --yes
```

Neu ban doi region khac trong `fly.toml`, tao volume cung region do.

## 4. Cau hinh secrets (quan trong)

Tao `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Set secrets cho Fly (dung Gmail `ctt.troyit.k69@gmail.com`):

```bash
fly secrets set \
  AUTH_SECRET="<day-la-auth-secret-cua-ban>" \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="465" \
  SMTP_SECURE="true" \
  SMTP_USER="ctt.troyit.k69@gmail.com" \
  SMTP_PASS="<gmail-app-password-16-ky-tu>" \
  SMTP_FROM_EMAIL="HUST x Troy IT Portal <ctt.troyit.k69@gmail.com>"
```

Bat buoc voi Gmail:
- Gmail account phai bat `2-Step Verification`.
- Tao `App Password` trong Google Account Security.
- `SMTP_PASS` la App Password (khong phai mat khau Gmail thuong).

## 5. Deploy

```bash
fly deploy
```

Lay URL:

```bash
fly status
```

## 6. Check nhanh sau deploy

```bash
fly logs
```

Test:
- Dang ky bang email `@sis.hust.edu.vn`.
- Nhan ma 6 so qua email.
- Xac minh ma de tao account.

## 7. Cap nhat du lieu sau nay

Neu ban cap nhat `data/catalog/Catalog.csv` hoac `data/resources` trong repo va deploy lai, co the copy de de len volume:

```bash
fly ssh console -C "cp -f /app/data/catalog/Catalog.csv /data/catalog/Catalog.csv"
fly ssh console -C "mkdir -p /data/resources && cp -R /app/data/resources/. /data/resources/"
```

Neu can import lai schedule tu xlsx trong app, vao tab Admin Import nhu binh thuong.
