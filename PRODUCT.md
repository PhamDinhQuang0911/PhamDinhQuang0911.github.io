# Product: QMath LMS

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Học sinh (THCS & THPT Việt Nam):**
   - Tình huống: Luyện tập giải toán trắc nghiệm/tự luận, làm bài kiểm tra trực tuyến có bấm giờ, xem lại ghi chép bài giảng của giáo viên và xem video bài giảng kèm bookmark thời gian.
   - Nhu cầu cốt lõi: Giao diện trực quan, tốc độ tải tức thì, đọc công thức Toán chuẩn mực, thao tác làm bài mượt mà trên điện thoại/máy tính bảng mà không bị che khuất nội dung.

2. **Giáo viên Toán học:**
   - Tình huống: Quản lý lớp học, quản lý ngân hàng câu hỏi phân tầng theo MapID, trích xuất đề thi từ mã nguồn LaTeX/Word, lưu bài giảng trực tiếp từ Bảng vẽ NoteRenderer vào lớp cho học sinh.
   - Nhu cầu cốt lõi: Soạn và trộn đề thi chuẩn cấu trúc Bộ GD&ĐT trong vài giây, hiển thị hình vẽ TikZ sắc nét, giao bài và chấm điểm tự động.

3. **Phụ huynh học sinh:**
   - Tình huống: Theo dõi tiến độ học tập, lịch sử nộp bài và nhận xét của giáo viên thông qua cổng tra cứu tiện lợi.

## Product Purpose

QMath LMS là hệ sinh thái Khảo thí & Quản lý Học tập Toán học thế hệ mới, giải quyết triệt để sự đứt gãy giữa việc giảng dạy bảng vẽ trên lớp và tự học trực tuyến:
- Số hóa và chuẩn hóa 100% ngân hàng câu hỏi Toán từ LaTeX (gói `ex_test`, hình vẽ `TikZ`, MathType) thành dữ liệu cấu trúc MapID phân cấp.
- Phòng luyện thi & thi thử thông minh tích hợp Gia sư AI (Google Gemini Flash) gợi ý phương pháp giải theo từng bước (tuyệt đối không giải hộ, kích thích tư duy).
- Tích hợp không gian ghi chép và bài giảng Bảng vẽ NoteRenderer: Lưu bài viết tay kèm video streaming (HLS/Telegram byte-range) trực tiếp vào lớp học.
- Đem lại trải nghiệm học tập sư phạm mượt mà, không giật lag trên mọi thiết bị.

## Positioning

Hệ sinh thái duy nhất tại Việt Nam kết nối liền mạch từ:
1. **Engine bóc tách đề thi LaTeX & TikZ chuyên sâu** chuẩn quy cách Bộ GD&ĐT 2018 (MCQ 4 lựa chọn, Đúng/Sai, Điền đáp số ngắn, Tự luận).
2. **Quản lý cây chuyên đề MapID đa tầng** lưu trữ phân tán hiệu năng cao trên Cloudflare R2 & Firestore.
3. **Đồng bộ hóa 1-click với Bảng vẽ NoteRenderer**: Bút viết mực mượt mà, compa, thước kẻ, máy tính Casio fx-580VN X chiếu màn hình rời.

## Operating Context

- **Thiết bị & Môi trường:** 
  - Đa nền tảng Web Responsive: Tối ưu cho cả PC máy tính bảng phấn của giáo viên, iPad/tablet stylus của học sinh và smartphone màn hình dọc.
- **Tình huống sử dụng thực tế:**
  - Trong giờ học: Giáo viên viết bảng trên NoteRenderer, trình chiếu bài giảng và máy tính Casio fx-580VN X lên màn hình lớp.
  - Sau giờ học: Giáo viên 1-click lưu bài giảng lên lớp học QMath. Học sinh mở điện thoại xem lại toàn bộ bảng viết, xuất PDF hoặc xem video tua lại các phân đoạn khó.
  - Kỳ thi & Ôn luyện: Học sinh làm bài thi trắc nghiệm bấm giờ, xem lời giải chi tiết, dùng trợ giúp 50/50 và gợi ý Gia sư AI.
- **Định dạng dữ liệu:**
  - Câu hỏi JSON: MapID, nội dung TeX, options, đáp án đúng, lời giải, mã TikZ.
  - Video bài giảng: Streaming phân đoạn HLS / Telegram proxy native byte-range.
  - Bảng vẽ: File `.nrn` vector strokes, nén nhị phân siêu nhẹ, xuất PDF độ nét cao.

## Capabilities and Constraints

- **Hỗ trợ 4 định dạng câu hỏi chuẩn Bộ GD&ĐT mới:** Trắc nghiệm 4 lựa chọn, Đúng/Sai đa ý (a/b/c/d), Trả lời ngắn số học, Tự luận.
- **Công thức Toán & Đồ thị:** Hiển thị tức thì qua MathJax 3 / KaTeX, biên dịch hình vẽ TikZ tự động thông qua VPS backend batch compilation.
- **Kiến trúc kỹ thuật:** Vanilla JS (zero bundle bloat), Tailwind CSS tối ưu hóa, Firebase Auth & Firestore, Cloudflare Workers & R2 storage.
- **Ràng buộc hiệu năng:**
  - Phải hiển thị nội dung ngay lập tức (<100ms khi có cache), không dùng spinner che khuất.
  - Không tải thư viện cồng kềnh, ưu tiên tối đa độ phản hồi mượt mà trên thiết bị học sinh cấu hình yếu.

## Brand Commitments

- **Tên thương hiệu:** QMath (Hệ sinh thái Khảo thí & Học tập Toán học).
- **Bộ máy giao diện theo mùa (Seasonal Theme Engine):** Tự động thích ứng màu sắc và tranh trang trí theo 4 mùa trong năm:
  - *Mùa xuân (T2–T4):* Hoa đào hồng tươi sáng (`#DB2777`), mang lại sinh khí đầu năm.
  - *Mùa hè (T5–T7):* Biển xanh mát rượi (`#2563EB`), giải tỏa căng thẳng mùa thi.
  - *Mùa thu (T8–T10):* Lá phong cam ấm áp (`#EA580C`), không khí tựu trường và tập trung.
  - *Mùa đông (T11–T1):* Bông tuyết chàm tím chiều sâu (`#4F46E5`), tĩnh lặng và kiên trì.
- **Tông giọng & Cảm xúc:** Sư phạm chuẩn mực, truyền cảm hứng, tinh gọn, hiện đại và thân thiện với học trò.

## Evidence on Hand

- Giao diện học sinh: `student.html`
- Giao diện giáo viên & quản trị: `dashboard.html`
- Phòng luyện thi & thi trắc nghiệm: `practice.html`, `exam.html`, `exam-print.html`
- Quản lý đề thi & ngân hàng câu hỏi: `exam-editor.html`, `dashboard-mapid.html`, `topic-builder.html`
- Trình phát video bài giảng: `course-player.html`, `homework-player.html`
- Hệ thống phong cách mùa: `season-theme.js`, `styles.css`, `tailwind-input.css`, `tailwind.config.js`

## Product Principles

1. **Sư phạm làm trọng tâm (Pedagogy First):** Giao diện tôn vinh nội dung toán học; công thức và hình vẽ phải là tâm điểm rõ nét nhất. Mọi đồ họa trang trí chỉ đóng vai trò tạo cảm hứng, không gây xao nhãng.
2. **Tốc độ & phản hồi tức thì (Instant Flow):** Giảm thiểu tối đa độ trễ, lưu trữ đệm thông minh để học sinh mở bài làm là thấy ngay.
3. **Thanh thoát chống cồng kềnh (Craft over Clutter):** Tuyệt đối nói không với cấu trúc "thẻ lồng thẻ" (card-in-card), loại bỏ các khối viền xám đục nặng nề; tạo chiều sâu bằng khoảng trắng có nhịp điệu và độ tương phản cao.
4. **Trải nghiệm 1 chạm liền mạch:** Từ danh sách bài giảng đến chế độ xem bài viết, mở video hoặc tải tài liệu chỉ trong 1 thao tác bấm trực tiếp.

## Accessibility & Inclusion

- Độ tương phản chữ luôn đạt chuẩn WCAG AA (tối thiểu 4.5:1 với body text, 3:1 với tiêu đề lớn).
- Tuyệt đối không dùng chữ xám nhạt (`#9ca3af` / `#d1d5db`) trên nền trắng.
- Tương thích tốt với thao tác cảm ứng (Touch targets ≥ 44x44px trên mobile).
- Hỗ trợ chế độ nền tối (Dark mode) bảo vệ mắt học sinh khi học đêm.
