# Kế hoạch Game 4 và Game 5 – hai chuyên đề còn thiếu game

Trạng thái: **đã duyệt và đã làm** ngày 15/11/2026 (chọn cách A: chuyển khung `rs` sang trước).
Hai game đã chạy trên https://digimark-514506.web.app. Phần còn lại: merge PR danh mục Hub #17,
thêm hoạt động vào khóa 70 và chạy trận chấm điểm — xem mục 7 ở cuối.

## 1. Vì sao hai game này

Khóa DIGIMARK-PVN (Moodle khóa 70) có 5 chuyên đề. Hiện đã có game ở ba chuyên đề:

| Chuyên đề | Game đã có | Mã hoạt động | cmid |
|---|---|---|---|
| CĐ2 · Chiến lược khách hàng và giá trị đề xuất | Game 3 · Săn hợp đồng trọng điểm | `key-accounts` | 4891 |
| CĐ4 · Tiếp thị dựa trên dữ liệu và AI | Game 2 · Thám tử AI | `ai-detective` | 4630 |
| CĐ5 · Kế hoạch marketing gắn với tăng trưởng | Game 1 · Đấu trường Thị phần | `market-share` | 4776 |

Còn thiếu:

- **Chuyên đề 1. Thị trường trong thời đại số** – 120 phút, sản phẩm học tập là *Bản đồ cơ hội thị trường*.
- **Chuyên đề 3. Tiếp thị số và trải nghiệm khách hàng** – 150 phút, sản phẩm học tập là *Digital Customer Journey Map* kèm phương án quản trị rủi ro truyền thông.

Hai chuyên đề này là hai chuyên đề dài nhất và cũng là hai chuyên đề dễ "nghe xong là quên" nhất, vì nội dung chủ yếu là khung tư duy (Market Intelligence, Owned/Paid/Earned, hành trình khách hàng, quản trị thương hiệu). Game là chỗ để học viên trả giá cho lựa chọn của mình thay vì chỉ nghe.

Giữ cách đặt tên theo thứ tự xây dựng (Game 4, Game 5) chứ không đánh số lại theo chuyên đề, vì ba game cũ đã có tên trong Sổ điểm khóa 70 và đổi tên sẽ làm học viên lẫn. Tên hoạt động trong Moodle ghi rõ chuyên đề.

## 2. Việc chuẩn bị chung: chuyển khung phòng nhiều vòng sang repo này

Hiện mỗi game trong repo này là một khối riêng và **tự viết lại máy trạng thái phòng**: `market/room.ts` 406 dòng, `abm/room.ts` 385 dòng, cộng với hai trang chơi riêng (`MarketPlay.tsx` 505 dòng, `AbmPlay.tsx` 797 dòng). Bên repo `ecomoctgames` đã có khung **round-sim (`rs`)**: một máy trạng thái phòng duy nhất (lobby → quyết định → kết quả → … → kết thúc) dùng chung cho 9 game, mỗi game chỉ khai báo phần riêng của mình.

| Cách làm | Mã phải viết cho 2 game mới | Rủi ro |
|---|---|---|
| A. Chuyển khung `rs` sang đây trước (**đề xuất**) | ~1.050 dòng khung (chuyển sang, đã chạy thật ở 9 game) + ~1.600 dòng/game | Phải kiểm thử lại để khung mới không ảnh hưởng 3 game cũ. Game cũ **không** chuyển sang khung mới – để nguyên, chạy song song. |
| B. Mỗi game tự viết phòng như hiện nay | ~2.600–3.200 dòng/game | Thêm hai bản sao máy trạng thái phòng nữa phải bảo trì; bảng điều khiển giảng viên mỗi game một kiểu. |

Đề xuất cách A: khung `rs` đã qua 9 game và 5 trận chấm điểm thật ở khóa ECOM, hẹn giờ theo vòng, tự điền máy vào ghế trống, gửi điểm LTI và phòng giảng viên đều nằm trong khung. Hai game dưới đây đều là 5 vòng quyết định nên lắp vào khung là vừa khít. Nếu sau này có Game 6 cho chuyên đề nâng cao thì phần việc còn lại chỉ là một khối game.

Nếu anh/chị muốn giữ nguyên cách cũ thì chọn B, kế hoạch phần game bên dưới không đổi, chỉ tăng khối lượng mã và thời gian.

---

## 3. Game 4 · Tín hiệu sớm (Chuyên đề 1)

**Mã hoạt động:** `signal-room` · **Biểu tượng:** 📡 · **Thời lượng:** 25–30 phút · **5 vòng = 5 quý**

### 3.1. Vai và câu hỏi của game

Mỗi học viên là **bộ phận thông tin thị trường** của một đơn vị thành viên. Sáu đơn vị cùng theo dõi một thị trường (nhiên liệu công nghiệp cho khu công nghiệp miền Trung – dùng lại bối cảnh Tình huống A của khóa). Câu hỏi của game đúng là câu hỏi của chuyên đề: *thị trường đang chuyển dịch, ai nhận ra trước và dám hành động khi tín hiệu còn chưa chắc chắn?*

### 3.2. Thứ hiện trên màn hình (công khai)

- **Sáu nhóm thông tin thị trường** của giáo trình (quy mô và tăng trưởng, khách hàng và nhu cầu, đối thủ và giải pháp thay thế, giá và kênh, công nghệ và môi trường kinh doanh, hiệu quả nội bộ) – kèm chi phí đặt "cảm biến" cho từng nhóm.
- **Dòng tín hiệu của quý**: mỗi tín hiệu ghi rõ nguồn, ngày, nhóm thông tin và trích dẫn một câu. Số tín hiệu nhìn thấy phụ thuộc nhóm nào đang có cảm biến.
- **Bốn chiều kiểm chứng** của giáo trình: độ tin cậy, thời điểm, tính đại diện, quyền sử dụng. Mỗi chiều chưa kiểm chứng hiện dấu "?".
- **Bảng giá** đầy đủ: giờ phân tích, chi phí kiểm chứng, chi phí từng hành động, và công thức tiền về của hành động – học viên tính được trước khi bấm, giống Game 11 bên ECOM.

### 3.3. Thứ không hiện (máy chủ giữ)

- Trong 6 chuyển dịch của giáo trình, game chọn **3 chuyển dịch thật** (mỗi chuyển dịch có quý bắt đầu thật và độ lớn thật) và **2 chuyển dịch giả** – tín hiệu ban đầu trông y như nhau.
- Độ tin cậy thật của từng tín hiệu, và tín hiệu nào thuộc chuyển dịch nào.
- Cảm biến và hành động của năm đối thủ.

### 3.4. Mỗi quý học viên quyết gì

Có **10 giờ phân tích**/quý. Khung quyết định đi đúng 6 bước Market Intelligence của giáo trình:

1. **Câu hỏi kinh doanh** – chọn 1 trong 4 câu hỏi quý này (ví dụ: phân khúc nào tăng trưởng 12 tháng tới?). Câu hỏi quyết định tín hiệu nào được xếp lên đầu.
2. **Nguồn** – bật/tắt cảm biến ở 6 nhóm thông tin. Mỗi nhóm đang bật tốn phí duy trì; nhóm vừa bật thì quý sau mới có dữ liệu (độ trễ, như thật).
3. **Thu thập và kiểm chứng** – chọn tín hiệu để kiểm chứng, theo từng chiều. Kiểm chứng đủ 4 chiều thì tốn gấp nhiều lần kiểm chứng một chiều.
4. **Phân tích** – ghép các tín hiệu thành một giả thuyết chuyển dịch, và chọn **cách đặt vấn đề**: theo sản phẩm ("bán thêm X") hay theo công việc khách hàng cần hoàn thành (JTBD).
5. **Quyết định** – một hành động: thử nghiệm ở một địa bàn, điều chỉnh giá, dựng gói giải pháp, vào phân khúc mới, hoặc không làm gì. Hành động đúng chuyển dịch thật, càng sớm thì tiền về càng lớn; đến quý 4–5 ai cũng thấy nên phần chia nhỏ lại.
6. **Theo dõi** – chọn giữ hay bỏ giả thuyết cũ. Giữ một giả thuyết đã bị dữ liệu phủ nhận bị trừ điểm kỷ luật thông tin.

### 3.5. Bốn cái bẫy, mỗi cái là một thông điệp của chuyên đề

- **Thu thập tất cả** – bật đủ 6 nhóm và kiểm chứng mọi thứ thì hết sạch 10 giờ, không còn gì để hành động. Điểm thông tin cao, lợi nhuận bằng 0. Đây là thông điệp "dữ liệu không tự tạo ra lợi thế".
- **Tin ngay** – hành động trên tín hiệu chưa kiểm chứng thắng đậm nếu may và mất đậm nếu tín hiệu đó thuộc chuyển dịch giả. Xác suất thật chỉ được lật vào cuối trận.
- **Chỉ xem giá đối thủ** – ai chỉ bật nhóm 4 sẽ không bao giờ thấy chuyển dịch "giải pháp thay thế" (điện hóa ở một số ứng dụng) và mất trắng một phân khúc ở quý 4. Đúng bài học 3.1 của giáo trình.
- **Để AI tổng hợp** – tuỳ chọn rẻ, cho thêm 2 tín hiệu mỗi quý, nhưng khoảng 1/4 bản tổng hợp của AI có một số liệu bịa. Hành động trên bản AI chưa ai rà soát bị trừ gấp đôi. Đúng nguyên tắc "kết quả AI cần được kiểm chứng".
- Thêm một bẫy nhỏ: có tín hiệu **đúng nhưng không được phép dùng** (dữ liệu khách hàng của đơn vị khác, dữ liệu cá nhân). Dùng nó để ra quyết định công khai bị phạt – chiều "quyền sử dụng dữ liệu" của giáo trình.

### 3.6. Thẻ mục tiêu (0–100)

| Phần | Điểm | Đo cái gì |
|---|---|---|
| Lợi nhuận cộng dồn | 45 | Tiền về từ các hành động đúng, trừ chi phí theo dõi và kiểm chứng |
| Chỉ số tín hiệu sớm | 30 | Bắt đúng mấy chuyển dịch thật, và sớm hơn trung bình phòng bao nhiêu quý |
| Kỷ luật thông tin | 25 | Tỷ lệ quyết định có bằng chứng đã kiểm chứng; trừ khi hành động trên tin chưa kiểm chứng, tin không được phép dùng, hoặc giữ giả thuyết đã bị phủ nhận |

Điểm Moodle = 70% thẻ mục tiêu + 30% thứ hạng trong phòng, quy về thang 10, lấy lần cao nhất – giống ba game hiện có.

### 3.7. Máy chơi (5 ghế trống)

Năm lối chơi, đặt tên trung lập để tên không tiết lộ chiến lược: `Trường Sơn`, `Bạch Đằng`, `Hồng Hà`, `An Khê`, `Vân Phong`. Lối chơi gán ngẫu nhiên theo ghế: *thu thập tất cả*, *tin ngay*, *chỉ xem giá*, *để AI làm*, *chờ chắc chắn*. Lối chơi thắng theo thiết kế – *đọc tín hiệu có chọn lọc* – để cho học viên, không gán cho máy; nếu một học viên chơi đúng bài của chuyên đề thì phải thắng được cả 5 máy.

### 3.8. Phần sau trận (cái học viên mang về)

Màn hình kết thúc lật toàn bộ mô hình ẩn: ba chuyển dịch thật bắt đầu từ quý nào, hai chuyển dịch giả là gì, mỗi người đã hành động ở quý nào, và tín hiệu nào mình đã bỏ qua. Xuất ra đúng **Bản đồ cơ hội thị trường** 7 ô của workshop CĐ1, đã điền sẵn từ ván chơi – nối game vào sản phẩm học tập của chuyên đề.

---

## 4. Game 5 · Hành trình và niềm tin (Chuyên đề 3)

**Mã hoạt động:** `journey-trust` · **Biểu tượng:** 🧭 · **Thời lượng:** 30–35 phút · **5 vòng = 5 quý**

### 4.1. Vai và câu hỏi của game

Mỗi học viên phụ trách marketing số cho một gói **khí/LNG cho khách hàng công nghiệp** (tình huống có sẵn trong workshop CĐ3). Sáu đơn vị cùng đi tìm khách trên cùng một tập khách hàng. Câu hỏi của game: *đưa khách đến là việc của marketing số, giữ khách lại là việc của trải nghiệm, và còn được chọn tiếp hay không là việc của niềm tin thương hiệu.*

### 4.2. Thứ hiện trên màn hình (công khai)

- **Sáu giai đoạn hành trình** (Nhận biết → Tìm hiểu → Đánh giá → Mua → Sử dụng → Gắn bó) với **tỷ lệ chuyển tiếp thật của quý vừa rồi** – học viên thấy rõ phễu rò ở đâu.
- **Owned / Paid / Earned** với cách vận hành viết thẳng ra: Paid cho tiếp cận ngay nhưng về 0 khi ngừng chi; Owned lên chậm nhưng cộng dồn thành tài sản; **Earned không mua được** – nó sinh ra từ điểm trải nghiệm và độ tin cậy, và nó nhân hệ số tiếp cận.
- **Bảng vai trò kênh** của giáo trình (website, SEO, search ads, LinkedIn, Zalo/Facebook, email, webinar, CRM, automation, công cụ AI) với chi phí và giai đoạn mà kênh đó phục vụ.
- **Chỉ số trải nghiệm**: CSAT, NPS, CES, thời gian phản hồi, tỷ lệ duy trì, tỷ lệ xử lý khiếu nại đúng hạn.
- **Ma trận rủi ro truyền thông**: khả năng xảy ra × mức độ tác động, kèm ba ngưỡng 1–7 / 8–14 / 15–25 như giáo trình, và mức rủi ro hiện tại của chính mình.

### 4.3. Thứ không hiện (máy chủ giữ)

- **Trọng số thật của 6 giai đoạn** đối với nhóm khách hàng công nghiệp này. Khách B2B công nghiệp coi bước Đánh giá (bằng chứng, hồ sơ, tiêu chuẩn) nặng hơn hẳn bước Nhận biết – học viên không thấy con số, chỉ suy ra từ phễu của quý trước.
- **Lượt rút sự cố** của mỗi quý từ 7 nhóm rủi ro truyền thông, với xác suất phụ thuộc mức quản trị, tỷ lệ nội dung AI chưa phê duyệt và số kênh/tài khoản đang đăng.
- Quyết định của năm đối thủ.

### 4.4. Mỗi quý học viên quyết gì

Có **12 điểm nguồn lực**/quý.

1. **Điểm chạm** – lưới 6 giai đoạn, mỗi giai đoạn nâng được 3 cấp. Giai đoạn bỏ trống thì phễu rò ngay tại đó: nội dung Nhận biết rất tốt mà bước Đánh giá không có hồ sơ năng lực thì khách rụng ở bước Đánh giá. Giống "chồng niềm tin" của Game 11 bên ECOM: chuỗi vỡ ở khâu yếu nhất.
2. **Owned / Paid / Earned** – chia tiền tiếp cận. Ai chỉ mua Paid thì quý nào cũng phải mua lại và dừng ở một mức. Ai chỉ làm Owned thì quý 1–2 gần như không có khách.
3. **Quản trị nội dung** – chọn cơ chế: *đăng nhanh, không phê duyệt* / *đầu mối truyền thông phê duyệt* / *phê duyệt theo phân quyền kèm giám sát kênh*. Càng chặt càng tốn và càng chậm, nhưng xác suất và mức tác động của sự cố giảm theo.
4. **Trải nghiệm** – chọn điểm đau để sửa, đúng bảng 5.3 của giáo trình: SLA phản hồi, chuẩn hóa nội dung kỹ thuật, CRM lưu lịch sử tương tác, chăm sóc sau bán. Mỗi mục sửa nâng một chỉ số trải nghiệm, và trải nghiệm là thứ sinh ra Earned Media.
5. **Nội dung AI** – ba mức kiểm soát: đăng trực tiếp / có người rà soát / phê duyệt theo phân quyền. Rẻ và nhanh so với an toàn, đúng nguyên tắc "AI hỗ trợ, con người chịu trách nhiệm".

### 4.5. Vòng xử lý sự cố – "60 phút đầu tiên"

Sự cố nổ ở **kết quả quý 1–4**, và ô xử lý nằm ngay đầu phiếu quyết định quý sau (nên không cần thêm loại phòng mới, vẫn là 5 vòng). Học viên được chọn **3 trong 6 bước** của quy trình giáo trình: Phát hiện / Xác minh / Phân loại / Chuyển cấp và phê duyệt / Phản hồi / Theo dõi và cải tiến. Bộ ba đúng phụ thuộc loại sự cố:

- Chọn *Phản hồi* trước *Xác minh* thì thiệt hại tăng – đúng tình huống 7.5 của giáo trình.
- Hai lựa chọn gài sẵn luôn làm xấu hơn: "phản bác ngay" và "xóa mọi bình luận".
- Với sự cố **an toàn, môi trường hoặc bảo mật** có một luật cứng: che giấu hoặc trì hoãn nghĩa vụ thông báo bị trừ nặng và **không có cách nào kiếm lại bằng điểm kinh doanh**. Giáo trình nói thẳng điều này, game phải cho học viên thấy hậu quả.

### 4.6. Thẻ mục tiêu (0–100)

| Phần | Điểm | Đo cái gì |
|---|---|---|
| Kết quả kinh doanh | 40 | Khách tiềm năng → hợp đồng → giữ khách, cộng dồn 5 quý |
| Trải nghiệm khách hàng | 30 | Tổng hợp CSAT, NPS, CES, thời gian phản hồi, tỷ lệ duy trì |
| Thương hiệu và quản trị rủi ro | 30 | Nhất quán giữa lời hứa và trải nghiệm, xác thực (không tuyên bố quá năng lực), chất lượng xử lý sự cố |

Điểm Moodle như các game khác: 70% thẻ mục tiêu + 30% thứ hạng, thang 10, lấy lần cao nhất.

### 4.7. Máy chơi (5 ghế trống)

Tên trung lập: `Phú Mỹ`, `Dung Quất`, `Cà Mau`, `Nhơn Trạch`, `Thị Vải`. Năm lối chơi: *mua tiếp cận* (toàn Paid), *chỉ làm website* (toàn Owned), *nhanh và lỏng* (không phê duyệt, AI đăng trực tiếp), *chỉ chăm đầu phễu* (bỏ Sử dụng và Gắn bó), *giấu sự cố*. Lối chơi thắng theo thiết kế – phủ đủ 6 giai đoạn, có quản trị, sửa điểm đau, xử lý sự cố đúng thứ tự – để cho học viên.

### 4.8. Phần sau trận

Màn hình kết thúc lật trọng số thật của 6 giai đoạn, cho thấy mỗi người đã rò ở giai đoạn nào và vì sao, bảng so sánh Owned/Paid/Earned của 6 đơn vị qua 5 quý, và toàn bộ sự cố đã nổ cùng cách mỗi người xử lý. Xuất ra **Digital Customer Journey Canvas** của workshop CĐ3 đã điền sẵn từ ván chơi.

---

## 5. Cách làm, theo thứ tự

Mỗi game đi hết đường ống đã dùng cho ba game trước:

1. **Khung `rs`** (một lần, nếu chọn cách A): chuyển `rs/` của engine và `rs/` của web sang repo này, giữ nguyên 3 game cũ, chạy lại toàn bộ test cũ.
2. **Engine**: `types.ts` công khai (bảng giá, nội dung hiển thị, kiểu dữ liệu) tách khỏi `model.ts` chỉ chạy ở máy chủ (mô hình ẩn). Web chỉ được nhập `types.ts` – giữ đúng luật của repo để mô hình ẩn không rò ra trình duyệt.
3. **Script cân bằng**: chạy 150 ván mỗi mức khó, in điểm trung bình từng lối chơi. Mục tiêu: lối chơi "đúng bài chuyên đề" thắng rõ nhưng không thắng không công, các lối chơi bẫy xếp dưới theo đúng thứ tự thông điệp. Cân cho đến khi đạt; ba game trước mất 3–4 lượt cân mỗi game.
4. **Web**: phiếu quyết định, bảng kết quả quý, màn hình giảng viên, màn hình lật mô hình ẩn. Tiếng Việt, đọc được trên điện thoại.
5. **Test**: test đơn vị cho engine (đủ 5 quý, chấm điểm, mô hình ẩn không lọt vào tài liệu phòng công khai, không có mảng lồng mảng vì Firestore không nhận), test tích hợp qua API với giả lập Firestore (chạy từ junction `C:\gh`, `JAVA_HOME` jdk-21), và test điểm chạy tới Hub.
6. **Triển khai**: `bash scripts/deploy.sh` với `FIREBASE_ACCOUNT=mbahelp2002@gmail.com`, chạy từ ổ D (không chạy từ `C:\gh`), dừng tiến trình vite/esbuild trước để tránh lỗi EPERM.
7. **Hub**: một PR thêm hai mục hoạt động `signal-room` và `journey-trust` vào `unigame-hub/config/games.json`. **Chờ anh/chị nói rõ mới merge**, rồi chạy script `finish-digimark-game45.sh` để triển khai lại Hub và giữ nguyên biến môi trường.
8. **Moodle khóa 70**: thêm hoạt động LTI vào Chuyên đề 1 và Chuyên đề 3, cùng cài đặt như ba game cũ (thang 10, lấy lần cao nhất, mô tả tiếng Việt hiện trên trang khóa học, ba tham số `game_id` / `activity` / `grade_policy`).
9. **Trận chấm điểm thật**: mỗi game một phòng 6 người = sinhvien001 đăng nhập trong khung trình duyệt + 5 người chơi chạy bằng script, rồi kiểm tra Sổ điểm khóa 70.

### Khối lượng và thời gian

| Phần | Mã (ước) | Thời gian |
|---|---|---|
| Chuyển khung `rs` (nếu chọn A) | ~1.050 dòng chuyển sang | nửa ngày |
| Game 4 Tín hiệu sớm | ~1.600 engine + ~1.000 web + test | 1–1,5 ngày |
| Game 5 Hành trình và niềm tin | ~1.800 engine + ~1.100 web + test | 1,5–2 ngày |
| Hub, Moodle, hai trận chấm điểm | – | nửa ngày |

Nếu chọn cách B thì cộng thêm khoảng nửa ngày cho mỗi game vì phải viết lại máy trạng thái phòng và trang chơi riêng.

## 6. Những chỗ cần anh/chị quyết

1. **Khung phòng**: cách A (chuyển `rs` sang trước, đề xuất) hay cách B (mỗi game tự viết như hiện nay).
2. **Làm cả hai hay làm một**: nếu chỉ chọn một thì nên là **Game 5 cho Chuyên đề 3**, vì chuyên đề này dài nhất (150 phút) và phần quản trị rủi ro truyền thông là phần học viên dễ làm sai nhất trong thực tế.
3. **Bối cảnh của Game 4**: dùng nhiên liệu công nghiệp (Tình huống A) như kế hoạch này, hay đổi sang phân bón/kênh phân phối cho gần với nhiều học viên hơn.
4. **Số người**: hai game này vẫn thiết kế cho phòng 6 người như ba game cũ, ghế trống do máy chơi. Khóa 70 hiện có 6 học viên nên vừa đủ một phòng; nếu lớp thật đông hơn thì giảng viên mở nhiều phòng song song.

Chưa làm gì trước khi có duyệt.


---

## 7. Đã làm (15/11/2026)

**Khung phòng (cách A).** `packages/engine/src/rs/` (types, room, registry, balance) và
`apps/web/src/rs/` (parts, RsPlay, RsScreen, registry). API thêm hai route `/rs-decide` và
`/rs-me`, cùng nhánh `isRs()` bên cạnh `isMarket()` / `isAbm()`. Ba game cũ không chuyển sang
khung mới và không đổi gì; toàn bộ test cũ vẫn xanh.

**Game 4 · Tín hiệu sớm** (`signal-room`, engine `sg/`): 5 quý, 10 giờ phân tích. Ba chuyển dịch
thật, hai chuyển dịch giả, trong đó "cạnh tranh giữa các giải pháp" luôn thật. Kết quả kiểm chứng
chỉ dùng được từ quý sau; quyết định không có bằng chứng đã kiểm chứng chỉ ăn 45%; ai chưa bao giờ
theo dõi đối thủ và công nghệ mất một phân khúc ở quý 4. Cân bằng (200 ván, mức vừa):
reader 54,1 > latecomer 43,2 > hoarder 28,1 > believer 17,7 > pricewatch 11,5 > aionly 8,8.

**Game 5 · Hành trình và niềm tin** (`journey-trust`, engine `jt/`): 5 quý, 12 điểm nguồn lực.
Trọng số thật của sáu giai đoạn là ẩn (Đánh giá 0,28 nặng nhất); giai đoạn cấp 0 là một lỗ
(tỷ lệ đi tiếp còn một nửa); mỗi điểm đau đã sửa cắt 30% phần khách còn rơi. Owned cộng dồn,
Paid hết hiệu lực khi ngừng chi, Earned sinh ra từ trải nghiệm và độ tin cậy. Sự cố nổ theo cơ chế
phê duyệt và mức kiểm soát nội dung AI, xử lý ở ô "60 phút đầu tiên" của quý sau bằng 3 trong 8
lựa chọn; che giấu sự cố an toàn, môi trường hoặc bảo mật bị chặn trần điểm thương hiệu.
Cân bằng: balanced 62,3 > hider 46,5 > websiteonly 44,4 > frontonly 25,7 > loose 22,2 > buyreach 5,1.

**Kiểm thử.** 54 test đơn vị (`test/sg.test.ts`, `test/jt.test.ts`) và 15 test tích hợp
(`apps/api/test/rs.test.ts`, gồm cả đường điểm về Hub), typecheck sạch cả ba workspace.
Đã chạy thử trên production bằng hai phòng luyện tập và kiểm tra toàn bộ màn hình, kể cả màn
hình lật mô hình ẩn.

**Đã vào Moodle (15/11/2026).** Hub PR #17 đã merge, `finish-digimark-game45.sh` chạy xong →
Hub `unigame-hub-00025-t44`. Khóa 70: cmid 6696 "Game 4 · Tín hiệu sớm" (Chuyên đề 1) và
cmid 6697 "Game 5 · Hành trình và niềm tin" (Chuyên đề 3), thang điểm 10, lấy lần cao nhất,
không giới hạn nhóm. Trận có điểm: Game 5 phòng 2CMME hạng 1/6, thẻ 59 → 7,13/10;
Game 4 phòng VRQCM hạng 4/6, thẻ 11,3 → 1,99/10, sau đó phòng DWMAJ hạng 1/6, thẻ 50,2 → 6,51/10
thay chỗ (đúng luật lấy lần cao nhất). Cả hai hiện trong Sổ điểm khóa 70 kèm dòng phản hồi
phòng · hạng · thẻ mục tiêu.

**Còn lại.** Thử với 6 điện thoại thật trong buổi học.
