// recalculate_all_tf_exams.js
// Kich ban tinh lai diem chuan BGD 2025 cho toan bo hoc sinh da lam cac de thi co cau hoi Dung/Sai

const SUPABASE_URL = "https://cuniqanbumcrqcdlcvad.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1bmlxYW5idW1jcnFjZGxjdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NDE4MTMsImV4cCI6MjEwNDUxNzgxM30.MWSv1QKVlQ9r-8r0hkrqWsmm75hULq_VjPCbTqXDe-o";

function tfBoolean(val) {
  return val === true || val === 'true' || val === 1 || val === '1' || val === 'D' || val === 'Đ' || val === 'd' || val === 'đ';
}

function shortMatch(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  const clean = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '.');
  return clean(a) === clean(b);
}

function normalizeTfAnswers(value, count = 0) {
  if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
    try { value = JSON.parse(value); } catch (_) {}
  }
  if (Array.isArray(value)) {
    return value.map(v => v === true || v === 'true' || v === 1 || v === '1' || v === 'D' || v === 'Đ' ? true : (v === false || v === 'false' || v === 0 || v === '0' || v === 'S' || v === 's' ? false : undefined));
  }
  if (!value || typeof value !== 'object') return [];
  return Array.from({ length: count }, (_, index) => {
    const raw = value[index] ?? value[String(index)];
    if (raw === true || raw === 'true' || raw === 1 || raw === '1' || raw === 'D' || raw === 'Đ') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0' || raw === 'S' || raw === 's') return false;
    return undefined;
  });
}

async function fetchJson(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }
  if (options.method === 'PATCH' || res.status === 204) return null;
  return await res.json();
}

async function runRecalculation() {
  console.log("=== BAT DAU QUET VA TINH LAI DIEM THI CHUAN BGD 2025 ===");
  
  // 1. Lay danh sach tat ca de thi
  const exams = await fetchJson('exams?select=id,title,questions,raw_data');
  console.log(`Da tai ${exams.length} de thi.`);

  // Loc cac de thi co cau hoi Dung/Sai
  const tfExams = exams.filter(e => {
    const qs = e.questions || e.raw_data?.questions || [];
    return qs.some(q => q && (q.type === 'tf' || q.type === 'dung_sai' || (Array.isArray(q.statements) && q.statements.length > 0)));
  });
  console.log(`Phat hien ${tfExams.length} de thi co cau hoi Dung/Sai.\n`);

  let totalUpdatedResults = 0;
  let summaryUpdates = [];

  for (const exam of tfExams) {
    const examQuestions = exam.questions || exam.raw_data?.questions || [];
    const cfgTn = exam.tnScore !== undefined ? Number(exam.tnScore) : (exam.raw_data?.tnScore !== undefined ? Number(exam.raw_data.tnScore) : 100);
    const cfgTl = exam.tlScore !== undefined ? Number(exam.tlScore) : (exam.raw_data?.tlScore !== undefined ? Number(exam.raw_data.tlScore) : null);

    // Tinh diem max cho tung cau hoi trua cau tu luan
    let configuredPoints = 0;
    let unconfiguredCount = 0;
    let totalMcqQ = 0;
    examQuestions.forEach(q => {
      if (q.type !== 'essay') {
        totalMcqQ++;
        if (q.point && parseFloat(q.point) > 0) configuredPoints += parseFloat(q.point);
        else unconfiguredCount++;
      }
    });

    const defaultPt = unconfiguredCount > 0 ? Math.max(0, cfgTn - configuredPoints) / unconfiguredCount : (configuredPoints === 0 && totalMcqQ > 0 ? (cfgTn / totalMcqQ) : 0);

    // 2. Lay ket qua thi cua hoc sinh cho de nay
    const results = await fetchJson(`results?exam_id=eq.${exam.id}&select=*`);
    if (!results || results.length === 0) continue;

    console.log(`--- De: [${exam.id}] "${exam.title}" (${results.length} bai nop) ---`);

    for (const r of results) {
      const answers = r.answers || r.raw_data?.answers || {};
      const config = r.raw_data?.shuffleConfig || r.shuffle_config || {};
      
      let rawMcqScore = 0;
      let rawMaxMcq = 0;
      let mcqCorrectCount = 0;
      let partialTfCount = 0;
      let fullTfCount = 0;

      examQuestions.forEach((q, originalIdx) => {
        if (q.type === 'essay') return;

        const pt = (q.point && parseFloat(q.point) > 0) ? parseFloat(q.point) : defaultPt;
        rawMaxMcq += pt;

        // Xac dinh khoa dap an hoc sinh (xu ly dao de)
        let ansKey = originalIdx;
        if (config.questionOrder && Array.isArray(config.questionOrder)) {
          const dIdx = config.questionOrder.indexOf(originalIdx);
          if (dIdx !== -1) ansKey = dIdx;
        }

        const u = answers[ansKey] !== undefined ? answers[ansKey] : answers[originalIdx];
        let isCorrect = false;
        let earnedFraction = 0;

        if (u !== undefined && u !== null && u !== '') {
          const isTf = q.type === 'tf' || q.type === 'dung_sai' || (Array.isArray(q.statements) && q.statements.length > 0);
          
          if (isTf) {
            const stmts = q.statements || [];
            const tfValues = normalizeTfAnswers(u, stmts.length);
            let correctStmts = 0;
            stmts.forEach((s, si) => {
              if (tfValues[si] !== undefined && tfValues[si] === tfBoolean(s.isTrue)) {
                correctStmts++;
              }
            });

            if (correctStmts === stmts.length) {
              isCorrect = true;
              fullTfCount++;
            } else if (correctStmts > 0) {
              partialTfCount++;
            }

            // Quy chuan tinh diem Dung/Sai Bo GD&DT 2025:
            // Dung 1/4 y: 10% (0.10)
            // Dung 2/4 y: 25% (0.25)
            // Dung 3/4 y: 50% (0.50)
            // Dung 4/4 y: 100% (1.00)
            // Dung 0/4 y: 0%
            if (stmts.length === 4) {
              if (correctStmts === 1) earnedFraction = 0.10;
              else if (correctStmts === 2) earnedFraction = 0.25;
              else if (correctStmts === 3) earnedFraction = 0.50;
              else if (correctStmts === 4) earnedFraction = 1.00;
              else earnedFraction = 0;
            } else if (stmts.length > 0) {
              earnedFraction = correctStmts / stmts.length;
            }
          } else if (q.type === 'short') {
            if (q.answer !== undefined && q.answer !== null && shortMatch(u, q.answer)) {
              isCorrect = true;
              earnedFraction = 1.0;
            }
          } else {
            // MC 4 lua chon
            let userChoice = u;
            if (config.optionMaps && config.optionMaps[originalIdx]) {
              userChoice = config.optionMaps[originalIdx][u] ?? u;
            }
            if (Number(userChoice) === Number(q.correct)) {
              isCorrect = true;
              earnedFraction = 1.0;
            }
          }
        }

        if (isCorrect) mcqCorrectCount++;
        rawMcqScore += pt * earnedFraction;
      });

      // Tinh diem trac nghiem cuoi cung theo thang tnScore
      let finalMcScore = rawMcqScore;
      if (cfgTn > 0 && rawMaxMcq > 0) {
        finalMcScore = parseFloat(((rawMcqScore / rawMaxMcq) * cfgTn).toFixed(2));
      } else {
        finalMcScore = parseFloat(rawMcqScore.toFixed(2));
      }

      // Giu nguyen diem tu luan neu co
      let essayScore = 0;
      if (r.raw_data?.essayScore !== undefined && r.raw_data?.essayScore !== null) {
        essayScore = parseFloat(r.raw_data.essayScore);
      } else if (r.essay_score !== undefined && r.essay_score !== null) {
        essayScore = parseFloat(r.essay_score);
      } else if (r.score > finalMcScore && r.score - finalMcScore > 1) {
        // Truong hop bai thi Mixed da co diem tu luan cong vao score tong
        essayScore = parseFloat((r.score - (r.raw_data?.mcScore ?? finalMcScore)).toFixed(2));
        if (essayScore < 0) essayScore = 0;
      }

      const newTotalScore = parseFloat((finalMcScore + essayScore).toFixed(2));
      const oldScore = parseFloat(Number(r.score).toFixed(2));
      const passScore = r.pass_score_snapshot !== undefined ? Number(r.pass_score_snapshot) : 5;
      const isPassed = newTotalScore >= passScore;

      // Kiem tra xem diem co thay doi khong
      const scoreDiff = Math.abs(newTotalScore - oldScore);
      if (scoreDiff > 0.01 || r.raw_data?.mcScore === undefined || r.raw_data?.tfGradedVersion !== 2025) {
        // Cap nhat vao Supabase
        const updatedRaw = {
          ...(r.raw_data || {}),
          score: newTotalScore,
          mcScore: finalMcScore,
          essayScore: essayScore,
          correctCount: mcqCorrectCount,
          totalQuestions: examQuestions.length,
          isPassed: isPassed,
          tfGradedVersion: 2025,
          recalculatedAt: new Date().toISOString()
        };

        try {
          await fetchJson(`results?id=eq.${r.id}`, {
            method: 'PATCH',
            headers: {
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({
              score: newTotalScore,
              correct_count: mcqCorrectCount,
              is_passed: isPassed,
              raw_data: updatedRaw
            })
          });

          totalUpdatedResults++;
          const info = `  [OK] ${r.student_name}: Diem cu ${oldScore} -> Diem moi ${newTotalScore} (+${(newTotalScore - oldScore).toFixed(2)}d | TF: ${fullTfCount} cau 4/4, ${partialTfCount} cau dung 1 phan)`;
          console.log(info);
          summaryUpdates.push({
            studentName: r.student_name,
            examTitle: exam.title,
            oldScore,
            newScore: newTotalScore,
            diff: (newTotalScore - oldScore).toFixed(2)
          });
        } catch (err) {
          console.error(`  [LOI CAP NHAT] ${r.student_name}:`, err.message);
        }
      } else {
        console.log(`  [GIU NGUYEN] ${r.student_name}: Diem ${newTotalScore} (Chuan xac)`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`HOAN TAT! Da cap nhat diem cho ${totalUpdatedResults} luot bai lam.`);
  console.log(`========================================`);
  if (summaryUpdates.length > 0) {
    console.log("\nDanh sach cac hoc sinh duoc cong lai diem:");
    summaryUpdates.forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.studentName} - "${s.examTitle}": ${s.oldScore} -> ${s.newScore} (Chênh lệch: ${s.diff > 0 ? '+' : ''}${s.diff} điểm)`);
    });
  }
}

runRecalculation().catch(console.error);
