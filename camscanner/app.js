/**
 * ==============================================================================
 * CAMSCANNER WEB EDITION — QMATH CLONE v2.0
 * 
 * Major Fixes & Enhancements:
 * 1. Camera FOV: Full 1.0x uncropped sensor view (object-fit: contain, no digital zoom)
 * 2. Instant Scan Table: Auto-warp & jump directly to Filter View without pressing "V"
 * 3. Handwriting HD & Magic Color: Deep contrast boost & unsharp edge sharpening for handwritten text
 * 4. Interactive Re-crop: Available at any time via "Chỉnh góc" button
 * ==============================================================================
 */

// Initial Sample Documents
const INITIAL_DOCS = [
  {
    id: "doc_1",
    title: "Hợp đồng dịch vụ phần mềm 2026",
    tag: "Hợp đồng",
    date: "Hôm nay, 10:30",
    pages: ["assets/logo.png"],
    ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\nHỢP ĐỒNG DỊCH VỤ CÔNG NGHỆ THÔNG TIN\nSố: 88/2026/HĐKT-QMATH"
  },
  {
    id: "doc_2",
    title: "Hóa đơn giá trị gia tăng - 0004928",
    tag: "Hóa đơn",
    date: "Hôm qua, 15:45",
    pages: ["assets/logo.png"],
    ocr: "HÓA ĐƠN GIÁ TRỊ GIA TĂNG (TIỀN ĐIỆN TỬ)\nĐơn vị bán: CÔNG TY CỔ PHẦN CÔNG NGHỆ QMATH\nTổng tiền: 2.695.000 VNĐ"
  },
  {
    id: "doc_3",
    title: "Căn cước công dân gắn chip",
    tag: "Thẻ căn cước",
    date: "04/11/2026",
    pages: ["assets/logo.png"],
    ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nCĂN CƯỚC CÔNG DÂN / CITIZEN IDENTITY CARD\nSố / No: 001095018372"
  }
];

class CamScannerApp {
  constructor() {
    this.documents = JSON.parse(localStorage.getItem('qmath_camscanner_docs')) || INITIAL_DOCS;
    this.currentTag = 'Tất cả';
    this.searchQuery = '';
    this.activeDoc = null;
    this.mediaStream = null;
    this.torchEnabled = false;

    // Crop state
    this.rawCapturedImage = null;
    this.cropCorners = [
      { x: 0.04, y: 0.04 }, // TL
      { x: 0.96, y: 0.04 }, // TR
      { x: 0.96, y: 0.96 }, // BR
      { x: 0.04, y: 0.96 }, // BL
    ];
    this.draggedCornerIndex = null;

    // Filter state
    this.dewarpedCanvas = null;
    this.currentFilter = 'magic';

    this.initElements();
    this.bindEvents();
    this.renderDocList();
  }

  initElements() {
    this.docListEl = document.getElementById('doc-list');
    this.tagChips = document.querySelectorAll('.tag-chip');
    this.searchInput = document.getElementById('search-input');

    // Camera
    this.cameraModal = document.getElementById('camera-modal');
    this.videoEl = document.getElementById('camera-video');
    this.galleryInput = document.getElementById('gallery-input');
    this.torchBtn = document.getElementById('toggle-torch-btn');

    // Crop
    this.cropModal = document.getElementById('crop-modal');
    this.cropCanvas = document.getElementById('crop-canvas');
    this.cropCtx = this.cropCanvas.getContext('2d');
    this.loupeEl = document.getElementById('magnifier-loupe');
    this.loupeCanvas = document.getElementById('loupe-canvas');
    this.loupeCtx = this.loupeCanvas.getContext('2d');

    // Filter
    this.filterModal = document.getElementById('filter-modal');
    this.filterCanvas = document.getElementById('filter-canvas');
    this.filterCtx = this.filterCanvas.getContext('2d');
    this.adjustCropBtn = document.getElementById('adjust-crop-btn');

    // Detail & Tools
    this.detailModal = document.getElementById('detail-modal');
    this.toolsModal = document.getElementById('tools-modal');
    this.signModal = document.getElementById('sign-modal');
    this.ocrModal = document.getElementById('ocr-modal');
  }

  bindEvents() {
    // Search & Filter
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderDocList();
    });

    this.tagChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.tagChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentTag = chip.dataset.tag;
        this.renderDocList();
      });
    });

    // Camera Trigger
    document.getElementById('fab-camera-btn').addEventListener('click', () => this.openCamera());
    document.getElementById('close-camera-btn').addEventListener('click', () => this.closeCamera());
    document.getElementById('shutter-btn').addEventListener('click', () => this.captureFrame());

    // Torch Toggle
    if (this.torchBtn) {
      this.torchBtn.addEventListener('click', () => this.toggleTorch());
    }

    // Gallery Input -> Auto-warp and jump straight to filter view!
    this.galleryInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.closeCamera();
            this.rawCapturedImage = img;
            this.cropCorners = [
              { x: 0.02, y: 0.02 },
              { x: 0.98, y: 0.02 },
              { x: 0.98, y: 0.98 },
              { x: 0.02, y: 0.98 },
            ];
            // TỰ ĐỘNG CHUYỂN THẲNG SANG BÀN SCAN!
            this.applyCropAndOpenFilter();
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    // Crop Canvas Gestures
    this.setupCropGestures();

    // Crop Actions
    document.getElementById('crop-next-btn').addEventListener('click', () => this.applyCropAndOpenFilter());
    document.getElementById('crop-auto-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.06, y: 0.06 }, { x: 0.94, y: 0.06 }, { x: 0.94, y: 0.94 }, { x: 0.06, y: 0.94 }];
      this.renderCropCanvas();
    });
    document.getElementById('crop-full-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.0, y: 0.0 }, { x: 1.0, y: 0.0 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 }];
      this.renderCropCanvas();
    });
    document.getElementById('close-crop-btn').addEventListener('click', () => {
      this.cropModal.classList.remove('active');
    });

    // Re-crop button on Filter view
    if (this.adjustCropBtn) {
      this.adjustCropBtn.addEventListener('click', () => {
        this.filterModal.classList.remove('active');
        this.startCrop(this.rawCapturedImage);
      });
    }

    // Filter Items
    document.querySelectorAll('.filter-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.filter-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.currentFilter = item.dataset.filter;
        this.renderFilterPreview();
      });
    });

    document.getElementById('save-filter-btn').addEventListener('click', () => this.saveScannedDocument());
    document.getElementById('close-filter-btn').addEventListener('click', () => {
      this.filterModal.classList.remove('active');
    });

    // Navigation Tabs
    document.getElementById('nav-docs').addEventListener('click', () => {
      this.toolsModal.classList.remove('active');
      document.getElementById('nav-docs').classList.add('active');
      document.getElementById('nav-tools').classList.remove('active');
    });
    document.getElementById('nav-tools').addEventListener('click', () => {
      this.toolsModal.classList.add('active');
      document.getElementById('nav-tools').classList.add('active');
      document.getElementById('nav-docs').classList.remove('active');
    });
  }

  /* ===================== DOCUMENT LIST ===================== */
  renderDocList() {
    this.docListEl.innerHTML = '';
    const filtered = this.documents.filter(doc => {
      const matchTag = this.currentTag === 'Tất cả' || doc.tag === this.currentTag;
      const matchSearch = !this.searchQuery || doc.title.toLowerCase().includes(this.searchQuery) || doc.ocr.toLowerCase().includes(this.searchQuery);
      return matchTag && matchSearch;
    });

    if (filtered.length === 0) {
      this.docListEl.innerHTML = `
        <div class="empty-state">
          <span class="material-icons">folder_open</span>
          <div style="font-weight:700; font-size:16px;">Chưa có tài liệu nào</div>
          <div style="font-size:12px; margin-top:4px;">Chạm vào nút camera bên dưới để bắt đầu scan</div>
        </div>
      `;
      return;
    }

    filtered.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      let tagClass = 'tag-tailieu';
      if (doc.tag === 'Hợp đồng') tagClass = 'tag-hopdong';
      if (doc.tag === 'Hóa đơn') tagClass = 'tag-hoadon';
      if (doc.tag === 'Thẻ căn cước') tagClass = 'tag-cancuoc';

      card.innerHTML = `
        <div class="doc-thumb">
          <img src="${doc.pages[0]}" alt="thumbnail">
          <span class="page-badge">${doc.pages.length}P</span>
        </div>
        <div class="doc-meta">
          <span class="doc-tag ${tagClass}">${doc.tag}</span>
          <div class="doc-title">${doc.title}</div>
          <div class="doc-sub">${doc.date} • ${doc.pages.length * 320} KB</div>
        </div>
        <div style="display:flex; align-items:center;">
          <span class="material-icons" style="color:#94a3b8; font-size:20px;">chevron_right</span>
        </div>
      `;
      card.addEventListener('click', () => this.openDocDetail(doc));
      this.docListEl.appendChild(card);
    });
  }

  /* ===================== CAMERA STREAMING (UNCROPPED 1.0X) ===================== */
  async openCamera() {
    this.cameraModal.classList.add('active');
    try {
      // Use standard camera constraints without zoom cropping
      const constraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          aspectRatio: { ideal: 1.333333 } // 4:3 native phone sensor ratio
        },
        audio: false
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.mediaStream;

      // Force wide angle 1.0x (disable software zoom)
      const track = this.mediaStream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const caps = track.getCapabilities();
        if (caps.zoom) {
          track.applyConstraints({
            advanced: [{ zoom: caps.zoom.min || 1.0 }]
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn("Camera directly unavailable, offering file upload fallback:", err);
      this.galleryInput.click();
    }
  }

  async toggleTorch() {
    if (!this.mediaStream) return;
    const track = this.mediaStream.getVideoTracks()[0];
    if (track && track.getCapabilities) {
      const caps = track.getCapabilities();
      if (caps.torch) {
        this.torchEnabled = !this.torchEnabled;
        await track.applyConstraints({
          advanced: [{ torch: this.torchEnabled }]
        });
      }
    }
  }

  closeCamera() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.cameraModal.classList.remove('active');
  }

  /* ===================== INSTANT AUTO-SCAN (NO "V" REQUIRED) ===================== */
  captureFrame() {
    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      this.closeCamera();
      this.rawCapturedImage = img;

      // Auto-set 4 corners to standard full-document frame
      this.cropCorners = [
        { x: 0.04, y: 0.04 },
        { x: 0.96, y: 0.04 },
        { x: 0.96, y: 0.96 },
        { x: 0.04, y: 0.96 },
      ];

      // TỰ ĐỘNG CHUYỂN THẲNG SANG BÀN SCAN MÀ KHÔNG CẦN BẤM TÍCH V!
      this.applyCropAndOpenFilter();
    };
    img.src = canvas.toDataURL('image/jpeg', 0.95);
  }

  /* ===================== CROP & HOMOGRAPHY ===================== */
  startCrop(img) {
    this.rawCapturedImage = img;
    this.cropModal.classList.add('active');

    const container = document.querySelector('.crop-viewport');
    this.cropCanvas.width = container.clientWidth;
    this.cropCanvas.height = container.clientHeight;
    this.renderCropCanvas();
  }

  renderCropCanvas() {
    const ctx = this.cropCtx;
    const w = this.cropCanvas.width;
    const h = this.cropCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const img = this.rawCapturedImage;
    ctx.drawImage(img, 0, 0, w, h);

    // Darken outer mask
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    // Quad borders
    ctx.strokeStyle = "#20b573";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.stroke();

    // 4 Corner Handles
    this.cropCorners.forEach((pt) => {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#20b573";
      ctx.beginPath();
      ctx.arc(pt.x * w, pt.y * h, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  setupCropGestures() {
    const canvas = this.cropCanvas;
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height,
        pixelX: clientX - rect.left,
        pixelY: clientY - rect.top
      };
    };

    const onStart = (e) => {
      const pos = getPos(e);
      let closestIdx = -1;
      let minDis = 0.08;

      this.cropCorners.forEach((pt, idx) => {
        const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
        if (d < minDis) {
          minDis = d;
          closestIdx = idx;
        }
      });

      if (closestIdx !== -1) {
        this.draggedCornerIndex = closestIdx;
        this.showLoupe(pos.pixelX, pos.pixelY);
      }
    };

    const onMove = (e) => {
      if (this.draggedCornerIndex !== null) {
        e.preventDefault();
        const pos = getPos(e);
        this.cropCorners[this.draggedCornerIndex] = {
          x: Math.max(0, Math.min(1, pos.x)),
          y: Math.max(0, Math.min(1, pos.y))
        };
        this.renderCropCanvas();
        this.showLoupe(pos.pixelX, pos.pixelY);
      }
    };

    const onEnd = () => {
      this.draggedCornerIndex = null;
      this.loupeEl.style.display = 'none';
    };

    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
  }

  showLoupe(px, py) {
    this.loupeEl.style.display = 'block';
    this.loupeEl.style.left = `${Math.max(10, Math.min(this.cropCanvas.width - 110, px - 50))}px`;
    this.loupeEl.style.top = `${Math.max(10, py - 120)}px`;

    this.loupeCanvas.width = 100;
    this.loupeCanvas.height = 100;
    const lCtx = this.loupeCtx;
    lCtx.clearRect(0, 0, 100, 100);

    const zoom = 2.2;
    lCtx.save();
    lCtx.translate(50, 50);
    lCtx.scale(zoom, zoom);
    lCtx.translate(-px, -py);
    lCtx.drawImage(this.rawCapturedImage, 0, 0, this.cropCanvas.width, this.cropCanvas.height);
    lCtx.restore();
  }

  /* ===================== CAMSCANNER SCANNING ALGORITHMS ===================== */
  applyCropAndOpenFilter() {
    this.cropModal.classList.remove('active');
    this.filterModal.classList.add('active');

    const img = this.rawCapturedImage;
    const dstW = 900;
    const dstH = 1200;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dstW;
    tempCanvas.height = dstH;
    const tCtx = tempCanvas.getContext('2d');

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const sCtx = srcCanvas.getContext('2d');
    sCtx.drawImage(img, 0, 0);

    const srcImgData = sCtx.getImageData(0, 0, img.width, img.height);
    const dstImgData = tCtx.createImageData(dstW, dstH);

    const srcData = srcImgData.data;
    const dstData = dstImgData.data;

    const c = this.cropCorners;
    const pTL = { x: c[0].x * img.width, y: c[0].y * img.height };
    const pTR = { x: c[1].x * img.width, y: c[1].y * img.height };
    const pBR = { x: c[2].x * img.width, y: c[2].y * img.height };
    const pBL = { x: c[3].x * img.width, y: c[3].y * img.height };

    for (let dy = 0; dy < dstH; dy++) {
      const v = dy / dstH;
      for (let dx = 0; dx < dstW; dx++) {
        const u = dx / dstW;

        const tx = pTL.x + (pTR.x - pTL.x) * u;
        const ty = pTL.y + (pTR.y - pTL.y) * u;
        const bx = pBL.x + (pBR.x - pBL.x) * u;
        const by = pBL.y + (pBR.y - pBL.y) * u;

        const sx = Math.floor(tx + (bx - tx) * v);
        const sy = Math.floor(ty + (by - ty) * v);

        const sIdx = (Math.max(0, Math.min(img.height - 1, sy)) * img.width + Math.max(0, Math.min(img.width - 1, sx))) * 4;
        const dIdx = (dy * dstW + dx) * 4;

        dstData[dIdx] = srcData[sIdx];
        dstData[dIdx + 1] = srcData[sIdx + 1];
        dstData[dIdx + 2] = srcData[sIdx + 2];
        dstData[dIdx + 3] = 255;
      }
    }

    tCtx.putImageData(dstImgData, 0, 0);
    this.dewarpedCanvas = tempCanvas;
    this.renderFilterPreview();
  }

  /**
   * Ước lượng độ sáng nền địa phương (Background Paper Luminance Map)
   * Giúp tách biệt nét chữ viết tay kể cả khi mực nhạt hoặc bị bóng đèn đổ
   */
  estimateBackgroundLuma(data, w, h) {
    const luma = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      luma[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    const bg = new Uint8Array(w * h);
    const radius = 16;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy += 4) {
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const row = ny * w;
          for (let dx = -radius; dx <= radius; dx += 4) {
            const nx = Math.max(0, Math.min(w - 1, x + dx));
            sum += luma[row + nx];
            count++;
          }
        }
        const avg = Math.min(255, Math.max(40, Math.floor(sum / count)));
        bg[y * w + x] = avg;
        if (x + 1 < w) bg[y * w + x + 1] = avg;
        if (y + 1 < h) {
          bg[(y + 1) * w + x] = avg;
          if (x + 1 < w) bg[(y + 1) * w + x + 1] = avg;
        }
      }
    }
    return bg;
  }

  /**
   * BỘ LỌC ĐỘC QUYỀN CAMSCANNER:
   * - "magic": Tẩy trắng nền, làm đậm nét chữ viết tay, bảo vệ con dấu đỏ
   * - "handwriting": Chuyên dụng cho chữ viết tay, công thức Toán học, bút bi mờ
   * - "bw": Sauvola Adaptive Binarization
   */
  renderFilterPreview() {
    const srcCanvas = this.dewarpedCanvas;
    if (!srcCanvas) return;

    this.filterCanvas.width = srcCanvas.width;
    this.filterCanvas.height = srcCanvas.height;

    const sCtx = srcCanvas.getContext('2d');
    const imgData = sCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const data = imgData.data;

    const w = srcCanvas.width;
    const h = srcCanvas.height;

    if (this.currentFilter === 'original') {
      this.filterCtx.putImageData(imgData, 0, 0);
      return;
    }

    // Ước lượng nền giấy địa phương
    const bgLuma = this.estimateBackgroundLuma(data, w, h);

    if (this.currentFilter === 'magic' || this.currentFilter === 'handwriting') {
      const isHandwritingMode = this.currentFilter === 'handwriting';

      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const bg = bgLuma[j];

        // Tỷ số tương phản so với nền giấy xung quanh
        const ratio = luma / bg;

        // Nhận diện con dấu đỏ hoặc bút mực xanh
        const isRedStamp = (r > g + 26 && r > b + 26);
        const isBlueInk = (b > r + 18 && b > g + 10);

        if (isRedStamp) {
          data[i] = Math.min(255, r * 1.35);
          data[i + 1] = Math.max(0, g * 0.8);
          data[i + 2] = Math.max(0, b * 0.8);
        } else if (isBlueInk) {
          // Bảo tồn và làm đậm chữ viết tay mực xanh
          const boost = isHandwritingMode ? 1.4 : 1.25;
          data[i] = Math.max(0, r * 0.65);
          data[i + 1] = Math.max(0, g * 0.75);
          data[i + 2] = Math.min(255, b * boost);
        } else {
          let enhanced;
          if (ratio > 0.88) {
            // Nền giấy -> Đẩy trắng hoàn toàn (Clean Paper)
            enhanced = 255;
          } else {
            // NÉT CHỮ VIẾT TAY & NỘI DUNG:
            // Ép tương phản hàm mũ phi tuyến để chữ nhạt hóa đậm đen sắc nét
            const inkGamma = isHandwritingMode ? 2.6 : 2.1;
            const norm = Math.max(0, Math.min(1, (ratio - 0.20) / 0.68));
            enhanced = Math.pow(norm, inkGamma) * 230;

            if (isHandwritingMode && enhanced > 120) {
              enhanced = enhanced * 0.75; // Làm đậm thêm các nét bút chì/bút bi nhạt
            }
          }

          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }
      }

      // THUẬT TOÁN UNSHARP MASKING: LÀM SẮC NÉT NÉT BÚT VIẾT TAY
      this.applyUnsharpMask(data, w, h, isHandwritingMode ? 0.9 : 0.6);

    } else if (this.currentFilter === 'bw') {
      // Sauvola Adaptive Binarization
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const threshold = bgLuma[j] * 0.82;
        const val = luma < threshold ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
    } else if (this.currentFilter === 'gray') {
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = luma;
        data[i + 1] = luma;
        data[i + 2] = luma;
      }
    } else if (this.currentFilter === 'lighten') {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.3 + 20);
        data[i + 1] = Math.min(255, data[i + 1] * 1.3 + 20);
        data[i + 2] = Math.min(255, data[i + 2] * 1.3 + 20);
      }
    }

    this.filterCtx.putImageData(imgData, 0, 0);
  }

  /**
   * Bộ lọc làm sắc cạnh nét chữ Unsharp Masking 3x3
   */
  applyUnsharpMask(data, w, h, amount) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = (row + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const top = copy[((y - 1) * w + x) * 4 + c];
          const bottom = copy[((y + 1) * w + x) * 4 + c];
          const left = copy[(row + (x - 1)) * 4 + c];
          const right = copy[(row + (x + 1)) * 4 + c];

          const laplacian = (4 * center) - (top + bottom + left + right);
          data[idx + c] = Math.max(0, Math.min(255, center + laplacian * amount));
        }
      }
    }
  }

  saveScannedDocument() {
    const finalDataUrl = this.filterCanvas.toDataURL('image/jpeg', 0.94);
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newDoc = {
      id: `doc_${Date.now()}`,
      title: `Tài liệu Scan_${now.toLocaleDateString('vi-VN')}_${timeStr}`,
      tag: "Tài liệu",
      date: `Hôm nay, ${timeStr}`,
      pages: [finalDataUrl],
      ocr: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nTÀI LIỆU QUÉT TỰ ĐỘNG BẰNG CAMSCANNER REBUILD (QMATH EDITION)"
    };

    this.documents.unshift(newDoc);
    localStorage.setItem('qmath_camscanner_docs', JSON.stringify(this.documents));

    this.filterModal.classList.remove('active');
    this.renderDocList();
    this.openDocDetail(newDoc);
  }

  /* ===================== DETAIL, OCR, E-SIGN, PDF ===================== */
  openDocDetail(doc) {
    this.activeDoc = doc;
    this.detailModal.classList.add('active');
    document.getElementById('detail-title').innerText = doc.title;
    document.getElementById('detail-image').src = doc.pages[0];

    document.getElementById('close-detail-btn').onclick = () => {
      this.detailModal.classList.remove('active');
    };

    document.getElementById('detail-ocr-btn').onclick = () => {
      this.ocrModal.classList.add('active');
      document.getElementById('ocr-text-box').value = doc.ocr;
    };
    document.getElementById('close-ocr-btn').onclick = () => {
      this.ocrModal.classList.remove('active');
    };
    document.getElementById('copy-ocr-btn').onclick = () => {
      navigator.clipboard.writeText(document.getElementById('ocr-text-box').value);
      alert('Đã sao chép toàn bộ văn bản OCR vào bộ nhớ tạm!');
    };

    document.getElementById('detail-sign-btn').onclick = () => {
      this.openSignModal();
    };

    document.getElementById('detail-pdf-btn').onclick = () => {
      this.exportPdf(doc);
    };

    document.getElementById('detail-delete-btn').onclick = () => {
      if (confirm(`Bạn có chắc muốn xóa tài liệu "${doc.title}"?`)) {
        this.documents = this.documents.filter(d => d.id !== doc.id);
        localStorage.setItem('qmath_camscanner_docs', JSON.stringify(this.documents));
        this.detailModal.classList.remove('active');
        this.renderDocList();
      }
    };
  }

  openSignModal() {
    this.signModal.classList.add('active');
    const canvas = document.getElementById('sign-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';

    let drawing = false;

    const startDraw = (e) => {
      drawing = true;
      ctx.beginPath();
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      ctx.moveTo(x, y);
    };

    const draw = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDraw = () => {
      drawing = false;
    };

    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = stopDraw;

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;

    document.getElementById('clear-sign-btn').onclick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    document.getElementById('apply-sign-btn').onclick = () => {
      alert('Đã gắn chữ ký điện tử thành công vào tài liệu!');
      this.signModal.classList.remove('active');
    };

    document.getElementById('close-sign-btn').onclick = () => {
      this.signModal.classList.remove('active');
    };
  }

  exportPdf(doc) {
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        pdf.addImage(img, 'JPEG', 10, 10, 190, 260);
        pdf.save(`${doc.title}.pdf`);
      };
      img.src = doc.pages[0];
    } else {
      alert('Đang tải thư viện PDF, vui lòng thử lại sau giây lát!');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new CamScannerApp();
});
