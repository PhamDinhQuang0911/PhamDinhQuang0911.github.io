import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. CẤU HÌNH FIREBASE (Dùng chung cấu hình của bạn)
const firebaseConfig = { apiKey: "AIzaSyCqAX3x1MbJ3do7m3EaH9JA4kFuVhlAc78", authDomain: "lms-thitracnghiem.firebaseapp.com", projectId: "lms-thitracnghiem", storageBucket: "lms-thitracnghiem.firebasestorage.app", messagingSenderId: "760187217240", appId: "1:760187217240:web:d043cd5808c349f87a712d" };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 2. BIẾN TRẠNG THÁI (GLOBAL STATE)
let mapData = {
    metadata: [], // Các dòng header, comment
    tree: []      // Cấu trúc cây JSON
};
let selectedNode = null; // Node đang được chọn để sửa

// 3. CORE: PARSER (Đọc file text -> JSON)
function parseMapID(text) {
    const lines = text.split(/\r?\n/);
    const root = [];
    const stack = []; // Stack lưu cha: [NodeLvl0, NodeLvl1, NodeLvl2...]
    const metadata = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Nếu không bắt đầu bằng '-', coi là metadata
        if (!trimmed.startsWith('-')) {
            metadata.push(line);
            return;
        }

        // Parse dòng cấu trúc: "----[D] Đại số"
        const match = line.match(/^(-+)\[(.+?)\]\s*(.*)/);
        if (match) {
            const dashes = match[1].length;
            const id = match[2];
            const name = match[3];

            // Công thức level: (số gạch - 1) / 3
            // 1->0, 4->1, 7->2, 10->3, 13->4
            const level = Math.round((dashes - 1) / 3);

            const node = {
                id: id,
                name: name,
                level: level,
                children: []
            };

            if (level === 0) {
                root.push(node);
                stack[0] = node; // Đặt làm cha cấp 0
                stack.length = 1; // Xóa các cấp con cũ trong stack
            } else {
                // Tìm cha ở cấp level-1
                const parent = stack[level - 1];
                if (parent) {
                    parent.children.push(node);
                    stack[level] = node; // Đặt mình làm cha cấp hiện tại
                    stack.length = level + 1; // Cắt đuôi stack thừa
                } else {
                    console.warn("Lỗi cấu trúc: Không tìm thấy cha cho dòng", line);
                }
            }
        }
    });

    return { tree: root, metadata: metadata };
}

// 4. CORE: GENERATOR (JSON -> Text)
function generateMapID(data) {
    let output = data.metadata.join('\n') + '\n';

    function traverse(nodes, lvl) {
        if (!nodes || nodes.length === 0) return;
        nodes.forEach(node => {
            const dashes = '-'.repeat(1 + (lvl * 3));
            output += `${dashes}[${node.id}] ${node.name}\n`;
            if (node.children.length > 0) traverse(node.children, lvl + 1);
        });
    }

    traverse(data.tree, 0);
    return output;
}

// 5. UI: RENDER TREE
function renderTree() {
    const container = document.getElementById('treeContainer');
    container.innerHTML = '';
    
    if (mapData.tree.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400">Trống</div>';
        return;
    }

    let count = 0;

    function createNodeHTML(node, pathIndices) {
        count++;
        const isSelected = selectedNode && selectedNode === node;
        
        // Div bọc node
        const div = document.createElement('div');
        div.className = `pl-4 ${node.level > 0 ? 'tree-line' : 'mb-2'}`;
        
        // Nội dung dòng
        const content = document.createElement('div');
        content.className = `flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-gray-100 transition-colors ${isSelected ? 'node-active' : ''}`;
        content.onclick = (e) => {
            e.stopPropagation();
            selectNode(node);
        };

        // Icon theo cấp
        let iconClass = 'fa-circle text-[6px]';
        if (node.level === 0) iconClass = 'fa-folder text-yellow-500 text-lg'; // Lớp
        else if (node.level === 1) iconClass = 'fa-book text-blue-500'; // Môn
        else if (node.level === 2) iconClass = 'fa-bookmark text-green-500'; // Chương
        else if (node.level === 3) iconClass = 'fa-file-lines text-purple-500'; // Bài
        
        content.innerHTML = `
            <div class="w-6 text-center"><i class="fa-solid ${iconClass}"></i></div>
            <span class="font-mono font-bold bg-gray-200 px-1.5 rounded text-xs text-gray-700 min-w-[24px] text-center">${node.id}</span>
            <span class="text-sm font-medium truncate flex-1">${node.name}</span>
            <span class="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">Lv${node.level}</span>
        `;

        div.appendChild(content);

        // Render con đệ quy
        if (node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            node.children.forEach((child, idx) => {
                childrenContainer.appendChild(createNodeHTML(child, [...pathIndices, idx]));
            });
            div.appendChild(childrenContainer);
        }

        return div;
    }

    mapData.tree.forEach((node, idx) => {
        container.appendChild(createNodeHTML(node, [idx]));
    });

    document.getElementById('nodeCount').innerText = `${count} mục`;
}

// 6. LOGIC: SELECTION & EDIT & SAVE
function selectNode(node) {
    selectedNode = node;
    renderTree(); // Re-render để highlight
    
    const editor = document.getElementById('nodeEditor');
    editor.classList.remove('hidden');
    
    document.getElementById('editKey').value = node.id;
    document.getElementById('editName').value = node.name;
    
    // Reset form thêm con
    document.getElementById('newChildKey').value = '';
    document.getElementById('newChildName').value = '';
}

function updateCurrentNode() {
    if (!selectedNode) return;
    selectedNode.id = document.getElementById('editKey').value.trim();
    selectedNode.name = document.getElementById('editName').value.trim();
    renderTree();
    showToast('Đã cập nhật mục!');
}

function addChildNode() {
    if (!selectedNode) return;
    const key = document.getElementById('newChildKey').value.trim();
    const name = document.getElementById('newChildName').value.trim();
    if (!key || !name) return alert("Vui lòng nhập Mã và Tên!");

    const newNode = {
        id: key,
        name: name,
        level: selectedNode.level + 1,
        children: []
    };
    selectedNode.children.push(newNode);
    renderTree();
    showToast('Đã thêm mục con!');
}

function deleteCurrentNode() {
    if (!selectedNode) return;
    if (!confirm(`Bạn có chắc muốn xóa mục "[${selectedNode.id}] ${selectedNode.name}" và toàn bộ con của nó?`)) return;

    // Hàm tìm và xóa node trong cây (đệ quy)
    function removeNode(nodes, target) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i] === target) {
                nodes.splice(i, 1);
                return true;
            }
            if (nodes[i].children.length > 0) {
                if (removeNode(nodes[i].children, target)) return true;
            }
        }
        return false;
    }

    removeNode(mapData.tree, selectedNode);
    selectedNode = null;
    document.getElementById('nodeEditor').classList.add('hidden');
    renderTree();
    showToast('Đã xóa mục!');
}

// 7. LOGIC: TEST ID (SMART PARSER)
function testID() {
    const rawId = document.getElementById('testIdInput').value.trim();
    if (!rawId) return;

    const resBox = document.getElementById('testResult');
    const errBox = document.getElementById('testError');
    const errTxt = document.getElementById('errMsg');
    
    resBox.classList.add('hidden');
    errBox.classList.add('hidden');

    try {
        const cleanId = rawId.replace(/[\s\[\]]/g, '').toUpperCase();
        
        // 1. Tìm Lớp (Ký tự đầu)
        const gradeKey = cleanId[0];
        const gradeNode = mapData.tree.find(n => n.id === gradeKey);
        if (!gradeNode) throw new Error(`Không tìm thấy Lớp mã [${gradeKey}]`);

        // 2. Tìm Môn (Ký tự thứ 2)
        const subjKey = cleanId[1];
        const subjNode = gradeNode.children.find(n => n.id === subjKey);
        if (!subjNode) throw new Error(`Không tìm thấy Môn mã [${subjKey}] trong Lớp ${gradeKey}`);

        // 3. Tìm Chương (Ký tự thứ 3)
        const chapKey = cleanId[2];
        const chapNode = subjNode.children.find(n => n.id === chapKey);
        if (!chapNode) throw new Error(`Không tìm thấy Chương mã [${chapKey}] trong Môn ${subjKey}`);

        // 4. Mức độ (Ký tự thứ 4) - Tra từ điển cứng
        const levelKey = cleanId[3];
        const levels = {'N': 'Nhận biết', 'H': 'Thông hiểu', 'V': 'Vận dụng', 'C': 'Vận dụng cao'};
        const levelName = levels[levelKey] || "Chưa xác định";

        // 5. Tìm Bài (Ký tự thứ 5)
        const lessonKey = cleanId[4];
        let lessonNode = null;
        if (chapNode.children) {
            lessonNode = chapNode.children.find(n => n.id === lessonKey);
        }
        if (!lessonNode) throw new Error(`Không tìm thấy Bài mã [${lessonKey}] trong Chương ${chapKey}`);

        // 6. Tìm Chi tiết (Nếu có) - Dành cho Lớp 9 hoặc THPT
        let detailNode = null;
        let remaining = cleanId.substring(5);
        if (remaining.startsWith('-')) remaining = remaining.substring(1); 

        if (remaining.length > 0) {
            if (lessonNode.children) {
                detailNode = lessonNode.children.find(n => n.id === remaining);
            }
            if (!detailNode) throw new Error(`Không tìm thấy Chi tiết mã [${remaining}] trong Bài ${lessonKey}`);
        }

        // --- HIỂN THỊ KẾT QUẢ ---
        document.getElementById('resGrade').innerText = gradeNode.name;
        document.getElementById('resSubj').innerText = subjNode.name;
        document.getElementById('resChap').innerText = chapNode.name;
        document.getElementById('resLevel').innerText = `${levelKey} - ${levelName}`;
        document.getElementById('resLesson').innerText = lessonNode.name;
        
        const rowDetail = document.getElementById('rowDetail');
        if (detailNode) {
            rowDetail.classList.remove('hidden');
            document.getElementById('resDetail').innerText = detailNode.name;
        } else {
            rowDetail.classList.add('hidden');
        }

        resBox.classList.remove('hidden');

    } catch (err) {
        errTxt.innerText = err.message;
        errBox.classList.remove('hidden');
    }
}

// 8. EVENT LISTENERS & UTILS
document.addEventListener('DOMContentLoaded', () => {
    // Nút Upload
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            mapData = parseMapID(text);
            renderTree();
            showToast('Đã nhập file thành công!');
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    // Nút Export
    document.getElementById('btnExport').addEventListener('click', () => {
        const text = generateMapID(mapData);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MapID_Config_${new Date().toISOString().slice(0,10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // Nút Save Firebase
    document.getElementById('btnSave').addEventListener('click', async () => {
        if (mapData.tree.length === 0) return alert("Dữ liệu trống!");
        const btn = document.getElementById('btnSave');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
        
        try {
            await setDoc(doc(db, "configurations", "map_id_tree"), {
                metadata: mapData.metadata,
                tree: JSON.parse(JSON.stringify(mapData.tree)),
                updatedAt: new Date().toISOString(),
                updatedBy: auth.currentUser ? auth.currentUser.email : 'unknown'
            });
            showToast('Đã lưu cấu hình lên Server!', 'success');
        } catch (e) {
            console.error(e);
            alert("Lỗi lưu: " + e.message);
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Lưu cấu hình';
        }
    });

    // Các nút trong Editor và Test
    document.getElementById('btnCheckID').addEventListener('click', testID);
    document.getElementById('btnUpdateNode').addEventListener('click', updateCurrentNode);
    document.getElementById('btnDeleteNode').addEventListener('click', deleteCurrentNode);
    document.getElementById('btnAddChild').addEventListener('click', addChildNode);
});

// Load khi vào trang
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "configurations", "map_id_tree"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                mapData.tree = data.tree || [];
                mapData.metadata = data.metadata || [];
                renderTree();
                console.log("Đã tải cấu hình từ Server");
            }
        } catch(e) { console.log("Chưa có cấu hình online:", e); }
    } else {
        window.location.href = 'index.html';
    }
});

// Toast
function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').innerText = msg;
    t.classList.remove('translate-x-full');
    setTimeout(() => t.classList.add('translate-x-full'), 3000);
}
