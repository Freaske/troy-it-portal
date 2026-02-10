# Lam viec 100% tren cloud (khong lam nang may ban)

Muc tieu: ban khong can build/deploy tren Mac. Ban chi sua code tren cloud, push la Fly tu cap nhat.

## A. Setup 1 lan

1. Day code len GitHub.
2. Dam bao app Fly da tao xong (app + volume + secrets SMTP).
3. Tao Fly API token:

```bash
fly auth token
```

4. Vao GitHub repo:
   - `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`
   - Tao secret ten `FLY_API_TOKEN`, value = token vua tao.
5. File CI da san trong repo: `.github/workflows/fly-deploy.yml`.

## B. Lam viec hang ngay (khong can chay local)

1. Vao GitHub repo -> `Code` -> `Codespaces` -> `Create codespace on main`.
2. Sua code trong Codespaces (VS Code tren web).
3. Commit + Push.
4. Neu push len `main`, GitHub Actions tu deploy len Fly.
5. Theo doi deploy:
   - Tab `Actions` trong GitHub.
   - Hoac chay `fly logs` khi can debug.

## C. Cach cap nhat an toan

1. Lam tren branch moi (vi du `feature/ui-admin`).
2. Mo Pull Request de review.
3. Merge vao `main` khi ok.
4. Merge xong se auto deploy.

## D. Neu can chinh du lieu tai nguyen lon

Resource lon (`/data/resources`, DB SQLite) nen giu tren Fly volume, khong commit vao Git.
Khi can cap nhat resource, dung lenh copy vao volume (tu may co file goc):

```bash
fly ssh console -C "mkdir -p /data/resources"
```

Hoac deploy lai data thong qua quy trinh trong `DEPLOY_FLY.md`.
