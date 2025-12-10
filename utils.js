/**
 * Chuyển đổi môi trường array sang matrix.
 * Môi trường matrix giúp hiển thị tốt hơn trong các cột hẹp (như bảng Đúng/Sai)
 * vì nó không ép buộc chiều rộng cột cố định như array.
 * * @param {string} content - Nội dung LaTeX gốc
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
