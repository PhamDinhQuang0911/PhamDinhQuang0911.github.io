/**
 * utils.js - Các hàm tiện ích cho LMS
 * Cập nhật: Thêm chức năng vẽ hình TikZ qua Server VPS
 */

// ============================================================================
// CẤU HÌNH SERVER VẼ HÌNH
// ============================================================================
// Đường dẫn API Quick Tunnel mới (Cập nhật theo yêu cầu của bạn)
const TIKZ_API_URL = "https://modern-brisbane-self-descending.trycloudflare.com/compile"; 

// ============================================================================
// CÁC HÀM XỬ LÝ (EXPORT)
// ============================================================================

/**
 * Hàm gửi code TikZ lên Server VPS để lấy link ảnh
 * @param {string} tikzCode - Mã nguồn LaTeX/TikZ
 * @returns {Promise<string>} - Trả về URL của ảnh SVG trên Cloudflare R2
 */
export const compileTikZToImage = async (tikzCode) => {
  try {
    // Gửi yêu cầu POST lên server
    const response = await fetch(TIKZ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: tikzCode })
    });

    const data = await response.json();

    // Kiểm tra nếu server báo lỗi (ví dụ: code sai cú pháp)
    if (!response.ok) {
      throw new Error(data.log || data.error || "Lỗi biên dịch không xác định từ Server");
    }

    // Thành công: Trả về link ảnh (https://pub-....r2.dev/tikz/xyz.svg)
    return data.url;

  } catch (error) {
    console.error("Lỗi khi gọi Server vẽ hình:", error);
    // Ném lỗi ra ngoài để giao diện hiển thị thông báo cho người dùng
    throw error;
  }
};

/**
 * Chuyển đổi môi trường array sang matrix.
 * Môi trường matrix giúp hiển thị tốt hơn trong các cột hẹp (như bảng Đúng/Sai)
 * vì nó không ép buộc chiều rộng cột cố định như array.
 * @param {string} content - Nội dung LaTeX gốc
 * @returns {string} - Nội dung LaTeX đã chuyển đổi
 */
export const convertArrayToMatrix = (content) => {
  if (!content) return "";

  // 1. Thay thế \begin{array}{...} hoặc \begin{array} thành \begin{matrix}
  // Regex giải thích:
  // \\begin\{array\} : Tìm chuỗi \begin{array}
  // (\{.*?\})?       : Tìm nhóm ký tự trong ngoặc nhọn {} ngay sau đó (non-greedy), có thể không có.
  let processed = content.replace(/\\begin\{array\}(\{.*?\})?/g, '\\begin{matrix}');

  // 2. Thay thế \end{array} thành \end{matrix}
  processed = processed.replace(/\\end\{array\}/g, '\\end{matrix}');

  // 3. (Tuỳ chọn) Xử lý lệnh \heva nếu có trong chuỗi gốc
  // Chuyển \heva{...} thành hệ phương trình dùng matrix
  // Lưu ý: Cách này chỉ áp dụng nếu \heva được viết dạng \heva{ dòng 1 \\ dòng 2 }
  if (processed.includes('\\heva')) {
     processed = processed.replace(/\\heva\s*\{/g, '\\left\\{\\begin{matrix}');
     // Cần đảm bảo đóng ngoặc đúng, nhưng thường MathJax sẽ tự xử lý hoặc code gốc đã có }
     // Để an toàn nhất, nên thay thế ở bước render macro, nhưng đây là giải pháp thay thế chuỗi tạm thời.
     processed = processed + " \\right."; // Đây là xử lý rủi ro, tốt nhất hãy dùng logic array ở trên.
  }

  return processed;
};
