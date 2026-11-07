(function () {
  window.MAU = window.MAU || {};

  // Helper tạo mốc định vị tương thích đồng thời cả dạng Object {ten, x, y, s} (chuẩn readQMSheet / reference-omr)
  // lẫn dạng mảng [x, y, s]
  function mkMoc(ten, x, y, s) {
    const obj = [x, y, s];
    obj.ten = ten;
    obj.x = x;
    obj.y = y;
    obj.s = s;
    return obj;
  }

  // ============================================================================
  // 1. MẪU PHIẾU CHUYÊN TRẢ LỜI NGẮN 30 CÂU (QM_TLN30) - NỀN GIẤY CHUẨN BGD A4
  // - Hỗ trợ từ 1 đến 30 câu Trả lời ngắn (5 hàng × 6 câu/hàng).
  // - Giữ nguyên phần Header, SBD (8 chữ số), Mã đề (4 chữ số) chuẩn BGD/TNmaker.
  // ============================================================================
  const tln30RowY0 = [6.50, 9.92, 13.34, 16.76, 20.18]; // Phân bố dọc 5 hàng (mỗi hàng 6 câu TLN, cách nhau 3.42cm)
  const tln30ColX0 = [1.38, 3.99, 6.60, 9.21, 11.82, 14.43]; // 6 câu mỗi hàng ngang, nằm gọn trong [0.92 .. 15.59]
  const tln30Dy = 0.195; // Khoảng cách tâm-tâm theo chiều dọc giữa 12 hàng (- , 0..9)
  const tln30Dx = 0.32;  // Khoảng cách tâm-tâm theo chiều ngang giữa 4 cột trong 1 câu

  const qmtln30_p3 = [];
  for (let r = 0; r < 5; r++) {
    const y0 = tln30RowY0[r];
    for (let c = 0; c < 6; c++) {
      const x0 = tln30ColX0[c];
      const qCols = [];
      for (let col = 0; col < 4; col++) {
        const cx = +(x0 + col * tln30Dx).toFixed(4);
        const colPts = [];
        for (let row = 0; row < 12; row++) {
          const cy = +(y0 + row * tln30Dy).toFixed(4);
          colPts.push([cx, cy]);
        }
        qCols.push(colPts);
      }
      qmtln30_p3.push(qCols);
    }
  }

  window.MAU.qmtln30 = {
    ten: 'QM_TLN30 - Chuyên 30 Câu Trả Lời Ngắn (Nền BGD)',
    r: 0.090,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isMultiRowP3: true,
    moc: [
      // 4 góc chuẩn A4
      mkMoc('TL', 0.46, 0.46, 0.38),
      mkMoc('TR', 16.07, 0.46, 0.38),
      mkMoc('BR', 16.07, 22.90, 0.38),
      mkMoc('BL', 0.46, 22.90, 0.38),
      // Mốc trung gian nằm hoàn toàn trong khoảng trắng giữa các hàng & cột
      mkMoc('I0', 0.46, 5.36, 0.24),
      mkMoc('I1', 5.65, 5.36, 0.24),
      mkMoc('I2', 10.86, 5.36, 0.24),
      mkMoc('I3', 16.07, 5.36, 0.24),
      mkMoc('I4', 0.46, 9.02, 0.24),
      mkMoc('I5', 5.65, 9.02, 0.24),
      mkMoc('I6', 10.86, 9.02, 0.24),
      mkMoc('I7', 16.07, 9.02, 0.24),
      mkMoc('I8', 0.46, 12.44, 0.24),
      mkMoc('I9', 5.65, 12.44, 0.24),
      mkMoc('I10', 10.86, 12.44, 0.24),
      mkMoc('I11', 16.07, 12.44, 0.24),
      mkMoc('I12', 0.46, 15.86, 0.24),
      mkMoc('I13', 5.65, 15.86, 0.24),
      mkMoc('I14', 10.86, 15.86, 0.24),
      mkMoc('I15', 16.07, 15.86, 0.24),
      mkMoc('I16', 0.46, 19.28, 0.24),
      mkMoc('I17', 5.65, 19.28, 0.24),
      mkMoc('I18', 10.86, 19.28, 0.24),
      mkMoc('I19', 16.07, 19.28, 0.24),
      mkMoc('I20', 5.65, 22.90, 0.24),
      mkMoc('I21', 10.86, 22.90, 0.24)
    ],
    p1: [],
    p2: [],
    p3: qmtln30_p3,
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: Array.from({ length: 8 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(10.88 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: Array.from({ length: 4 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(13.92 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // 2. MẪU PHIẾU KẾT HỢP: 40 CÂU TN 4 PHƯƠNG ÁN + TỰ LUẬN (QM_TULUAN40)
  // - Nửa trên: SBD (8 số) + Mã đề (4 số) + 40 câu Trắc nghiệm A, B, C, D (4 cột × 10 câu).
  // - Nửa dưới: Khung chấm điểm Tự luận + Vùng dòng kẻ trình bày bài làm Tự luận.
  // ============================================================================
  const tuluan40_p1 = [];
  const tl40ColX0 = [1.80, 5.45, 9.10, 12.75];
  for (let col = 0; col < 4; col++) {
    const bx = tl40ColX0[col];
    for (let row = 0; row < 10; row++) {
      const cy = +(6.44 + row * 0.38).toFixed(4);
      tuluan40_p1.push([
        [+(bx).toFixed(4), cy],
        [+(bx + 0.52).toFixed(4), cy],
        [+(bx + 1.04).toFixed(4), cy],
        [+(bx + 1.56).toFixed(4), cy]
      ]);
    }
  }

  window.MAU.qmtuluan40 = {
    ten: 'QM_TuLuan40 - 40 Câu TN (4 Phương Án) + Tự Luận',
    r: 0.115,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isHybridEssay: true,
    essayBox: [0.92, 10.85, 15.61, 22.65], // Vùng tự luận (cm)
    moc: [
      mkMoc('TL', 0.46, 0.46, 0.38),
      mkMoc('TR', 16.07, 0.46, 0.38),
      mkMoc('BR', 16.07, 22.90, 0.38),
      mkMoc('BL', 0.46, 22.90, 0.38),
      mkMoc('I0', 0.46, 5.45, 0.24),
      mkMoc('I1', 4.86, 5.45, 0.24),
      mkMoc('I2', 8.50, 5.45, 0.24),
      mkMoc('I3', 12.16, 5.45, 0.24),
      mkMoc('I4', 16.07, 5.45, 0.24),
      mkMoc('I5', 0.46, 10.55, 0.26),
      mkMoc('I6', 4.86, 10.55, 0.24),
      mkMoc('I7', 8.50, 10.55, 0.24),
      mkMoc('I8', 12.16, 10.55, 0.24),
      mkMoc('I9', 16.07, 10.55, 0.26),
      mkMoc('I10', 0.46, 16.70, 0.24),
      mkMoc('I11', 16.07, 16.70, 0.24)
    ],
    p1: tuluan40_p1,
    p2: [],
    p3: [],
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: Array.from({ length: 8 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(10.88 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: Array.from({ length: 4 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(13.92 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // 3. MẪU PHIẾU KẾT HỢP RÚT GỌN: 20 TN + 2 Đ/S + 4 TLN + TỰ LUẬN (QM_COMBO2024)
  // - Phần I: Tối đa 20 câu TN 4 phương án A, B, C, D (4 cột × 5 câu).
  // - Phần II: Tối đa 2 câu Đúng/Sai (mỗi câu 4 ý a, b, c, d).
  // - Phần III: Tối đa 4 câu Trả lời ngắn (4 câu × 4 cột × 12 hàng).
  // - Phần IV: Khung ghi điểm Tự luận & Vùng trình bày Tự luận rộng rãi ở nửa dưới.
  // ============================================================================
  const combo_p1 = [];
  const cbColX0 = [1.88, 5.48, 9.08, 12.68];
  for (let col = 0; col < 4; col++) {
    const bx = cbColX0[col];
    for (let row = 0; row < 5; row++) {
      const cy = +(6.34 + row * 0.36).toFixed(4);
      combo_p1.push([
        [+(bx).toFixed(4), cy],
        [+(bx + 0.50).toFixed(4), cy],
        [+(bx + 1.00).toFixed(4), cy],
        [+(bx + 1.50).toFixed(4), cy]
      ]);
    }
  }

  // Phần II: 2 câu Đ/S (8 dòng ý: 0..3 là Câu 1 a,b,c,d; 4..7 là Câu 2 a,b,c,d)
  const combo_p2 = [];
  const cbP2ColX = [2.16, 4.26];
  for (let q = 0; q < 2; q++) {
    const bx = cbP2ColX[q];
    for (let r = 0; r < 4; r++) {
      const cy = +(9.64 + r * 0.44).toFixed(4);
      combo_p2.push([
        [+(bx).toFixed(4), cy],        // Đúng
        [+(bx + 0.62).toFixed(4), cy]  // Sai
      ]);
    }
  }

  // Phần III: 4 câu TLN đặt bên phải Phần II (từ x = 6.20 đến 15.40)
  const combo_p3 = [];
  const cbP3ColX0 = [6.36, 8.76, 11.16, 13.56];
  const cbP3Dy = 0.205;
  const cbP3Dx = 0.35;
  for (let q = 0; q < 4; q++) {
    const x0 = cbP3ColX0[q];
    const qCols = [];
    for (let col = 0; col < 4; col++) {
      const cx = +(x0 + col * cbP3Dx).toFixed(4);
      const colPts = [];
      for (let row = 0; row < 12; row++) {
        const cy = +(9.66 + row * cbP3Dy).toFixed(4);
        colPts.push([cx, cy]);
      }
      qCols.push(colPts);
    }
    combo_p3.push(qCols);
  }

  window.MAU.qmcombo2024 = {
    ten: 'QM_Combo2024 - 20 TN + 2 Đ/S + 4 TLN + Tự Luận',
    r: 0.098,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isHybridEssay: true,
    essayBox: [0.92, 12.75, 15.61, 22.65],
    moc: [
      mkMoc('TL', 0.46, 0.46, 0.38),
      mkMoc('TR', 16.07, 0.46, 0.38),
      mkMoc('BR', 16.07, 22.90, 0.38),
      mkMoc('BL', 0.46, 22.90, 0.38),
      mkMoc('I0', 0.46, 5.45, 0.24),
      mkMoc('I1', 4.86, 5.45, 0.24),
      mkMoc('I2', 8.50, 5.45, 0.24),
      mkMoc('I3', 12.16, 5.45, 0.24),
      mkMoc('I4', 16.07, 5.45, 0.24),
      mkMoc('I5', 0.46, 8.26, 0.24),
      mkMoc('I6', 5.66, 8.26, 0.24),
      mkMoc('I7', 16.07, 8.26, 0.24),
      mkMoc('I8', 0.46, 12.50, 0.26),
      mkMoc('I9', 5.66, 12.50, 0.24),
      mkMoc('I10', 11.00, 12.50, 0.24),
      mkMoc('I11', 16.07, 12.50, 0.26),
      mkMoc('I12', 0.46, 17.70, 0.24),
      mkMoc('I13', 16.07, 17.70, 0.24)
    ],
    p1: combo_p1,
    p2: combo_p2,
    p3: combo_p3,
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: Array.from({ length: 8 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(10.88 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: Array.from({ length: 4 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(13.92 + col * 0.30).toFixed(4), +(1.82 + d * 0.34).toFixed(4)])
    ),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // BỘ DỰNG VECTOR CANVAS & XUẤT PDF/PNG IN A4 ĐỘ NÉT CAO (300 DPI)
  // Đảm bảo trùng khớp 100.00% từng milimet với tọa độ chấm OMR
  // ============================================================================
  window.renderCustomOmrSheetToCanvas = function (tplKey, scale = 1.5) {
    const tpl = window.MAU && window.MAU[tplKey];
    if (!tpl) return null;

    // Kích thước gốc chuẩn 1653 x 2339 (100 px = 1 cm) -> scale = 1.5 cho 2480 x 3508 (chuẩn A4 300 DPI)
    const baseW = Math.round(tpl.khung[2] * 100);
    const baseH = Math.round(tpl.khung[3] * 100);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(baseW * scale);
    canvas.height = Math.round(baseH * scale);
    const ctx = canvas.getContext('2d');

    ctx.save();
    ctx.scale(scale, scale);

    // Nền giấy trắng tinh
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, baseW, baseH);

    const cm = (v) => v * 100;

    // 1. Vẽ toàn bộ mốc định vị đen (Fiducial Markers)
    ctx.fillStyle = '#000000';
    for (const m of tpl.moc) {
      const mx = m.x !== undefined ? m.x : m[0];
      const my = m.y !== undefined ? m.y : m[1];
      const ms = (m.s !== undefined ? m.s : m[2]) || 0.24;
      ctx.fillRect(cm(mx - ms / 2), cm(my - ms / 2), cm(ms), cm(ms));
    }

    // Helper vẽ khung chữ nhật
    const strokeBox = (x, y, w, h, lw = 1.6, color = '#000000') => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(cm(x), cm(y), cm(w), cm(h));
    };

    // Helper vẽ ô tròn trắc nghiệm chuẩn BGD
    const drawBubble = (x, y, rCm, label = '', fontSize = 11.5) => {
      ctx.beginPath();
      ctx.arc(cm(x), cm(y), cm(rCm), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.35;
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();
      if (label) {
        ctx.fillStyle = '#0f172a';
        ctx.font = `700 ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cm(x), cm(y) + 0.5);
      }
    };

    // 2. VẼ PHẦN HEADER CHUNG (HỌ TÊN, LỚP, PHÒNG THI, SBD 8 SỐ, MÃ ĐỀ 4 SỐ)
    // Khung thông tin thí sinh bên trái (x: 0.92 -> 10.35, y: 0.65 -> 5.18)
    strokeBox(0.92, 0.65, 9.43, 4.53, 1.8);

    ctx.fillStyle = '#000000';
    ctx.font = '900 19px "Times New Roman", Arial, serif';
    ctx.textAlign = 'center';
    const sheetMainTitle =
      tplKey === 'qmtln30'
        ? 'PHIẾU TRẢ LỜI TRẮC NGHIỆM – CHUYÊN ĐỀ TRẢ LỜI NGẮN (30 CÂU)'
        : tplKey === 'qmtuluan40'
        ? 'PHIẾU BÀI LÀM TRẮC NGHIỆM & TỰ LUẬN KẾT HỢP'
        : 'PHIẾU LÀM BÀI KIỂM TRA ĐỊNH KỲ (TRẮC NGHIỆM + TỰ LUẬN)';
    ctx.fillText(sheetMainTitle, cm(5.63), cm(0.98));

    ctx.font = 'italic 12px Arial, sans-serif';
    const subTitle =
      tplKey === 'qmtln30'
        ? 'Chuẩn định dạng Bộ GD&ĐT (Hỗ trợ đề từ 1 đến 30 câu Trả lời ngắn)'
        : tplKey === 'qmtuluan40'
        ? 'Phần I: Trắc nghiệm 4 phương án (Tối đa 40 câu)  •  Phần II: Trình bày Tự luận'
        : 'Cấu trúc kết hợp: Phần I (Tối đa 20 TN) • Phần II (Tối đa 2 Đ/S) • Phần III (Tối đa 4 TLN) • Phần IV (Tự luận)';
    ctx.fillText(subTitle, cm(5.63), cm(1.22));

    // Đường kẻ ngang dưới tiêu đề
    ctx.beginPath();
    ctx.moveTo(cm(1.10), cm(1.36));
    ctx.lineTo(cm(10.15), cm(1.36));
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // Các dòng thông tin thí sinh (tương thích vị trí cropCandidateHandwrittenName ở y ~ 2.45 - 2.95)
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('1. Kỳ thi / Kiểm tra: ..........................................................................................................', cm(1.12), cm(1.70));
    ctx.fillText('2. Môn thi: ....................................................   Ngày thi: ......../......../202......', cm(1.12), cm(2.04));
    ctx.fillText('3. Phòng thi: ................................................   Lớp: .............................................', cm(1.12), cm(2.38));
    ctx.fillText('4. Họ và tên thí sinh (chữ in hoa): .................................................................................', cm(1.12), cm(2.76));

    // Khung chữ ký / Hướng dẫn & Bảng ghi điểm tổng hợp trong Header
    if (tplKey === 'qmtln30') {
      strokeBox(1.12, 2.98, 5.80, 2.02, 1.1);
      ctx.font = 'bold 11.5px Arial, sans-serif';
      ctx.fillText('HƯỚNG DẪN LÀM BÀI TRẢ LỜI NGẮN (30 CÂU):', cm(1.25), cm(3.22));
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText('• Ghi kết quả số vào 4 ô vuông ở đầu mỗi câu (từ trái sang phải).', cm(1.25), cm(3.48));
      ctx.fillText('• Dấu trừ (-) chỉ tô ở cột thứ nhất; dấu phẩy (,) tô ở cột 2 hoặc 3.', cm(1.25), cm(3.73));
      ctx.fillText('• Tô kín và đậm 1 ô tròn tương ứng trên mỗi cột bằng bút chì đen.', cm(1.25), cm(3.98));
      ctx.fillText('• Tuyệt đối không làm bẩn 4 mốc vuông đen ở 4 góc tờ phiếu.', cm(1.25), cm(4.23));
      ctx.fillText('• Thí sinh ký tên: ...............................................................', cm(1.25), cm(4.78));

      strokeBox(7.05, 2.98, 3.12, 2.02, 1.1);
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('KẾT QUẢ CHẤM', cm(8.61), cm(3.22));
      ctx.beginPath();
      ctx.moveTo(cm(7.05), cm(3.36));
      ctx.lineTo(cm(10.17), cm(3.36));
      ctx.stroke();
      ctx.font = 'italic 11px Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('(Hệ thống đóng dấu tự động)', cm(8.61), cm(4.82));
    } else {
      // Bảng Điểm Trắc nghiệm | Điểm Tự luận | Tổng điểm | Nhận xét của Giáo viên
      const bx = 1.10, by = 2.96, bw = 9.08, bh = 2.04;
      strokeBox(bx, by, bw, bh, 1.3);
      ctx.beginPath();
      ctx.moveTo(cm(bx), cm(by + 0.38));
      ctx.lineTo(cm(bx + bw), cm(by + 0.38));
      // Chia 4 cột: Điểm TN (1.72) | Điểm TL (1.72) | Tổng Điểm (1.85) | Nhận xét & Chữ ký HS (3.79)
      const c1 = bx + 1.72, c2 = c1 + 1.72, c3 = c2 + 1.85;
      ctx.moveTo(cm(c1), cm(by)); ctx.lineTo(cm(c1), cm(by + bh));
      ctx.moveTo(cm(c2), cm(by)); ctx.lineTo(cm(c2), cm(by + bh));
      ctx.moveTo(cm(c3), cm(by)); ctx.lineTo(cm(c3), cm(by + bh));
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ĐIỂM TRẮC NGHIỆM', cm((bx + c1) / 2), cm(by + 0.24));
      ctx.fillText('ĐIỂM TỰ LUẬN', cm((c1 + c2) / 2), cm(by + 0.24));
      ctx.fillText('TỔNG ĐIỂM', cm((c2 + c3) / 2), cm(by + 0.24));
      ctx.fillText('NHẬN XÉT CỦA GIÁO VIÊN / CHỮ KÝ', cm((c3 + bx + bw) / 2), cm(by + 0.24));

      ctx.font = 'italic 10px Arial, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText('(Máy chấm tự động)', cm((bx + c1) / 2), cm(by + bh - 0.14));
      ctx.fillText('(Giáo viên ghi)', cm((c1 + c2) / 2), cm(by + bh - 0.14));
      ctx.fillText('(TN + Tự luận)', cm((c2 + c3) / 2), cm(by + bh - 0.14));
    }

    // 3. VẼ KHUNG SỐ BÁO DANH (8 CỘT) & MÃ ĐỀ THI (4 CỘT)
    // Khung SBD: x = 10.62 -> 13.18, y = 0.65 -> 5.18
    strokeBox(10.62, 0.65, 2.56, 4.53, 1.8);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('7. SỐ BÁO DANH', cm(11.90), cm(0.90));
    for (let c = 0; c < 8; c++) {
      const cx = 10.88 + c * 0.30;
      strokeBox(cx - 0.14, 1.04, 0.28, 0.44, 1.1);
      for (let d = 0; d < 10; d++) {
        const pt = tpl.sbd[c][d];
        drawBubble(pt[0], pt[1], 0.11, String(d), 10);
      }
    }

    // Khung Mã đề: x = 13.64 -> 15.14, y = 0.65 -> 5.18
    strokeBox(13.64, 0.65, 1.48, 4.53, 1.8);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('8. MÃ ĐỀ THI', cm(14.38), cm(0.90));
    for (let c = 0; c < 4; c++) {
      const cx = 13.92 + c * 0.30;
      strokeBox(cx - 0.14, 1.04, 0.28, 0.44, 1.1);
      for (let d = 0; d < 10; d++) {
        const pt = tpl.made[c][d];
        drawBubble(pt[0], pt[1], 0.11, String(d), 10);
      }
    }

    // Helper vẽ 1 hộp Câu Trả lời ngắn (4 cột × 12 hàng)
    const drawP3QuestionBox = (qIdx, qCols, boxTopY, dyStep, rBubble) => {
      const xFirst = qCols[0][0][0];
      const xLast = qCols[3][0][0];
      const yFirst = qCols[0][0][1];
      const yLast = qCols[0][11][1];
      const boxLeft = xFirst - 0.46;
      const boxRight = xLast + 0.20;
      const boxW = boxRight - boxLeft;
      const boxBottom = yLast + 0.18;
      const boxH = boxBottom - boxTopY;

      strokeBox(boxLeft, boxTopY, boxW, boxH, 1.4);

      // Header "Câu X"
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(boxLeft + 0.015), cm(boxTopY + 0.015), cm(boxW - 0.03), cm(0.28));
      ctx.beginPath();
      ctx.moveTo(cm(boxLeft), cm(boxTopY + 0.29));
      ctx.lineTo(cm(boxRight), cm(boxTopY + 0.29));
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Câu ${qIdx + 1}`, cm((boxLeft + boxRight) / 2), cm(boxTopY + 0.15));

      // 4 ô điền chữ số viết tay
      const writeTop = boxTopY + 0.29;
      const writeH = (yFirst - rBubble - 0.06) - writeTop;
      ctx.beginPath();
      ctx.moveTo(cm(boxLeft), cm(writeTop + writeH));
      ctx.lineTo(cm(boxRight), cm(writeTop + writeH));
      ctx.stroke();

      for (let c = 0; c < 4; c++) {
        const colX = qCols[c][0][0] - 0.17;
        ctx.beginPath();
        ctx.moveTo(cm(colX), cm(writeTop));
        ctx.lineTo(cm(colX), cm(boxBottom));
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = '#64748b';
        ctx.stroke();
      }

      // Nhãn hàng (- , 0..9) bên trái và các ô tròn
      const rowLabels = tpl.p3hang;
      for (let r = 0; r < 12; r++) {
        const cy = qCols[0][r][1];
        // Vạch ngang phân cách nhẹ giữa các hàng để học sinh dóng cột không nhầm
        if (r > 0) {
          ctx.beginPath();
          ctx.moveTo(cm(boxLeft), cm(cy - dyStep / 2));
          ctx.lineTo(cm(boxRight), cm(cy - dyStep / 2));
          ctx.lineWidth = 0.35;
          ctx.strokeStyle = '#cbd5e1';
          ctx.stroke();
        }
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 10px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowLabels[r], cm(boxLeft + 0.16), cm(cy));

        for (let c = 0; c < 4; c++) {
          const pt = qCols[c][r];
          // Chỉ vẽ ký tự mờ bên trong ô tròn để học sinh dễ tô
          drawBubble(pt[0], pt[1], rBubble, rowLabels[r], 8.5);
        }
      }
    };

    // Helper vẽ vùng trình bày Tự luận có dòng kẻ chấm + bảng điểm thành phần
    const drawEssayArea = (x0, y0, x1, y1, partTitle) => {
      const w = x1 - x0;
      const h = y1 - y0;
      strokeBox(x0, y0, w, h, 1.8);

      // Thanh tiêu đề Phần Tự Luận + Bảng điểm thành phần Câu 1, Câu 2, Câu 3, Câu 4
      const headerH = 0.48;
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(x0 + 0.02), cm(y0 + 0.02), cm(w - 0.04), cm(headerH - 0.02));
      ctx.beginPath();
      ctx.moveTo(cm(x0), cm(y0 + headerH));
      ctx.lineTo(cm(x1), cm(y0 + headerH));
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(partTitle, cm(x0 + 0.18), cm(y0 + headerH / 2));

      // Các ô điểm tự luận nhỏ góc phải thanh tiêu đề (Bài 1 | Bài 2 | Bài 3 | Bài 4 | Tổng TL)
      const scoreBoxW = 1.12;
      const labels = ['Bài 1: ........đ', 'Bài 2: ........đ', 'Bài 3: ........đ', 'Bài 4: ........đ', 'Tổng TL: ........đ'];
      const startScoreX = x1 - labels.length * scoreBoxW;
      ctx.font = 'bold 10px Arial, sans-serif';
      for (let i = 0; i < labels.length; i++) {
        const sx = startScoreX + i * scoreBoxW;
        ctx.beginPath();
        ctx.moveTo(cm(sx), cm(y0));
        ctx.lineTo(cm(sx), cm(y0 + headerH));
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.fillStyle = i === labels.length - 1 ? '#b91c1c' : '#1e293b';
        ctx.fillText(labels[i], cm(sx + 0.10), cm(y0 + headerH / 2));
      }

      // Dòng kẻ chấm (dotted lines) cách nhau 0.62cm để học sinh trình bày lời giải tự luận
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.85;
      for (let ly = y0 + headerH + 0.62; ly < y1 - 0.25; ly += 0.62) {
        ctx.beginPath();
        ctx.moveTo(cm(x0 + 0.22), cm(ly));
        ctx.lineTo(cm(x1 - 0.22), cm(ly));
        ctx.stroke();
      }
      ctx.restore();
    };

    // ========================================================================
    // 4. VẼ NỘI DUNG RIÊNG CỦA TỪNG MẪU PHIẾU
    // ========================================================================
    if (tplKey === 'qmtln30') {
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN TRẢ LỜI NGẮN (30 CÂU): Thí sinh viết số vào 4 ô vuông đỉnh cột rồi tô kín ô tròn tương ứng', cm(0.92), cm(5.63));

      for (let q = 0; q < 30; q++) {
        const r = Math.floor(q / 6);
        const boxTopY = tln30RowY0[r] - 0.70;
        drawP3QuestionBox(q, tpl.p3[q], boxTopY, tln30Dy, tpl.r);
      }
    } else if (tplKey === 'qmtuluan40') {
      // Khung Phần I: 40 câu Trắc nghiệm 4 phương án
      strokeBox(0.92, 5.70, 14.69, 4.62, 1.8);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(0.94), cm(5.72), cm(14.65), cm(0.38));
      ctx.beginPath();
      ctx.moveTo(cm(0.92), cm(6.10));
      ctx.lineTo(cm(15.61), cm(6.10));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN I. TRẮC NGHIỆM 4 PHƯƠNG ÁN (Mỗi câu thí sinh chỉ chọn 1 phương án A, B, C hoặc D)', cm(1.10), cm(5.95));

      const opts = ['A', 'B', 'C', 'D'];
      for (let col = 0; col < 4; col++) {
        const bx = tl40ColX0[col];
        if (col > 0) {
          ctx.beginPath();
          ctx.moveTo(cm(bx - 0.85), cm(6.10));
          ctx.lineTo(cm(bx - 0.85), cm(10.32));
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = '#94a3b8';
          ctx.stroke();
        }
        // Header cột A B C D
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'center';
        for (let o = 0; o < 4; o++) {
          ctx.fillText(opts[o], cm(bx + o * 0.52), cm(6.24));
        }

        for (let row = 0; row < 10; row++) {
          const qIdx = col * 10 + row;
          const qPts = tpl.p1[qIdx];
          const cy = qPts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 11.5px Arial, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${qIdx + 1}.`, cm(bx - 0.26), cm(cy));
          for (let o = 0; o < 4; o++) {
            drawBubble(qPts[o][0], qPts[o][1], tpl.r, opts[o], 10.5);
          }
        }
      }

      // Khung Phần II: Tự Luận
      drawEssayArea(0.92, 10.85, 15.61, 22.65, 'PHẦN II. BÀI LÀM TỰ LUẬN (Thí sinh trình bày lời giải vào vùng dòng kẻ dưới đây)');
    } else if (tplKey === 'qmcombo2024') {
      // 1. Khung Phần I: 20 câu Trắc nghiệm 4 phương án (4 cột × 5 câu)
      strokeBox(0.92, 5.66, 14.69, 2.38, 1.8);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(0.94), cm(5.68), cm(14.65), cm(0.36));
      ctx.beginPath();
      ctx.moveTo(cm(0.92), cm(6.04));
      ctx.lineTo(cm(15.61), cm(6.04));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN I. TRẮC NGHIỆM NHIỀU LỰA CHỌN (Tối đa 20 câu – Mỗi câu chọn 1 đáp án A, B, C hoặc D)', cm(1.10), cm(5.88));

      const opts = ['A', 'B', 'C', 'D'];
      for (let col = 0; col < 4; col++) {
        const bx = cbColX0[col];
        if (col > 0) {
          ctx.beginPath();
          ctx.moveTo(cm(bx - 0.82), cm(6.04));
          ctx.lineTo(cm(bx - 0.82), cm(8.04));
          ctx.lineWidth = 0.85;
          ctx.strokeStyle = '#94a3b8';
          ctx.stroke();
        }
        for (let row = 0; row < 5; row++) {
          const qIdx = col * 5 + row;
          const qPts = tpl.p1[qIdx];
          const cy = qPts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 11px Arial, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${qIdx + 1}.`, cm(bx - 0.24), cm(cy));
          for (let o = 0; o < 4; o++) {
            drawBubble(qPts[o][0], qPts[o][1], tpl.r, opts[o], 9.8);
          }
        }
      }

      // 2. Khung Phần II (Bên trái): Tối đa 2 câu Đúng/Sai
      strokeBox(0.92, 8.48, 4.52, 3.80, 1.8);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(0.94), cm(8.50), cm(4.48), cm(0.36));
      ctx.beginPath();
      ctx.moveTo(cm(0.92), cm(8.86));
      ctx.lineTo(cm(5.44), cm(8.86));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN II. TRẮC NGHIỆM ĐÚNG / SAI (Tối đa 2 câu)', cm(1.06), cm(8.70));

      for (let q = 0; q < 2; q++) {
        const bx = cbP2ColX[q];
        const cardLeft = bx - 0.72;
        const cardW = 1.92;
        strokeBox(cardLeft, 8.98, cardW, 2.34, 1.1);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(cm(cardLeft + 0.02), cm(9.00), cm(cardW - 0.04), cm(0.38));
        ctx.beginPath();
        ctx.moveTo(cm(cardLeft), cm(9.38));
        ctx.lineTo(cm(cardLeft + cardW), cm(9.38));
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Câu ${q + 1}`, cm(cardLeft + cardW / 2), cm(9.14));
        ctx.font = 'bold 9.5px Arial, sans-serif';
        ctx.fillText('Ý', cm(cardLeft + 0.32), cm(9.30));
        ctx.fillText('Đúng', cm(bx), cm(9.30));
        ctx.fillText('Sai', cm(bx + 0.62), cm(9.30));

        const subLabels = ['a)', 'b)', 'c)', 'd)'];
        for (let r = 0; r < 4; r++) {
          const pts = tpl.p2[q * 4 + r];
          const cy = pts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 11px Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(subLabels[r], cm(cardLeft + 0.32), cm(cy));
          drawBubble(pts[0][0], pts[0][1], tpl.r, 'Đ', 9.5);
          drawBubble(pts[1][0], pts[1][1], tpl.r, 'S', 9.5);
        }
      }
      ctx.fillStyle = '#475569';
      ctx.font = 'italic 9.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('* Trong mỗi ý a), b), c), d) hãy tô Đúng (Đ) hoặc Sai (S).', cm(1.08), cm(11.65));
      ctx.fillText('* Barem chuẩn BGD: 1 ý: 0.1đ · 2 ý: 0.25đ · 3 ý: 0.5đ · 4 ý: 1.0đ.', cm(1.08), cm(11.95));

      // 3. Khung Phần III (Bên phải): Tối đa 4 câu Trả lời ngắn
      strokeBox(5.80, 8.48, 9.81, 3.80, 1.8);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(5.82), cm(8.50), cm(9.77), cm(0.36));
      ctx.beginPath();
      ctx.moveTo(cm(5.80), cm(8.86));
      ctx.lineTo(cm(15.61), cm(8.86));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = 'bold 11.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN III. TRẮC NGHIỆM TRẢ LỜI NGẮN (Tối đa 4 câu – Điền số & tô ô tròn tương ứng)', cm(5.96), cm(8.70));

      for (let q = 0; q < 4; q++) {
        drawP3QuestionBox(q, tpl.p3[q], 8.94, cbP3Dy, tpl.r);
      }

      // 4. Khung Phần IV: Tự Luận
      drawEssayArea(0.92, 12.75, 15.61, 22.65, 'PHẦN IV. BÀI LÀM TỰ LUẬN (Thí sinh trình bày lời giải chi tiết vào phần dòng kẻ bên dưới)');
    }

    ctx.restore();
    return canvas;
  };

  // Mở cửa sổ in A4 chuẩn 100% khổ giấy (không lề, nét căng 300 DPI) hoặc lưu thành PDF
  window.printCustomOmrSheetA4 = function (tplKey) {
    const canvas = window.renderCustomOmrSheetToCanvas(tplKey, 1.8);
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const tpl = window.MAU[tplKey];
    const win = window.open('', '_blank');
    if (!win) {
      alert('Vui lòng cho phép mở cửa sổ bật lên (Pop-up) để in phiếu A4!');
      return;
    }
    win.document.write(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${tpl.ten || 'Phiếu Trả Lời OMR A4'}</title>
  <style>
    @page { size: A4 portrait; margin: 0mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #334155; display: flex; flex-direction: column; align-items: center; font-family: system-ui, sans-serif; }
    .toolbar {
      position: fixed; top: 14px; z-index: 100; background: #0f172a; color: #fff;
      padding: 10px 20px; border-radius: 999px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      display: flex; align-items: center; gap: 14px; font-size: 13px; font-weight: 700;
    }
    .toolbar button, .toolbar a {
      background: #10b981; color: #fff; border: none; padding: 7px 16px; border-radius: 999px;
      cursor: pointer; font-weight: 800; font-size: 13px; text-decoration: none;
    }
    .toolbar a.dl { background: #3b82f6; }
    .page {
      width: 210mm; height: 297mm; background: #fff; margin: 68px auto 30px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
    }
    .page img { width: 210mm; height: 297mm; object-fit: contain; display: block; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page { margin: 0; box-shadow: none; width: 210mm; height: 297mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>📄 ${tpl.ten} (Chuẩn in A4 300 DPI)</span>
    <button onclick="window.print()">🖨️ In Phiếu A4 / Lưu PDF</button>
    <a class="dl" href="${dataUrl}" download="${tplKey}-A4-300dpi.png">⬇️ Tải Ảnh Gốc 300 DPI</a>
  </div>
  <div class="page">
    <img src="${dataUrl}" alt="${tpl.ten}" onload="setTimeout(() => {}, 200)" />
  </div>
</body>
</html>`);
    win.document.close();
  };

  window.downloadCustomOmrSheetPNG = function (tplKey) {
    const canvas = window.renderCustomOmrSheetToCanvas(tplKey, 1.8);
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${tplKey}-A4-300dpi.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
})();
