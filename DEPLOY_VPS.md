# Deploy TKB Portal Len Web (VPS, khong doi codebase)

Huong dan nay dung cho du an hien tai (Next.js + Prisma + SQLite + tai nguyen file local + upload anh giang vien).
Muc tieu: deploy len 1 VPS Ubuntu + Nginx + SSL.

## 1. Yeu cau truoc khi bat dau

- Ban co domain (vi du: `portal.yourdomain.com`).
- Ban co VPS Ubuntu 22.04 (khuyen nghi RAM >= 2GB).
- Ban biet IP VPS.
- Ban dang o may Macbook (nhu hien tai).

## 2. Day code len GitHub

Chay tren Mac:

```bash
cd /Users/harrieum/Desktop/tkb-portal
git init
git add .
git commit -m "prepare production deploy"
git branch -M main
git remote add origin <GITHUB_REPO_URL>
git push -u origin main
```

Neu repo da co san, bo qua `git init` + `remote add`, chi can `git add/commit/push`.

## 3. Setup VPS lan dau

SSH vao VPS:

```bash
ssh root@<VPS_IP>
```

Cai cac goi can thiet:

```bash
apt update && apt upgrade -y
apt install -y git curl nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm i -g pm2
```

Clone project:

```bash
mkdir -p /var/www
cd /var/www
git clone <GITHUB_REPO_URL> tkb-portal
cd /var/www/tkb-portal
```

## 4. Copy du lieu that (DB + resources) len VPS

### 4.1 Tao folder tren VPS

Tren VPS:

```bash
mkdir -p /var/www/tkb-portal/data/resources
mkdir -p /var/www/tkb-portal/data/catalog
mkdir -p /var/www/tkb-portal/public/uploads/lecturers
```

### 4.2 Copy tu Mac len VPS

Mo Terminal moi tren Mac:

```bash
# Copy SQLite DB (neu ban da co data)
scp /Users/harrieum/Desktop/tkb-portal/prisma/dev.db root@<VPS_IP>:/var/www/tkb-portal/prisma/dev.db

# Copy Catalog CSV
scp /Users/harrieum/Downloads/Catalog.csv root@<VPS_IP>:/var/www/tkb-portal/data/catalog/Catalog.csv

# Copy folder resources
rsync -avh "/Users/harrieum/Downloads/Troy University Resources/" root@<VPS_IP>:/var/www/tkb-portal/data/resources/
```

## 5. Tao file env production

Tren VPS:

```bash
cd /var/www/tkb-portal
cp .env.example .env
nano .env
```

Dat gia tri nhu sau:

```env
DATABASE_URL="file:/var/www/tkb-portal/prisma/dev.db"
CATALOG_CSV_PATH="/var/www/tkb-portal/data/catalog/Catalog.csv"
TROY_RESOURCES_DIR="/var/www/tkb-portal/data/resources"
AUTH_SECRET="<mot-chuoi-rat-dai-random>"

# Email verification code (khuyen nghi: Gmail SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="ctt.troyit.k69@gmail.com"
SMTP_PASS="<gmail-app-password-16-ky-tu>"
SMTP_FROM_EMAIL="HUST x Troy IT Portal <ctt.troyit.k69@gmail.com>"

# Tuy chon: dung Resend thay cho SMTP
# RESEND_API_KEY="<your_resend_api_key>"
# RESEND_FROM_EMAIL="HUST Portal <no-reply@your-domain.com>"
```

Tao AUTH_SECRET nhanh:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 6. Build va chay app

Tren VPS:

```bash
cd /var/www/tkb-portal
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 start npm --name tkb-portal -- start
pm2 save
pm2 startup
```

Kiem tra app:

```bash
pm2 status
pm2 logs tkb-portal --lines 100
curl http://127.0.0.1:3000/api/meta
```

## 7. Cau hinh Nginx + domain + SSL

### 7.1 Tao Nginx config

Tren VPS:

```bash
nano /etc/nginx/sites-available/tkb-portal
```

Noi dung:

```nginx
server {
    listen 80;
    server_name portal.yourdomain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:

```bash
ln -s /etc/nginx/sites-available/tkb-portal /etc/nginx/sites-enabled/tkb-portal
nginx -t
systemctl restart nginx
```

### 7.2 Truy cap DNS

Tai nha cung cap domain, tao ban ghi:

- Type: `A`
- Name: `portal` (hoac root `@`)
- Value: `<VPS_IP>`

Cho DNS cap nhat (5-30 phut, co khi lau hon).

### 7.3 Bat HTTPS

```bash
certbot --nginx -d portal.yourdomain.com
```

## 8. Email verification code (signup)

Flow da co san:

1. Dang ky -> gui ma 6 so vao email.
2. Nhap ma -> tao account.

De gui email that, bat buoc:

- Cach 1 (de nhat): Gmail SMTP
  - Bat 2-Step Verification cho Gmail.
  - Tao App Password trong Google Account.
  - Dien `SMTP_*` trong `.env` (nhu mau o buoc 5).
- Cach 2: Resend
  - Tao tai khoan Resend.
  - Verify sender domain / sender email.
  - Dien `RESEND_*` trong `.env`.

Neu chua cau hinh SMTP/Resend:

- Moi truong production se bao loi khong cau hinh email.
- Moi truong dev local se hien `DEV CODE` de test.

## 9. Update version moi

Moi lan cap nhat code:

```bash
cd /var/www/tkb-portal
git pull origin main
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 restart tkb-portal
pm2 logs tkb-portal --lines 100
```

## 10. Troubleshooting nhanh

### Loi Prisma schema/client

```bash
npx prisma generate
npx prisma db push
pm2 restart tkb-portal
```

### Loi khong doc duoc resources

Kiem tra duong dan trong `.env`:

- `CATALOG_CSV_PATH`
- `TROY_RESOURCES_DIR`

Va quyen file:

```bash
ls -la /var/www/tkb-portal/data
```

### Upload avatar fail

Kiem tra folder ton tai:

```bash
ls -la /var/www/tkb-portal/public/uploads/lecturers
```

Neu chua co:

```bash
mkdir -p /var/www/tkb-portal/public/uploads/lecturers
```
