const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// Hàm này cho phép Giáo viên gọi từ Dashboard để reset mật khẩu HS
exports.resetStudentPassword = functions.https.onCall(async (data, context) => {
    // Kiểm tra xem người gọi có phải là Giáo viên không (để bảo mật)
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Bạn phải đăng nhập.');
    }

    const { studentUid, newPassword } = data;

    try {
        // Lệnh cập nhật mật khẩu cấp Admin
        await admin.auth().updateUser(studentUid, {
            password: newPassword
        });
        return { success: true, message: `Đã đổi mật khẩu thành công!` };
    } catch (error) {
        console.error("Lỗi đổi pass:", error);
        throw new functions.https.HttpsError('internal', 'Không thể đổi mật khẩu: ' + error.message);
    }
});
