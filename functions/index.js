const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.resetStudentPassword = functions.https.onCall(async (data, context) => {
    const { studentUid, newPassword } = data;

    try {
        await admin.auth().updateUser(studentUid, {
            password: newPassword
        });
        return { success: true, message: `Đã đổi mật khẩu thành công!` };
    } catch (error) {
        console.error("Lỗi đổi pass:", error);
        throw new functions.https.HttpsError('internal', 'Lỗi: ' + error.message);
    }
});
