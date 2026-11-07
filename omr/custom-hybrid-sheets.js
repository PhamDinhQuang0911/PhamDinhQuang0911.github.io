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

  // Toạ độ dùng chung cho SBD (8 chữ số) và Mã đề (4 chữ số) chuẩn kích thước lớn TNMaker / BGD
  // Bán kính ô tô SBD/Mã đề r = 0.130cm (đường kính 0.26cm = 3.30mm trên giấy A4), khoảng cách dọc 0.375cm
  function buildStandardSbd() {
    return Array.from({ length: 8 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(10.90 + col * 0.315).toFixed(4), +(2.06 + d * 0.375).toFixed(4)])
    );
  }
  function buildStandardMade() {
    return Array.from({ length: 4 }, (_, col) =>
      Array.from({ length: 10 }, (_, d) => [+(14.02 + col * 0.315).toFixed(4), +(2.06 + d * 0.375).toFixed(4)])
    );
  }

  // ============================================================================
  // 1. MẪU PHIẾU CHUYÊN TRẢ LỜI NGẮN 30 CÂU (QM_TLN30) - NỀN GIẤY CHUẨN BGD A4
  // - Hỗ trợ từ 1 đến 30 câu Trả lời ngắn (5 hàng × 6 câu/hàng).
  // - KHÔNG có ô ghi điểm số trên phiếu (theo chuẩn phiếu chuyên TN).
  // - Chữ cỡ lớn chuẩn TNMaker (Times New Roman) & Ô tô tròn cỡ lớn (r = 0.106cm).
  // ============================================================================
  const tln30RowY0 = [6.62, 10.02, 13.42, 16.82, 20.22]; // 5 hàng cách đều 3.40cm
  const tln30ColX0 = [1.46, 3.99, 6.52, 9.05, 11.58, 14.11]; // 6 câu mỗi hàng ngang, nằm gọn trong [0.92 .. 15.56]
  const tln30Dy = 0.212; // Khoảng cách tâm-tâm theo chiều dọc giữa 12 hàng (- , 0..9)
  const tln30Dx = 0.35;  // Khoảng cách tâm-tâm theo chiều ngang giữa 4 cột trong 1 câu

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
    r: 0.106,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isMultiRowP3: true,
    moc: [
      // 4 góc chuẩn A4 (cạnh 0.42cm đậm nét chuẩn TNMaker)
      mkMoc('TL', 0.46, 0.46, 0.42),
      mkMoc('TR', 16.07, 0.46, 0.42),
      mkMoc('BR', 16.07, 22.92, 0.42),
      mkMoc('BL', 0.46, 22.92, 0.42),
      // Mốc trung gian nằm hoàn toàn trong khoảng trắng giữa các hàng & cột
      mkMoc('I0', 0.46, 5.66, 0.25),
      mkMoc('I1', 5.835, 5.66, 0.25),
      mkMoc('I2', 10.895, 5.66, 0.25),
      mkMoc('I3', 16.07, 5.66, 0.25),
      mkMoc('I4', 0.46, 9.15, 0.25),
      mkMoc('I5', 5.835, 9.15, 0.25),
      mkMoc('I6', 10.895, 9.15, 0.25),
      mkMoc('I7', 16.07, 9.15, 0.25),
      mkMoc('I8', 0.46, 12.55, 0.25),
      mkMoc('I9', 5.835, 12.55, 0.25),
      mkMoc('I10', 10.895, 12.55, 0.25),
      mkMoc('I11', 16.07, 12.55, 0.25),
      mkMoc('I12', 0.46, 15.95, 0.25),
      mkMoc('I13', 5.835, 15.95, 0.25),
      mkMoc('I14', 10.895, 15.95, 0.25),
      mkMoc('I15', 16.07, 15.95, 0.25),
      mkMoc('I16', 0.46, 19.35, 0.25),
      mkMoc('I17', 5.835, 19.35, 0.25),
      mkMoc('I18', 10.895, 19.35, 0.25),
      mkMoc('I19', 16.07, 19.35, 0.25),
      mkMoc('I20', 5.835, 22.92, 0.25),
      mkMoc('I21', 10.895, 22.92, 0.25)
    ],
    p1: [],
    p2: [],
    p3: qmtln30_p3,
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: buildStandardSbd(),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: buildStandardMade(),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // 2. MẪU PHIẾU KẾT HỢP: 40 CÂU TN 4 PHƯƠNG ÁN + TỰ LUẬN (QM_TULUAN40)
  // - Nửa trên: Khung Điểm (chuyên cho phiếu Tự luận TN) + Thông tin TS + SBD + Mã đề + 40 câu A,B,C,D.
  // - Ô tô rất to (r = 0.145cm, tương đương đường kính ~3.7mm trên A4, to hơn cả BGD chuẩn).
  // - Nửa dưới: Vùng trình bày bài làm Tự luận + ô ghi điểm từng bài.
  // ============================================================================
  const tuluan40_p1 = [];
  const tl40ColX0 = [1.82, 5.50, 9.18, 12.86];
  for (let col = 0; col < 4; col++) {
    const bx = tl40ColX0[col];
    for (let row = 0; row < 10; row++) {
      const cy = +(6.92 + row * 0.405).toFixed(4);
      tuluan40_p1.push([
        [+(bx).toFixed(4), cy],
        [+(bx + 0.68).toFixed(4), cy],
        [+(bx + 1.36).toFixed(4), cy],
        [+(bx + 2.04).toFixed(4), cy]
      ]);
    }
  }

  window.MAU.qmtuluan40 = {
    ten: 'QM_TuLuan40 - 40 Câu TN (4 Phương Án) + Tự Luận',
    r: 0.145,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isHybridEssay: true,
    essayBox: [0.92, 11.42, 15.61, 22.65], // Vùng tự luận (cm)
    moc: [
      mkMoc('TL', 0.46, 0.46, 0.42),
      mkMoc('TR', 16.07, 0.46, 0.42),
      mkMoc('BR', 16.07, 22.92, 0.42),
      mkMoc('BL', 0.46, 22.92, 0.42),
      mkMoc('I0', 0.46, 5.88, 0.25),
      mkMoc('I1', 4.41, 5.88, 0.25),
      mkMoc('I2', 8.09, 5.88, 0.25),
      mkMoc('I3', 11.77, 5.88, 0.25),
      mkMoc('I4', 16.07, 5.88, 0.25),
      mkMoc('I5', 0.46, 11.12, 0.26),
      mkMoc('I6', 4.41, 11.12, 0.25),
      mkMoc('I7', 8.09, 11.12, 0.25),
      mkMoc('I8', 11.77, 11.12, 0.25),
      mkMoc('I9', 16.07, 11.12, 0.26),
      mkMoc('I10', 0.46, 17.00, 0.25),
      mkMoc('I11', 16.07, 17.00, 0.25)
    ],
    p1: tuluan40_p1,
    p2: [],
    p3: [],
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: buildStandardSbd(),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: buildStandardMade(),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // 3. MẪU PHIẾU KẾT HỢP RÚT GỌN: 20 TN + 2 Đ/S + 4 TLN + TỰ LUẬN (QM_COMBO2024)
  // - Khung Điểm (chuyên cho phiếu có Tự luận) + Thông tin TS + SBD + Mã đề.
  // - Phần I: Tối đa 20 câu TN 4 phương án A, B, C, D (4 cột × 5 câu), ô tô r = 0.142cm.
  // - Phần II: Tối đa 2 câu Đúng/Sai (mỗi câu 4 ý a, b, c, d), ô tô r = 0.142cm.
  // - Phần III: Tối đa 4 câu Trả lời ngắn (4 câu × 4 cột × 12 hàng), ô tô r = 0.114cm.
  // - Phần IV: Vùng trình bày Tự luận + ô ghi điểm từng bài Tự luận.
  // ============================================================================
  const combo_p1 = [];
  const cbColX0 = [1.82, 5.50, 9.18, 12.86];
  for (let col = 0; col < 4; col++) {
    const bx = cbColX0[col];
    for (let row = 0; row < 5; row++) {
      const cy = +(6.92 + row * 0.41).toFixed(4);
      combo_p1.push([
        [+(bx).toFixed(4), cy],
        [+(bx + 0.68).toFixed(4), cy],
        [+(bx + 1.36).toFixed(4), cy],
        [+(bx + 2.04).toFixed(4), cy]
      ]);
    }
  }

  // Phần II: 2 câu Đ/S (8 dòng ý: 0..3 là Câu 1 a,b,c,d; 4..7 là Câu 2 a,b,c,d)
  const combo_p2 = [];
  const cbP2ColX = [2.04, 4.18];
  for (let q = 0; q < 2; q++) {
    const bx = cbP2ColX[q];
    for (let r = 0; r < 4; r++) {
      const cy = +(10.74 + r * 0.46).toFixed(4);
      combo_p2.push([
        [+(bx).toFixed(4), cy],        // Đúng
        [+(bx + 0.72).toFixed(4), cy]  // Sai
      ]);
    }
  }

  // Phần III: 4 câu TLN đặt bên phải Phần II (từ x = 5.95 đến 15.61)
  const combo_p3 = [];
  const cbP3ColX0 = [6.48, 8.88, 11.28, 13.68];
  const cbP3Dy = 0.228;
  const cbP3Dx = 0.39;
  for (let q = 0; q < 4; q++) {
    const x0 = cbP3ColX0[q];
    const qCols = [];
    for (let col = 0; col < 4; col++) {
      const cx = +(x0 + col * cbP3Dx).toFixed(4);
      const colPts = [];
      for (let row = 0; row < 12; row++) {
        const cy = +(10.48 + row * cbP3Dy).toFixed(4);
        colPts.push([cx, cy]);
      }
      qCols.push(colPts);
    }
    combo_p3.push(qCols);
  }

  window.MAU.qmcombo2024 = {
    ten: 'QM_Combo2024 - 20 TN + 2 Đ/S + 4 TLN + Tự Luận',
    r: 0.122,
    khung: [0, 0, 16.53, 23.39],
    isCustomRenderable: true,
    isHybridEssay: true,
    essayBox: [0.92, 13.68, 15.61, 22.65],
    moc: [
      mkMoc('TL', 0.46, 0.46, 0.42),
      mkMoc('TR', 16.07, 0.46, 0.42),
      mkMoc('BR', 16.07, 22.92, 0.42),
      mkMoc('BL', 0.46, 22.92, 0.42),
      mkMoc('I0', 0.46, 5.88, 0.25),
      mkMoc('I1', 4.41, 5.88, 0.25),
      mkMoc('I2', 8.09, 5.88, 0.25),
      mkMoc('I3', 11.77, 5.88, 0.25),
      mkMoc('I4', 16.07, 5.88, 0.25),
      mkMoc('I5', 0.46, 9.02, 0.25),
      mkMoc('I6', 5.65, 9.02, 0.25),
      mkMoc('I7', 16.07, 9.02, 0.25),
      mkMoc('I8', 0.46, 13.40, 0.26),
      mkMoc('I9', 5.65, 13.40, 0.25),
      mkMoc('I10', 11.00, 13.40, 0.25),
      mkMoc('I11', 16.07, 13.40, 0.26),
      mkMoc('I12', 0.46, 18.20, 0.25),
      mkMoc('I13', 16.07, 18.20, 0.25)
    ],
    p1: combo_p1,
    p2: combo_p2,
    p3: combo_p3,
    p3hang: ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    sbd: buildStandardSbd(),
    sbdNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    made: buildStandardMade(),
    madeNhan: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  };

  // ============================================================================
  // BỘ DỰNG VECTOR CANVAS & XUẤT PDF/PNG IN A4 ĐỘ NÉT CAO (300 DPI)
  // Thiết kế chuẩn thẩm mỹ & kích thước chữ to rõ như phiếu TNMaker / BGD
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
    const SERIF = '"Times New Roman", Times, serif';
    const SANS = 'Arial, Helvetica, sans-serif';

    // 1. Vẽ toàn bộ mốc định vị đen (Fiducial Markers)
    ctx.fillStyle = '#000000';
    for (const m of tpl.moc) {
      const mx = m.x !== undefined ? m.x : m[0];
      const my = m.y !== undefined ? m.y : m[1];
      const ms = (m.s !== undefined ? m.s : m[2]) || 0.25;
      ctx.fillRect(cm(mx - ms / 2), cm(my - ms / 2), cm(ms), cm(ms));
    }

    // Helper vẽ khung chữ nhật
    const strokeBox = (x, y, w, h, lw = 1.5, color = '#000000') => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(cm(x), cm(y), cm(w), cm(h));
    };

    // Helper vẽ ô tròn trắc nghiệm cỡ lớn chuẩn TNMaker/BGD
    const drawBubble = (x, y, rCm, label = '', fontSize = 13.5, strokeColor = '#334155', lw = 1.35) => {
      ctx.beginPath();
      ctx.arc(cm(x), cm(y), cm(rCm), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();
      if (label) {
        ctx.fillStyle = '#1e293b';
        ctx.font = `700 ${fontSize}px ${SANS}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, cm(x), cm(y) + 0.5);
      }
    };

    // ========================================================================
    // 2. VẼ PHẦN HEADER CHUẨN TNMAKER / BGD (CHỮ TO RÕ, DỄ ĐỌC)
    // ========================================================================
    ctx.fillStyle = '#000000';
    ctx.font = `bold 29px ${SERIF}`;
    ctx.textAlign = 'center';
    const mainTitle =
      tplKey === 'qmtln30'
        ? 'PHIẾU TRẢ LỜI TRẮC NGHIỆM'
        : 'PHIẾU TRẢ LỜI TRẮC NGHIỆM & TỰ LUẬN';
    ctx.fillText(mainTitle, cm(5.55), cm(0.88));

    ctx.font = `19.5px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('Kỳ thi: ........................................................................', cm(3.10), cm(1.36));
    ctx.fillText('Bài thi: ..............................................   Ngày thi: ......./......./ 20......', cm(0.92), cm(1.82));

    // Khung bên trái (x: 0.92 -> 4.18, y: 2.04 -> 5.44)
    // - Đối với phiếu Tự luận + TN (qmtuluan40, qmcombo2024): Có ô ĐIỂM (Điểm TN / Tự luận / Tổng) + Họ tên, chữ ký CBCT 1 & 2.
    // - Đối với phiếu chuyên TN (qmtln30): BỎ phần ghi điểm số, chỉ để Họ tên, chữ ký của cán bộ coi thi 1 & 2 chuẩn CV 1239.
    const leftBoxX = 0.92, leftBoxY = 2.04, leftBoxW = 3.26, leftBoxH = 3.40;
    strokeBox(leftBoxX, leftBoxY, leftBoxW, leftBoxH, 1.5);

    if (tpl.isHybridEssay) {
      // Có phần ghi Điểm cho phiếu Tự luận kết hợp Trắc nghiệm
      ctx.beginPath();
      ctx.moveTo(cm(leftBoxX), cm(2.54));
      ctx.lineTo(cm(leftBoxX + leftBoxW), cm(2.54));
      ctx.moveTo(cm(leftBoxX), cm(3.48));
      ctx.lineTo(cm(leftBoxX + leftBoxW), cm(3.48));
      ctx.moveTo(cm(leftBoxX), cm(4.46));
      ctx.lineTo(cm(leftBoxX + leftBoxW), cm(4.46));
      // Chia đôi cột Điểm TN | Điểm TL ở hàng điểm
      const midX = leftBoxX + leftBoxW / 2;
      ctx.moveTo(cm(midX), cm(2.04));
      ctx.lineTo(cm(midX), cm(3.48));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold 15.5px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.fillText('Điểm TN', cm((leftBoxX + midX) / 2), cm(2.36));
      ctx.fillText('Điểm TL', cm((midX + leftBoxX + leftBoxW) / 2), cm(2.36));

      ctx.font = `15.5px ${SERIF}`;
      ctx.fillText('Họ tên, chữ ký', cm(leftBoxX + leftBoxW / 2), cm(3.84));
      ctx.fillText('của cán bộ coi thi 1', cm(leftBoxX + leftBoxW / 2), cm(4.16));

      ctx.fillText('Họ tên, chữ ký', cm(leftBoxX + leftBoxW / 2), cm(4.82));
      ctx.fillText('của cán bộ coi thi 2', cm(leftBoxX + leftBoxW / 2), cm(5.14));
    } else {
      // Phiếu không có Tự luận (qmtln30): BỎ hoàn toàn ô ghi điểm số, chỉ có Cán bộ coi thi 1 & 2
      ctx.beginPath();
      ctx.moveTo(cm(leftBoxX), cm(3.74));
      ctx.lineTo(cm(leftBoxX + leftBoxW), cm(3.74));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `16.5px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.fillText('Họ tên, chữ ký', cm(leftBoxX + leftBoxW / 2), cm(2.58));
      ctx.fillText('của cán bộ coi thi 1', cm(leftBoxX + leftBoxW / 2), cm(2.94));

      ctx.fillText('Họ tên, chữ ký', cm(leftBoxX + leftBoxW / 2), cm(4.28));
      ctx.fillText('của cán bộ coi thi 2', cm(leftBoxX + leftBoxW / 2), cm(4.64));
    }

    // Khung thông tin thí sinh (Mục 1 -> 6) cỡ chữ lớn 17.5px giống hệt phiếu TNMaker
    const infoBoxX = 4.34, infoBoxY = 2.04, infoBoxW = 5.90, infoBoxH = 3.40;
    strokeBox(infoBoxX, infoBoxY, infoBoxW, infoBoxH, 1.5);
    ctx.fillStyle = '#000000';
    ctx.font = `17.5px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText('1. Hội đồng thi: .........................................................', cm(4.48), cm(2.44));
    ctx.fillText('2. Điểm thi: ...............................................................', cm(4.48), cm(3.00));
    ctx.fillText('3. Phòng thi số: ........................................................', cm(4.48), cm(3.56));
    ctx.fillText('4. Họ và tên thí sinh: ................................................', cm(4.48), cm(4.12));
    ctx.fillText('5. Ngày sinh: ......../......../............... (Nam/ Nữ).', cm(4.48), cm(4.68));
    ctx.fillText('6. Chữ ký của thí sinh: ............................................', cm(4.48), cm(5.24));

    // ========================================================================
    // 3. VẼ KHUNG 7. SỐ BÁO DANH (8 CỘT) & 8. MÃ ĐỀ THI (4 CỘT) CỠ LỚN CHUẨN TNMAKER
    // ========================================================================
    ctx.fillStyle = '#000000';
    ctx.font = `18px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('7. Số báo danh', cm(12.00), cm(0.86));
    ctx.fillText('8. Mã đề thi', cm(14.49), cm(0.86));

    // 8 ô vuông viết số SBD (x: 10.7425 -> 13.2625, y: 1.00 -> 1.66)
    for (let c = 0; c < 8; c++) {
      const cx = tpl.sbd[c][0][0];
      strokeBox(cx - 0.1575, 1.00, 0.315, 0.66, 1.3);
    }
    // Khung bao 8 cột × 10 hàng ô tròn SBD
    strokeBox(10.7425, 1.80, 2.52, 3.88, 1.4);
    for (let d = 0; d < 10; d++) {
      const cy = tpl.sbd[0][d][1];
      // Vòng tròn chỉ số 0..9 bên trái cột SBD giống hệt TNMaker
      drawBubble(10.50, cy, 0.125, String(d), 13.5, '#000000', 1.3);
      for (let c = 0; c < 8; c++) {
        const pt = tpl.sbd[c][d];
        drawBubble(pt[0], pt[1], 0.130, '', 12, '#475569', 1.25);
      }
    }

    // 4 ô vuông viết số Mã đề (x: 13.8625 -> 15.1225, y: 1.00 -> 1.66)
    for (let c = 0; c < 4; c++) {
      const cx = tpl.made[c][0][0];
      strokeBox(cx - 0.1575, 1.00, 0.315, 0.66, 1.3);
    }
    // Khung bao 4 cột × 10 hàng ô tròn Mã đề
    strokeBox(13.8625, 1.80, 1.26, 3.88, 1.4);
    for (let d = 0; d < 10; d++) {
      const cy = tpl.made[0][d][1];
      for (let c = 0; c < 4; c++) {
        const pt = tpl.made[c][d];
        drawBubble(pt[0], pt[1], 0.130, '', 12, '#475569', 1.25);
      }
      // Vòng tròn chỉ số 0..9 bên phải cột Mã đề giống hệt TNMaker
      drawBubble(15.36, cy, 0.125, String(d), 13.5, '#000000', 1.3);
    }

    // Mốc đen nhỏ giữa SBD và Mã đề (tăng thẩm mỹ chuẩn TNMaker)
    ctx.fillStyle = '#000000';
    ctx.fillRect(cm(13.44), cm(3.48), cm(0.22), cm(0.22));
    ctx.fillRect(cm(13.44), cm(5.48), cm(0.22), cm(0.22));

    // ========================================================================
    // HELPER VẼ KHUNG CÂU TRẢ LỜI NGẮN (P3) CHUẨN TNMAKER / BGD (CHỮ TO & Ô TÔ LỚN)
    // ========================================================================
    const drawP3QuestionBox = (qIdx, qCols, boxTopY, dyStep, rBubble) => {
      const xFirst = qCols[0][0][0];
      const xLast = qCols[3][0][0];
      const yFirst = qCols[0][0][1];
      const yLast = qCols[0][11][1];
      const boxLeft = xFirst - 0.50;
      const boxRight = xLast + 0.22;
      const boxW = boxRight - boxLeft;
      const boxBottom = yLast + 0.19;
      const boxH = boxBottom - boxTopY;

      strokeBox(boxLeft, boxTopY, boxW, boxH, 1.5);

      // Header "Câu X" cỡ lớn 15.5px
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(cm(boxLeft + 0.015), cm(boxTopY + 0.015), cm(boxW - 0.03), cm(0.32));
      ctx.beginPath();
      ctx.moveTo(cm(boxLeft), cm(boxTopY + 0.33));
      ctx.lineTo(cm(boxRight), cm(boxTopY + 0.33));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold 15.5px ${SERIF}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Câu ${qIdx + 1}`, cm((boxLeft + boxRight) / 2), cm(boxTopY + 0.175));

      // 4 ô điền chữ số viết tay ở đỉnh mỗi câu
      const writeTop = boxTopY + 0.33;
      const writeH = Math.max(0.34, (yFirst - rBubble - 0.05) - writeTop);
      const cellLeft0 = xFirst - rBubble - 0.04;
      const cellStep = (xLast - xFirst) / 3;
      for (let c = 0; c < 4; c++) {
        const cx = qCols[c][0][0];
        strokeBox(cx - cellStep * 0.46, writeTop + 0.03, cellStep * 0.92, writeH - 0.06, 1.1, '#334155');
      }

      // Nhãn hàng (- , 0..9) bên trái cỡ lớn (14px bold) và các ô tròn tô
      const rowLabels = tpl.p3hang;
      for (let r = 0; r < 12; r++) {
        const cy = qCols[0][r][1];
        ctx.fillStyle = '#000000';
        ctx.font = `bold 14px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rowLabels[r], cm(boxLeft + 0.20), cm(cy));

        for (let c = 0; c < 4; c++) {
          // Chuẩn BGD / TNMaker: hàng '-' (r=0) chỉ vẽ ô tròn ở cột 1 (c=0); hàng ',' (r=1) vẽ ở cột 2, 3 (c=1,2)
          if (r === 0 && c > 0) continue;
          if (r === 1 && (c === 0 || c === 3)) continue;
          const pt = qCols[c][r];
          drawBubble(pt[0], pt[1], rBubble, '', 11, '#334155', 1.35);
        }
      }
    };

    // Helper vẽ vùng trình bày Tự luận có dòng kẻ chấm + bảng điểm thành phần cỡ chữ to
    const drawEssayArea = (x0, y0, x1, y1, partTitle) => {
      const w = x1 - x0;
      const h = y1 - y0;
      strokeBox(x0, y0, w, h, 1.8);

      const headerH = 0.54;
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(cm(x0 + 0.02), cm(y0 + 0.02), cm(w - 0.04), cm(headerH - 0.02));
      ctx.beginPath();
      ctx.moveTo(cm(x0), cm(y0 + headerH));
      ctx.lineTo(cm(x1), cm(y0 + headerH));
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = `bold 16.5px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(partTitle, cm(x0 + 0.18), cm(y0 + headerH / 2));

      // Các ô điểm tự luận nhỏ góc phải thanh tiêu đề (Bài 1 | Bài 2 | Bài 3 | Bài 4 | Tổng TL)
      const scoreBoxW = 1.45;
      const labels = ['Bài 1: ......đ', 'Bài 2: ......đ', 'Bài 3: ......đ', 'Bài 4: ......đ', 'Tổng TL: ......đ'];
      const startScoreX = x1 - labels.length * scoreBoxW;
      ctx.font = `bold 13.5px ${SERIF}`;
      for (let i = 0; i < labels.length; i++) {
        const sx = startScoreX + i * scoreBoxW;
        ctx.beginPath();
        ctx.moveTo(cm(sx), cm(y0));
        ctx.lineTo(cm(sx), cm(y0 + headerH));
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = '#000000';
        ctx.stroke();
        ctx.fillStyle = i === labels.length - 1 ? '#b91c1c' : '#0f172a';
        ctx.fillText(labels[i], cm(sx + 0.10), cm(y0 + headerH / 2));
      }

      // Dòng kẻ chấm (dotted lines) cách nhau 0.68cm để học sinh viết chữ thoải mái
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.95;
      for (let ly = y0 + headerH + 0.68; ly < y1 - 0.25; ly += 0.68) {
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
      for (let q = 0; q < 30; q++) {
        const r = Math.floor(q / 6);
        const boxTopY = tln30RowY0[r] - 0.78;
        drawP3QuestionBox(q, tpl.p3[q], boxTopY, tln30Dy, tpl.r);
      }
    } else if (tplKey === 'qmtuluan40') {
      // Tiêu đề PHẦN I cỡ lớn giống TNMaker (không đè lên mốc I1 ở x=4.41)
      ctx.fillStyle = '#000000';
      ctx.font = `bold 18.5px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN I', cm(0.94), cm(5.88));

      const opts = ['A', 'B', 'C', 'D'];
      for (let col = 0; col < 4; col++) {
        const bx = tl40ColX0[col];
        // Vẽ khung từng khối 10 câu tách biệt giống hệt TNMaker
        const blockLeft = bx - 0.88;
        const blockW = 3.22;
        strokeBox(blockLeft, 6.08, blockW, 4.78, 1.5);

        // Nhãn cột A B C D cỡ lớn
        ctx.fillStyle = '#000000';
        ctx.font = `bold 15px ${SERIF}`;
        ctx.textAlign = 'center';
        for (let o = 0; o < 4; o++) {
          ctx.fillText(opts[o], cm(bx + o * 0.68), cm(6.42));
        }

        for (let row = 0; row < 10; row++) {
          const qIdx = col * 10 + row;
          const qPts = tpl.p1[qIdx];
          const cy = qPts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = `bold 16.5px ${SERIF}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${qIdx + 1}`, cm(bx - 0.30), cm(cy));
          for (let o = 0; o < 4; o++) {
            drawBubble(qPts[o][0], qPts[o][1], tpl.r, opts[o], 13.0, '#334155', 1.4);
          }
        }
      }

      // Khung Phần II: Tự Luận
      drawEssayArea(0.92, 11.42, 15.61, 22.65, 'PHẦN II. BÀI LÀM TỰ LUẬN');
    } else if (tplKey === 'qmcombo2024') {
      // 1. PHẦN I: 20 câu Trắc nghiệm 4 phương án (4 cột × 5 câu)
      ctx.fillStyle = '#000000';
      ctx.font = `bold 18.5px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN I', cm(0.94), cm(5.88));

      const opts = ['A', 'B', 'C', 'D'];
      for (let col = 0; col < 4; col++) {
        const bx = cbColX0[col];
        const blockLeft = bx - 0.88;
        const blockW = 3.22;
        strokeBox(blockLeft, 6.08, blockW, 2.74, 1.5);

        ctx.fillStyle = '#000000';
        ctx.font = `bold 15px ${SERIF}`;
        ctx.textAlign = 'center';
        for (let o = 0; o < 4; o++) {
          ctx.fillText(opts[o], cm(bx + o * 0.68), cm(6.42));
        }

        for (let row = 0; row < 5; row++) {
          const qIdx = col * 5 + row;
          const qPts = tpl.p1[qIdx];
          const cy = qPts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = `bold 16.5px ${SERIF}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${qIdx + 1}`, cm(bx - 0.30), cm(cy));
          for (let o = 0; o < 4; o++) {
            drawBubble(qPts[o][0], qPts[o][1], 0.142, opts[o], 13.0, '#334155', 1.4);
          }
        }
      }

      // 2. PHẦN II (Bên trái): 2 câu Đúng/Sai cỡ lớn chuẩn TNMaker
      ctx.fillStyle = '#000000';
      ctx.font = `bold 18.5px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN II', cm(0.94), cm(9.35));

      const p2BoxLeft = 0.94;
      const p2BoxW = 4.38;
      strokeBox(p2BoxLeft, 9.56, p2BoxW, 3.60, 1.5);
      // Đường kẻ chia đôi Câu 1 và Câu 2
      ctx.beginPath();
      ctx.moveTo(cm(p2BoxLeft + p2BoxW / 2), cm(9.56));
      ctx.lineTo(cm(p2BoxLeft + p2BoxW / 2), cm(13.16));
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#000000';
      ctx.stroke();

      for (let q = 0; q < 2; q++) {
        const bx = cbP2ColX[q];
        const colLeft = p2BoxLeft + q * (p2BoxW / 2);
        const colCenter = colLeft + p2BoxW / 4;

        ctx.fillStyle = '#000000';
        ctx.font = `bold 16.5px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.fillText(`Câu ${q + 1}`, cm(colCenter), cm(9.92));

        ctx.font = `14.5px ${SERIF}`;
        ctx.fillText('Đúng', cm(bx), cm(10.28));
        ctx.fillText('Sai', cm(bx + 0.72), cm(10.28));

        const subLabels = ['a)', 'b)', 'c)', 'd)'];
        for (let r = 0; r < 4; r++) {
          const pts = tpl.p2[q * 4 + r];
          const cy = pts[0][1];
          ctx.fillStyle = '#000000';
          ctx.font = `bold 16px ${SERIF}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(subLabels[r], cm(colLeft + 0.20), cm(cy));
          drawBubble(pts[0][0], pts[0][1], 0.142, '', 12.5, '#334155', 1.4);
          drawBubble(pts[1][0], pts[1][1], 0.142, '', 12.5, '#334155', 1.4);
        }
      }

      // 3. PHẦN III (Bên phải): 4 câu Trả lời ngắn cỡ lớn chuẩn TNMaker
      ctx.fillStyle = '#000000';
      ctx.font = `bold 18.5px ${SERIF}`;
      ctx.textAlign = 'left';
      ctx.fillText('PHẦN III', cm(5.98), cm(9.35));

      for (let q = 0; q < 4; q++) {
        drawP3QuestionBox(q, tpl.p3[q], 9.56, cbP3Dy, 0.114);
      }

      // 4. PHẦN IV: Tự Luận
      drawEssayArea(0.92, 13.68, 15.61, 22.65, 'PHẦN IV. BÀI LÀM TỰ LUẬN');
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
    <button onclick="window.print()">🖨️ In ngay / Lưu PDF (Khổ A4)</button>
    <a class="dl" href="${dataUrl}" download="${tplKey}-A4-300dpi.png">⬇️ Tải ảnh PNG (300 DPI)</a>
  </div>
  <div class="page">
    <img src="${dataUrl}" alt="${tpl.ten}" onload="setTimeout(() => window.focus(), 200)" />
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
