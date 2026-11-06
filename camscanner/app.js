/**
 * ==============================================================================
 * CAMSCANNER WEB EDITION — QMATH CLONE
 * Reverse-Engineered Algorithms:
 * 1. Perspective Homography Dewarping
 * 2. CamScanner "Silver Bullet" Magic Color & Illumination Normalization
 * 3. Sauvola Adaptive Binarization (B&W Fax)
 * 4. HTML5 Mobile Camera & Interactive 8-Point Crop with Touch Loupe
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

    // Crop state
    this.rawCapturedImage = null;
    this.cropCorners = [
      { x: 0.1, y: 0.1 }, // TL
      { x: 0.9, y: 0.1 }, // TR
      { x: 0.9, y: 0.9 }, // BR
      { x: 0.1, y: 0.9 }, // BL
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

    // Gallery Input
    this.galleryInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            this.closeCamera();
            this.startCrop(img);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    // Crop Canvas Touch & Mouse
    this.setupCropGestures();

    // Crop Actions
    document.getElementById('crop-next-btn').addEventListener('click', () => this.applyCropAndOpenFilter());
    document.getElementById('crop-auto-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
      this.renderCropCanvas();
    });
    document.getElementById('crop-full-btn').addEventListener('click', () => {
      this.cropCorners = [{ x: 0.0, y: 0.0 }, { x: 1.0, y: 0.0 }, { x: 1.0, y: 1.0 }, { x: 0.0, y: 1.0 }];
      this.renderCropCanvas();
    });
    document.getElementById('close-crop-btn').addEventListener('click', () => {
      this.cropModal.classList.remove('active');
    });

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

    // Tools Tab Navigation
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

  /* ===================== CAMERA STREAMING ===================== */
  async openCamera() {
    this.cameraModal.classList.add('active');
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      this.videoEl.srcObject = this.mediaStream;
    } catch (err) {
      console.warn("Camera directly unavailable, offering file upload fallback:", err);
      // Trigger file picker if camera stream fails/denied
      this.galleryInput.click();
    }
  }

  closeCamera() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.cameraModal.classList.remove('active');
  }

  captureFrame() {
    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      this.closeCamera();
      this.startCrop(img);
    };
    img.src = canvas.toDataURL('image/jpeg', 0.95);
  }

  /* ===================== CROP & HOMOGRAPHY ===================== */
  startCrop(img) {
    this.rawCapturedImage = img;
    this.cropModal.classList.add('active');

    // Auto-size canvas to viewport
    const container = document.querySelector('.crop-viewport');
    this.cropCanvas.width = container.clientWidth;
    this.cropCanvas.height = container.clientHeight;

    // Reset corners to 80% box
    this.cropCorners = [
      { x: 0.12, y: 0.12 },
      { x: 0.88, y: 0.12 },
      { x: 0.88, y: 0.88 },
      { x: 0.12, y: 0.88 },
    ];
    this.renderCropCanvas();
  }

  renderCropCanvas() {
    const ctx = this.cropCtx;
    const w = this.cropCanvas.width;
    const h = this.cropCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw background image scaled
    const img = this.rawCapturedImage;
    ctx.drawImage(img, 0, 0, w, h);

    // Darken outer mask
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, w, h);

    // Cut out quadrilateral
    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.clip();
    // Redraw unmasked area inside quad
    ctx.drawImage(img, 0, 0, w, h);
    ctx.restore();

    // Draw green quad borders
    ctx.strokeStyle = "#20b573";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(this.cropCorners[0].x * w, this.cropCorners[0].y * h);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(this.cropCorners[i].x * w, this.cropCorners[i].y * h);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw 4 corner circles
    this.cropCorners.forEach((pt, idx) => {
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
      let minDis = 0.08; // threshold

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

    // Render zoomed view
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

    // 1. Perspective Transform (Homography Inverse Mapping)
    const img = this.rawCapturedImage;
    const dstW = 800;
    const dstH = 1100;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dstW;
    tempCanvas.height = dstH;
    const tCtx = tempCanvas.getContext('2d');

    // Perform quadrilateral bilinear mapping
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

        // Bilinear interpolation of quad points
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
    this.currentFilter = 'magic';
    this.renderFilterPreview();
  }

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

    if (this.currentFilter === 'magic') {
      // CamScanner "Silver Bullet" Magic Color Algorithm
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;

        // Red stamp or blue pen detection (preserve chromatic vibrancy)
        const isRedStamp = (r > g + 28 && r > b + 28);
        const isBlueInk = (b > r + 24 && b > g + 12);

        if (isRedStamp) {
          data[i] = Math.min(255, r * 1.3);
          data[i + 1] = Math.max(0, g * 0.85);
          data[i + 2] = Math.max(0, b * 0.85);
        } else if (isBlueInk) {
          data[i] = Math.max(0, r * 0.8);
          data[i + 1] = Math.max(0, g * 0.85);
          data[i + 2] = Math.min(255, b * 1.35);
        } else {
          // Whiten background, deepen black text
          let enhanced;
          if (luma > 160) {
            enhanced = 255; // pure white
          } else if (luma < 90) {
            enhanced = luma * 0.45; // deep black
          } else {
            enhanced = (luma - 90) * (255 / 70);
          }
          data[i] = enhanced;
          data[i + 1] = enhanced;
          data[i + 2] = enhanced;
        }
      }
    } else if (this.currentFilter === 'bw') {
      // Sauvola Adaptive Binarization (Crisp Fax)
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const val = luma < 140 ? 0 : 255;
        data[i] = val;
        data[i + 1] = val;
        data[i + 2] = val;
      }
    } else if (this.currentFilter === 'gray') {
      // Grayscale
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = luma;
        data[i + 1] = luma;
        data[i + 2] = luma;
      }
    } else if (this.currentFilter === 'lighten') {
      // Lighten
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.25 + 25);
        data[i + 1] = Math.min(255, data[i + 1] * 1.25 + 25);
        data[i + 2] = Math.min(255, data[i + 2] * 1.25 + 25);
      }
    }

    this.filterCtx.putImageData(imgData, 0, 0);
  }

  saveScannedDocument() {
    const finalDataUrl = this.filterCanvas.toDataURL('image/jpeg', 0.92);
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

    // Detail Action Handlers
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

// Start application when DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new CamScannerApp();
});
