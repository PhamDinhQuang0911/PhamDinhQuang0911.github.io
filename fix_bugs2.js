const fs = require('fs');

// --- 1. Fix exam.html ---
let c = fs.readFileSync('exam.html', 'utf8');

// Fix bug 1: Image not displaying in review mode because r.answers[0] is a string, not an array.
c = c.replace(
    /\$\{\(r\.answers && r\.answers\[0\] && r\.answers\[0\]\.length > 0\)\s*\? r\.answers\[0\]\.map\(\(url, i\) => `[^`]*`\)\.join\(''\)\s*: '<div class="text-gray-400 italic py-10">[^<]*<i class="fa-regular fa-image text-4xl block mb-2"><\/i>Không tìm thấy ảnh bài làm\.<\/div>'\s*\}/g,
    `\${(typeof r.answers[0] === 'string' && r.answers[0].includes('<img')) 
        ? r.answers[0].replace(/<button[^>]*>.*?<\\/button>/g, '') 
        : '<div class="text-gray-400 italic py-10"><i class="fa-regular fa-image text-4xl block mb-2"></i>Không tìm thấy ảnh bài làm.</div>'}`
);

// Fix bug 3: Vãng lai for homework - check examData.assignTo
c = c.replace(
    `                        const classQueryHW = query(collection(db, "classes"), where("members", "array-contains", currentUser.uid));
                        const classSnapsHW = await getDocs(classQueryHW);
                        for (const clsDoc of classSnapsHW.docs) {
                            const clsData = clsDoc.data();
                            let hasExam = false;
                            if (clsData.exams && Array.isArray(clsData.exams) && clsData.exams.includes(examId)) {
                                hasExam = true;
                            } else if (clsData.exams && Array.isArray(clsData.exams)) {
                                hasExam = clsData.exams.some(e => (e.id === examId || e.examId === examId));
                            } else if (clsData.curriculum && JSON.stringify(clsData.curriculum).includes(examId)) {
                                hasExam = true;
                            }
                            if (hasExam) { detectedClassId = clsDoc.id; break; }
                        }`,
    `                        const classQueryHW = query(collection(db, "classes"), where("members", "array-contains", currentUser.uid));
                        const classSnapsHW = await getDocs(classQueryHW);
                        for (const clsDoc of classSnapsHW.docs) {
                            const clsData = clsDoc.data();
                            let hasExam = false;
                            
                            // Check in class's exams array
                            if (clsData.exams && Array.isArray(clsData.exams) && clsData.exams.includes(examId)) {
                                hasExam = true;
                            } else if (clsData.exams && Array.isArray(clsData.exams)) {
                                hasExam = clsData.exams.some(e => (e.id === examId || e.examId === examId));
                            } else if (clsData.curriculum && JSON.stringify(clsData.curriculum).includes(examId)) {
                                hasExam = true;
                            }
                            
                            // Check in examData's assignTo array (used by homework assignments)
                            if (examData && examData.assignTo && Array.isArray(examData.assignTo) && examData.assignTo.includes(clsDoc.id)) {
                                hasExam = true;
                            }
                            
                            if (hasExam) { detectedClassId = clsDoc.id; break; }
                        }`
);

fs.writeFileSync('exam.html', c);

// --- 2. Fix exam-editor.html ---
let c2 = fs.readFileSync('exam-editor.html', 'utf8');

// Fix bug 2: generateAIBanner 403 error by adding fallback and removing MathJax trigger
c2 = c2.replace(
    `                const bgImg = await new Promise((res, rej) => {
                    const img = new Image(); img.crossOrigin = 'anonymous';
                    img.onload = () => res(img); img.onerror = rej; img.src = bgUrl;
                });`,
    `                let bgImg;
                try {
                    bgImg = await new Promise((res, rej) => {
                        const img = new Image(); img.crossOrigin = 'anonymous';
                        img.onload = () => res(img); 
                        img.onerror = () => rej(new Error("Failed to load Pollinations image")); 
                        img.src = bgUrl;
                    });
                } catch(e) {
                    console.warn("Dùng ảnh dự phòng do AI bị lỗi:", e);
                    bgImg = await new Promise((res, rej) => {
                        const img = new Image(); img.crossOrigin = 'anonymous';
                        img.onload = () => res(img); img.onerror = rej; 
                        img.src = "https://placehold.co/800x400/111827/ffffff.png?text=B%C3%A0i+T%E1%BA%ADp";
                    });
                }`
);

fs.writeFileSync('exam-editor.html', c2);

console.log('Fixed exam.html and exam-editor.html');
