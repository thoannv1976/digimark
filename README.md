# DIGIMARK Arena

Game cạnh tranh cho khóa **Thị trường và Marketing số trong thời đại số** (DIGIMARK 2026).
Bản hiện tại có **Game 2 – Thám tử AI**: đấu nhanh tối đa 6 người (ghế trống do máy chơi) với 72 câu thuộc 6 chủ đề:
Bắt lỗi AI · Đèn dữ liệu · Prompt · Đọc số liệu · Khủng hoảng · Quản trị AI (soạn từ Học liệu 07, 10, Slide CĐ4, Hồ sơ tình huống).

## Cấu trúc
- `packages/engine` – lõi game thuần TypeScript: ngân hàng câu (`src/content/ai-detective.ts`), tính điểm, máy chơi, luồng phòng. Test: `npm run test:unit`.
- `apps/api` – Fastify trên Cloud Run (`arena-api`). Mọi ghi Firestore đi qua API trong transaction; đáp án và token nằm ở `rooms/{code}/private/state`, trình duyệt không đọc được.
- `apps/web` – React + Vite + Tailwind trên Firebase Hosting. Trình duyệt chỉ đọc `rooms/{code}` theo thời gian thực. Chỉ import `packages/engine/src/types.ts`, không bao giờ import ngân hàng câu.

Trang: `/` học viên (vào phòng / đấu với máy) · `/p/:code` màn hình người chơi · `/gv` bảng giảng viên (tạo nhiều phòng, bắt đầu tất cả, xuất CSV) · `/gv/:code` màn hình chiếu.

## Luật điểm
Đúng tối đa 1.000 (nhanh 1.000 → chậm nhất 500) · chuỗi đúng +10%/câu, tối đa +50% · sai −200 · không trả lời 0 ·
Bắt lỗi AI đúng câu sai loại lỗi 60% · Sắp xếp tính theo số vị trí đúng · Kiểm chứng (2 lượt) giảm điểm câu đó còn ½.
Máy chơi: Dễ 60% / Vừa 72% / Khó 85% đúng.

## Chạy trên máy (Windows)
Đường dẫn có tiếng Việt nên emulator chạy qua junction `C:\gh`:
```bash
cd /c/gh/repos/digimark-arena && firebase emulators:start --only firestore --project demo-arena
cd apps/api && FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 npx tsx watch src/server.ts
npm run dev --workspace @arena/web   # http://localhost:5173 (dùng apps/web/.env.development)
```
Test tích hợp API: `npm run test:integration` (từ `C:\gh\repos\digimark-arena`).

## Triển khai
`PROJECT_ID=<project> bash scripts/deploy.sh` – cần chuẩn bị một lần: bật API run/cloudbuild/artifactregistry/firestore,
tạo Firestore (asia-southeast1), Artifact Registry repo `arena`, service account `arena-api@` (roles/datastore.user),
`apps/web/.env.production`, và TTL policy:
`gcloud firestore fields ttls update expireAt --collection-group=rooms --enable-ttl` (và `--collection-group=private`).
