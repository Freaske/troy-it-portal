# TKB Troy IT Portal

University-style timetable portal built from the workbook:

- `data/raw/TKB Troy-IT SPRING 26.xlsx`

This project imports `.xlsx` directly into a database (no CSV conversion) and provides:

- Filter by semester, cohort, class group, and day
- Conflict detection (same class group + same day/time + multiple courses)
- Admin import page for uploading a new Excel file
- Course catalog + lecturer info + ratings/comments from external resources
- Mandatory sign-in session (portal access control)
- Resource hub with search/filter + inline preview
- Admin lecturer profile overrides (title/department/email/office/bio)
- Student review and rating submission stored in DB
- Admin add/remove lecturer per course (không cần sửa file gốc)
- Student profile settings (`name`, `khoa`, `lop`, `MSSV`, `language: VI/EN/JA`)
- Student self-registration only with `@sis.hust.edu.vn`
- New-device verification code flow on login

## 1. Run locally (Mac)

From project root `/Users/harrieum/Desktop/tkb-portal`:

```bash
npm install
npx prisma generate
npx prisma db push
npm run import:xlsx
npm run dev
```

Open:

- Login: `http://localhost:3000/login`
- Register: `http://localhost:3000/register`
- Main portal: `http://localhost:3000`
- Admin import: `http://localhost:3000/admin/import`
- Courses: `http://localhost:3000/courses`
- Lecturers: `http://localhost:3000/lecturers`
- Resources hub: `http://localhost:3000/resources`
- Profile settings: `http://localhost:3000/profile`
- Resource viewer: `http://localhost:3000/resources/view?course=CS%202255&path=guide.md`

## 2. External data sources (catalog + resources)

By default, the app reads:

- Catalog: `data/catalog/Catalog.csv`
- Resources dir: `data/resources`

Override via env:

```bash
CATALOG_CSV_PATH="/absolute/path/to/Catalog.csv"
TROY_RESOURCES_DIR="/absolute/path/to/Troy University Resources"
```

These values can be added to `.env.local` if you want to override default local paths.

## 3. Authentication

The portal requires login for all pages and APIs (except `/api/auth/*`, `/login`, and `/register`).

Default demo accounts:

- `admin / hust2026`
- `student / troy2026`
- `lecturer / bkhanoi2026`

Student registration:

- API: `POST /api/auth/register`
- Email bắt buộc: `@sis.hust.edu.vn`
- Password tối thiểu 8 ký tự

New-device verification:

- Khi đăng nhập account DB ở thiết bị mới, `POST /api/auth/login` trả về `requiresDeviceVerification`
- Nhập mã tại `POST /api/auth/verify-device`
- Ở local/dev, mã xác thực được log ra terminal server để test

Customize users with:

```bash
AUTH_SECRET="your-long-secret"
PORTAL_USERS="admin:pass:ADMIN:Admin Name;student:pass:STUDENT:Student Name"
```

`PORTAL_USERS` format: `username:password:ROLE:Display Name` separated by `;`.

Role behavior:

- `ADMIN`: full schedule scope + import + lecturer profile editor + attach/detach lecturer theo course
- `LECTURER`: semester-focused timetable + courses/faculty/resources views (không có quyền admin)
- `STUDENT`: timetable theo profile cá nhân + submit reviews + xem chi tiết giảng viên + profile settings/language

## 4. Useful scripts

```bash
npm run dev
npm run lint
npm run build
npm run import:xlsx
npm run sync:resources
```

Import custom file path:

```bash
npm run import:xlsx -- "data/raw/your-file.xlsx"
```

Resync catalog/resources from Downloads:

```bash
npm run sync:resources
```

## 5. API endpoints

- `GET /api/meta`
- `GET /api/schedule?semester=SPRING_2026&cohort=K69&classGroup=IT%2001&day=ALL`
- `POST /api/admin/import` (multipart form-data with `file`)
- `GET /api/catalog?q=cs`
- `GET /api/lecturers?q=khôi`
- `PATCH /api/admin/lecturers/:id` (ADMIN only)
- `POST /api/admin/course-lecturers` (ADMIN attach lecturer to course)
- `DELETE /api/admin/course-lecturers` (ADMIN detach lecturer from course)
- `POST /api/reviews` (STUDENT only)
- `GET /api/reviews?course=CS%202255`
- `GET /api/resources/file?course=CS%202255&path=C01.pdf`
- `GET /resources` (resource hub)
- `GET /resources/view?course=CS%202255&path=C01.pdf` (inline preview for pdf/md/docx/pptx)
- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/verify-device`
- `POST /api/auth/logout`
- `GET /api/auth/session`
- `GET /api/profile`
- `PATCH /api/profile`

## 6. Data model

Prisma schema (`prisma/schema.prisma`) includes:

- `Semester`
- `Cohort`
- `ClassGroup`
- `Course`
- `ScheduleEntry`
- `ImportRun`
- `LecturerProfile`
- `StudentReview`
- `CourseLecturerOverride`
- `AccountUser`
- `DeviceTrust`
- `DeviceChallenge`
- `UserSetting`

Catalog/resources aggregation logic:

- `src/lib/knowledge.ts` parses course catalog, guide comments, and lecturer links.

## 7. Notes

- Default import target sheets: `SPRING 2026 Kxx`
- Parser source: `src/lib/importers/springSchedule.ts`
- Default workbook resolver: `data/raw/TKB Troy-IT SPRING 26.xlsx`

## 8. Remote workflow (no heavy local build)

If you want cloud-only editing + auto deploy:

1. Follow `/Users/harrieum/Desktop/tkb-portal/DEPLOY_FLY.md` once.
2. Add GitHub secret `FLY_API_TOKEN` (from `fly auth token`).
3. Edit code in GitHub Codespaces.
4. Push to `main` -> GitHub Actions deploys automatically via `/Users/harrieum/Desktop/tkb-portal/.github/workflows/fly-deploy.yml`.

Detailed guide: `/Users/harrieum/Desktop/tkb-portal/REMOTE_DEV.md`.
