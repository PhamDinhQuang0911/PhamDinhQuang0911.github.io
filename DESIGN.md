---
name: QMath LMS
description: Hệ sinh thái Khảo thí & Quản lý Học tập Toán học thông minh
colors:
  primary: "rgb(var(--color-primary-600))"
  primary-light: "rgb(var(--color-primary-50))"
  primary-tint: "rgb(var(--color-primary-100))"
  primary-hover: "rgb(var(--color-primary-700))"
  primary-deep: "rgb(var(--color-primary-800))"
  spring-rose: "#db2777"
  summer-ocean: "#2563eb"
  autumn-amber: "#ea580c"
  winter-indigo: "#4f46e5"
  video-emerald: "#059669"
  video-emerald-bg: "#ecfdf5"
  pdf-rose: "#e11d48"
  pdf-rose-bg: "#fff1f2"
  neutral-surface: "#ffffff"
  neutral-subtle: "#f8fafc"
  neutral-border: "#e2e8f0"
  neutral-text-main: "#0f172a"
  neutral-text-muted: "#475569"
  neutral-text-caption: "#64748b"
  dark-surface: "#111827"
  dark-card: "#1e293b"
  dark-border: "#334155"
  dark-text: "#f8fafc"
typography:
  display:
    fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif'
    fontSize: "2rem"
    fontWeight: 900
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif'
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  body:
    fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif'
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.55
    letterSpacing: "0em"
  label:
    fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  2xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.xl}"
    padding: "20px"
  chip:
    backgroundColor: "{colors.primary-light}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: QMath LMS

## Overview

**Creative North Star: "The Seasonal Math Conservatory" (Nhà vòm Toán học Bốn mùa)**

QMath LMS kết hợp sự chuẩn mực tuyệt đối của toán học với chất thơ ấm áp, tươi mới của thiên nhiên bốn mùa Việt Nam. Một không gian học tập khoa học nhưng tràn đầy cảm hứng, nơi công thức và đồ họa toán học hiển thị sắc bén, tương phản cao, hòa quyện cùng ngôn ngữ thị giác hiện đại theo mùa (hoa đào mùa xuân, biển đảo mùa hè, lá phong mùa thu và người tuyết mùa đông).

Hệ thống thiết kế đặt trọng tâm vào **tính sư phạm và độ phản hồi tức thì**. Mọi chi tiết thừa thãi, khung viền xám đục nặng nề hoặc các cấu trúc "thẻ lồng thẻ" đều bị loại bỏ để nhường chỗ cho nội dung cốt lõi: đề bài, bước giải, hình vẽ TikZ và nét bút ghi chép của giáo viên. Giao diện có nhịp thở khoáng đạt, phân cấp thông tin rõ ràng và thao tác gọn gàng, tôn trọng sự tập trung cao độ của học sinh và thầy cô giáo.

**Key Characteristics:**
- **Dynamic Seasonal Engine:** Giao diện tự động biến chuyển màu chủ đạo và họa tiết vector nhẹ nhàng theo từng mùa trong năm mà không làm thay đổi thói quen sử dụng.
- **Craft Floor Rigor:** Chống triệt để các phản hoa văn AI (AI slop): không dùng font mặc định nhàm chán, không dùng chữ xám nhạt khó đọc, không lồng hộp vô tội vạ.
- **Ultra-Compact & Focused:** Mọi danh sách (đề thi, bài giảng) ưu tiên định dạng danh sách hàng ngang tinh gọn (compact row), hiển thị nhiều dữ liệu hơn trên một màn hình nhưng không gây ngột ngạt.
- **Mathematical Clarity:** Tối ưu hóa phông chữ và bố cục chuyên dụng cho ký hiệu toán học (`MathJax`, `KaTeX`, `AxMath`, `Consolas`).

---

## Colors

Bảng màu QMath được vận hành bởi bộ máy giao diện theo mùa kết hợp cùng các sắc độ nhấn định danh tính năng, luôn đảm bảo độ tương phản tối thiểu 4.5:1 với văn bản.

### Primary (Seasonal Dynamic)
- **Spring Rose** (`#db2777` / `rgb(219 39 119)`): Sắc hồng đào rạng rỡ của mùa xuân, khích lệ khởi đầu mới đầy năng lượng.
- **Summer Ocean** (`#2563eb` / `rgb(37 99 235)`): Xanh đại dương tươi mát mùa hè, tạo cảm giác thoáng đãng, dịu mắt trong mùa ôn thi căng thẳng.
- **Autumn Amber** (`#ea580c` / `rgb(234 88 12)`): Cam ấm mùa thu tựu trường, kích thích tư duy logic và sự tập trung trí tuệ.
- **Winter Indigo** (`#4f46e5` / `rgb(79 70 229)`): Tím chàm sâu lắng của mùa đông, biểu trưng cho sự kiên trì và bền bỉ trong học tập.

### Functional Accents
- **Video Emerald** (`#059669` / bg: `#ecfdf5`): Nhận diện video bài giảng trực tuyến, các bài tập đã nộp hoặc đạt điểm tối đa.
- **PDF Rose** (`#e11d48` / bg: `#fff1f2`): Thao tác xuất và tải file PDF bài giảng, các cảnh báo quan trọng hoặc bài thi quá hạn.
- **Brand Teal** (`#0f766e`): Điểm tựa tĩnh của logo và các văn bản định vị thương hiệu QMath.

### Neutral
- **Main Text (`#0f172a`)**: Slate 900 đậm đà, tương phản sắc nét trên nền sáng, không bao giờ dùng đen tuyền gắt `#000000`.
- **Muted Text (`#475569`)**: Slate 600 cho phụ đề, thông tin phụ trợ (ngày tháng, số trang), đảm bảo tỉ lệ tương phản vượt chuẩn ≥ 4.5:1.
- **Caption Text (`#64748b`)**: Slate 500 dành riêng cho nhãn nhỏ, icon bổ trợ. Cấm sử dụng màu xám sáng hơn giá trị này cho văn bản.
- **Surface (`#ffffff`)**: Nền thẻ trắng tinh khiết, sạch sẽ.
- **Subtle Surface (`#f8fafc`)**: Nền toàn trang Slate 50 nhẹ nhàng, dịu mắt.
- **Border (`#e2e8f0` / `rgba(0,0,0,0.06)`)**: Đường kẻ siêu mảnh phân chia khu vực, không tạo cảm giác đóng hộp.

### Named Rules
- **The Contrast Floor Rule:** Tuyệt đối không sử dụng các mã màu xám nhạt như `#9ca3af` hay `#d1d5db` cho văn bản trên nền sáng. Mọi dòng chữ hiển thị phải đọc được rõ ràng dưới ánh sáng lớp học và màn hình ngoài trời.
- **The Seasonal Singularity Rule:** Trên một màn hình chỉ tồn tại duy nhất một màu sắc chủ đạo theo mùa hiện tại; các nút bấm bổ trợ (phát video, tải pdf) chỉ dùng tông pastel tương ứng làm nền.

---

## Typography

Hệ thống phân cấp kiểu chữ ưu tiên sự mượt mà của tiếng Việt có dấu và tính chính xác tuyệt đối của công thức toán học.

- **Display & Interface:** `"Be Vietnam Pro"`, `"Inter"`, `system-ui, -apple-system, sans-serif` — Bo tròn hiện đại, hỗ trợ dấu tiếng Việt hoàn hảo, rõ ràng ở mọi kích thước nhỏ.
- **Math Formulas:** `"AxMath"`, `"Cambria Math"`, `"KaTeX_Main"`, `serif` — Dành cho công thức, tích phân, ma trận, biểu thức giải tích.
- **Monospace & Casio:** `"Consolas"`, `"Courier New"`, `monospace` — Dành cho code, ma trận màn hình máy tính Casio fx-580VN X, dữ liệu trắc nghiệm.

### Hierarchy
- **Display** (Bold 900, 2rem / 32px, line-height 1.15): Tiêu đề màn hình chính, điểm số tổng kết, banner chào mừng.
- **Headline** (Extrabold 800, 1.375rem / 22px, line-height 1.25): Tên chuyên đề, tên lớp học, tiêu đề bài thi.
- **Title** (Bold 700, 1rem / 16px, line-height 1.35): Tên bài giảng, câu hỏi thi, tiêu đề mục con.
- **Body** (Medium 500, 0.9375rem / 15px, line-height 1.55): Nội dung câu hỏi toán, lời giải, hướng dẫn làm bài, giới hạn 65–75ch cho độ dễ đọc tối đa.
- **Label / Tag** (Bold 700, 0.75rem / 12px, letter-spacing +0.02em): Huy hiệu số trang, trạng thái nộp bài, thời gian bấm giờ.

### Named Rules
- **The No-Gradient-Text Rule:** Tiêu đề thể hiện uy lực thông qua font-weight (800/900) và tỷ lệ kích thước, tuyệt đối không dùng hiệu ứng chữ chuyển màu (gradient text) gây lòe loẹt và giảm độ đọc.

---

## Layout

- **Container Model:** Màn hình chính sử dụng bố cục responsive có lề linh hoạt (`max-w-7xl mx-auto px-3 sm:px-6`).
- **Spatial Grid:** Nhịp khoảng cách dựa trên hệ số 4px/8px tiêu chuẩn (`gap-2`, `gap-3`, `gap-4`).
- **Compact List Priority:** Đối với danh sách bài giảng và ngân hàng câu hỏi, ưu tiên định dạng danh sách hàng ngang thu gọn (Compact row, chiều cao 48–56px), giảm bớt cuộn trang không cần thiết.
- **Responsive Stacking:** Trên màn hình di động (<640px), thanh công cụ tự động xếp gọn, chuyển sang cuộn ngang nhẹ (`overflow-x: auto; scrollbar-width: none`) hoặc gom nhóm thông minh.

---

## Elevation & Depth

QMath sử dụng phong cách **Tonal Layering kết hợp Soft Directional Shadows**, không sử dụng bóng đổ xám đen thô cứng.

### Shadow Vocabulary
- **Subtle Surface** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05)`): Dành cho thẻ nghỉ, hàng danh sách.
- **Interactive Lift** (`box-shadow: 0 4px 14px -2px var(--season-shadow)`): Dành cho nút bấm chính và thẻ khi rê chuột (hover).
- **Floating Modals & Video Studio** (`box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.3)`): Dành cho cửa sổ nổi, trình phát video và bảng vẽ NoteRenderer.

### Named Rules
- **The Zero-Block-Shadow Rule:** Không sử dụng bóng đổ cứng không blur (`4px 4px 0px #000`) phong cách neobrutalism. Mọi chiều sâu phải có độ khuếch tán mềm mại, chân thực.

---

## Shapes

- **Form Language:** Hiện đại, thân thiện và năng động (Apple-inspired rounded geometry).
- **Radius System:**
  - *Capsule (9999px):* Huy hiệu trạng thái, nút chuyển mùa, thanh ghi âm trôi nổi.
  - *Large Curve (16px–24px):* Thẻ chứa tổng quát, banner chính, modal popup.
  - *Medium Curve (10px–12px):* Nút bấm hành động, ô nhập liệu, thumbnail bài giảng.
- **Borders:** Luôn đi kèm viền siêu mảnh `1px solid var(--border)` hòa quyện với nền, ngăn cảm giác viền cắt thô kệch.

---

## Components

### 1. Buttons
- **Primary:** Nền gradient mùa (`bg-gradient-to-r from-primary-600 to-primary-700`), chữ trắng, bo góc 12px, bóng đổ dịu nhẹ theo màu mùa. Hover nâng nhẹ `translateY(-1px)`.
- **Secondary / Action:** Nền pastel nhạt (`bg-primary-50`), chữ màu chủ đạo đậm, hover sáng hơn.
- **Quick Icon Button:** Hình vuông hoặc tròn 32x32px bo 8–10px, nền trắng viền mảnh xám, hover đổi màu theo tác vụ (xanh lá cho video, hồng cho pdf).

### 2. Compact Lesson Row (Signature Component)
- Thanh hàng ngang cao 52px, nền `bg-gray-50/40 hover:bg-white`, viền mảnh `1px border-gray-200/60`.
- Thumbnail 48x44px bo góc 8px với badge số trang và biểu tượng phát video trực tiếp.
- Tiêu đề đậm rõ ràng, thông tin ngày học và giáo viên cùng hàng.
- Nút tác vụ nhanh: `[Xem]`, `[Video]`, `[PDF]`. Nhấp toàn hàng để mở bài ngay.

### 3. Exam & Question Card
- Nền trắng tinh khiết, phân cách các phương án A/B/C/D bằng khung bo 10px viền `border-gray-200`.
- Khi chọn phương án: Đổi sang nền pastel mùa, viền màu chủ đạo đậm, vòng tròn chữ cái nổi bật.
- Công thức toán và hình vẽ TikZ hiển thị trung tâm, sắc nét, không bị ngắt dòng phản cảm.

### 4. Inputs & Form Fields
- Chiều cao tối thiểu 42px, nền `bg-gray-50/70`, viền `border-gray-200`, bo góc 10–12px.
- Focus: Đổi viền sang màu chủ đạo mùa, kèm vòng sáng `ring-2 ring-primary-500/20`.

---

## Do's and Don'ts

### Do:
- **Do** giữ tỷ lệ tương phản văn bản luôn ≥ 4.5:1. Mọi chữ hiển thị phải đậm đà, dễ đọc dưới mọi điều kiện ánh sáng.
- **Do** sử dụng cấu trúc danh sách thu gọn (compact row) cho các màn hình quản lý nhiều nội dung.
- **Do** đồng bộ màu sắc theo mùa bằng biến CSS `var(--color-primary-600)` và `var(--season-shadow)`.
- **Do** cung cấp trạng thái tức thì (hover, active, disabled) cho mọi phần tử tương tác.
- **Do** kiểm tra thực tế giao diện trên cả màn hình di động 375px và màn hình lớn 1920px.

### Don't:
- **Don't** lồng thẻ bên trong thẻ (card-in-a-card) tạo cảm giác ngột ngạt, đóng hộp nhiều tầng.
- **Don't** sử dụng font Inter mặc định đơn điệu mà không trau chuốt font tiếng Việt và công thức toán.
- **Don't** dùng màu xám nhạt (`#9ca3af`) cho bất kỳ nhãn văn bản quan trọng nào.
- **Don't** sử dụng hiệu ứng chữ gradient hoặc bóng đổ cứng không blur kiểu neobrutalism.
- **Don't** chèn spinner xoay vòng chờ đợi khi dữ liệu đã có sẵn trong bộ nhớ đệm cache.
